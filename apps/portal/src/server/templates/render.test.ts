import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definitionWarnings, renderTemplate } from './render.ts';
import type { Definition } from './validation.ts';

const base: Definition = {
  fields: [
    { key: 'name', label: 'Name', type: 'short', required: true, example: 'Asha', options: [] },
    { key: 'budget', label: 'Budget', type: 'amount', required: false, example: '', options: [], min: 0, max: 1000 },
    { key: 'when', label: 'Date', type: 'date', required: false, example: '', options: [] },
    { key: 'items', label: 'Items', type: 'rows', required: false, example: '', options: [] },
  ],
  subject: 'Hello {{name}}', body: 'Dear {{name}},\n{{items}}\n{{member_name}}', signature: '{{club_name}}',
  allowedMailboxIds: ['m1'], allowedRecipients: [], category: 'correspondence', policy: {}, followupDays: null,
};
const trusted = { member_name: 'Member', member_position: 'Director', club_name: 'Club', club_website: 'https://example.org' };

test('values are inserted as text and escaped in HTML, never evaluated', () => {
  const r = renderTemplate(base, { name: '<script>alert(1)</script>' }, trusted);
  assert.equal(r.text.includes('<script>alert(1)</script>'), true);
  assert.equal(r.html.includes('<script>'), false);
  assert.equal(r.html.includes('&lt;script&gt;'), true);
});

test('a value containing a variable is not re-interpolated', () => {
  const r = renderTemplate(base, { name: '{{member_name}}' }, trusted);
  assert.equal(r.subject, 'Hello {{member_name}}');
  assert.deepEqual(r.warnings, []);
});

test('trusted automatic fields cannot be overridden by caller values', () => {
  const r = renderTemplate(base, { name: 'A', member_name: 'Impostor' }, trusted);
  assert.equal(r.text.endsWith('Member'), true);
  assert.equal(r.warnings.includes('Unknown field: member_name'), true);
});

test('missing required, invalid and unresolved values produce warnings', () => {
  const r = renderTemplate({ ...base, body: '{{nope}} {{ constructor }} {{name}}' }, { budget: 5000, when: '2026-02-30' }, trusted);
  assert.deepEqual([...r.warnings].sort(), ['Invalid field: Budget', 'Invalid field: Date', 'Required field: Name', 'Unresolved variable: constructor', 'Unresolved variable: nope'].sort());
});

test('subject line breaks are flattened to prevent header injection', () => {
  const r = renderTemplate(base, { name: 'A\r\nBcc: x@example.org' }, trusted);
  assert.equal(/[\r\n]/.test(r.subject), false);
});

test('repeating rows render one line per row', () => {
  const r = renderTemplate(base, { name: 'A', items: [{ column_1: 'Audit', column_2: '2 weeks' }, { column_1: 'Report' }] }, trusted);
  assert.equal(r.text.includes('- Audit | 2 weeks\n- Report'), true);
});

test('definition checks reject unknown variables, duplicate or reserved keys and malformed syntax', () => {
  assert.deepEqual(definitionWarnings(base), []);
  const bad = definitionWarnings({
    ...base, fields: [...base.fields, { ...base.fields[0] }, { key: 'club_name', label: 'Club', type: 'short', required: false, example: '', options: [] },
      { key: 'kind', label: 'Kind', type: 'select', required: false, example: '', options: [] }],
    body: '{{missing}} {{name', subject: 'x',
  });
  for (const expected of ['Duplicate field keys', 'Automatic fields cannot be defined by authors', 'Options required: Kind', 'Unknown variable: missing', 'Malformed variable']) {
    assert.equal(bad.includes(expected), true, expected);
  }
});
