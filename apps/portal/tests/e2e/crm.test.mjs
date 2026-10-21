import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
let owner; // finance director: crm.view + crm.manage
let outsider; // marketing director: crm.view + crm.manage, owns nothing of the owner's
let collaborator; // finance member: crm.view only
let advisory; // no CRM access at all
const ids = {};

async function invite(key, email, departmentId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName: key, departmentId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  ids[key] = res.json.id;
}

async function created(response) {
  assert.equal(response.status, 201, response.text);
  return response.json.id;
}

/** An organisation owned by `client`, with one contact and one opportunity whose primary contact it is. */
async function seedClient(client, name, website, domain = website) {
  const org = await created(await client.post('/api/crm/organizations', { name, website }));
  const contact = await created(await client.post(`/api/crm/organizations/${org}/contacts`, { fullName: `${name} lead`, email: `lead@${domain}`, phone: '+91 90000 00000', restrictedNotes: 'Prefers calls after 5pm' }));
  const opportunity = await created(await client.post(`/api/crm/organizations/${org}/opportunities`, { title: `${name} strategy`, primaryContactId: contact }));
  return { org, contact, opportunity };
}

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  await invite('owner', 'c.owner@example.com', 'finance', 'director');
  await invite('outsider', 'c.out@example.com', 'marketing', 'director');
  await invite('collaborator', 'c.collab@example.com', 'finance');
  await invite('advisory', 'c.adv@example.com', 'finance', 'advisory');
  owner = signIn(portal, 'c.owner@example.com');
  outsider = signIn(portal, 'c.out@example.com');
  collaborator = signIn(portal, 'c.collab@example.com');
  advisory = signIn(portal, 'c.adv@example.com');
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec('DELETE FROM rate_limits');
});

test('the CRM needs a session and crm.view', async () => {
  assert.equal((await anonymous(portal).get('/api/crm/summary')).status, 401);
  for (const path of ['/api/crm/summary', '/api/crm/organizations', '/api/crm/opportunities', '/api/crm/contacts', '/api/crm/next-steps']) {
    assert.equal((await advisory.get(path)).status, 403, path);
  }
  assert.equal((await collaborator.post('/api/crm/organizations', { name: 'Not allowed' })).status, 403);
});

describe('record visibility', () => {
  let rec;
  before(async () => {
    rec = await seedClient(owner, 'Green Earth', 'greenearth.org');
  });

  test('an unrelated member gets 404 on details and finds nothing in lists, search or counts', async () => {
    assert.equal((await owner.get(`/api/crm/organizations/${rec.org}`)).status, 200);
    for (const path of [`/api/crm/organizations/${rec.org}`, `/api/crm/opportunities/${rec.opportunity}`, `/api/crm/contacts/${rec.contact}`, `/api/crm/organizations/${rec.org}/access`]) {
      assert.equal((await outsider.get(path)).status, 404, path);
    }
    for (const path of ['/api/crm/organizations', '/api/crm/organizations?q=green', '/api/crm/opportunities?q=green', '/api/crm/contacts?q=lead', '/api/crm/summary', '/api/crm/engagements']) {
      const res = await outsider.get(path);
      assert.equal(res.status, 200, path);
      assert.ok(!res.text.includes('Green Earth') && !res.text.includes('greenearth'), path);
    }
    assert.deepEqual((await outsider.get('/api/crm/summary')).json.counts, {});
    assert.equal((await owner.get('/api/crm/summary')).json.counts.lead, 1);
    // Writes through someone else's record ids are refused the same way.
    assert.equal((await outsider.post('/api/crm/touchpoints', { kind: 'note', opportunityId: rec.opportunity, summary: 'x', occurredAt: '2030-01-01T10:00:00Z' })).status, 404);
    assert.equal((await outsider.post(`/api/crm/organizations/${rec.org}/opportunities`, { title: 'Sneaky' })).status, 404);
    assert.equal((await outsider.post(`/api/crm/organizations/${rec.org}/access`, { personId: ids.outsider })).status, 404);
    // Creating the same website elsewhere does not reveal that it exists.
    assert.equal((await outsider.post('/api/crm/organizations', { name: 'Other', website: 'https://www.greenearth.org' })).status, 201);
    const duplicate = await owner.post('/api/crm/organizations', { name: 'Green Earth again', website: 'greenearth.org/about' });
    assert.deepEqual([duplicate.status, duplicate.json], [409, { error: 'duplicate_organization', id: rec.org }]);
  });

  test('an organisation grant opens it with private contact fields, and revoking it closes it again', async () => {
    assert.equal((await collaborator.post(`/api/crm/organizations/${rec.org}/access`, { personId: ids.collaborator })).status, 404);
    assert.equal((await owner.post(`/api/crm/organizations/${rec.org}/access`, { personId: ids.advisory })).status, 400);
    await created(await owner.post(`/api/crm/organizations/${rec.org}/access`, { personId: ids.collaborator }));

    const detail = await collaborator.get(`/api/crm/organizations/${rec.org}`);
    assert.equal(detail.status, 200, detail.text);
    assert.equal(detail.json.contacts[0].email, 'lead@greenearth.org');
    assert.equal(detail.json.contacts[0].restrictedNotes, 'Prefers calls after 5pm');
    assert.deepEqual(detail.json.access, { view: true, edit: false, grants: false, private: true });
    assert.equal((await collaborator.get(`/api/crm/opportunities/${rec.opportunity}`)).status, 200);
    assert.deepEqual((await collaborator.get('/api/crm/organizations?q=green')).json.map((o) => o.id), [rec.org]);
    assert.equal((await collaborator.get('/api/crm/summary')).json.counts.lead, 1);
    assert.equal((await collaborator.get('/api/crm/contacts?q=lead')).json.length, 1);
    // Viewing is not editing, and collaborators cannot pass access on.
    assert.equal((await collaborator.patch(`/api/crm/organizations/${rec.org}`, { industry: 'Climate' })).status, 403);
    assert.equal((await collaborator.get(`/api/crm/organizations/${rec.org}/access`)).status, 403);

    assert.equal((await owner.del(`/api/crm/organizations/${rec.org}/access`, { personId: ids.collaborator })).status, 200);
    assert.equal((await collaborator.get(`/api/crm/organizations/${rec.org}`)).status, 404);
    assert.equal((await collaborator.get(`/api/crm/opportunities/${rec.opportunity}`)).status, 404);
    assert.deepEqual((await collaborator.get('/api/crm/organizations')).json, []);
    assert.deepEqual((await collaborator.get('/api/crm/summary')).json.counts, {});
  });

  test('an opportunity grant shows that opportunity only, without private contact fields', async () => {
    await created(await owner.post(`/api/crm/opportunities/${rec.opportunity}/access`, { personId: ids.collaborator }));
    const opportunity = await collaborator.get(`/api/crm/opportunities/${rec.opportunity}`);
    assert.equal(opportunity.status, 200, opportunity.text);
    assert.deepEqual(opportunity.json.organization, { id: rec.org, name: 'Green Earth', canOpen: false });
    assert.equal(opportunity.json.primaryContact.fullName, 'Green Earth lead');
    assert.equal(opportunity.json.primaryContact.email, null);
    assert.equal(opportunity.json.primaryContact.restrictedNotes, null);
    assert.equal((await collaborator.get(`/api/crm/organizations/${rec.org}`)).status, 404);
    assert.equal((await collaborator.get(`/api/crm/contacts/${rec.contact}`)).status, 404);
    assert.deepEqual((await collaborator.get('/api/crm/contacts?q=lead')).json, []);
    assert.equal((await owner.del(`/api/crm/opportunities/${rec.opportunity}/access`, { personId: ids.collaborator })).status, 200);
    assert.equal((await collaborator.get(`/api/crm/opportunities/${rec.opportunity}`)).status, 404);
  });

  test('a contact grant opens that contact with private fields only, and revoking it closes it again', async () => {
    await created(await owner.post(`/api/crm/contacts/${rec.contact}/access`, { personId: ids.collaborator }));
    const contact = await collaborator.get(`/api/crm/contacts/${rec.contact}`);
    assert.equal(contact.status, 200, contact.text);
    assert.equal(contact.json.email, 'lead@greenearth.org');
    assert.deepEqual((await collaborator.get('/api/crm/contacts?q=lead')).json.map((c) => c.id), [rec.contact]);
    assert.equal((await collaborator.get(`/api/crm/organizations/${rec.org}`)).status, 404);
    assert.equal((await collaborator.get(`/api/crm/opportunities/${rec.opportunity}`)).status, 404);
    assert.deepEqual((await collaborator.get('/api/crm/summary')).json.counts, {});
    assert.equal((await owner.del(`/api/crm/contacts/${rec.contact}/access`, { personId: ids.collaborator })).status, 200);
    assert.equal((await collaborator.get(`/api/crm/contacts/${rec.contact}`)).status, 404);
    assert.deepEqual((await collaborator.get('/api/crm/contacts?q=lead')).json, []);
  });

  test('handing an organisation to a new owner removes the previous owner at once', async () => {
    const handed = await seedClient(owner, 'Handover Trust', 'handover.org');
    assert.equal((await owner.patch(`/api/crm/organizations/${handed.org}`, { ownerId: ids.outsider })).status, 200);
    assert.equal((await owner.get(`/api/crm/organizations/${handed.org}`)).status, 404);
    assert.equal((await owner.get(`/api/crm/contacts/${handed.contact}`)).status, 404);
    // The opportunity stays with the owner who still owns it.
    assert.equal((await owner.get(`/api/crm/opportunities/${handed.opportunity}`)).status, 200);
    assert.equal((await outsider.get(`/api/crm/organizations/${handed.org}`)).status, 200);
  });

  test('email touchpoints keep a reference, never the body', async () => {
    const base = { kind: 'email', opportunityId: rec.opportunity, summary: 'Re: scope', occurredAt: '2030-01-02T09:00:00Z' };
    assert.equal((await owner.post('/api/crm/touchpoints', { ...base, notes: 'Full message text', externalRef: 'msg-1' })).status, 400);
    assert.equal((await owner.post('/api/crm/touchpoints', base)).status, 400);
    assert.equal((await owner.post('/api/crm/touchpoints', { ...base, externalRef: 'msg-1' })).status, 201);
    const [touchpoint] = (await owner.get(`/api/crm/opportunities/${rec.opportunity}`)).json.touchpoints;
    assert.deepEqual([touchpoint.kind, touchpoint.externalRef, touchpoint.notes], ['email', 'msg-1', null]);
  });

  test('an opportunity editor cannot attach a hidden contact by guessing its id', async () => {
    // Given an editor granted an opportunity but not its organisation or contacts.
    await created(await owner.post(`/api/crm/opportunities/${rec.opportunity}/access`, { personId: ids.outsider }));
    // When it tries to link a contact in the same organisation using a guessed id.
    const contactChange = await outsider.patch(`/api/crm/opportunities/${rec.opportunity}`, { primaryContactId: rec.contact });
    const touchpoint = await outsider.post('/api/crm/touchpoints', { kind: 'call', opportunityId: rec.opportunity, contactId: rec.contact, summary: 'Guessed contact', occurredAt: '2030-01-02T09:00:00Z' });
    // Then both mutations reject the hidden contact without confirming it exists.
    assert.equal(contactChange.status, 404, contactChange.text);
    assert.equal(touchpoint.status, 404, touchpoint.text);
    assert.equal((await owner.del(`/api/crm/opportunities/${rec.opportunity}/access`, { personId: ids.outsider })).status, 200);
  });
});

describe('pipeline', () => {
  let rec;
  before(async () => {
    rec = await seedClient(owner, 'River Trust', 'rivertrust.org');
  });

  test('losing needs a reason code, reopening clears it, and won is reached only by accepting a proposal', async () => {
    const move = (body) => owner.post(`/api/crm/opportunities/${rec.opportunity}/stage`, body);
    assert.equal((await move({ stageId: 'lost' })).status, 400);
    assert.equal((await move({ stageId: 'lost', lostReason: 'made_up' })).status, 400);
    const lost = await move({ stageId: 'lost', lostReason: 'no_response', lostNote: 'Three follow-ups' });
    assert.deepEqual(lost.json, { id: rec.opportunity, from: 'lead', to: 'lost', lostReason: 'no_response' });
    const reopened = await move({ stageId: 'qualified' });
    assert.equal(reopened.status, 200, reopened.text);
    const row = portal.db.prepare('SELECT lost_reason, lost_note, closed_at FROM crm_opportunities WHERE id = ?').get(rec.opportunity);
    assert.deepEqual({ ...row }, { lost_reason: null, lost_note: null, closed_at: null });
    const won = await move({ stageId: 'won' });
    assert.equal(won.status, 400);
    assert.ok(won.text.includes('won_requires_accepted_proposal'), won.text);
    assert.equal((await collaborator.post(`/api/crm/opportunities/${rec.opportunity}/stage`, { stageId: 'lead' })).status, 404);
  });

  test('stages are configured by CRM admins only', async () => {
    assert.equal((await owner.post('/api/crm/stages', { id: 'pilot', label: 'Pilot' })).status, 403);
    assert.equal((await admin.post('/api/crm/stages', { id: 'pilot', label: 'Pilot', sortOrder: 35 })).status, 201);
    assert.equal((await admin.patch('/api/crm/stages/won', { active: false })).status, 400);
    assert.equal((await admin.patch('/api/crm/stages/pilot', { active: false })).status, 200);
    assert.equal((await owner.post(`/api/crm/opportunities/${rec.opportunity}/stage`, { stageId: 'pilot' })).status, 400);
  });

  test('my overdue next steps lists only my own open opportunities due by today', async () => {
    const mine = await seedClient(owner, 'Hill School', 'hillschool.org');
    const theirs = await seedClient(outsider, 'Sea Shore', 'seashore.org');
    assert.equal((await owner.patch(`/api/crm/opportunities/${mine.opportunity}`, { nextAction: 'Call back', nextActionDue: '2020-01-01' })).status, 200);
    assert.equal((await owner.patch(`/api/crm/opportunities/${rec.opportunity}`, { nextActionDue: '2999-01-01' })).status, 200);
    assert.equal((await outsider.patch(`/api/crm/opportunities/${theirs.opportunity}`, { nextActionDue: '2020-01-01' })).status, 200);
    const steps = (await owner.get('/api/crm/next-steps')).json;
    assert.deepEqual(steps.map((step) => [step.id, step.overdue, step.nextAction]), [[mine.opportunity, true, 'Call back']]);
    assert.deepEqual((await outsider.get('/api/crm/next-steps')).json.map((step) => step.id), [theirs.opportunity]);
  });
});

