import * as v from 'valibot';
import { emailAddress, id, singleLine } from '../validation';
import { MAIL_ADAPTERS, MAIL_CATEGORIES, MAIL_FOLDERS, MAILBOX_CAPABILITIES, MAILBOX_STATUSES } from './types';

const addresses = v.pipe(v.array(emailAddress), v.maxLength(50));
export const mailboxInput = v.strictObject({
  address: emailAddress,
  displayName: singleLine(120),
  purpose: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ''),
  managerId: id,
});
export const policyInput = v.strictObject({
  status: v.optional(v.picklist(MAILBOX_STATUSES)),
  outboundAdapter: v.optional(v.picklist(MAIL_ADAPTERS)),
  approvalRequired: v.optional(v.literal(true)),
  requireDistinctReviewer: v.optional(v.boolean()),
  repliesOnly: v.optional(v.boolean()),
  signature: v.optional(v.pipe(v.string(), v.maxLength(2000))),
  outboundPaused: v.optional(v.boolean()),
  categoryPolicy: v.optional(v.array(v.picklist(MAIL_CATEGORIES))),
});
export const membershipInput = v.strictObject({
  capabilities: v.pipe(v.array(v.picklist(MAILBOX_CAPABILITIES)), v.maxLength(11)),
  validUntil: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp())), null),
});
export const draftInput = v.strictObject({
  to: v.pipe(addresses, v.minLength(1)),
  cc: v.optional(addresses, []),
  bcc: v.optional(addresses, []),
  subject: singleLine(300),
  text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100_000)),
  attachmentIds: v.optional(v.pipe(v.array(id), v.maxLength(10)), []),
  category: v.optional(v.picklist(MAIL_CATEGORIES), 'correspondence'),
});
export const draftQuery = v.strictObject({
  before: v.optional(id),
  folder: v.optional(v.picklist(MAIL_FOLDERS)),
});
export const editDraftInput = v.strictObject({ ...draftInput.entries, revision: v.pipe(v.number(), v.integer(), v.minValue(1)) });
export const revisionInput = v.strictObject({ revision: v.pipe(v.number(), v.integer(), v.minValue(1)) });
export const reviewInput = v.strictObject({
  ...revisionInput.entries,
  decision: v.picklist(['approved', 'changes_requested', 'rejected']),
  comments: v.optional(v.pipe(v.string(), v.maxLength(2000)), ''),
});
export const sendInput = v.strictObject({
  ...revisionInput.entries,
  idempotencyKey: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{8,128}$/)),
  scheduledAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp())), null),
});
export type DraftInput = v.InferOutput<typeof draftInput>;
