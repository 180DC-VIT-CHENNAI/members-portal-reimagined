import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = new URL(process.env.LOCAL_API_URL || 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Local Worker only');
const cwd = fileURLToPath(new URL('../apps/admin-api/', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
function sql(command) {
  const state = process.env.LOCAL_D1_STATE ? ['--persist-to', process.env.LOCAL_D1_STATE] : [];
  return JSON.parse(execFileSync(wrangler, ['d1', 'execute', 'DB', '--local', ...state, '--json', '--command', command], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0].results;
}
async function call(path, token, method = 'GET', body) {
  return fetch(new URL(path, base), { method, headers: {
    Origin: 'https://personal.example', 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}
const created = [];
async function issue(token, label) {
  const response = await call('/api/auth/session', null, 'POST', { token, deviceLabel: label });
  assert.equal(response.status, 200, 'Valid registry token issues a session');
  assert.match(response.headers.get('cache-control'), /no-store/);
  const data = await response.json();
  assert.match(data.token, /^180dc_session_[a-f0-9]{64}$/);
  assert.ok(Date.parse(data.expiresAt) > Date.now());
  created.push(data);
  return data;
}
try {
  const first = await issue('synthetic-member-token', 'Synthetic browser');
  const second = await issue('synthetic-member-token', 'Synthetic Android');
  assert.notEqual(first.token, second.token);
  assert.equal((await call('/api/members-directory', first.token)).status, 200);
  const list = await (await call('/api/auth/sessions', first.token)).json();
  assert.ok(list.data.some(s => s.id === first.sessionId && s.current));
  assert.ok(list.data.some(s => s.id === second.sessionId && !s.current));
  assert.equal(JSON.stringify(list).includes(first.token), false);
  assert.equal(JSON.stringify(list).includes('token_hash'), false);
  const stored = sql(`SELECT token_hash, source_token_hash FROM member_sessions WHERE id = '${first.sessionId}'`)[0];
  assert.match(stored.token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.token_hash, first.token);
  assert.equal((await call(`/api/auth/sessions/${first.sessionId}`, 'synthetic-board-token', 'DELETE')).status, 404, 'Rank grants no access to another account session');
  assert.equal((await call(`/api/auth/sessions/${second.sessionId}`, first.token, 'DELETE')).status, 200);
  assert.equal((await call('/api/members-directory', second.token)).status, 401);
  assert.equal((await call('/api/members-directory', first.token)).status, 200, 'Revocation affects only the selected device');
  sql("UPDATE users SET role_id = 'chairperson' WHERE id = 'fixture-member'");
  assert.equal((await call('/api/roles', first.token)).status, 200, 'Current role applies without reissuing session');
  sql("UPDATE users SET role_id = 'member' WHERE id = 'fixture-member'");
  assert.equal((await call('/api/roles', first.token)).status, 403);
  sql("UPDATE admin_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE email = 'member@example.invalid'");
  assert.equal((await call('/api/members-directory', first.token)).status, 401, 'Source token revocation invalidates devices');
  sql("UPDATE admin_tokens SET revoked_at = NULL WHERE email = 'member@example.invalid'");
  sql("UPDATE admin_tokens SET token = 'synthetic-member-rotated' WHERE email = 'member@example.invalid'");
  assert.equal((await call('/api/members-directory', first.token)).status, 401, 'Source token rotation invalidates devices');
  sql("UPDATE admin_tokens SET token = 'synthetic-member-token' WHERE email = 'member@example.invalid'");
  sql(`UPDATE member_sessions SET expires_at = '2000-01-01T00:00:00Z' WHERE id = '${first.sessionId}'`);
  assert.equal((await call('/api/members-directory', first.token)).status, 401);
  const third = await issue('synthetic-member-token', 'Synthetic logout');
  assert.equal((await call('/api/auth/logout', third.token, 'POST')).status, 200);
  assert.equal((await call('/api/members-directory', third.token)).status, 401);
  // A removed identity must not be recreated by its former registry credential.
  sql("INSERT OR IGNORE INTO users (id, name, email, role_id) VALUES ('fixture-session-exit', 'Synthetic departing member', 'exit@example.invalid', 'member')");
  sql("INSERT OR IGNORE INTO admin_tokens (token, email, name, role_id) VALUES ('synthetic-exit-token', 'exit@example.invalid', 'Synthetic departing member', 'member')");
  const departing = await issue('synthetic-exit-token', 'Synthetic departing device');
  assert.equal((await call('/api/members/fixture-session-exit', 'synthetic-board-token', 'DELETE')).status, 200);
  assert.equal((await call('/api/members-directory', departing.token)).status, 401);
  assert.equal((await call('/api/auth/session', null, 'POST', { token: 'synthetic-exit-token' })).status, 401);
  assert.equal(sql("SELECT COUNT(*) AS count FROM member_sessions WHERE user_id = 'fixture-session-exit'")[0].count, 0, 'Member removal cascades device credentials');
  for (const token of ['synthetic-expired-token', 'synthetic-revoked-token', 'unknown']) {
    assert.equal((await call('/api/auth/session', null, 'POST', { token })).status, 401);
  }
  assert.equal((await call('/api/auth/session', null, 'POST', { token: 'synthetic-member-token', deviceLabel: 'x'.repeat(81) })).status, 400);
  assert.equal(sql(`SELECT COUNT(*) AS count FROM audit_log WHERE action = 'session_created' AND target_id = '${third.sessionId}'`)[0].count, 1);
  assert.equal(sql(`SELECT COUNT(*) AS count FROM audit_log WHERE action = 'session_revoked' AND target_id = '${third.sessionId}'`)[0].count, 1);
  console.log('Local Worker: hashed sessions, own-account revocation, logout/expiry, current roles, source revoke/rotate and member exit verified');
} finally {
  sql("UPDATE users SET role_id = 'member' WHERE id = 'fixture-member'");
  sql("UPDATE admin_tokens SET token = 'synthetic-member-token', revoked_at = NULL WHERE email = 'member@example.invalid'");
  for (const session of created) sql(`UPDATE member_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = '${session.sessionId}'`);
}
