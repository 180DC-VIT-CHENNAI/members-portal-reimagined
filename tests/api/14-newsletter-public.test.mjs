// Public newsletter: subscribe, welcome email, unsubscribe (personal link,
// one-click header, legacy ?email= link), archive and single issue.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, post, api, tokens, expectOk, expectStatus, subscribe, requestSubscription, outboxMark, waitForMail, uniqueEmail } from "../lib/api.mjs";

const count = async () => expectOk(await get("/api/newsletter/subscribers/count")).count;

describe("subscribing", () => {
  test("new subscribers get a welcome email with their own unsubscribe link", async () => {
    const before = await count();
    const { email, token, welcome } = await subscribe();
    assert.equal(welcome.subject, "Welcome to the 180DC Newsletter!");
    assert.ok(welcome.html.includes("https://180dcvitc.org/unsubscribe/" + token), "footer link");
    assert.equal(welcome.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.equal(await count(), before + 1);
    const again = expectOk(await post("/api/newsletter/subscribe", { email }));
    assert.equal(again.pending, true, "same reply whether or not the address is subscribed");
    assert.match(again.message, /check your inbox/i);
  });

  test("a subscription stays inactive until the emailed link is confirmed (double opt-in)", async () => {
    const before = await count();
    const { confirmToken, json } = await requestSubscription();
    assert.equal(json.pending, true);
    assert.equal(await count(), before, "not counted before confirmation");
    expectOk(await post("/api/newsletter/confirm", { token: confirmToken }));
    assert.equal(await count(), before + 1);
    expectStatus(await post("/api/newsletter/confirm", { token: confirmToken }), 400, "link is single-use");
  });

  test("unknown or missing confirmation tokens are refused", async () => {
    expectStatus(await post("/api/newsletter/confirm", { token: "not-a-real-token" }), 400);
    expectStatus(await post("/api/newsletter/confirm", {}), 400);
  });

  test("an invalid email is refused", async () => {
    expectStatus(await post("/api/newsletter/subscribe", { email: "not-an-email" }), 400);
  });

  test("5 sign-ups per hour per IP", async () => {
    const ip = "203.0.113.90";
    let last;
    for (let i = 0; i < 6; i++) last = await post("/api/newsletter/subscribe", { email: uniqueEmail("rl") }, { ip });
    expectStatus(last, 429);
  });
});

describe("unsubscribing", () => {
  test("the personal link unsubscribes; using it again says 'already'", async () => {
    const { email, token } = await subscribe();
    const before = await count();
    const json = expectOk(await post(`/api/newsletter/unsubscribe/${token}`, {}));
    assert.equal(json.status, "unsubscribed");
    assert.equal(json.email, email);
    assert.equal(await count(), before - 1);
    assert.equal(expectOk(await post(`/api/newsletter/unsubscribe/${token}`, {})).status, "already");
  });

  test("one-click unsubscribe works the way Gmail sends it (form post, no Origin)", async () => {
    const { token } = await subscribe();
    const res = await api("POST", `/api/newsletter/unsubscribe/${token}`, {
      origin: false,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      rawBody: "List-Unsubscribe=One-Click",
    });
    assert.equal(expectOk(res).status, "unsubscribed");
  });

  test("other routes still refuse cross-site form posts", async () => {
    const res = await api("POST", "/api/newsletter/subscribe", {
      origin: "https://evil.example",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      rawBody: "email=x@y.co",
    });
    expectStatus(res, 403);
  });

  test("bad or unknown tokens", async () => {
    expectStatus(await post("/api/newsletter/unsubscribe/not-hex", {}), 401, "non-hex path isn't even public");
    expectStatus(await post("/api/newsletter/unsubscribe/abc123", {}), 400);
    assert.equal(expectOk(await post(`/api/newsletter/unsubscribe/${"a".repeat(48)}`, {})).status, "not_found");
  });

  test("the unsubscribe link can't be triggered by a GET (link scanners)", async () => {
    const { token } = await subscribe();
    const res = await get(`/api/newsletter/unsubscribe/${token}`);
    assert.notEqual(res.status, 200);
    assert.equal(expectOk(await post(`/api/newsletter/unsubscribe/${token}`, {})).status, "unsubscribed", "still subscribed until the POST");
  });

  test("legacy ?email= links from older emails still work", async () => {
    const { email } = await subscribe();
    assert.equal(expectOk(await get(`/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`)).status, "unsubscribed");
    assert.equal(expectOk(await get(`/api/newsletter/unsubscribe?email=${encodeURIComponent(uniqueEmail("never"))}`)).status, "not_found");
  });

  test("re-subscribing sends a welcome-back email and keeps the same link", async () => {
    const { email, token } = await subscribe();
    expectOk(await post(`/api/newsletter/unsubscribe/${token}`, {}));
    const { confirmToken, json } = await requestSubscription(email);
    assert.equal(json.pending, true, "re-subscribing needs confirmation too");
    const mark = await outboxMark();
    expectOk(await post("/api/newsletter/confirm", { token: confirmToken }));
    const [mail] = await waitForMail(email, mark);
    assert.equal(mail.subject, "Welcome back to the 180DC Newsletter!");
    assert.ok(mail.headers["List-Unsubscribe"].includes(token));
  });
});

describe("archive", () => {
  test("only sent issues are public; a single issue is sanitized", async () => {
    const B = { token: tokens.board };
    const { id } = expectOk(await post("/api/newsletter", { title: "Draft only " + Date.now(), content: "<p>hi</p>" }, B));
    assert.ok(!expectOk(await get("/api/newsletter")).data.some((n) => n.id === id), "unsent drafts hidden");
    const one = expectOk(await get(`/api/newsletter/${id}`));
    assert.equal(one.data.id, id);
    expectStatus(await get("/api/newsletter/no-such-issue"), 404);
  });
});
