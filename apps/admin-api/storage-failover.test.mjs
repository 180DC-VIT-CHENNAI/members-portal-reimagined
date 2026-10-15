import test from 'node:test';
import assert from 'node:assert/strict';
import { withStorageFailover } from './storage-failover.ts';

const B2_ENV = {
  B2_S3_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
  B2_BUCKET: 'backup',
  B2_KEY_ID: 'kid',
  B2_APPLICATION_KEY: 'secret',
  B2_READ_KEY_ID: 'rkid',
  B2_READ_APPLICATION_KEY: 'rsecret',
};

const { B2_READ_KEY_ID, B2_READ_APPLICATION_KEY, ...WRITE_ONLY_ENV } = B2_ENV;

function memoryR2({ down = false } = {}) {
  const store = new Map();
  const fail = async () => { throw new Error('R2 unavailable'); };
  return {
    store,
    put: down ? fail : async (key, value, options = {}) => {
      store.set(key, { value: typeof value === 'string' ? value : new TextDecoder().decode(value), options });
      return { key };
    },
    get: down ? fail : async (key) => {
      const hit = store.get(key);
      return hit ? { key, body: hit.value, text: async () => hit.value, customMetadata: hit.options.customMetadata || {} } : null;
    },
    head: down ? fail : async (key) => (store.has(key) ? { key } : null),
    delete: down ? fail : async (key) => { store.delete(key); },
    list: down ? fail : async () => ({ objects: [...store.keys()].map((key) => ({ key })), truncated: false, delimitedPrefixes: [] }),
  };
}

function fakeB2() {
  const objects = new Map();
  const calls = [];
  const fetcher = async (request) => {
    const url = new URL(request.url);
    calls.push({ method: request.method, path: url.pathname, auth: request.headers.get('authorization') });
    const key = decodeURIComponent(url.pathname.replace(/^\/backup\//, ''));
    if (request.method === 'PUT') {
      objects.set(key, { body: await request.text(), type: request.headers.get('content-type'), meta: request.headers.get('x-amz-meta-r2-custom') });
      return new Response(null, { status: 200, headers: { etag: '"abc"' } });
    }
    if (request.method === 'DELETE') { objects.delete(key); return new Response(null, { status: 204 }); }
    if (url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix');
      const contents = [...objects.keys()].filter((k) => k.startsWith(prefix))
        .map((k) => `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key><Size>${objects.get(k).body.length}</Size><LastModified>2026-10-16T00:00:00.000Z</LastModified><ETag>&quot;abc&quot;</ETag></Contents>`).join('');
      return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);
    }
    const hit = objects.get(key);
    if (!hit) return new Response(null, { status: 404 });
    const headers = { 'content-length': String(hit.body.length), etag: '"abc"' };
    if (hit.type) headers['content-type'] = hit.type;
    if (hit.meta) headers['x-amz-meta-r2-custom'] = hit.meta;
    return new Response(request.method === 'HEAD' ? null : hit.body, { headers });
  };
  return { objects, calls, fetcher };
}

function harness(r2) {
  const pending = [];
  const b2 = fakeB2();
  const env = withStorageFailover({ ...B2_ENV, CLUB_FILES: r2 }, (p) => pending.push(p), b2.fetcher);
  return { env, b2, settle: () => Promise.all(pending) };
}

test('without B2 configuration the env is returned unchanged', () => {
  const r2 = memoryR2();
  const env = { CLUB_FILES: r2 };
  assert.equal(withStorageFailover(env, () => {}), env);
});

test('writes go to R2 and are mirrored to B2 with signed requests and metadata', async () => {
  const r2 = memoryR2();
  const { env, b2, settle } = harness(r2);
  await env.CLUB_FILES.put('general/a.txt', new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('hello')); c.close(); } }), {
    httpMetadata: { contentType: 'text/plain' },
    customMetadata: { uploadedByName: 'Srijan Gūchhait' },
  });
  await settle();
  assert.equal(r2.store.get('general/a.txt').value, 'hello');
  const mirrored = b2.objects.get('r2/club_files/general/a.txt');
  assert.equal(mirrored.body, 'hello');
  assert.equal(mirrored.type, 'text/plain');
  assert.match(b2.calls[0].auth, /^AWS4-HMAC-SHA256 Credential=kid\/\d{8}\/us-west-004\/s3\/aws4_request/);
});

test('reads fall back to B2 when R2 is down, preserving custom metadata', async () => {
  const healthy = harness(memoryR2());
  await healthy.env.CLUB_FILES.put('general/a.txt', 'hello', { customMetadata: { fileName: 'ä.txt' } });
  await healthy.settle();
  const down = withStorageFailover({ ...B2_ENV, CLUB_FILES: memoryR2({ down: true }) }, () => {}, healthy.b2.fetcher);
  const object = await down.CLUB_FILES.get('general/a.txt');
  assert.equal(await object.text(), 'hello');
  assert.deepEqual(object.customMetadata, { fileName: 'ä.txt' });
  assert.equal((await down.CLUB_FILES.head('general/a.txt')).key, 'general/a.txt');
  assert.equal(await down.CLUB_FILES.get('general/missing.txt'), null);
});

test('writes during an R2 outage land in B2 and stay readable after R2 recovers', async () => {
  const { env, b2 } = harness(memoryR2({ down: true }));
  await env.CLUB_FILES.put('events/b.txt', 'outage');
  assert.equal(b2.objects.get('r2/club_files/events/b.txt').body, 'outage');
  const recovered = withStorageFailover({ ...B2_ENV, CLUB_FILES: memoryR2() }, () => {}, b2.fetcher);
  assert.equal(await (await recovered.CLUB_FILES.get('events/b.txt')).text(), 'outage');
});

test('with only a write key, R2 failures propagate and outage writes still land in B2', async () => {
  const b2 = fakeB2();
  const env = withStorageFailover({ ...WRITE_ONLY_ENV, CLUB_FILES: memoryR2({ down: true }) }, () => {}, b2.fetcher);
  await env.CLUB_FILES.put('general/d.txt', 'kept');
  assert.equal(b2.objects.get('r2/club_files/general/d.txt').body, 'kept');
  assert.match(b2.calls[0].auth, /Credential=kid\//);
  await assert.rejects(env.CLUB_FILES.get('general/d.txt'), /R2 unavailable/);
  await assert.rejects(env.CLUB_FILES.list({ prefix: 'general/' }), /R2 unavailable/);
  const healthy = withStorageFailover({ ...WRITE_ONLY_ENV, CLUB_FILES: memoryR2() }, () => {}, b2.fetcher);
  assert.equal(await healthy.CLUB_FILES.get('general/d.txt'), null);
  assert.equal(b2.calls.length, 1);
});

test('failover reads are signed with the read key', async () => {
  const { env, b2 } = harness(memoryR2());
  await env.CLUB_FILES.get('general/none.txt');
  assert.equal(b2.calls.at(-1).method, 'GET');
  assert.match(b2.calls.at(-1).auth, /Credential=rkid\//);
});

test('list falls back to B2 with keys relative to the bucket', async () => {
  const healthy = harness(memoryR2());
  await healthy.env.CLUB_FILES.put('projects/x & y.pdf', 'pdf');
  await healthy.settle();
  const down = withStorageFailover({ ...B2_ENV, CLUB_FILES: memoryR2({ down: true }) }, () => {}, healthy.b2.fetcher);
  const page = await down.CLUB_FILES.list({ prefix: 'projects/' });
  assert.deepEqual(page.objects.map((o) => o.key), ['projects/x & y.pdf']);
  assert.equal(page.truncated, false);
});

test('deletes require R2 and are mirrored to B2', async () => {
  const { env, b2, settle } = harness(memoryR2());
  await env.CLUB_FILES.put('general/c.txt', 'bye');
  await settle();
  await env.CLUB_FILES.delete('general/c.txt');
  await settle();
  assert.equal(b2.objects.has('r2/club_files/general/c.txt'), false);
  const down = withStorageFailover({ ...B2_ENV, CLUB_FILES: memoryR2({ down: true }) }, () => {}, b2.fetcher);
  await assert.rejects(down.CLUB_FILES.delete('general/c.txt'), /R2 unavailable/);
});
