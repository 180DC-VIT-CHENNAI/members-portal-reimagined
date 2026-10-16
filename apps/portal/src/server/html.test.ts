import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeHtml, stripTags } from './html.ts';

test('keeps allow-listed markup', () => {
  const html = '<h2>Result</h2><p>We <strong>doubled</strong> reach. <a href="https://example.org" title="site">Read</a></p><ul><li>One</li></ul>';
  assert.equal(sanitizeHtml(html), html);
});

test('drops scripts, styles, event handlers and script URLs', () => {
  const out = sanitizeHtml('<p onclick="x()">Hi</p><script>alert(1)</script><style>p{}</style><a href="javascript:alert(1)">x</a><img src=" data:text/html,x" onerror=alert(1)>');
  assert.equal(out.includes('script'), false);
  assert.equal(out.includes('onclick'), false);
  assert.equal(out.includes('onerror'), false);
  assert.equal(out.includes('javascript:'), false);
  assert.equal(out.includes('data:'), false);
  assert.ok(out.startsWith('<p>Hi</p>'));
});

test('escapes tags outside the allow-list', () => {
  assert.equal(sanitizeHtml('<iframe src="https://evil.example"></iframe>'), '&lt;iframe src=&quot;https://evil.example&quot;&gt;&lt;/iframe&gt;');
});

test('entity-encoded script URLs are caught', () => {
  assert.equal(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>'), '<a>x</a>');
});

test('stripTags leaves plain text', () => {
  assert.equal(stripTags(' <b>General</b> body <i>meet</i> '), 'General body meet');
});
