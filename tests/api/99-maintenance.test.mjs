// Maintenance mode. Runs last: while it is on, non-board members are locked
// out. The worker caches the setting for 60 s (KNOWN-3), so this file waits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get, post, tokens, expectOk, expectStatus } from "../lib/api.mjs";
import { KNOWN } from "../lib/known-issues.mjs";

const B = { token: tokens.board };
const waitForCache = () => new Promise((r) => setTimeout(r, 61_000));

test("only board can toggle maintenance; anyone can read it", async () => {
  expectStatus(await post("/api/admin/maintenance", { enabled: true }, { token: tokens.director }), 403);
  const json = expectOk(await get("/api/admin/maintenance"));
  assert.equal(json.enabled, false);
});

test("turning it on takes effect immediately", { todo: KNOWN.MAINTENANCE_CACHE }, async () => {
  expectOk(await get("/api/dashboard", { token: tokens.member }));
  expectOk(await post("/api/admin/maintenance", { enabled: true, message: "Back soon" }, B));
  try {
    expectStatus(await get("/api/dashboard", { token: tokens.member }), 503);
  } finally {
    expectOk(await post("/api/admin/maintenance", { enabled: false }, B));
  }
});

test("while on, members get 503 with the message; board still gets in", { timeout: 200_000 }, async () => {
  await waitForCache();
  const on = expectOk(await post("/api/admin/maintenance", { enabled: true, message: "Back at 6pm" }, B));
  assert.equal(on.enabled, true);
  assert.equal(expectOk(await get("/api/admin/maintenance")).message, "Back at 6pm");
  try {
    await waitForCache();
    const res = await get("/api/dashboard", { token: tokens.member });
    assert.equal(res.status, 503);
    assert.equal(res.json.error, "Back at 6pm");
    expectOk(await get("/api/dashboard", B));
  } finally {
    expectOk(await post("/api/admin/maintenance", { enabled: false }, B));
  }
  await waitForCache();
  expectOk(await get("/api/dashboard", { token: tokens.member }), "back to normal");
});
