#!/usr/bin/env node
// 180DC admin-api test runner.
//
//   pnpm test                 every email is captured, nothing is sent
//   pnpm test:mail            every email is ALSO delivered to TEST_EMAIL
//   pnpm test -- --only auth  run files whose name matches a regex
//   pnpm test -- --grep retry run only tests whose name matches
//   pnpm test -- --log        stream wrangler output
//
// Starts the worker on a fresh local database, creates one account per role,
// then runs tests/api/*.test.mjs with node:test.
import { spawn } from "node:child_process";
import { readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, d1 } from "./lib/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const mail = argv.includes("--mail");
const log = argv.includes("--log");
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
const grepIdx = argv.indexOf("--grep");
const grep = grepIdx >= 0 ? argv[grepIdx + 1] : null;

const recipient = process.env.TEST_EMAIL;
if (mail && !recipient) {
  console.error(
    "--mail needs TEST_EMAIL=<your inbox>, e.g.\n  TEST_EMAIL=you@example.com pnpm test:mail\n" +
      "SPACEMAIL_SMTP_USER/PASS must be in apps/admin-api/.dev.vars.",
  );
  process.exit(2);
}

const ORIGIN = "http://localhost:5173";
let ipN = 0;
const ip = () => `192.0.2.${(ipN++ % 250) + 1}`;

async function call(base, method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "CF-Connecting-IP": ip(),
      Origin: ORIGIN,
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// One account per role. Emails use a domain that never receives mail; in
// --mail mode everything is redirected to TEST_EMAIL anyway.
async function createAccounts(server) {
  const base = server.baseUrl;
  const [row] = await d1(
    server.stateDir,
    "180dc-db",
    "SELECT token FROM admin_tokens WHERE email = 'admin@vitstudent.ac.in'",
  );
  if (!row) throw new Error("seeded dev token not found");
  const board = row.token;
  await call(base, "POST", "/api/dev-login", null, { token: board });

  const mk = async (path, body) => (await call(base, "POST", path, board, body)).token;
  const t = { board };
  t.board2 = await mk("/api/board-users", { email: "board2@test.180dcvitc.org", name: "Board Two", roleId: "secretary" });
  t.director = await mk("/api/board-users", { email: "director@test.180dcvitc.org", name: "Marketing Director", roleId: "marketing_director", departmentId: "marketing" });
  t.director2 = await mk("/api/board-users", { email: "director2@test.180dcvitc.org", name: "Finance Director", roleId: "finance_director", departmentId: "finance" });
  t.member = await mk("/api/members", { email: "member@test.180dcvitc.org", name: "Marketing Member", departmentId: "marketing" });
  t.member2 = await mk("/api/members", { email: "member2@test.180dcvitc.org", name: "Finance Member", departmentId: "finance" });
  t.advisory = await mk("/api/advisory-members", { email: "advisory@test.180dcvitc.org", name: "Advisory Member", exTitle: "Former Chair" });
  // /api/auth/session creates the users row for accounts that only have a token.
  for (const key of Object.keys(t)) await call(base, "POST", "/api/auth/session", null, { token: t[key] });

  const users = {};
  const list = await call(base, "GET", "/api/users", board);
  for (const u of list.data || list.users || list) users[u.email] = u;
  return { tokens: t, users };
}

const files = readdirSync(join(here, "api"))
  .filter((f) => f.endsWith(".test.mjs") && (!only || new RegExp(only).test(f)))
  .sort()
  .map((f) => join(here, "api", f));
if (files.length === 0) {
  console.error("no test files matched");
  process.exit(2);
}

console.log(`Starting admin-api (email mode: ${mail ? "redirect → " + recipient : "capture"}) …`);
const server = await startServer({ mode: mail ? "redirect" : "capture", recipient, log });
let code = 1;
try {
  const { tokens, users } = await createAccounts(server);
  const stateFile = join(mkdtempSync(join(tmpdir(), "180dc-state-")), "state.json");
  writeFileSync(stateFile, JSON.stringify({ baseUrl: server.baseUrl, stateDir: server.stateDir, mail, recipient: recipient || null, tokens, users }));
  console.log(`Worker ready at ${server.baseUrl}; running ${files.length} test file(s)\n`);
  code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-concurrency=1", "--test-reporter=spec", ...(grep ? ["--test-name-pattern", grep] : []), ...files],
      { stdio: "inherit", env: { ...process.env, TEST_STATE_FILE: stateFile } },
    );
    child.on("exit", (c) => resolve(c ?? 1));
  });
} catch (e) {
  console.error(e.stack || e);
  console.error("\n--- wrangler output (tail) ---\n" + server.output().slice(-3000));
} finally {
  await server.stop();
}
process.exit(code);
