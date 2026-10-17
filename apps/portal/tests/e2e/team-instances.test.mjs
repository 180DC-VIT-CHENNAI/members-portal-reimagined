import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
let dirF; // finance director
let dirM; // marketing director
let memF; // finance member
let advF; // finance advisory member
const ids = {};

async function invite(key, email, departmentId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName: email.split('@')[0], departmentId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  ids[key] = res.json.id;
}

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  await invite('dirF', 'dir.finance@example.com', 'finance', 'director');
  await invite('dirM', 'dir.marketing@example.com', 'marketing', 'director');
  await invite('memF', 'mem.finance@example.com', 'finance');
  await invite('memF2', 'mem2.finance@example.com', 'finance');
  await invite('memM', 'mem.marketing@example.com', 'marketing');
  await invite('advF', 'adv.finance@example.com', 'finance', 'advisory');
  await invite('alumF', 'alumni.finance@example.com', 'finance');
  await invite('invited', 'invited.finance@example.com', 'finance');
  dirF = signIn(portal, 'dir.finance@example.com');
  dirM = signIn(portal, 'dir.marketing@example.com');
  memF = signIn(portal, 'mem.finance@example.com');
  advF = signIn(portal, 'adv.finance@example.com');
  for (const email of ['mem2.finance@example.com', 'mem.marketing@example.com', 'alumni.finance@example.com']) signIn(portal, email);
  assert.equal((await admin.post('/api/people/' + ids.alumF + '/status', { status: 'alumni' })).status, 200);
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec('DELETE FROM rate_limits;');
});

const base = (id) => '/api/team-instances/' + id;
const create = (client, body) => client.post('/api/team-instances', { name: 'Case challenge', departmentIds: ['finance'], ...body });
const detail = async (client, id) => (await client.get(base(id))).json;
const teamIn = (instance, teamId) => [...instance.ungroupedTeams, ...instance.groups.flatMap((group) => group.teams)].find((team) => team.id === teamId);
const place = (client, id, teamId, personId) => client.post(base(id) + '/teams/' + teamId + '/members', { personId });
const placeOutside = (client, id, teamId, externalId) => client.post(base(id) + '/teams/' + teamId + '/externals', { externalId });
async function addTeam(client, id, body) {
  const res = await client.post(base(id) + '/teams', { name: 'Team', ...body });
  assert.equal(res.status, 201, res.text);
  return res.json.id;
}

test('team instances need a session, and advisory members cannot see them', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.get('/api/team-instances')).status, 401);
  assert.equal((await anon.post('/api/team-instances', { name: 'x', departmentIds: ['finance'] })).status, 401);
  assert.equal((await advF.get('/api/team-instances')).status, 403);
  const list = await memF.get('/api/team-instances');
  assert.equal(list.status, 200, list.text);
  assert.deepEqual(list.json, []);
});

test('directors create instances for their own department, admins for any, and input is validated', async () => {
  const made = await create(dirF, { levels: ['Round  1', ' ', 'Final'], groupLabel: 'Client' });
  assert.equal(made.status, 201, made.text);
  ids.challenge = made.json.id;
  const challenge = await detail(dirF, ids.challenge);
  assert.deepEqual(challenge.levels, [
    { position: 1, name: 'Round 1' },
    { position: 2, name: 'Level 2' },
    { position: 3, name: 'Final' },
  ]);
  assert.equal(challenge.groupLabel, 'Client');
  assert.deepEqual(challenge.departments.map((department) => department.id), ['finance']);
  assert.deepEqual(challenge.access, { view: true, staff: true, configure: true });
  assert.equal((await create(dirF, { departmentIds: ['marketing'] })).status, 403);
  assert.equal((await create(dirF, { departmentIds: ['finance', 'marketing'] })).status, 403);
  assert.equal((await create(memF, {})).status, 403);
  const joint = await create(admin, { name: 'Joint programme', departmentIds: ['finance', 'marketing', 'finance'] });
  assert.equal(joint.status, 201, joint.text);
  ids.joint = joint.json.id;
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM instance_departments WHERE instance_id = ?').get(ids.joint).n, 2);
  assert.deepEqual((await detail(admin, ids.joint)).levels, [{ position: 1, name: 'Level 1' }]);
  for (const bad of [{ name: '  ' }, { departmentIds: [] }, { departmentIds: ['nope'] }, { levels: [] }, { levels: Array(21).fill('L') }, { levels: ['x'.repeat(61)] }, { groupLabel: 'x'.repeat(41) }]) {
    assert.equal((await create(admin, bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  }
  const seen = (await memF.get('/api/team-instances')).json;
  assert.deepEqual(seen.map((instance) => instance.id).sort(), [ids.challenge, ids.joint].sort());
  assert.deepEqual(seen.find((instance) => instance.id === ids.joint).access, { view: true, staff: false, configure: false });
});

test('a department grant runs a joint instance but cannot reshape or delete it', async () => {
  const joint = ids.joint;
  assert.deepEqual((await detail(dirF, joint)).access, { view: true, staff: true, configure: false });
  assert.equal((await dirF.patch(base(joint), { name: 'Renamed' })).status, 403);
  assert.equal((await dirF.del(base(joint))).status, 403);
  const team = await addTeam(dirF, joint, { name: 'Late team' });
  assert.equal((await admin.patch(base(joint), { levels: ['Heats', 'Semis', 'Final'] })).status, 200);
  assert.equal((await dirF.patch(base(joint) + '/teams/' + team, { currentLevel: 3 })).status, 200);
  assert.equal((await admin.patch(base(joint), { levels: ['Heats', 'Final'] })).status, 200);
  assert.equal(teamIn(await detail(admin, joint), team).currentLevel, 2, 'teams above a shrunk ladder move to its top');
  assert.equal((await dirM.post(base(joint) + '/groups', { name: 'Acme' })).status, 201);
  assert.equal((await admin.patch(base(joint), { departmentIds: ['finance'] })).status, 200);
  assert.equal((await dirM.post(base(joint) + '/groups', { name: 'Beta' })).status, 403);
  assert.deepEqual((await detail(dirM, joint)).access, { view: true, staff: false, configure: false });
  assert.equal((await dirF.patch(base(joint), { departmentIds: ['finance', 'marketing'] })).status, 403);
  assert.equal((await admin.patch(base(joint), {})).status, 400);
});

test('groups organise teams, and deleting a group keeps its teams and everyone on them', async () => {
  const id = ids.challenge;
  const group = await dirF.post(base(id) + '/groups', { name: 'Acme Foundation', organization: 'Acme' });
  assert.equal(group.status, 201, group.text);
  const team = await addTeam(dirF, id, { name: 'Acme A', groupId: group.json.id });
  assert.equal((await place(dirF, id, team, ids.memF)).status, 201);
  assert.equal((await dirF.patch(base(id) + '/groups/' + group.json.id, { name: 'Acme Trust', sortOrder: 4 })).status, 200);
  let challenge = await detail(memF, id);
  assert.deepEqual(challenge.groups.map((g) => [g.name, g.organization, g.sortOrder, g.teams.map((t) => t.name)]), [['Acme Trust', 'Acme', 4, ['Acme A']]]);
  assert.equal((await memF.post(base(id) + '/groups', { name: 'Not mine' })).status, 403);
  const elsewhere = await dirF.post(base(ids.joint) + '/groups', { name: 'Elsewhere' });
  const wrong = await dirF.post(base(id) + '/teams', { name: 'Wrong group', groupId: elsewhere.json.id });
  assert.deepEqual([wrong.status, wrong.text], [400, 'unknown_group']);
  assert.equal((await dirF.del(base(id) + '/groups/' + group.json.id)).status, 200);
  challenge = await detail(memF, id);
  assert.deepEqual(challenge.groups, []);
  const kept = teamIn(challenge, team);
  assert.equal(kept.groupId, null);
  assert.deepEqual(kept.members.map((m) => m.id), [ids.memF]);
  assert.equal((await dirF.del(base(id) + '/groups/' + group.json.id)).status, 404);
});

test('outside people: emails are unique per instance ignoring case, and only those running it see them', async () => {
  const id = ids.challenge;
  const asha = await dirF.post(base(id) + '/externals', { name: 'Asha Rao', email: 'Asha@Client.org', organization: 'Client Org' });
  assert.equal(asha.status, 201, asha.text);
  ids.asha = asha.json.id;
  const dupe = await dirF.post(base(id) + '/externals', { name: 'Someone', email: 'asha@client.ORG' });
  assert.deepEqual([dupe.status, dupe.text], [409, 'external_email_taken']);
  assert.equal((await dirF.post(base(ids.joint) + '/externals', { name: 'Asha elsewhere', email: 'asha@client.org' })).status, 201);
  const ben = await dirF.post(base(id) + '/externals', { name: 'Ben' });
  assert.equal(ben.status, 201, ben.text);
  assert.equal((await dirF.patch(base(id) + '/externals/' + ben.json.id, { email: 'ASHA@client.org' })).status, 409);
  assert.equal((await dirF.patch(base(id) + '/externals/' + ids.asha, { email: 'asha@client.org', organization: 'Client Org Ltd' })).status, 200);
  const seenByStaff = (await detail(dirF, id)).externals.find((e) => e.id === ids.asha);
  assert.deepEqual([seenByStaff.email, seenByStaff.organization], ['asha@client.org', 'Client Org Ltd']);
  assert.equal((await detail(memF, id)).externals.find((e) => e.id === ids.asha).email, null);
  assert.equal((await dirF.patch(base(id) + '/externals/' + ids.asha, { email: null })).status, 200);
  assert.equal(portal.db.prepare('SELECT email FROM instance_externals WHERE id = ?').get(ids.asha).email, null);
  const team = await addTeam(dirF, id, { name: 'Outside test' });
  assert.equal((await placeOutside(dirF, id, team, ben.json.id)).status, 201);
  assert.equal((await dirF.del(base(id) + '/externals/' + ben.json.id)).status, 200);
  assert.deepEqual(teamIn(await detail(dirF, id), team).members, [], 'removing someone from the register takes them off every team');
  assert.equal((await placeOutside(dirF, id, team, ben.json.id)).status, 404);
});

test('team sizes count members and outside people together', async () => {
  const id = ids.challenge;
  const inverted = await dirF.post(base(id) + '/teams', { name: 'Bad', minMembers: 3, maxMembers: 2 });
  assert.deepEqual([inverted.status, inverted.text], [400, 'min_above_max']);
  const pair = await addTeam(dirF, id, { name: 'Pair', minMembers: 2, maxMembers: 2 });
  ids.pair = pair;
  assert.equal((await place(dirF, id, pair, ids.memF)).status, 201);
  let team = teamIn(await detail(dirF, id), pair);
  assert.deepEqual([team.count, team.short, team.full], [1, true, false]);
  assert.equal((await placeOutside(dirF, id, pair, ids.asha)).status, 201);
  team = teamIn(await detail(dirF, id), pair);
  assert.deepEqual([team.count, team.short, team.full], [2, false, true]);
  assert.deepEqual(team.members.map((m) => m.kind), ['person', 'external']);
  const full = await place(dirF, id, pair, ids.memF2);
  assert.deepEqual([full.status, full.text], [409, 'team_full']);
  const belowMinimum = await dirF.patch(base(id) + '/teams/' + pair, { maxMembers: 1 });
  assert.deepEqual([belowMinimum.status, belowMinimum.text], [400, 'min_above_max']);
  const shrink = await dirF.patch(base(id) + '/teams/' + pair, { maxMembers: 1, minMembers: 1 });
  assert.deepEqual([shrink.status, shrink.text], [409, 'cap_below_members']);
  assert.equal((await dirF.patch(base(id) + '/teams/' + pair, { minMembers: 3 })).status, 400);
  assert.deepEqual((await dirF.patch(base(id) + '/teams/' + pair, { maxMembers: null, minMembers: null })).json, { id: pair, changed: true });
  const tooHigh = await dirF.patch(base(id) + '/teams/' + pair, { currentLevel: 4 });
  assert.deepEqual([tooHigh.status, tooHigh.text], [400, 'level_out_of_range']);
  assert.equal((await dirF.patch(base(id) + '/teams/' + pair, { status: 'bogus' })).status, 400);
  assert.deepEqual((await dirF.patch(base(id) + '/teams/' + pair, { currentLevel: 3, status: 'winner' })).json, { id: pair, changed: true });
  assert.deepEqual((await dirF.patch(base(id) + '/teams/' + pair, { status: 'winner' })).json, { id: pair, changed: false });
  const { stats } = await detail(dirF, id);
  assert.equal(stats.winners, 1);
  assert.deepEqual([stats.placements, stats.people], [3, 2], 'mem.finance is on Acme A and Pair; Asha on Pair');
});

test('placing members follows department scope, access and the advisory exclusion', async () => {
  const id = ids.challenge;
  const team = await addTeam(dirF, id, { name: 'Staffing' });
  const foreign = await place(dirF, id, team, ids.memM);
  assert.deepEqual([foreign.status, foreign.text], [403, 'outside_your_departments']);
  assert.equal((await place(admin, id, team, ids.memM)).status, 201);
  for (const key of ['advF', 'alumF', 'invited']) {
    const res = await place(dirF, id, team, ids[key]);
    assert.deepEqual([res.status, res.text], [400, 'person_not_eligible'], key);
  }
  assert.equal((await place(dirF, id, team, 'missing-person')).status, 400);
  assert.equal((await place(dirF, id, team, ids.memF2)).status, 201);
  const twice = await place(dirF, id, team, ids.memF2);
  assert.deepEqual([twice.status, twice.text], [409, 'already_on_team']);
  assert.equal((await place(dirF, id, ids.pair, ids.memF2)).status, 201, 'one person may be on several teams');
  assert.equal((await place(memF, id, team, ids.memF)).status, 403);
  const { stats } = await detail(dirF, id);
  assert.ok(stats.placements > stats.people, 'placements count each team someone is on');
  assert.deepEqual((await dirF.del(base(id) + '/teams/' + team + '/members/' + ids.memM)).json, { removed: true });
  assert.deepEqual((await dirF.del(base(id) + '/teams/' + team + '/members/' + ids.memM)).json, { removed: false });
  const picker = await dirF.get(base(id) + '/people');
  assert.equal(picker.status, 200, picker.text);
  const pickable = picker.json.map((p) => p.id);
  for (const key of ['dirF', 'memF', 'memF2']) assert.ok(pickable.includes(ids[key]), key);
  for (const key of ['memM', 'dirM', 'advF', 'alumF', 'invited']) assert.ok(!pickable.includes(ids[key]), key);
  assert.equal((await memF.get(base(id) + '/people')).status, 403);
  const adminPicks = (await admin.get(base(id) + '/people')).json.map((p) => p.id);
  assert.ok(adminPicks.includes(ids.memM) && !adminPicks.includes(ids.advF));
});

test('moving keeps exactly one placement, and a failed move loses none', async () => {
  const id = ids.challenge;
  const a = await addTeam(dirF, id, { name: 'Move A' });
  const b = await addTeam(dirF, id, { name: 'Move B', maxMembers: 1 });
  assert.equal((await place(dirF, id, a, ids.memF)).status, 201);
  const move = (body) => dirF.post(base(id) + '/move', { kind: 'person', memberId: ids.memF, fromTeamId: a, toTeamId: b, ...body });
  assert.deepEqual((await move({ toTeamId: a })).json, { moved: false });
  assert.deepEqual((await move({})).json, { moved: true });
  let instance = await detail(dirF, id);
  assert.deepEqual(teamIn(instance, a).members, []);
  assert.deepEqual(teamIn(instance, b).members.map((m) => m.id), [ids.memF]);
  const gone = await move({});
  assert.deepEqual([gone.status, gone.text], [404, 'not_on_team']);
  assert.equal((await place(dirF, id, a, ids.memF2)).status, 201);
  const full = await move({ memberId: ids.memF2 });
  assert.deepEqual([full.status, full.text], [409, 'team_full']);
  assert.equal((await place(dirF, id, a, ids.memF)).status, 201);
  const already = await dirF.post(base(id) + '/move', { kind: 'person', memberId: ids.memF, fromTeamId: b, toTeamId: a });
  assert.deepEqual([already.status, already.text], [409, 'already_on_team']);
  assert.equal((await move({ toTeamId: 'missing' })).status, 404);
  assert.equal((await move({ kind: 'robot' })).status, 400);
  assert.equal((await placeOutside(dirF, id, a, ids.asha)).status, 201);
  assert.equal((await dirF.patch(base(id) + '/teams/' + b, { maxMembers: null })).status, 200);
  assert.deepEqual((await dirF.post(base(id) + '/move', { kind: 'external', memberId: ids.asha, fromTeamId: a, toTeamId: b })).json, { moved: true });
  portal.db.exec(`CREATE TRIGGER reject_move BEFORE INSERT ON instance_team_members WHEN NEW.team_id = '${b}' BEGIN SELECT RAISE(ABORT, 'injected_failure'); END;`);
  try {
    assert.equal((await move({ memberId: ids.memF2 })).status, 500);
  } finally {
    portal.db.exec('DROP TRIGGER reject_move;');
  }
  instance = await detail(dirF, id);
  assert.ok(teamIn(instance, a).members.some((m) => m.id === ids.memF2), 'the failed move left them on their team');
  assert.ok(!teamIn(instance, b).members.some((m) => m.id === ids.memF2));
});

test('simultaneous placements never overfill a team, and a lowered cap never undercuts who is on it', async () => {
  const team = await addTeam(admin, ids.joint, { name: 'Two seats', maxMembers: 2 });
  const results = await Promise.all([ids.dirF, ids.memF, ids.memF2, ids.dirM, ids.memM].map((personId) => place(admin, ids.joint, team, personId)));
  assert.deepEqual(results.map((res) => res.status).sort(), [201, 201, 409, 409, 409], results.map((res) => res.text).join(' '));
  assert.ok(results.filter((res) => res.status === 409).every((res) => res.text === 'team_full'));
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM instance_team_members WHERE team_id = ?').get(team).n, 2);
  const lowered = await admin.patch(base(ids.joint) + '/teams/' + team, { maxMembers: 1 });
  assert.deepEqual([lowered.status, lowered.text], [409, 'cap_below_members']);
  assert.equal(portal.db.prepare('SELECT max_members AS m FROM instance_teams WHERE id = ?').get(team).m, 2);
});

test('staffing changes are rate limited per client', async () => {
  const team = await addTeam(admin, ids.joint, { name: 'Limited' });
  assert.equal((await place(admin, ids.joint, team, ids.memF)).status, 201);
  portal.db.prepare("UPDATE rate_limits SET count = 600 WHERE endpoint = 'team_staffing'").run();
  assert.equal((await place(admin, ids.joint, team, ids.memF2)).status, 429);
  assert.equal((await addTeam(admin, ids.joint, { name: 'Other bucket' })).length > 0, true);
});

test('activity lists the latest 30 changes of that instance only, and deleting it removes everything but its history', async () => {
  const id = ids.challenge;
  const activity = await memF.get(base(id) + '/activity');
  assert.equal(activity.status, 200, activity.text);
  const actions = activity.json.map((entry) => entry.action);
  assert.equal(activity.json.length, 30, 'only the latest 30 of its 33 changes');
  for (const action of ['team_instance.team.create', 'team_instance.member.add', 'team_instance.member.remove', 'team_instance.member.move', 'team_instance.team.update', 'team_instance.external.create']) {
    assert.ok(actions.includes(action), action);
  }
  assert.equal(portal.db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'team_instance.create' AND target_id = ?").get(id).n, 1);
  const moved = activity.json.find((entry) => entry.action === 'team_instance.member.move');
  assert.deepEqual([moved.actorName, moved.details.member, moved.details.fromTeam, moved.details.toTeam], ['dir.finance', 'Asha Rao', 'Move A', 'Move B']);
  const winner = activity.json.find((entry) => entry.action === 'team_instance.team.update' && entry.details.status);
  assert.deepEqual(winner.details.status, { from: 'active', to: 'winner' });
  assert.deepEqual(winner.details.level, { from: 'Round 1', to: 'Final' });
  assert.ok(!JSON.stringify(activity.json).includes('client.org'), 'activity never carries emails');
  const insert = portal.db.prepare("INSERT INTO audit_log (actor_person_id, action, target_type, target_id, details) VALUES (?, 'team_instance.team.update', 'team_instance', ?, ?)");
  for (let i = 0; i < 35; i++) insert.run(ids.dirF, id, JSON.stringify({ team: 'Bulk ' + i, fields: ['sortOrder'] }));
  const page = (await memF.get(base(id) + '/activity')).json;
  assert.equal(page.length, 30);
  assert.equal(page[0].details.team, 'Bulk 34');
  assert.ok(!(await memF.get(base(ids.joint) + '/activity')).json.some((entry) => String(entry.details.team ?? '').startsWith('Bulk')));
  assert.equal((await dirF.del(base(id))).status, 200);
  for (const table of ['instance_departments', 'instance_levels', 'instance_groups', 'instance_teams', 'instance_externals']) {
    assert.equal(portal.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE instance_id = ?`).get(id).n, 0, table);
  }
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM instance_team_members m LEFT JOIN instance_teams t ON t.id = m.team_id WHERE t.id IS NULL').get().n, 0);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM instance_team_externals x LEFT JOIN instance_teams t ON t.id = x.team_id WHERE t.id IS NULL').get().n, 0);
  assert.equal((await memF.get(base(id))).status, 404);
  assert.equal((await memF.get(base(id) + '/activity')).status, 404);
  assert.ok(portal.db.prepare("SELECT count(*) AS n FROM audit_log WHERE target_type = 'team_instance' AND target_id = ?").get(id).n > 30);
});
