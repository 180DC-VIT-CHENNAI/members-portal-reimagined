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

describe('consulting request conversion', () => {
  const insert = (id, email, organization) =>
    portal.db
      .prepare("INSERT INTO consulting_requests (id, name, email, phone, organization, role_in_org, requirement) VALUES (?, 'Ravi', ?, '9999999999', ?, 'Director', 'Help with operations')")
      .run(id, email, organization);

  test('converting twice links the same records, and a second request reuses the organisation', async () => {
    insert('req_crm_1', 'Ravi@BlueSky.org', 'Blue Sky Foundation');
    assert.equal((await owner.post('/api/consulting-requests/req_crm_1/convert')).status, 403);
    assert.equal((await admin.post('/api/consulting-requests/missing/convert')).status, 404);
    const first = await admin.post('/api/consulting-requests/req_crm_1/convert');
    assert.deepEqual([first.status, first.json.created], [200, true], first.text);
    const again = await admin.post('/api/consulting-requests/req_crm_1/convert');
    assert.equal(again.status, 200);
    assert.deepEqual(again.json, { ...first.json, created: false });
    assert.equal(portal.db.prepare("SELECT count(*) AS n FROM crm_opportunities WHERE consulting_request_id = 'req_crm_1'").get().n, 1);
    const org = (await admin.get(`/api/crm/organizations/${first.json.organizationId}`)).json;
    assert.deepEqual([org.name, org.domain, org.source, org.contacts.map((c) => c.email)], ['Blue Sky Foundation', 'bluesky.org', 'consulting_request', ['ravi@bluesky.org']]);

    insert('req_crm_2', 'meera@bluesky.org', 'Blue Sky');
    const second = await admin.post('/api/consulting-requests/req_crm_2/convert');
    assert.equal(second.json.organizationId, first.json.organizationId);
    assert.notEqual(second.json.contactId, first.json.contactId);
    assert.notEqual(second.json.opportunityId, first.json.opportunityId);
  });

  test('conversion never reuses a hidden organisation or contact', async () => {
    // Given a converter with intake permission but no access to another client's CRM.
    await invite('converter', 'c.converter@example.com', 'finance', 'director');
    const converter = signIn(portal, 'c.converter@example.com');
    portal.db.prepare('INSERT INTO person_grants (id, person_id, permission) VALUES (?, ?, ?)').run('converter-intake', ids.converter, 'consulting.manage');
    const hidden = await seedClient(owner, 'Private Client', 'private-client.org');
    insert('req_crm_private', 'lead@private-client.org', 'Private Client');
    // When intake conversion sees the same domain, it may only reuse visible records.
    const response = await converter.post('/api/consulting-requests/req_crm_private/convert');
    // Then no hidden identifier is returned and the private record remains inaccessible.
    assert.equal(response.status, 200, response.text);
    assert.notEqual(response.json.organizationId, hidden.org);
    assert.notEqual(response.json.contactId, hidden.contact);
    assert.equal((await converter.get(`/api/crm/organizations/${hidden.org}`)).status, 404);
  });

  test('converting a request linked to an inaccessible opportunity returns 404', async () => {
    // Given an existing conversion the converter cannot access.
    insert('req_crm_hidden_link', 'lead@hidden-link.org', 'Hidden Link');
    const linked = await admin.post('/api/consulting-requests/req_crm_hidden_link/convert');
    assert.equal(linked.status, 200, linked.text);
    const converter = signIn(portal, 'c.converter@example.com');
    // When the converter attempts to reopen it.
    const response = await converter.post('/api/consulting-requests/req_crm_hidden_link/convert');
    // Then it has the same non-disclosing status as a missing opportunity.
    assert.equal(response.status, 404, response.text);
    assert.ok(!response.text.includes(linked.json.opportunityId));
  });
});

describe('proposal to engagement to closeout', () => {
  let rec;
  let proposal;
  let engagement;
  before(async () => {
    rec = await seedClient(owner, 'Lake Clinic', 'lakeclinic.org');
  });

  test('versions freeze, and accepting a sent proposal creates one engagement and its canonical project', async () => {
    proposal = await created(await owner.post(`/api/crm/opportunities/${rec.opportunity}/proposals`, { title: 'Operations review', scope: 'Review intake', objectives: 'Cut wait times' }));
    const accept = (client) => client.post(`/api/crm/proposals/${proposal}/accept`, { departmentIds: ['finance'], leadId: ids.collaborator, confidentiality: 'confidential' });
    assert.equal((await accept(admin)).status, 409);
    assert.equal((await owner.post(`/api/crm/proposals/${proposal}/status`, { status: 'sent' })).status, 200);
    const revised = await owner.post(`/api/crm/proposals/${proposal}/versions`, { scope: 'Review intake and triage', objectives: 'Cut wait times by a third' });
    assert.deepEqual([revised.status, revised.json.version], [201, 2]);
    const versions = portal.db.prepare('SELECT version, frozen_at IS NOT NULL AS frozen FROM crm_proposal_versions WHERE proposal_id = ? ORDER BY version').all(proposal).map((r) => ({ ...r }));
    assert.deepEqual(versions, [{ version: 1, frozen: 1 }, { version: 2, frozen: 0 }]);
    assert.equal((await owner.post(`/api/crm/proposals/${proposal}/status`, { status: 'sent' })).status, 200);

    assert.equal((await accept(owner)).status, 403); // creating the project needs projects.manage
    assert.equal((await accept(outsider)).status, 404);
    const accepted = await accept(admin);
    assert.equal(accepted.status, 201, accepted.text);
    engagement = accepted.json.engagementId;
    assert.equal((await accept(admin)).status, 409);
    assert.equal((await owner.post(`/api/crm/proposals/${proposal}/versions`, { scope: 'Too late' })).status, 409);

    const project = portal.db.prepare('SELECT name, client, internal, status FROM projects WHERE id = ?').get(accepted.json.projectId);
    assert.deepEqual({ ...project }, { name: 'Lake Clinic strategy', client: null, internal: 0, status: 'active' });
    assert.deepEqual(portal.db.prepare('SELECT department_id FROM project_departments WHERE project_id = ?').all(accepted.json.projectId).map((r) => r.department_id), ['finance']);
    const members = portal.db.prepare('SELECT person_id, role FROM project_members WHERE project_id = ? ORDER BY role').all(accepted.json.projectId).map((r) => [r.person_id, r.role]);
    assert.deepEqual(members, [[ids.owner, 'Client owner'], [ids.collaborator, 'Engagement lead']]);
    const opportunity = (await owner.get(`/api/crm/opportunities/${rec.opportunity}`)).json;
    assert.deepEqual([opportunity.stageId, opportunity.engagement.id, opportunity.proposals[0].status], ['won', engagement, 'accepted']);
    assert.equal((await owner.post(`/api/crm/opportunities/${rec.opportunity}/stage`, { stageId: 'lead' })).status, 400);
    // The lead can open the engagement; outsiders cannot.
    assert.equal((await collaborator.get(`/api/crm/engagements/${engagement}`)).status, 200);
    assert.equal((await outsider.get(`/api/crm/engagements/${engagement}`)).status, 404);
    assert.ok(!(await outsider.get('/api/crm/engagements')).json.some((row) => row.id === engagement));
    assert.ok((await collaborator.get('/api/crm/engagements')).json.some((row) => row.id === engagement));
    assert.equal((await outsider.patch(`/api/crm/engagements/${engagement}/closeout`, { filesArchived: true })).status, 404);
    assert.equal(portal.db.prepare('SELECT count(*) AS n FROM crm_engagements WHERE opportunity_id = ?').get(rec.opportunity).n, 1);
  });

  test('closeout needs its checklist and, without consent, creates no case-study draft', async () => {
    assert.equal((await owner.post(`/api/crm/engagements/${engagement}/close`)).status, 400);
    assert.equal((await owner.patch(`/api/crm/engagements/${engagement}/closeout`, { deliverablesAccepted: true, filesArchived: true, knowledgeTransferDone: true, clientFeedback: 'Great work' })).status, 200);
    const closed = await owner.post(`/api/crm/engagements/${engagement}/close`);
    assert.deepEqual(closed.json, { closed: true, caseStudyDraftId: null });
    assert.equal(portal.db.prepare('SELECT count(*) AS n FROM crm_case_study_drafts').get().n, 0);
    assert.equal((await owner.patch(`/api/crm/engagements/${engagement}/closeout`, { caseStudyConsent: true })).status, 409);
  });

  test('with consent, closeout creates an unpublished case-study draft only', async () => {
    const other = await seedClient(owner, 'Forest Fund', 'forestfund.org');
    const id = await created(await owner.post(`/api/crm/opportunities/${other.opportunity}/proposals`, { title: 'Fundraising plan', scope: 'Donor map', objectives: 'Grow repeat donors' }));
    await owner.post(`/api/crm/proposals/${id}/status`, { status: 'sent' });
    const { engagementId } = (await admin.post(`/api/crm/proposals/${id}/accept`, { departmentIds: ['finance'], leadId: ids.owner })).json;
    const publicBefore = portal.db.prepare('SELECT count(*) AS n FROM case_studies').get().n;
    await owner.patch(`/api/crm/engagements/${engagementId}/closeout`, { deliverablesAccepted: true, filesArchived: true, knowledgeTransferDone: true, caseStudyConsent: true });
    const closed = await owner.post(`/api/crm/engagements/${engagementId}/close`);
    assert.equal(closed.status, 200, closed.text);
    const draft = portal.db.prepare('SELECT title, summary, status FROM crm_case_study_drafts WHERE id = ?').get(closed.json.caseStudyDraftId);
    assert.deepEqual({ ...draft }, { title: 'Forest Fund: Forest Fund strategy', summary: 'Grow repeat donors', status: 'draft' });
    assert.equal(portal.db.prepare('SELECT count(*) AS n FROM case_studies').get().n, publicBefore);
    const site = await anonymous(portal).get('/api/content/case-studies');
    assert.ok(!site.text.includes('Forest Fund'));
    assert.equal((await owner.get(`/api/crm/engagements/${engagementId}`)).json.caseStudyDraft.status, 'draft');
  });
});

describe('dedupe and merge', () => {
  test('merging re-points contacts, opportunities, touchpoints and grants, and is admin-only', async () => {
    const target = await seedClient(owner, 'Sun Power', 'sunpower.org');
    const source = await seedClient(outsider, 'Sun Power Ltd', 'https://www.SunPower.org/', 'sunpower.org');
    await created(await outsider.post('/api/crm/touchpoints', { kind: 'call', organizationId: source.org, summary: 'Intro call', occurredAt: '2030-01-03T09:00:00Z' }));
    await created(await outsider.post(`/api/crm/organizations/${source.org}/access`, { personId: ids.collaborator }));

    assert.equal((await owner.get('/api/crm/duplicates')).status, 403);
    const groups = (await admin.get('/api/crm/duplicates')).json.organizations;
    assert.deepEqual(groups.find((group) => group.key === 'sunpower.org').records.map((r) => r.id).sort(), [target.org, source.org].sort());
    assert.equal((await owner.post(`/api/crm/organizations/${target.org}/merge`, { sourceId: source.org })).status, 403);
    assert.equal((await admin.post(`/api/crm/organizations/${target.org}/merge`, { sourceId: target.org })).status, 400);

    const merged = await admin.post(`/api/crm/organizations/${target.org}/merge`, { sourceId: source.org });
    assert.deepEqual(merged.json, { id: target.org, mergedId: source.org });
    const counts = (table, column) => portal.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).get(source.org).n;
    assert.deepEqual([counts('crm_contacts', 'organization_id'), counts('crm_opportunities', 'organization_id'), counts('crm_touchpoints', 'organization_id')], [0, 0, 0]);
    const detail = (await admin.get(`/api/crm/organizations/${target.org}`)).json;
    assert.equal(detail.contacts.length, 2);
    assert.deepEqual(detail.opportunities.map((o) => o.id).sort(), [target.opportunity, source.opportunity].sort());
    assert.equal(detail.touchpoints.length, 1);
    assert.equal((await admin.get(`/api/crm/organizations/${source.org}`)).status, 404);
    assert.ok(!(await admin.get('/api/crm/organizations?q=sun')).json.some((o) => o.id === source.org));
    // The collaborator's grant moved with the records; the outsider keeps their own opportunity only.
    assert.equal((await collaborator.get(`/api/crm/organizations/${target.org}`)).status, 200);
    assert.equal((await outsider.get(`/api/crm/organizations/${target.org}`)).status, 404);
    assert.equal((await outsider.get(`/api/crm/opportunities/${source.opportunity}`)).status, 200);

    // Contacts with the same email inside the merged organisation can be merged too.
    await created(await owner.post(`/api/crm/organizations/${target.org}/contacts`, { fullName: 'Duplicate lead', email: 'LEAD@sunpower.org' }));
    const dupes = (await admin.get('/api/crm/duplicates')).json.contacts.find((group) => group.key === 'lead@sunpower.org').records;
    assert.equal(dupes.length, 3);
    const [keep, drop] = [target.contact, source.contact];
    assert.equal((await outsider.post(`/api/crm/contacts/${keep}/merge`, { sourceId: drop })).status, 403);
    assert.equal((await admin.post(`/api/crm/contacts/${keep}/merge`, { sourceId: drop })).status, 200);
    assert.equal(portal.db.prepare('SELECT primary_contact_id FROM crm_opportunities WHERE id = ?').get(source.opportunity).primary_contact_id, keep);
  });
});
