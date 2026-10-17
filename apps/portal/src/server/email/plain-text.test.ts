import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToPlainText } from './plain-text.ts';

test('plain text removes executable content and retains link destinations', () => {
  const text = htmlToPlainText('<head>hidden</head><script>bad()</script><p>Read <a href="https://example.com">more</a> &amp; &#x1f600;</p>');
  assert.equal(text, 'Read more (https://example.com) & 😀');
});
