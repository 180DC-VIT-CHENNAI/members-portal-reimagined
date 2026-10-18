import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLetterHTML,
  collectLetterData,
  defaultLetterForm,
  docNumber,
  fmtDate,
  LETTER_LAYOUTS,
  LETTER_TYPES,
  validateLetterForm,
} from './templates.ts';

const TITLES = {
  promotion: 'LETTER OF PROMOTION',
  termination: 'LETTER OF TERMINATION',
  transfer: 'LETTER OF DEPARTMENT TRANSFER',
  resignation: 'LETTER OF RESIGNATION',
  showcause: 'SHOW-CAUSE / WARNING LETTER',
  service: 'SERVICE CERTIFICATE',
  relieving: 'RELIEVING LETTER',
  recognition: 'RECOGNITION LETTER',
  mou: 'MEMORANDUM OF UNDERSTANDING',
  announcement: 'ANNOUNCEMENT LETTER',
  'department-report': 'DEPARTMENT REPORT',
  ldi: 'LDI FORM',
} as const;

test('covers exactly the 13 legacy types, each with a layout', () => {
  assert.equal(LETTER_TYPES.length, 13);
  assert.deepEqual(Object.keys(LETTER_LAYOUTS).sort(), [...LETTER_TYPES].sort());
  assert.equal(LETTER_LAYOUTS.ldi.kind === 'flow' && LETTER_LAYOUTS.ldi.minPages, 3);
  assert.equal(LETTER_LAYOUTS['department-report'].kind === 'flow' && LETTER_LAYOUTS['department-report'].minPages, 3);
});

test('every non-appointment type renders its title, reference and one signature table', () => {
  for (const type of LETTER_TYPES) {
    const data = collectLetterData({ ...defaultLetterForm('2026-10-17'), 'f-type': type, 'f-name': 'Asha', 'f-reg': '25bce1234' });
    const html = buildLetterHTML(data);
    if (type === 'appointment') {
      assert.match(html, /class="appt-body"/);
      assert.doesNotMatch(html, /class="sig"/);
      continue;
    }
    assert.ok(html.includes(`<div class="main">${TITLES[type]}</div>`), type);
    assert.ok(html.includes(`Ref. No.: ${data.docnum}`), type);
    assert.equal(html.match(/<table class="sig">/g)?.length, 1, type);
  }
});

test('interpolated values are escaped; announcement newlines become <br>', () => {
  const data = collectLetterData({
    'f-type': 'announcement',
    'f-announcement-sender': '<script>alert(1)</script>',
    'f-announcement-message': 'a & "b"\nc',
  });
  const html = buildLetterHTML(data);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('a &amp; &quot;b&quot;<br>c'));
});

test('report pipe rows become escaped table cells', () => {
  const html = buildLetterHTML(collectLetterData({ 'f-type': 'department-report', 'f-report-director': 'D', 'f-report-subteams': 'Web | <i>A</i> | Active' }));
  assert.ok(html.includes('<td>Web</td><td>&lt;i&gt;A&lt;/i&gt;</td><td class="status-active">Active</td>'));
});

test('letter data is frozen and unknown types fall back to appointment', () => {
  const data = collectLetterData({ 'f-type': 'nope' });
  assert.equal(data.type, 'appointment');
  assert.ok(Object.isFrozen(data));
});

test('reference numbers match the legacy FNV-1a values and ignore the date', () => {
  assert.equal(docNumber('promotion', 'A', '25BCE1234', 'HR', 'Consultant', 'Lead'), '180DC-B4062409');
  const service = { 'f-type': 'service', 'f-name': 'Asha', 'f-reg': '25bce1234', 'f-team': 'HR' };
  assert.equal(collectLetterData({ ...service, 'f-date': '2026-10-17' }).docnum, '180DC-F76B1B74');
  assert.equal(collectLetterData({ ...service, 'f-date': '2027-01-01' }).docnum, '180DC-F76B1B74');
  assert.equal(collectLetterData({ 'f-type': 'ldi', 'f-ldi-submitter': 'Ravi', 'f-ldi-title': 'Idea' }).docnum, '180DC-5F7F3F7E');
});

test('dates format like the legacy studio', () => {
  assert.equal(fmtDate('2026-10-07'), '7 October 2026');
  assert.equal(fmtDate(''), '');
  assert.equal(collectLetterData({}).dateStr, '(select date)');
});

test('validation reports the first missing or invalid field per type', () => {
  const member = { 'f-name': 'Asha', 'f-reg': '25BCE1234' };
  const cases: readonly [Record<string, string>, string | null][] = [
    [{ 'f-type': 'appointment', 'f-name': 'Asha' }, null],
    [{ 'f-type': 'promotion' }, 'f-name'],
    [{ 'f-type': 'promotion', 'f-name': 'Asha', 'f-reg': '25BCE0234' }, 'f-reg'],
    [{ 'f-type': 'promotion', 'f-name': 'Asha', 'f-reg': ' 25bce1234 ' }, null],
    [{ 'f-type': 'transfer', ...member, 'f-team-from': 'HR', 'f-team-to': 'HR' }, 'f-team-to'],
    [{ 'f-type': 'termination', ...member }, 'f-reason'],
    [{ 'f-type': 'resignation', ...member }, 'f-resignation-reason'],
    [{ 'f-type': 'showcause', ...member }, 'f-sc-incident'],
    [{ 'f-type': 'service', ...member, 'f-service-projects': '2' }, 'f-service-positions'],
    [{ 'f-type': 'recognition', ...member, 'f-rec-task': 't' }, 'f-rec-outcome'],
    [{ 'f-type': 'mou', 'f-mou-party': 'NGO' }, 'f-mou-purpose'],
    [{ 'f-type': 'announcement', 'f-announcement-sender': 'S' }, 'f-announcement-message'],
    [{ 'f-type': 'announcement', 'f-announcement-sender': 'S', 'f-announcement-message': 'm', 'f-announcement-kind': 'event' }, 'f-announcement-event-date'],
    [{ 'f-type': 'department-report' }, 'f-report-director'],
    [{ 'f-type': 'ldi', 'f-ldi-submitter': 'R' }, 'f-ldi-title'],
  ];
  for (const [form, field] of cases) {
    const result = validateLetterForm(form);
    assert.equal(result.ok ? null : result.field, field, JSON.stringify(form));
  }
});

test('an MOU with complete agreement fields needs no member name or registration', () => {
  const ids = ['f-mou-party', 'f-mou-purpose', 'f-mou-scope', 'f-mou-resp-ours', 'f-mou-resp-other', 'f-mou-docs', 'f-mou-term', 'f-mou-confidentiality', 'f-mou-termination'];
  assert.deepEqual(validateLetterForm({ 'f-type': 'mou', ...Object.fromEntries(ids.map((id) => [id, 'x'])) }), { ok: true });
});
