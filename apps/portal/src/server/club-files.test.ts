import test from 'node:test';
import assert from 'node:assert/strict';
import { clubFileFromObject, clubFileProblem, downloadFileHeaders, isSharedFileKey, matchesClubFileFilter, sharedFileKeyById, sharedFileObjects } from './club-files.ts';
const bucket = {
  async list({ prefix, cursor }: { prefix: string; cursor?: string }) {
    const keys = ({ 'general/': cursor ? ['general/second.pdf'] : ['general/first.pdf', 'general/nested/private.pdf'], 'projects/': ['projects/project.pdf'], 'events/': ['events/event.pdf'] } as Record<string, string[]>)[prefix] || ['letters/private.pdf'];
    return { objects: keys.map((key: string) => ({ key })), truncated: prefix === 'general/' && !cursor, cursor: 'next' };
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
  assert.equal(await sharedFileKeyById({ list: async ({ prefix }: { prefix: string }) => ({ objects: [{ key: `${prefix}duplicate.pdf` }] }) }, 'duplicate'), null);
});
test('private downloads encode hostile filenames and disable browser caching', () => {
  const headers = downloadFileHeaders('report"\r\nInjected: yes.pdf', 'application/pdf');
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(/[\r\n]/.test(headers['Content-Disposition']), false);
  assert.match(headers['Content-Disposition'], /^attachment;/);
});

test('upload checks reject empty, oversized and unlisted files', () => {
  assert.equal(clubFileProblem({ name: 'a.pdf', size: 0 }), 'empty_file');
  assert.equal(clubFileProblem({ name: 'a.pdf', size: 26 * 1024 * 1024 }), 'file_too_large');
  assert.equal(clubFileProblem({ name: 'run.exe', size: 10 }), 'unsupported_file_type');
  assert.equal(clubFileProblem({ name: 'page.html', size: 10 }), 'unsupported_file_type');
  assert.equal(clubFileProblem({ name: 'Minutes.PDF', size: 10 }), null);
});

test('filters match event and project exactly and search name and description', () => {
  const file = clubFileFromObject({ key: 'events/abc.pdf', size: 3, uploaded: new Date(0), customMetadata: { fileName: 'Expo deck.pdf', eventName: 'Club Expo', description: 'Final slides' } });
  assert.equal(file.id, 'abc');
  assert.equal(matchesClubFileFilter(file, { eventName: 'club expo' }), true);
  assert.equal(matchesClubFileFilter(file, { eventName: 'club' }), false);
  assert.equal(matchesClubFileFilter(file, { search: 'slides' }), true);
  assert.equal(matchesClubFileFilter(file, { projectName: 'x' }), false);
});
