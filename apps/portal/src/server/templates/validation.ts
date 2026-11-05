import * as v from 'valibot';
import { emailAddress, id, singleLine } from '../validation';
import { MAIL_CATEGORIES } from '../mailboxes/types';

export const TEMPLATE_ACTIONS = ['author', 'edit', 'publish', 'retire', 'draft', 'review', 'send'] as const;
export type TemplateAction = (typeof TEMPLATE_ACTIONS)[number];
export const FIELD_TYPES = ['short', 'long', 'date', 'amount', 'organization', 'contact', 'select', 'multi_select', 'url', 'attachment', 'boolean', 'rows'] as const;
const field = v.strictObject({
  key: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{0,39}$/)),
  label: singleLine(100),
  type: v.picklist(FIELD_TYPES),
  required: v.optional(v.boolean(), false),
  example: v.optional(v.pipe(v.string(), v.maxLength(500)), ''),
  options: v.optional(v.pipe(v.array(singleLine(100)), v.maxLength(30)), []),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
});
export const definitionInput = v.strictObject({
  fields: v.pipe(v.array(field), v.maxLength(40)),
  subject: singleLine(300),
  body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(30_000)),
  signature: v.optional(v.pipe(v.string(), v.maxLength(2000)), ''),
  allowedMailboxIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(20)),
  allowedRecipients: v.optional(v.pipe(v.array(emailAddress), v.maxLength(50)), []),
  category: v.optional(v.picklist(MAIL_CATEGORIES), 'correspondence'),
  policy: v.optional(v.record(v.picklist(TEMPLATE_ACTIONS), v.pipe(v.array(id), v.maxLength(50))), {}),
  followupDays: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365))), null),
});
export type Definition = v.InferOutput<typeof definitionInput>;
export type Field = Definition['fields'][number];
export const createTemplateInput = v.strictObject({
  name: singleLine(120),
  ownerScope: v.picklist(['global', 'department', 'mailbox']),
  ownerId: v.optional(v.nullable(id), null),
  definition: definitionInput,
});
export const saveVersionInput = v.strictObject({
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  definition: definitionInput,
});
export const transitionInput = v.strictObject({
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  action: v.picklist(['publish', 'retire']),
});
const scalar = v.union([v.pipe(v.string(), v.maxLength(10_000)), v.number(), v.boolean()]);
export const valuesInput = v.record(v.string(), v.union([
  scalar, v.pipe(v.array(scalar), v.maxLength(30)),
  v.pipe(v.array(v.record(v.string(), scalar)), v.maxLength(30)),
]));
export type Values = v.InferOutput<typeof valuesInput>;
export const renderInput = v.strictObject({
  versionId: id,
  values: valuesInput,
  to: v.optional(v.pipe(v.array(emailAddress), v.maxLength(50)), []),
});
export const testInput = v.strictObject({ versionId: id, values: valuesInput });
export const templateQuery = v.strictObject({ before: v.optional(id) });
