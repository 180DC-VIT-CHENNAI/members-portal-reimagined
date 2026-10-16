// E2E harness: runs the portal dev server against a fresh local D1 and signs
// people in by creating real Better Auth sessions (no test backdoor in the app).
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
// Void's built-in development secret (used when BETTER_AUTH_SECRET is unset).
const DEV_AUTH_SECRET = 'void-dev-better-auth-secret-1234567890';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Resolve when `predicate(chunk)` matches the child's output; reject on exit. */
function waitForOutput(child, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(`dev server not ready in ${timeoutMs}ms\n${log}`)), timeoutMs);
    const onData = (buf) => {
      log += buf.toString();
      if (predicate(log)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`dev server exited (${code})\n${log}`));
    });
  });
}

export async function startPortal() {
  const stateDir = mkdtempSync(join(tmpdir(), 'portal-e2e-'));
  const port = await freePort();
  const child = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORTAL_STATE_DIR: stateDir,
      NO_COLOR: '1',
      AUTH_GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com',
      AUTH_GOOGLE_CLIENT_SECRET: 'e2e-secret',
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const kill = async () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
  };
  const base = `http://localhost:${port}`;
  let db;
  try {
    // Strip ANSI codes: CI runners get coloured output with the port in bold.
    await waitForOutput(child, (log) => log.replace(/\x1b\[[0-9;]*m/g, '').includes(`:${port}/`), 120_000);
    // The first API request runs the migrations against the fresh database.
    const health = await fetch(`${base}/api/health`);
    if (!health.ok) throw new Error(`health ${health.status}`);
    await fetch(`${base}/api/me`);

    const d1Dir = join(stateDir, 'v3', 'd1', 'miniflare-D1DatabaseObject');
    const file = readdirSync(d1Dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
    db = new DatabaseSync(join(d1Dir, file));
    db.exec('PRAGMA busy_timeout = 5000');
  } catch (err) {
    // Never leave a dev server running: it would keep the test process alive.
    await kill();
    rmSync(stateDir, { recursive: true, force: true });
    throw err;
  }

  return {
    base,
    db,
    async stop() {
      db.close();
      await kill();
      rmSync(stateDir, { recursive: true, force: true });
    },
  };
}

/**
 * Stand-in for a completed Google sign-in: create the Better Auth user and a
 * session, link it to the person like the first-sign-in hook does, and return
 * a client that sends the signed session cookie.
 */
export function signIn(portal, email) {
  const { db, base } = portal;
  const now = Date.now();
  let user = db.prepare('SELECT id FROM user WHERE email = ?').get(email);
  if (!user) {
    user = { id: randomUUID() };
    db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').run(user.id, email, email, now, now);
    db.prepare(
      `UPDATE people SET auth_user_id = ?, status = CASE status WHEN 'invited' THEN 'active' ELSE status END,
         activated_at = COALESCE(activated_at, datetime('now')) WHERE email = ? AND auth_user_id IS NULL`,
    ).run(user.id, email);
  }
  const token = randomUUID().replace(/-/g, '');
  db.prepare('INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run(
    randomUUID(), token, user.id, now + 3_600_000, now, now,
  );
  const signature = createHmac('sha256', DEV_AUTH_SECRET).update(token).digest('base64');
  return client(base, `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`);
}

export function anonymous(portal) {
  return client(portal.base, null);
}

function client(base, cookie) {
  const call = async (method, path, body) => {
    const headers = { origin: base };
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, headers: res.headers };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b),
    put: (p, b) => call('PUT', p, b),
  };
}
