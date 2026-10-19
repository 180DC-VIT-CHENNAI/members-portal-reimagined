import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalContent, digest, editable, recipientsValid } from './rules.ts';
import type { SnapshotContent } from './types.ts';

const content: SnapshotContent = {
  mailboxId: 'mailbox', conversationId: null, fromAddress: 'technical@example.org', fromName: 'Technical',
  recipients: { to: ['client@example.org'], cc: [], bcc: [] }, subject: 'Proposal', text: 'Hello',
  html: '<p>Hello</p>', signature: '180DC', category: 'correspondence', attachments: [], templateVersionId: null,
};

test('the digest changes when any reviewed recipient, signature, template or attachment changes', async () => {
  const original = await digest(canonicalContent(content));
  for (const change of [
    { recipients: { ...content.recipients, bcc: ['hidden@example.org'] } },
    { signature: 'Different' }, { text: 'Different' }, { fromAddress: 'other@example.org' },
    { templateVersionId: 'version-2' },
    { attachments: [{ id: 'a', key: 'private/a', filename: 'a.pdf', contentType: 'application/pdf', bytes: 10, digest: 'hash' }] },
  ]) assert.notEqual(await digest(canonicalContent({ ...content, ...change })), original);
  assert.equal(await digest(canonicalContent({ ...content })), original);
});

test('sent, rejected and ambiguous drafts cannot be edited into a resend', () => {
  assert.equal(editable('queued'), true);
  assert.equal(editable('submitted'), true);
  assert.equal(editable('accepted'), false);
  assert.equal(editable('outcome_unknown'), false);
  assert.equal(editable('rejected'), false);
});

test('recipient policy rejects duplicates across To/CC/BCC and excessive audiences', () => {
  assert.equal(recipientsValid(content.recipients), true);
  assert.equal(recipientsValid({ ...content.recipients, bcc: ['client@example.org'] }), false);
  assert.equal(recipientsValid({ to: Array.from({ length: 51 }, (_, i) => `${i}@example.org`), cc: [], bcc: [] }), false);
});
