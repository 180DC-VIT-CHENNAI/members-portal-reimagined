import * as v from 'valibot';
import { id } from '../validation';
import { CONVERSATION_STATUSES, INBOX_VIEWS, MAIL_PRIORITIES } from './inbox-types';

export const inboxQuery = v.strictObject({
  view: v.optional(v.picklist(INBOX_VIEWS), 'inbox'),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  before: v.optional(id),
});
export const triageInput = v.strictObject({
  status: v.optional(v.picklist(CONVERSATION_STATUSES)),
  priority: v.optional(v.picklist(MAIL_PRIORITIES)),
  assignedTo: v.optional(v.nullable(id)),
  tags: v.optional(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(30))), v.maxLength(10))),
  dueForReplyAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
});
export const noteInput = v.strictObject({ body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000)) });
export const replyInput = v.strictObject({ messageId: id });
