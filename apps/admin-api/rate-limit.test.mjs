import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumeRateLimit } from './rate-limit.ts';
function adapter(sqlite) {
  return { prepare: sql => ({ bind: (...params) => ({ first: async () => sqlite.prepare(sql).get(...params) }) }) };
}
const schema = 'CREATE TABLE IF NOT EXISTS rate_limits(ip TEXT, endpoint TEXT, count INTEGER DEFAULT 1, window_start TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(ip,endpoint))';
test('concurrent attempts consume exactly the shared allowance and saturate safely', async () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(schema);
  try {
    const results = await Promise.all(Array.from({ length: 25 }, () => consumeRateLimit(adapter(sqlite), '192.0.2.1', 'login', 10, 60)));
    assert.equal(results.filter(r => r.allowed).length, 10);
    assert.ok(results.filter(r => !r.allowed).every(r => r.retryAfter > 0 && r.retryAfter <= 60));
    assert.equal(sqlite.prepare('SELECT count FROM rate_limits').get().count, 11);
    assert.equal((await consumeRateLimit(adapter(sqlite), '192.0.2.2', 'login', 10)).allowed, true);
    assert.equal((await consumeRateLimit(adapter(sqlite), '192.0.2.1', 'different', 10)).allowed, true);
  } finally { sqlite.close(); }
});
test('limits survive a new database connection and expired windows reset', async () => {
  const directory = mkdtempSync(join(tmpdir(), '180dc-rate-test-')); const file = join(directory, 'state.sqlite');
  let sqlite = new DatabaseSync(file); sqlite.exec(schema);
  try {
    await consumeRateLimit(adapter(sqlite), '192.0.2.1', 'login', 1, 3600);
    sqlite.close(); sqlite = new DatabaseSync(file);
    assert.equal((await consumeRateLimit(adapter(sqlite), '192.0.2.1', 'login', 1, 3600)).allowed, false);
    sqlite.exec("UPDATE rate_limits SET window_start = datetime('now', '-3600 seconds')");
    assert.deepEqual(await consumeRateLimit(adapter(sqlite), '192.0.2.1', 'login', 1, 3600), { allowed: true, retryAfter: 0 });
    assert.equal(sqlite.prepare('SELECT count FROM rate_limits').get().count, 1);
  } finally { sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('invalid policies or unavailable state never grant access', async () => {
  const unavailable = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
  for (const maximum of [0, -1, 1.5, NaN]) await assert.rejects(consumeRateLimit(unavailable, 'ip', 'route', maximum));
  await assert.rejects(consumeRateLimit(unavailable, 'ip', 'route', 10, 0));
  await assert.rejects(consumeRateLimit(unavailable, 'ip', 'route', 10), /unavailable/);
});
