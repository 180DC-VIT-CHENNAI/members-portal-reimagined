// Checks the test setup itself: accounts exist, the dev outbox records mail,
// and rate limits are isolated per (fake) client IP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get, post, outbox, tokens, users, expectOk, state } from "../lib/api.mjs";

test("one account per role was created", () => {
  for (const key of ["board", "board2", "director", "director2", "member", "member2", "advisory"]) {
    assert.ok(tokens[key], `token for ${key}`);
  }
  assert.equal(users["director@test.180dcvitc.org"].power_level, 50);
  assert.equal(users["member@test.180dcvitc.org"].power_level, 10);
  assert.equal(users["advisory@test.180dcvitc.org"].power_level, 30);
  assert.equal(users["board2@test.180dcvitc.org"].power_level, 100);
});

test("account creation emailed each new user their login token", async () => {
  const { messages } = await outbox();
  for (const email of ["board2", "director", "member", "advisory"].map((p) => `${p}@test.180dcvitc.org`)) {
    const mail = messages.find((m) => m.recipient === email);
    assert.ok(mail, `token email to ${email}`);
    assert.match(mail.from_address, /technical@180dcvitc\.org/);
  }
  if (state.mail) {
    assert.ok(messages.every((m) => m.delivered_to === state.recipient), "redirected to TEST_EMAIL");
  } else {
    assert.ok(messages.every((m) => m.delivered_to === null), "capture mode sends nothing");
  }
});

test("rate limits are per client IP", async () => {
  // GET /api/newsletter allows 100/min per IP: 101 calls from one IP trip it,
  // and another IP is unaffected.
  const ip = "198.51.100.7";
  let last;
  for (let i = 0; i < 101; i++) last = await get("/api/newsletter", { ip });
  assert.equal(last.status, 429);
  expectOk(await get("/api/newsletter", { ip: "198.51.100.8" }));
});

test("unauthenticated requests to member routes are rejected", async () => {
  const res = await get("/api/dashboard");
  assert.equal(res.status, 401);
  const bad = await get("/api/dashboard", { token: "not-a-real-token" });
  assert.equal(bad.status, 401);
});
