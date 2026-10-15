import test from 'node:test';
import assert from 'node:assert/strict';
import { commentBody } from './task-comment-input.ts';
test('comment text is bounded plain text and retains meaningful punctuation', () => {
  assert.equal(commentBody('  <script>plain text</script>\nNext action  '), '<script>plain text</script>\nNext action');
  for (const value of [undefined, null, {}, 1, '', '   ', 'a'.repeat(4001)]) assert.throws(() => commentBody(value));
  assert.equal(commentBody('a'.repeat(4000)).length, 4000);
});
