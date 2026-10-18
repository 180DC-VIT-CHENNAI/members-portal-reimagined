import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  for (const [email, departmentId] of [['new.tech@example.com', 'tech'], ['no.dept@example.com', null]]) {
    const res = await admin.post('/api/people', { email, fullName: 'New Person', departmentId });
    assert.equal(res.status, 201, res.text);
  }
});
after(async () => {
  await portal?.stop();
});

const personId = (email) => portal.db.prepare('SELECT id FROM people WHERE email = ?').get(email).id;
const keys = (checklist) => checklist.items.map((item) => item.key);

describe('first-login checklist', () => {
  test('signed-out requests get 401', async () => {
    assert.equal((await anonymous(portal).get('/api/onboarding')).status, 401);
    assert.equal((await anonymous(portal).post('/api/onboarding/acknowledgments', { item: 'checklist_dismissed' })).status, 401);
  });

  test('a new member sees open items that match their access', async () => {
    const member = signIn(portal, 'new.tech@example.com');
    const { permissions } = (await member.get('/api/me')).json;
    const res = await member.get('/api/onboarding');
    assert.equal(res.status, 200, res.text);
    const expected = ['profile'];
    const dept = (key) => permissions[key] === 'global' || permissions[key]?.includes('tech');
    if (dept('departments.instructions.view') || dept('departments.workspace.view')) expected.push('department');
    if (permissions['files.view']) expected.push('resources');
    assert.deepEqual(keys(res.json), expected);
    assert.deepEqual([res.json.complete, res.json.dismissed, res.json.visible], [false, false, true]);
    assert.deepEqual(res.json.items[0].missing, ['year', 'branch', 'about']);
    assert.equal(res.json.items[0].href, `/people/${personId('new.tech@example.com')}`);
  });

  test('the profile item is derived from saved fields, never from private ones', async () => {
    const member = signIn(portal, 'new.tech@example.com');
    const id = personId('new.tech@example.com');
    assert.equal((await member.patch(`/api/people/${id}`, { phone: '+91 98765 43210', regNo: '23BCE0001' })).status, 200);
    assert.equal((await member.get('/api/onboarding')).json.items[0].done, false);
    assert.equal((await member.patch(`/api/people/${id}`, { year: 2, branch: 'CSE', skills: ['research'] })).status, 200);
    const profile = (await member.get('/api/onboarding')).json.items[0];
    assert.deepEqual([profile.done, profile.missing], [true, []]);
  });

  test('read items need an explicit, persisted acknowledgment', async () => {
    const member = signIn(portal, 'new.tech@example.com');
    const readable = (await member.get('/api/onboarding')).json.items.filter((item) => item.kind === 'acknowledge');
    for (const item of readable) {
      assert.equal(item.done, false);
      const res = await member.post('/api/onboarding/acknowledgments', { item: item.acknowledgment });
      assert.equal(res.status, 200, res.text);
      assert.ok(res.json.items.find((i) => i.key === item.key).doneAt);
    }
    const stored = portal.db.prepare('SELECT item, acknowledged_at FROM onboarding_acknowledgments WHERE person_id = ?').all(personId('new.tech@example.com'));
    assert.equal(stored.length, readable.length);
    if (readable.length) {
      const first = stored[0];
      await member.post('/api/onboarding/acknowledgments', { item: first.item });
      assert.equal(portal.db.prepare('SELECT acknowledged_at AS at FROM onboarding_acknowledgments WHERE person_id = ? AND item = ?').get(personId('new.tech@example.com'), first.item).at, first.acknowledged_at);
    }
    const done = (await member.get('/api/onboarding')).json;
    assert.deepEqual([done.complete, done.visible], [true, false]);
  });

  test('unknown or unavailable items are rejected', async () => {
    const noDept = signIn(portal, 'no.dept@example.com');
    assert.equal((await noDept.post('/api/onboarding/acknowledgments', { item: 'everything' })).status, 400);
    assert.ok(!keys((await noDept.get('/api/onboarding')).json).includes('department'));
    const res = await noDept.post('/api/onboarding/acknowledgments', { item: 'department_read' });
    assert.equal(res.status, 400);
    assert.match(res.text, /onboarding_item_unavailable/);
  });

  test('hiding the checklist is per person and keeps the items truthful', async () => {
    const noDept = signIn(portal, 'no.dept@example.com');
    const hidden = await noDept.post('/api/onboarding/acknowledgments', { item: 'checklist_dismissed' });
    assert.equal(hidden.status, 200, hidden.text);
    assert.deepEqual([hidden.json.complete, hidden.json.dismissed, hidden.json.visible], [false, true, false]);
    assert.equal((await admin.get('/api/onboarding')).json.dismissed, false);
  });
});
