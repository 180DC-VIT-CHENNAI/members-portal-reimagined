import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkInvitation, invitationCampaign, invitationHtml, invitationOrigin, isUniqueViolation, PORTAL_ORIGIN } from './invitations.ts';

test('production links always use the fixed portal origin', () => {
  assert.equal(invitationOrigin('http://localhost:5173/api/people', true), PORTAL_ORIGIN);
  assert.equal(invitationOrigin('https://evil.example.com/api/people', true), PORTAL_ORIGIN);
});

test('local development keeps its own loopback origin, anything else falls back', () => {
  assert.equal(invitationOrigin('http://localhost:5173/api/people', false), 'http://localhost:5173');
  assert.equal(invitationOrigin('http://127.0.0.1:4000/api/people', false), 'http://127.0.0.1:4000');
  assert.equal(invitationOrigin('https://evil.example.com/api/people', false), PORTAL_ORIGIN);
  assert.equal(invitationOrigin('http://localhost.evil.com/api/people', false), PORTAL_ORIGIN);
});

test('the email links to Google sign-in, escapes names and carries no credential', () => {
  const html = invitationHtml({ origin: PORTAL_ORIGIN, inviterName: 'A <b>', fullName: 'New "One"' });
  assert.match(html, /href="https:\/\/180dc\.vitcc\.org\/login"/);
  assert.ok(html.includes('A &lt;b&gt;'));
  assert.ok(html.includes('New &quot;One&quot;'));
  assert.doesNotMatch(html, /token|password:|otp/i);
  assert.ok(!invitationHtml({ origin: PORTAL_ORIGIN, inviterName: 'A', fullName: null }).includes('Hi '));
});

test('campaign rows are pending, deduplicated and reply to the inviter', () => {
  const row = invitationCampaign({ recipients: ['A@x.org', 'a@x.org ', 'b@x.org'], html: '<p>x</p>', replyTo: 'me@x.org', createdBy: 'p1' });
  assert.deepEqual(row.recipients, ['a@x.org', 'b@x.org']);
  assert.equal(row.total, 2);
  assert.equal(row.kind, 'invitation');
  assert.equal(row.status, 'pending');
  assert.equal(row.meta?.replyTo, 'me@x.org');
});

const base = {
  departmentId: 'tech', department: { id: 'tech', active: true }, roleExists: true,
  positionId: undefined, position: undefined, currentTermId: '2026-27',
};

test('invitations validate role, department, position and term', () => {
  assert.deepEqual(checkInvitation(base), { ok: true, positionId: null });
  assert.deepEqual(checkInvitation({ ...base, roleExists: false }), { ok: false, error: 'unknown_access_role' });
  assert.deepEqual(checkInvitation({ ...base, department: undefined }), { ok: false, error: 'unknown_department' });
  assert.deepEqual(checkInvitation({ ...base, department: { id: 'tech', active: false } }), { ok: false, error: 'unknown_department' });
  const position = { id: 'p', departmentId: 'tech', active: true };
  assert.deepEqual(checkInvitation({ ...base, positionId: 'p', position }), { ok: true, positionId: 'p' });
  assert.deepEqual(checkInvitation({ ...base, positionId: 'p', position: { ...position, departmentId: null } }), { ok: true, positionId: 'p' });
  assert.deepEqual(checkInvitation({ ...base, positionId: 'p', position: undefined }), { ok: false, error: 'unknown_position' });
  assert.deepEqual(checkInvitation({ ...base, positionId: 'p', position: { ...position, active: false } }), { ok: false, error: 'unknown_position' });
  assert.deepEqual(checkInvitation({ ...base, positionId: 'p', position: { ...position, departmentId: 'finance' } }), { ok: false, error: 'unknown_position' });
  assert.deepEqual(checkInvitation({ ...base, positionId: 'p', position, currentTermId: undefined }), { ok: false, error: 'no_current_term' });
});

test('unique violations are recognised through error causes', () => {
  assert.equal(isUniqueViolation(new Error('Failed query', { cause: new Error('D1_ERROR: UNIQUE constraint failed: people.email') })), true);
  assert.equal(isUniqueViolation(new Error('D1_ERROR: FOREIGN KEY constraint failed')), false);
  assert.equal(isUniqueViolation('UNIQUE constraint failed'), false);
});
