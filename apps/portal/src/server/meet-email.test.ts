import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetEmailHtml } from './meet-email.ts';

const meet = {
  kind: 'club' as const,
  title: 'All hands <script>x()</script>',
  description: 'Agenda\n<b>budget</b>',
  meetLink: 'https://meet.example.com/abc?x=1&y="2"',
  scheduledAt: '2026-10-20T13:00:00.000Z',
};

test('dynamic fields are escaped and the link is an escaped href', () => {
  const html = meetEmailHtml(meet);
  assert.doesNotMatch(html, /<script>|<b>/);
  assert.match(html, /All hands &lt;script&gt;/);
  assert.match(html, /Agenda<br>&lt;b&gt;budget/);
  assert.ok(html.includes('href="https://meet.example.com/abc?x=1&amp;y=&quot;2&quot;"'));
});

test('times are converted to IST and a meet without a link has no href', () => {
  const html = meetEmailHtml({ ...meet, meetLink: null, description: null });
  assert.match(html, /6:30\s?pm/i);
  assert.doesNotMatch(html, /href=/);
});
