import type { Definition, Field, TemplateAction, Values } from '../server/templates/validation.ts';
import { FIELD_TYPES, TEMPLATE_ACTIONS } from '../server/templates/validation.ts';
import { api } from './api.ts';

export type { Definition, Field, TemplateAction, Values };
export { FIELD_TYPES, TEMPLATE_ACTIONS };
export type FieldType = Field['type'];

export const loadTemplates = () => api('/api/email-templates', { query: {} });
export const loadTemplate = (id: string) => api('/api/email-templates/:id', { params: { id } });
export const loadMailboxTemplates = (id: string) => api('/api/mailboxes/:id/templates', { params: { id } });
export type TemplateDetail = Awaited<ReturnType<typeof loadTemplate>>;
export type UsableTemplate = Awaited<ReturnType<typeof loadMailboxTemplates>>['templates'][number];

export const FIELD_LABELS: Readonly<Record<FieldType, string>> = {
  short: 'Short text', long: 'Long text', date: 'Date', amount: 'Amount', organization: 'CRM organisation',
  contact: 'CRM contact', select: 'Select one', multi_select: 'Select many', url: 'Web link',
  attachment: 'Attachment', boolean: 'Yes / no', rows: 'Repeating rows',
};
export const ACTION_LABELS: Readonly<Record<TemplateAction, string>> = {
  author: 'Author', edit: 'Edit', publish: 'Publish', retire: 'Retire', draft: 'Draft from', review: 'Review', send: 'Send',
};
export const SCOPE_LABELS = { global: 'Club-wide', department: 'Department', mailbox: 'Mailbox' } as const;
export const AUTOMATIC_VARIABLES = ['member_name', 'member_position', 'club_name', 'club_website'] as const;

/** Raw form values: every input edits a string (or a checkbox/multi-select), converted once on submit. */
export type RawValues = Record<string, string | boolean | readonly string[]>;

export function toValues(definition: Definition, raw: RawValues): Values {
  const values: Values = {};
  for (const f of definition.fields) {
    const value = raw[f.key];
    if (value === undefined || value === '') continue;
    if (f.type === 'boolean') values[f.key] = value === true;
    else if (f.type === 'multi_select') values[f.key] = Array.isArray(value) ? [...value] : [];
    else if (typeof value !== 'string') continue;
    else if (f.type === 'amount') values[f.key] = Number(value);
    else if (f.type === 'rows') {
      values[f.key] = value.split('\n').filter((line) => line.trim()).map((line) =>
        Object.fromEntries(line.split('|').map((cell, i) => [`column_${i + 1}`, cell.trim()])));
    } else values[f.key] = value;
  }
  return values;
}

/** Sample data from each field's example; CRM and attachment fields need a real record and stay empty. */
export function sampleValues(definition: Definition): RawValues {
  const raw: RawValues = {};
  for (const f of definition.fields) {
    if (['organization', 'contact', 'attachment'].includes(f.type)) continue;
    if (f.type === 'boolean') raw[f.key] = true;
    else if (f.type === 'select') raw[f.key] = f.options[0] ?? '';
    else if (f.type === 'multi_select') raw[f.key] = f.options.slice(0, 1);
    else if (f.example) raw[f.key] = f.example;
  }
  return raw;
}

export type FieldForm = { key: string; label: string; type: FieldType; required: boolean; example: string; options: string; min: string; max: string };
export type DefinitionForm = {
  fields: FieldForm[]; subject: string; body: string; signature: string; allowedMailboxIds: string[];
  allowedRecipients: string; category: Definition['category']; followupDays: string; policy: Partial<Record<TemplateAction, string[]>>;
};

export const emptyField = (): FieldForm => ({ key: '', label: '', type: 'short', required: true, example: '', options: '', min: '', max: '' });

export function formFrom(d: Definition): DefinitionForm {
  return {
    fields: d.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, example: f.example, options: f.options.join('\n'),
      min: f.min === undefined ? '' : String(f.min), max: f.max === undefined ? '' : String(f.max) })),
    subject: d.subject, body: d.body, signature: d.signature, allowedMailboxIds: [...d.allowedMailboxIds],
    allowedRecipients: d.allowedRecipients.join(', '), category: d.category,
    followupDays: d.followupDays === null ? '' : String(d.followupDays),
    policy: Object.fromEntries(Object.entries(d.policy).map(([k, ids]) => [k, [...ids]])),
  };
}

export function definitionFrom(form: DefinitionForm): Definition {
  const number = (value: string) => value.trim() === '' ? undefined : Number(value);
  return {
    fields: form.fields.map((f) => ({
      key: f.key.trim(), label: f.label.trim(), type: f.type, required: f.required, example: f.example,
      options: ['select', 'multi_select'].includes(f.type) ? f.options.split('\n').map((x) => x.trim()).filter(Boolean) : [],
      ...(number(f.min) === undefined ? {} : { min: number(f.min) }), ...(number(f.max) === undefined ? {} : { max: number(f.max) }),
    })),
    subject: form.subject, body: form.body, signature: form.signature, allowedMailboxIds: form.allowedMailboxIds,
    allowedRecipients: form.allowedRecipients.split(/[,;\s]+/).filter(Boolean), category: form.category,
    followupDays: form.followupDays.trim() ? Number(form.followupDays) : null,
    policy: Object.fromEntries(Object.entries(form.policy).filter(([, ids]) => ids?.length)),
  };
}

export const emptyForm = (mailboxIds: string[] = []): DefinitionForm => ({
  fields: [], subject: '', body: '', signature: '', allowedMailboxIds: mailboxIds, allowedRecipients: '',
  category: 'correspondence', followupDays: '', policy: {},
});
