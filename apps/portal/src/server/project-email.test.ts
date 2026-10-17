import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDay, projectCreatedHtml, projectMemberHtml } from './project-email.ts';

test('project emails escape every dynamic field', () => {
  const html = projectCreatedHtml({ name: 'Audit <b>', client: 'R&D "Co"', deadline: '2026-10-30', departments: ['Finance', '<Ops>'] });
  assert.doesNotMatch(html, /<b>|<Ops>/);
  assert.ok(html.includes('Audit &lt;b&gt;') && html.includes('R&amp;D &quot;Co&quot;') && html.includes('&lt;Ops&gt;'));
  assert.doesNotMatch(projectMemberHtml('<i>x</i>', 'Lead & analyst'), /<i>|& /);
});

test('optional facts are left out and days are formatted without shifting', () => {
  const html = projectCreatedHtml({ name: 'X', client: null, deadline: null, departments: ['Finance'] });
  assert.doesNotMatch(html, /Client|Deadline/);
  assert.match(formatDay('2026-10-30'), /30 Oct 2026/);
  assert.match(formatDay('2027-01-01'), /1 Jan 2027/);
});
