import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canMoveProposal,
  canReviseProposal,
  closeoutMissing,
  normalizeDomain,
  normalizeEmail,
  normalizeOrganizationName,
  organizationDomainOfEmail,
  type StageRef,
  stageMove,
} from './rules.ts';

const stage = (id: string, kind: StageRef['kind'] = 'open', active = true): StageRef => ({ id, kind, active });

test('websites, URLs and emails normalise to one bare host', () => {
  for (const input of ['https://www.GreenEarth.org/about?x=1', 'greenearth.org', 'http://user:pw@greenearth.org:8080', 'WWW.greenearth.org.', 'team@GreenEarth.org']) {
    assert.equal(normalizeDomain(input), 'greenearth.org', input);
  }
  assert.equal(normalizeDomain('https://blog.greenearth.org'), 'blog.greenearth.org');
  for (const input of ['', '   ', null, undefined, 'not a site', 'localhost', 'https://']) assert.equal(normalizeDomain(input), null, String(input));
});

test('personal mailboxes do not identify an organisation', () => {
  assert.equal(organizationDomainOfEmail('ravi@greenearth.org'), 'greenearth.org');
  assert.equal(organizationDomainOfEmail('Ravi@Gmail.com'), null);
  assert.equal(organizationDomainOfEmail('someone@outlook.com'), null);
  assert.equal(normalizeEmail('  Ravi@GreenEarth.org '), 'ravi@greenearth.org');
  assert.equal(normalizeEmail('  '), null);
});

test('organisation names compare without case, punctuation or legal suffixes', () => {
  assert.equal(normalizeOrganizationName('Green Earth Pvt. Ltd.'), 'green earth');
  assert.equal(normalizeOrganizationName('GREEN-EARTH'), 'green earth');
  assert.equal(normalizeOrganizationName('The Green Earth Co'), 'green earth');
  assert.notEqual(normalizeOrganizationName('Green Earth Trust'), 'green earth');
});

test('opportunities move between open stages and reopen from lost with the reason cleared', () => {
  assert.deepEqual(stageMove(stage('lead'), stage('discovery'), null), { ok: true, lostReason: null, closed: false });
  assert.deepEqual(stageMove(stage('lost', 'lost'), stage('lead'), 'budget'), { ok: true, lostReason: null, closed: false });
});

test('losing an opportunity needs a reason code', () => {
  assert.deepEqual(stageMove(stage('lead'), stage('lost', 'lost'), undefined), { ok: false, error: 'lost_reason_required' });
  assert.deepEqual(stageMove(stage('lead'), stage('lost', 'lost'), 'no_response'), { ok: true, lostReason: 'no_response', closed: true });
});

test('won is reached only through an accepted proposal and is final', () => {
  assert.deepEqual(stageMove(stage('proposal'), stage('won', 'won'), null), { ok: false, error: 'won_requires_accepted_proposal' });
  assert.deepEqual(stageMove(stage('won', 'won'), stage('lead'), null), { ok: false, error: 'opportunity_closed' });
});

test('moves to the same or a retired stage are refused', () => {
  assert.deepEqual(stageMove(stage('lead'), stage('lead'), null), { ok: false, error: 'same_stage' });
  assert.deepEqual(stageMove(stage('lead'), stage('old', 'open', false), null), { ok: false, error: 'stage_inactive' });
});

test('proposals go draft -> sent -> accepted or declined, and decided proposals are final', () => {
  assert.equal(canMoveProposal('draft', 'sent'), true);
  assert.equal(canMoveProposal('draft', 'accepted'), false);
  assert.equal(canMoveProposal('sent', 'accepted'), true);
  assert.equal(canMoveProposal('sent', 'declined'), true);
  assert.equal(canMoveProposal('accepted', 'declined'), false);
  assert.equal(canMoveProposal('declined', 'sent'), false);
  assert.deepEqual((['draft', 'sent', 'accepted', 'declined'] as const).filter(canReviseProposal), ['draft', 'sent']);
});

test('closeout lists every unchecked item', () => {
  assert.deepEqual(closeoutMissing({ deliverablesAccepted: false, filesArchived: true, knowledgeTransferDone: false }), ['deliverablesAccepted', 'knowledgeTransferDone']);
  assert.deepEqual(closeoutMissing({ deliverablesAccepted: true, filesArchived: true, knowledgeTransferDone: true }), []);
});
