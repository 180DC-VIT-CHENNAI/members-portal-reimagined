// Login and token management: token login, dev login, forgot-token,
// token rotation, admin token create/revoke/delete, Google (Clerk) login.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, del, tokens, expectOk, expectStatus, expectDenied,
  outbox, outboxMark, waitForMail, newMember, uniqueEmail,
} from "../lib/api.mjs";

describe("token login", () => {
  test("a valid token returns the member's profile", async () => {
    const json = expectOk(await post("/api/auth/token-login", { token: tokens.director }));
    assert.equal(json.email, "director@test.180dcvitc.org");
    assert.equal(json.roleId, "marketing_director");
    assert.equal(json.powerLevel, 50);
    assert.equal(json.departmentId, "marketing");
  });

  test("an unknown token is rejected", async () => {
    expectStatus(await post("/api/auth/token-login", { token: "nope" }), 401);
  });

  test("a missing token is a 400", async () => {
    expectStatus(await post("/api/auth/token-login", {}), 400);
  });

  test("repeated bad tokens from one IP are rate limited", async () => {
    const ip = "203.0.113.50";
    let last;
    for (let i = 0; i < 11; i++) last = await post("/api/auth/token-login", { token: "bad" + i }, { ip });
    expectStatus(last, 429);
  });
});

describe("dev login", () => {
  test("works outside production with a valid token", async () => {
    const json = expectOk(await post("/api/dev-login", { token: tokens.board }));
    assert.equal(json.powerLevel, 100);
  });

  test("rejects an unknown token", async () => {
    expectStatus(await post("/api/dev-login", { token: "nope" }), 401);
  });
});

describe("forgot token", () => {
  test("emails the token to a registered member", async () => {
    const m = await newMember("forgot");
    const mark = await outboxMark();
    const json = expectOk(await post("/api/auth/forgot-token", { email: m.email }));
    assert.match(json.message, /if the email is registered/i);
    const [mail] = await waitForMail(m.email, mark);
    assert.ok(mail.html.includes(m.token), "email contains the token");
  });

  test("gives the same answer for an unknown email and sends nothing", async () => {
    const email = uniqueEmail("ghost");
    const mark = await outboxMark();
    const json = expectOk(await post("/api/auth/forgot-token", { email }));
    assert.match(json.message, /if the email is registered/i);
    const { messages } = await outbox({ since: mark, to: email });
    assert.equal(messages.length, 0);
  });

  test("rejects an invalid email", async () => {
    expectStatus(await post("/api/auth/forgot-token", { email: "not-an-email" }), 400);
  });

  test("is limited to 3 requests per hour per IP", async () => {
    const ip = "203.0.113.60";
    let last;
    for (let i = 0; i < 4; i++) last = await post("/api/auth/forgot-token", { email: uniqueEmail("rl") }, { ip });
    expectStatus(last, 429);
  });
});

describe("rotate token", () => {
  test("issues a new token, emails it, and the old one stops working", async () => {
    const m = await newMember("rotate");
    const mark = await outboxMark();
    const json = expectOk(await post("/api/auth/rotate-token", {}, { token: m.token }));
    assert.ok(json.token && json.token !== m.token);
    expectStatus(await get("/api/dashboard", { token: m.token }), 401);
    expectOk(await get("/api/dashboard", { token: json.token }));
    const [mail] = await waitForMail(m.email, mark);
    assert.ok(mail.html.includes(json.token));
  });

  test("needs to be logged in", async () => {
    expectStatus(await post("/api/auth/rotate-token", {}), 401);
  });
});

describe("admin tokens (board)", () => {
  test("board can issue a token for an email, which then logs in", async () => {
    const email = uniqueEmail("issued");
    const mark = await outboxMark();
    const json = expectOk(await post("/api/admin-tokens", { email, name: "Issued", roleId: "member" }, { token: tokens.board }));
    assert.ok(json.token);
    const login = expectOk(await post("/api/auth/token-login", { token: json.token }));
    assert.equal(login.email, email);
    await waitForMail(email, mark);
  });

  test("revoking a token blocks it; revoking twice is a 409", async () => {
    const m = await newMember("revoke");
    expectOk(await post(`/api/admin-tokens/${encodeURIComponent(m.email)}/revoke`, {}, { token: tokens.board }));
    expectStatus(await get("/api/dashboard", { token: m.token }), 401);
    expectStatus(await post("/api/auth/token-login", { token: m.token }), 401);
    expectStatus(await post(`/api/admin-tokens/${encodeURIComponent(m.email)}/revoke`, {}, { token: tokens.board }), 409);
  });

  test("deleting a token blocks it; unknown email is a 404", async () => {
    const m = await newMember("deltoken");
    expectOk(await del(`/api/admin-tokens/${encodeURIComponent(m.email)}`, { token: tokens.board }));
    expectStatus(await get("/api/dashboard", { token: m.token }), 401);
    expectStatus(await del(`/api/admin-tokens/${encodeURIComponent(uniqueEmail("none"))}`, { token: tokens.board }), 404);
  });

  test("directors and members cannot manage tokens", async () => {
    for (const who of ["director", "member", "advisory"]) {
      expectDenied(await post("/api/admin-tokens", { email: uniqueEmail("x") }, { token: tokens[who] }), who);
      expectDenied(await post("/api/admin-tokens/member@test.180dcvitc.org/revoke", {}, { token: tokens[who] }), who);
    }
  });
});

describe("Google (Clerk) login", () => {
  test("missing clerkToken is a 400", async () => {
    expectStatus(await post("/api/auth/clerk-login", {}), 400);
  });

  test("a forged clerkToken is never accepted", async () => {
    // 500 when CLERK_SECRET_KEY is not set locally, 401 when it is.
    const res = await post("/api/auth/clerk-login", { clerkToken: "eyJhbGciOiJIUzI1NiJ9.e30.forged" });
    assert.ok([401, 500].includes(res.status), `got ${res.status}`);
    assert.ok(!res.json?.token, "no session token issued");
  });

  test("linking needs a member session and a clerkToken", async () => {
    expectStatus(await post("/api/auth/link-clerk", { clerkToken: "x" }), 401);
    expectStatus(await post("/api/auth/link-clerk", {}, { token: tokens.member }), 400);
  });

  test("unlinking turns Google login off for the caller", async () => {
    const m = await newMember("unlink");
    const json = expectOk(await post("/api/auth/unlink-clerk", {}, { token: m.token }));
    assert.match(json.message, /disabled/i);
  });
});
