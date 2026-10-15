import test from 'node:test';
import assert from 'node:assert/strict';
import { isSharedFileKey, sharedFileObjects, sharedFileKeyById, downloadFileHeaders } from './club-file-policy.ts';
const bucket = {
  async list({ prefix, cursor }) {
    const keys = { 'general/': cursor ? ['general/second.pdf'] : ['general/first.pdf', 'general/nested/private.pdf'], 'projects/': ['projects/project.pdf'], 'events/': ['events/event.pdf'] }[prefix] || ['letters/private.pdf'];
    return { objects: keys.map(key => ({ key })), truncated: prefix === 'general/' && !cursor, cursor: 'next' };
  },
};
test('shared library traverses pages and never lists private or nested namespaces', async () => {
  const keys = []; for await (const obj of sharedFileObjects(bucket)) keys.push(obj.key);
  assert.deepEqual(keys, ['general/first.pdf', 'general/second.pdf', 'projects/project.pdf', 'events/event.pdf']);
  for (const key of ['letters/private.pdf', 'private/projects/a.pdf', 'general/nested/a.pdf', 'general/../a.pdf']) assert.equal(isSharedFileKey(key), false);
});
test('lookup uses complete IDs, later pages and fails closed for ambiguity', async () => {
  assert.equal(await sharedFileKeyById(bucket, 'second'), 'general/second.pdf');
  assert.equal(await sharedFileKeyById(bucket, 'sec'), null);
  assert.equal(await sharedFileKeyById(bucket, '../private'), null);
  assert.equal(await sharedFileKeyById(bucket, 'private'), null);
  assert.equal(await sharedFileKeyById({ list: async ({ prefix }) => ({ objects: [{ key: `${prefix}duplicate.pdf` }] }) }, 'duplicate'), null);
});
test('private downloads encode hostile filenames and disable browser caching', () => {
  const headers = downloadFileHeaders('report"\r\nInjected: yes.pdf', 'application/pdf');
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(/[\r\n]/.test(headers['Content-Disposition']), false);
  assert.match(headers['Content-Disposition'], /^attachment;/);
});
