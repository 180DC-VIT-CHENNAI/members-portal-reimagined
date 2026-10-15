// Team instances (e.g. a case competition): instances, levels, groups,
// teams with member limits, outside members, moving people between teams,
// eliminations and the activity log.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { get, post, put, del, tokens, users, expectOk, expectStatus } from "../lib/api.mjs";

const B = { token: tokens.board };
const D = { token: tokens.director }; // marketing
const memberId = users["member@test.180dcvitc.org"].id;
const member2Id = users["member2@test.180dcvitc.org"].id;
const advisoryId = users["advisory@test.180dcvitc.org"].id;

const tree = async (id, who = B) => expectOk(await get("/api/team-instances", who)).data.find((i) => i.id === id);
const allTeams = (inst) => [...inst.ungrouped_teams, ...inst.groups.flatMap((g) => g.teams)];
const teamIn = async (instId, teamId) => allTeams(await tree(instId)).find((t) => t.id === teamId);

async function newInstance(who = D, extra = {}) {
  const json = expectOk(await post("/api/team-instances", { name: "Case comp " + Date.now(), levelCount: 3, levelNames: ["Prelims", "Semis", "Finals"], ...extra }, who));
  return json.instanceId;
}

describe("instances", () => {
  test("a director creates one for their own department, with named levels", async () => {
    const id = await newInstance(D, { departmentIds: ["finance"] });
    const inst = await tree(id);
    assert.deepEqual(inst.departments.map((d) => d.id), ["marketing"], "directors can't pick other departments");
    assert.equal(inst.level_count, 3);
    assert.deepEqual(inst.levels.map((l) => l.name), ["Prelims", "Semis", "Finals"]);
    assert.equal(inst.group_label, "Company");
  });

  test("board must choose departments, which must exist", async () => {
    expectStatus(await post("/api/team-instances", { name: "x" }, B), 400);
    expectStatus(await post("/api/team-instances", { name: "x", departmentIds: ["nope"] }, B), 400);
    const id = expectOk(await post("/api/team-instances", { name: "Board inst " + Date.now(), departmentIds: ["tech", "crm"] }, B)).instanceId;
    assert.deepEqual((await tree(id)).departments.map((d) => d.id).sort(), ["crm", "tech"]);
  });

  test("validation: name and a level count of 1-20", async () => {
    expectStatus(await post("/api/team-instances", {}, D), 400);
    expectStatus(await post("/api/team-instances", { name: "x", levelCount: 0 }, D), 400);
    expectStatus(await post("/api/team-instances", { name: "x", levelCount: 21 }, D), 400);
  });

  test("editing: rename, relabel, and shrinking levels pulls teams down", async () => {
    const id = await newInstance();
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "Alpha" }, D));
    expectOk(await put(`/api/team-instances/${id}/teams/${teamId}`, { currentLevel: 3 }, D));
    expectOk(await put(`/api/team-instances/${id}`, { name: "Renamed", groupLabel: "Client", levelCount: 2 }, D));
    const inst = await tree(id);
    assert.equal(inst.name, "Renamed");
    assert.equal(inst.group_label, "Client");
    assert.equal(inst.level_count, 2);
    assert.deepEqual(inst.levels.map((l) => l.name), ["Prelims", "Semis"], "existing names kept");
    assert.equal(allTeams(inst)[0].current_level, 2);
    expectStatus(await put(`/api/team-instances/${id}`, { name: "" }, D), 400);
  });

  test("deleting removes the instance and everything in it", async () => {
    const id = await newInstance();
    expectOk(await post(`/api/team-instances/${id}/teams`, { name: "Gone", memberIds: [memberId] }, D));
    expectOk(await del(`/api/team-instances/${id}`, D));
    assert.equal(await tree(id), undefined);
    expectStatus(await del(`/api/team-instances/${id}`, D), 404);
  });
});

describe("who can do what", () => {
  let id;
  before(async () => { id = await newInstance(); });

  test("members can view instances but not change them", async () => {
    assert.ok(await tree(id, { token: tokens.member }));
    expectStatus(await post("/api/team-instances", { name: "x" }, { token: tokens.member }), 403);
    expectStatus(await post(`/api/team-instances/${id}/teams`, { name: "x" }, { token: tokens.member }), 403);
  });

  test("advisory members cannot see instances at all", async () => {
    expectStatus(await get("/api/team-instances", { token: tokens.advisory }), 403);
    expectStatus(await get(`/api/team-instances/${id}/activity`, { token: tokens.advisory }), 403);
  });

  test("a director of another department cannot manage this instance", async () => {
    const D2 = { token: tokens.director2 };
    expectStatus(await put(`/api/team-instances/${id}`, { name: "hijack" }, D2), 403);
    expectStatus(await post(`/api/team-instances/${id}/teams`, { name: "x" }, D2), 403);
    expectStatus(await post(`/api/team-instances/${id}/groups`, { name: "x" }, D2), 403);
    expectStatus(await del(`/api/team-instances/${id}`, D2), 403);
  });

  test("board can manage any instance", async () => {
    expectOk(await post(`/api/team-instances/${id}/groups`, { name: "Board group" }, B));
  });
});

describe("groups", () => {
  test("create, rename, reorder, and deleting ungroups its teams", async () => {
    const id = await newInstance();
    const { groupId } = expectOk(await post(`/api/team-instances/${id}/groups`, { name: "Acme", organization: "Acme Ltd" }, D));
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "T1", groupId }, D));
    let inst = await tree(id);
    assert.equal(inst.groups[0].teams[0].id, teamId);
    assert.equal(inst.groups[0].stats.team_count, 1);
    expectOk(await put(`/api/team-instances/${id}/groups/${groupId}`, { name: "Acme Corp", sortOrder: 5 }, D));
    expectStatus(await put(`/api/team-instances/${id}/groups/${groupId}`, { sortOrder: -1 }, D), 400);
    expectOk(await del(`/api/team-instances/${id}/groups/${groupId}`, D));
    inst = await tree(id);
    assert.equal(inst.groups.length, 0);
    assert.equal(inst.ungrouped_teams[0].id, teamId);
  });

  test("a team can't join a group from another instance", async () => {
    const a = await newInstance();
    const b = await newInstance();
    const { groupId } = expectOk(await post(`/api/team-instances/${a}/groups`, { name: "G" }, D));
    expectStatus(await post(`/api/team-instances/${b}/teams`, { name: "T", groupId }, D), 400);
  });
});

describe("teams and members", () => {
  test("a team with members, a minimum and a maximum", async () => {
    const id = await newInstance();
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "Alpha", minMembers: 2, maxMembers: 2, memberIds: [memberId] }, D));
    let t = await teamIn(id, teamId);
    assert.equal(t.member_count, 1);
    assert.equal(t.requirement_met, false);
    assert.equal(t.is_full, false);
    const extra = (await post(`/api/team-instances/${id}/externals`, { name: "Guest", organization: "Uni" }, D)).json;
    expectOk(await post(`/api/team-instances/${id}/teams/${teamId}/external-members`, { externalId: extra.externalId }, D));
    t = await teamIn(id, teamId);
    assert.equal(t.member_count, 2);
    assert.equal(t.requirement_met, true);
    assert.equal(t.is_full, true);
    const ext2 = expectOk(await post(`/api/team-instances/${id}/externals`, { name: "Guest 2" }, D)).externalId;
    expectStatus(await post(`/api/team-instances/${id}/teams/${teamId}/external-members`, { externalId: ext2 }, D), 400, "team is full");
    expectStatus(await put(`/api/team-instances/${id}/teams/${teamId}`, { maxMembers: 1 }, D), 400, "can't shrink below current size");
  });

  test("team validation", async () => {
    const id = await newInstance();
    expectStatus(await post(`/api/team-instances/${id}/teams`, {}, D), 400);
    expectStatus(await post(`/api/team-instances/${id}/teams`, { name: "x", minMembers: 3, maxMembers: 2 }, D), 400);
    expectStatus(await post(`/api/team-instances/${id}/teams`, { name: "x", maxMembers: 0 }, D), 400);
    expectStatus(await post(`/api/team-instances/${id}/teams`, { name: "x", maxMembers: 1, memberIds: [memberId, users["director@test.180dcvitc.org"].id] }, D), 400, "more members than the max");
  });

  test("eligibility: advisory never, other departments only for board", async () => {
    const id = await newInstance();
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "T" }, D));
    expectStatus(await post(`/api/team-instances/${id}/teams/${teamId}/members`, { userId: advisoryId }, D), 400);
    expectStatus(await post(`/api/team-instances/${id}/teams/${teamId}/members`, { userId: member2Id }, D), 400, "director can't add other departments");
    expectStatus(await post(`/api/team-instances/${id}/teams/${teamId}/members`, { userId: "no-such-user" }, D), 400);
    expectOk(await post(`/api/team-instances/${id}/teams/${teamId}/members`, { userId: member2Id }, B), "board can");
    expectStatus(await post(`/api/team-instances/${id}/teams/${teamId}/members`, { userId: member2Id }, B), 400, "already in team");
  });

  test("removing members and deleting a team", async () => {
    const id = await newInstance();
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "T", memberIds: [memberId] }, D));
    expectOk(await del(`/api/team-instances/${id}/teams/${teamId}/members/${memberId}`, D));
    assert.equal((await teamIn(id, teamId)).member_count, 0);
    expectOk(await del(`/api/team-instances/${id}/teams/${teamId}`, D));
    assert.equal(await teamIn(id, teamId), undefined);
  });

  test("levels and statuses: advance, eliminate, crown a winner", async () => {
    const id = await newInstance();
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "T" }, D));
    expectOk(await put(`/api/team-instances/${id}/teams/${teamId}`, { currentLevel: 2, status: "eliminated" }, D));
    let t = await teamIn(id, teamId);
    assert.equal(t.current_level, 2);
    assert.equal(t.status, "eliminated");
    assert.equal((await tree(id)).stats.eliminated_count, 1);
    expectOk(await put(`/api/team-instances/${id}/teams/${teamId}`, { status: "winner" }, D));
    expectStatus(await put(`/api/team-instances/${id}/teams/${teamId}`, { currentLevel: 4 }, D), 400);
    expectStatus(await put(`/api/team-instances/${id}/teams/${teamId}`, { status: "champion" }, D), 400);
  });
});

describe("outside members", () => {
  test("add, edit, prevent duplicate emails, remove", async () => {
    const id = await newInstance();
    const { externalId } = expectOk(await post(`/api/team-instances/${id}/externals`, { name: "Judge", email: "judge@example.com", organization: "Firm" }, D));
    expectStatus(await post(`/api/team-instances/${id}/externals`, { name: "Dup", email: "JUDGE@example.com" }, D), 400);
    expectStatus(await post(`/api/team-instances/${id}/externals`, { name: "Bad", email: "nope" }, D), 400);
    expectOk(await put(`/api/team-instances/${id}/externals/${externalId}`, { name: "Head Judge", email: "" }, D));
    let ext = (await tree(id)).externals.find((e) => e.id === externalId);
    assert.equal(ext.name, "Head Judge");
    assert.equal(ext.email, null);
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "T", externalIds: [externalId] }, D));
    expectOk(await del(`/api/team-instances/${id}/externals/${externalId}`, D));
    assert.equal((await teamIn(id, teamId)).member_count, 0, "removed from teams too");
  });

  test("an outside member from another instance can't be used", async () => {
    const a = await newInstance();
    const b = await newInstance();
    const { externalId } = expectOk(await post(`/api/team-instances/${a}/externals`, { name: "X" }, D));
    expectStatus(await post(`/api/team-instances/${b}/teams`, { name: "T", externalIds: [externalId] }, D), 400);
  });
});

describe("moving members", () => {
  test("moves internal and outside members between teams", async () => {
    const id = await newInstance();
    const { externalId } = expectOk(await post(`/api/team-instances/${id}/externals`, { name: "Ext" }, D));
    const a = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "A", memberIds: [memberId], externalIds: [externalId] }, D)).teamId;
    const b = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "B" }, D)).teamId;
    expectOk(await post(`/api/team-instances/${id}/move-member`, { kind: "internal", memberId, fromTeamId: a, toTeamId: b }, D));
    expectOk(await post(`/api/team-instances/${id}/move-member`, { kind: "external", memberId: externalId, fromTeamId: a, toTeamId: b }, D));
    assert.equal((await teamIn(id, a)).member_count, 0);
    assert.equal((await teamIn(id, b)).member_count, 2);
  });

  test("refuses full targets, wrong source, bad kind and foreign teams", async () => {
    const id = await newInstance();
    const a = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "A", memberIds: [memberId] }, D)).teamId;
    const full = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "Full", maxMembers: 1, memberIds: [users["director@test.180dcvitc.org"].id] }, D)).teamId;
    const empty = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "Empty" }, D)).teamId;
    expectStatus(await post(`/api/team-instances/${id}/move-member`, { kind: "internal", memberId, fromTeamId: a, toTeamId: full }, D), 400);
    expectStatus(await post(`/api/team-instances/${id}/move-member`, { kind: "internal", memberId, fromTeamId: empty, toTeamId: a }, D), 400);
    expectStatus(await post(`/api/team-instances/${id}/move-member`, { kind: "alien", memberId, fromTeamId: a, toTeamId: empty }, D), 400);
    const other = await newInstance();
    const foreign = expectOk(await post(`/api/team-instances/${other}/teams`, { name: "F" }, D)).teamId;
    expectStatus(await post(`/api/team-instances/${id}/move-member`, { kind: "internal", memberId, fromTeamId: a, toTeamId: foreign }, D), 400);
    const same = expectOk(await post(`/api/team-instances/${id}/move-member`, { kind: "internal", memberId, fromTeamId: a, toTeamId: a }, D));
    assert.match(same.message, /no change/i);
  });
});

describe("activity log", () => {
  test("records what happened in the instance", async () => {
    const id = await newInstance();
    const { teamId } = expectOk(await post(`/api/team-instances/${id}/teams`, { name: "Logged" }, D));
    expectOk(await post(`/api/team-instances/${id}/teams/${teamId}/members`, { userId: memberId }, D));
    expectOk(await put(`/api/team-instances/${id}/teams/${teamId}`, { status: "eliminated" }, D));
    const { data } = expectOk(await get(`/api/team-instances/${id}/activity`, { token: tokens.member }));
    const actions = data.map((r) => r.action);
    for (const a of ["team_instance_created", "team_created", "team_member_added", "team_status_changed"]) {
      assert.ok(actions.includes(a), a);
    }
    expectStatus(await get("/api/team-instances/nope/activity", B), 404);
  });
});
