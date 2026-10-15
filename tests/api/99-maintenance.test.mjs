// Maintenance mode. Runs last: while it is on, non-board members are locked
// out. Each isolate caches the setting for 60 s; the isolate that handles the
// toggle applies it at once (wrangler dev runs a single isolate).
import { test } from "node:test";
import assert from "node:assert/strict";
import { get, post, tokens, expectOk, expectStatus } from "../lib/api.mjs";

const B = { token: tokens.board };

test("only board can toggle maintenance; anyone can read it", async () => {
  expectStatus(await post("/api/admin/maintenance", { enabled: true }, { token: tokens.director }), 403);
  const json = expectOk(await get("/api/admin/maintenance"));
  assert.equal(json.enabled, false);
});

test("while on, members get 503 with the message; board still gets in", async () => {
  expectOk(await get("/api/dashboard", { token: tokens.member }));
  const on = expectOk(await post("/api/admin/maintenance", { enabled: true, message: "Back at 6pm" }, B));
  assert.equal(on.enabled, true);
  try {
    assert.equal(expectOk(await get("/api/admin/maintenance")).message, "Back at 6pm");
    const res = await get("/api/dashboard", { token: tokens.member });
    assert.equal(res.status, 503);
    assert.equal(res.json.error, "Back at 6pm");
    expectStatus(await get("/api/dashboard", { token: tokens.advisory }), 503);
    expectOk(await get("/api/dashboard", B));
  } finally {
    expectOk(await post("/api/admin/maintenance", { enabled: false }, B));
  }
  expectOk(await get("/api/dashboard", { token: tokens.member }), "back to normal");
});
