// Login and token management: token login, dev login, forgot-token,
// token rotation, admin token create/revoke/delete, Google sign-in.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, del, tokens, expectOk, expectStatus, expectDenied,
  outbox, outboxMark, waitForMail, newMember, uniqueEmail, googleFlow, BASE,
} from "../lib/api.mjs";

describe("token login", () => {
  test("a valid token returns the member's profile", async () => {
    const json = expectOk(await post("/api/auth/session", { token: tokens.director }));
    assert.equal(json.email, "director@test.180dcvitc.org");
    assert.equal(json.roleId, "marketing_director");
    assert.equal(json.powerLevel, 50);
    assert.equal(json.departmentId, "marketing");
  });

  test("an unknown token is rejected", async () => {
    expectStatus(await post("/api/auth/session", { token: "nope" }), 401);
  });

  test("a missing token is a 400", async () => {
    expectStatus(await post("/api/auth/session", {}), 400);
  });

  test("repeated bad tokens from one IP are rate limited", async () => {
    const ip = "203.0.113.50";
    let last;
    for (let i = 0; i < 11; i++) last = await post("/api/auth/session", { token: "bad" + i }, { ip });
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
    const login = expectOk(await post("/api/auth/session", { token: json.token }));
    assert.equal(login.email, email);
    await waitForMail(email, mark);
  });

  test("revoking a token blocks it; revoking twice is a 409", async () => {
    const m = await newMember("revoke");
    expectOk(await post(`/api/admin-tokens/${encodeURIComponent(m.email)}/revoke`, {}, { token: tokens.board }));
    expectStatus(await get("/api/dashboard", { token: m.token }), 401);
    expectStatus(await post("/api/auth/session", { token: m.token }), 401);
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

describe("Google sign-in (Worker OAuth)", () => {
  const signInAs = async (sub) => {
    const flow = await googleFlow({ sub });
    assert.equal(flow.callback.status, 302);
    return flow;
  };

  test("start redirects to Google with PKCE, a state, and an HttpOnly state cookie", async () => {
    const res = await get("/api/auth/google/start");
    assert.equal(res.status, 302);
    const url = new URL(res.headers.get("location"));
    assert.equal(url.searchParams.get("client_id"), "test-client.apps.googleusercontent.com");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    // wrangler dev rewrites the request host to the configured route, so only the path is stable here.
    assert.equal(new URL(url.searchParams.get("redirect_uri")).pathname, "/api/auth/google/callback");
    assert.ok(url.searchParams.get("state"));
    assert.match(res.headers.get("set-cookie") || "", /g_oauth_state=[^;]+;.*HttpOnly/);
  });

  test("an unlinked Google account cannot sign in", async () => {
    const flow = await signInAs("unlinked-" + Date.now());
    assert.equal(flow.location.searchParams.get("google_error"), "not_linked");
  });

  test("the callback is refused without this browser's state cookie, and state is single-use", async () => {
    const noCookie = await googleFlow({ sub: "x", withCookie: false });
    assert.equal(noCookie.location.searchParams.get("google_error"), "invalid_state");
    const flow = await googleFlow({ sub: "replay-" + Date.now() });
    const replay = await get(`/api/auth/google/callback?${flow.query}`, { headers: { Cookie: flow.cookie } });
    assert.equal(new URL(replay.headers.get("location"), BASE).searchParams.get("google_error"), "expired");
  });

  test("linking needs a member session", async () => {
    expectStatus(await post("/api/auth/google/link-start", {}), 401);
  });

  test("a member links Google, then Google sign-in issues a working single-use session", async () => {
    const m = await newMember("glink");
    const sub = "sub-" + m.email;
    const link = await googleFlow({ sub, linkToken: m.token });
    assert.equal(link.location.searchParams.get("google"), "linked");
    assert.equal(link.location.searchParams.get("panel"), "profile");

    const login = await signInAs(sub);
    const code = login.location.searchParams.get("google_code");
    assert.ok(code, "handoff code in redirect");
    const session = expectOk(await post("/api/auth/google/exchange", { code }));
    assert.equal(session.email, m.email);
    assert.match(session.token, /^180dc_session_/);
    expectOk(await get("/api/dashboard", { token: session.token }));
    expectStatus(await post("/api/auth/google/exchange", { code }), 401, "handoff code is single-use");
  });

  test("one Google account cannot be linked to two members", async () => {
    const a = await newMember("gdup-a");
    const b = await newMember("gdup-b");
    const sub = "dup-" + Date.now();
    assert.equal((await googleFlow({ sub, linkToken: a.token })).location.searchParams.get("google"), "linked");
    const second = await googleFlow({ sub, linkToken: b.token });
    assert.equal(second.location.searchParams.get("google_error"), "already_linked");
  });

  test("unlinking turns Google sign-in off", async () => {
    const m = await newMember("gunlink");
    const sub = "unlink-" + m.email;
    await googleFlow({ sub, linkToken: m.token });
    assert.match(expectOk(await post("/api/auth/google/unlink", {}, { token: m.token })).message, /disabled/i);
    assert.equal((await signInAs(sub)).location.searchParams.get("google_error"), "not_linked");
  });

  test("Google sign-in cannot restore access after the member token is revoked", async () => {
    const m = await newMember("grevoke");
    const sub = "revoke-" + m.email;
    await googleFlow({ sub, linkToken: m.token });
    expectOk(await post(`/api/admin-tokens/${encodeURIComponent(m.email)}/revoke`, {}, { token: tokens.board }));
    assert.equal((await signInAs(sub)).location.searchParams.get("google_error"), "inactive");
  });
});
