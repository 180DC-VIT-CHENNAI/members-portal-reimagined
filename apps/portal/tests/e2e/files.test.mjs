import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
const MEMBER = 'files.member@example.com';
let portal;
let admin;
let member;
let publicClient;

const textFile = (name, data = 'hello club', type = 'text/plain') => ({ name, type, data });
// Smallest valid PNG (1x1, transparent).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

before(async () => {
  portal = await startPortal();
  admin = signIn(portal, ADMIN);
  publicClient = anonymous(portal);
  const res = await admin.post('/api/people', { email: MEMBER, fullName: 'Fran Files', departmentId: 'finance', positionId: 'pos_finance_member' });
  assert.equal(res.status, 201, res.text);
  member = signIn(portal, MEMBER);
});
after(async () => {
  await portal?.stop();
});

describe('club files', () => {
  test('upload, list, filter, download and delete round trip', async () => {
    const up = await admin.upload('/api/club-files/upload', {
      file: textFile('Budget notes.txt', 'line one'),
      category: 'events',
      eventName: 'Orientation 2026',
      description: 'Notes from planning',
    });
    assert.equal(up.status, 201, up.text);
    assert.match(up.json.key, /^events\/[0-9a-f]{32}\.txt$/);
    const id = up.json.id;

    const project = await admin.upload('/api/club-files/upload', { file: textFile('plan.txt'), category: 'projects', projectName: 'Rural co-op' });
    assert.equal(project.status, 201, project.text);

    const list = await member.get('/api/club-files');
    assert.equal(list.status, 200, list.text);
    const mine = list.json.files.find((f) => f.id === id);
    assert.ok(mine, 'uploaded file is listed');
    assert.equal(mine.fileName, 'Budget notes.txt');
    assert.equal(mine.eventName, 'Orientation 2026');
    assert.equal(mine.uploadedBy, ADMIN);

    const events = await member.get('/api/club-files?category=events');
    assert.deepEqual(events.json.files.map((f) => f.id), [id]);
    const search = await member.get('/api/club-files?search=budget');
    assert.deepEqual(search.json.files.map((f) => f.id), [id]);
    assert.deepEqual((await member.get('/api/club-files/events')).json.events, ['Orientation 2026']);
    assert.deepEqual((await member.get('/api/club-files/projects')).json.projects, ['Rural co-op']);
    assert.equal((await member.get('/api/club-files?category=letters')).status, 400);

    const download = await member.get(`/api/club-files/${id}/download`);
    assert.equal(download.status, 200);
    assert.equal(download.text, 'line one');
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
    assert.match(download.headers.get('cache-control'), /no-store/);

    assert.equal((await member.del(`/api/club-files/${id}`)).status, 403);
    assert.equal((await admin.del(`/api/club-files/${id}`)).status, 204);
    assert.equal((await member.get(`/api/club-files/${id}/download`)).status, 404);
    assert.equal((await admin.del(`/api/club-files/${id}`)).status, 404);
    const audit = portal.db.prepare("SELECT action FROM audit_log WHERE target_type = 'club_file' AND target_id = ? ORDER BY created_at").all(id);
    assert.deepEqual(audit.map((r) => r.action), ['club_file.upload', 'club_file.delete']);
  });

  test('rejects missing, empty, disallowed and oversized files', async () => {
    assert.equal((await admin.upload('/api/club-files/upload', { category: 'general' })).status, 400);
    const empty = await admin.upload('/api/club-files/upload', { file: textFile('empty.txt', '') });
    assert.equal(empty.status, 400);
    const exe = await admin.upload('/api/club-files/upload', { file: textFile('tool.exe', 'MZ') });
    assert.equal(exe.status, 400);
    const big = await admin.upload('/api/club-files/upload', { file: textFile('big.txt', Buffer.alloc(25 * 1024 * 1024 + 1)) });
    assert.equal(big.status, 400);
    const badCategory = await admin.upload('/api/club-files/upload', { file: textFile('a.txt'), category: 'letters' });
    assert.equal(badCategory.status, 400);
  });

  test('signed-out callers get 401 and members cannot upload', async () => {
    assert.equal((await publicClient.get('/api/club-files')).status, 401);
    assert.equal((await publicClient.upload('/api/club-files/upload', { file: textFile('a.txt') })).status, 401);
    assert.equal((await member.upload('/api/club-files/upload', { file: textFile('a.txt') })).status, 403);
  });
});

describe('case-study files', () => {
  test('image upload is served publicly and can be deleted', async () => {
    const up = await admin.upload('/api/case-studies/upload-image', { image: { name: 'cover.png', type: 'image/png', data: PNG } });
    assert.equal(up.status, 200, up.text);
    assert.match(up.json.key, /^images\/[0-9a-f-]{36}\.png$/);
    const served = await publicClient.get(up.json.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal(served.headers.get('content-disposition'), null);
    assert.equal((await admin.del('/api/case-studies/delete-image', { key: up.json.key })).status, 204);
    assert.equal((await publicClient.get(up.json.url)).status, 404);
  });

  test('image type, key and permission checks', async () => {
    const svg = await admin.upload('/api/case-studies/upload-image', { image: { name: 'x.svg', type: 'image/svg+xml', data: '<svg/>' } });
    assert.equal(svg.status, 400);
    assert.equal((await admin.del('/api/case-studies/delete-image', { key: '../club_files/general/x.txt' })).status, 400);
    assert.equal((await publicClient.get('/api/case-studies/images/letters/x.pdf')).status, 400);
    assert.equal((await publicClient.upload('/api/case-studies/upload-image', { image: { name: 'c.png', type: 'image/png', data: PNG } })).status, 401);
  });

  test('source documents: DOCX downloads as an attachment, other types rejected', async () => {
    const docx = await admin.upload('/api/case-studies/upload-source', {
      file: { name: 'Study.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: 'PK fake' },
    });
    assert.equal(docx.status, 200, docx.text);
    const served = await publicClient.get(docx.json.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-disposition'), 'attachment');
    assert.equal((await admin.upload('/api/case-studies/upload-source', { file: textFile('notes.txt') })).status, 400);
  });

  test('document import turns a PDF into escaped HTML with a suggested title', async () => {
    const pdf = '%PDF-1.4\n1 0 obj\n<< >>\nendobj\n2 0 obj\n<< /Length 10 >>\nstream\nBT (Market entry for a rural co-op) Tj ET\nendstream\nendobj\n%%EOF';
    const res = await admin.upload('/api/case-studies/upload-document', { document: { name: 'study.pdf', type: 'application/pdf', data: pdf } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.suggestedTitle, 'Market entry for a rural co-op');
    assert.match(res.json.content, /<p>Market entry for a rural co-op<\/p>/);
    const empty = await admin.upload('/api/case-studies/upload-document', {
      document: { name: 'blank.pdf', type: 'application/pdf', data: '%PDF-1.4\nstream\nBT ET\nendstream' },
    });
    assert.equal(empty.status, 400);
  });
});

describe('gallery CDN', () => {
  test('missing photos are 404 and traversal is rejected, without signing in', async () => {
    assert.equal((await publicClient.get('/api/gallery-cdn/2025/nope.webp')).status, 404);
    assert.equal((await publicClient.get('/api/gallery-cdn/..%2Fsecret')).status, 400);
  });
});
