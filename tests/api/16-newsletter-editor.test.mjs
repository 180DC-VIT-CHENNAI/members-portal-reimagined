// Newsletter editor (separate OTP login): access rules, drafts, test sends,
// sending to subscribers, event mails, and board-managed editor access.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, del, tokens, expectOk, expectStatus, expectDenied,
  otpLogin, subscribe, outbox, outboxMark, waitForMail, drainUntilDone, upload, fixture, uniqueEmail,
} from "../lib/api.mjs";
import { KNOWN } from "../lib/known-issues.mjs";

const B = { token: tokens.board };
let editor; // a board-authorized outside editor
let memberEditor; // a General Member (members may use the editor)

before(async () => {
  const email = uniqueEmail("editor");
  expectOk(await post("/api/newsletter-editor/admin/authorized-emails", { email }, B));
  editor = { email, ...(await otpLogin("newsletter", email)) };
  memberEditor = { email: "member@test.180dcvitc.org", ...(await otpLogin("newsletter", "member@test.180dcvitc.org")) };
});

describe("OTP login", () => {
  test("authorized emails and members can log in; the session works", async () => {
    const me = expectOk(await get("/api/newsletter-editor/me", { token: editor.token }));
    assert.equal(me.email, editor.email);
    expectOk(await get("/api/newsletter-editor/me", { token: memberEditor.token }));
  });

  test("advisory members and strangers are refused", async () => {
    expectStatus(await post("/api/newsletter-editor/otp/send", { email: "advisory@test.180dcvitc.org" }), 403);
    expectStatus(await post("/api/newsletter-editor/otp/send", { email: uniqueEmail("stranger") }), 403);
  });

  test("wrong, reused and missing codes fail", async () => {
    const email = "member2@test.180dcvitc.org";
    const { code } = await otpLogin("newsletter", email);
    expectStatus(await post("/api/newsletter-editor/otp/verify", { email, code }), 400, "reused");
    const mark = await outboxMark();
    expectOk(await post("/api/newsletter-editor/otp/send", { email }));
    await waitForMail(email, mark);
    expectStatus(await post("/api/newsletter-editor/otp/verify", { email, code: "000000" }), 400, "wrong code");
    expectStatus(await post("/api/newsletter-editor/otp/verify", { email: uniqueEmail("x"), code: "123456" }), 400, "no OTP");
    expectStatus(await post("/api/newsletter-editor/otp/verify", { email }), 400);
  });

  test("logging out ends the session; no session means 401", async () => {
    const s = await otpLogin("newsletter", editor.email);
    expectOk(await post("/api/newsletter-editor/logout", {}, { token: s.token }));
    expectStatus(await get("/api/newsletter-editor/me", { token: s.token }), 401);
    expectStatus(await get("/api/newsletter-editor/drafts"), 401);
    expectStatus(await get("/api/newsletter-editor/drafts", { token: tokens.board }), 401, "member tokens aren't editor sessions");
  });
});

describe("drafts", () => {
  test("plain text becomes paragraphs; HTML is sanitized; editors see their own drafts", async () => {
    const { id } = expectOk(await post("/api/newsletter-editor/drafts", { title: "Plain " + Date.now(), emailSubject: "Read this", content: "Para one\n\nPara two" }, { token: editor.token }));
    const html = expectOk(await post("/api/newsletter-editor/drafts", { title: "Html " + Date.now(), content: "<p>ok</p><script>bad()</script>" }, { token: editor.token }));
    const mine = expectOk(await get("/api/newsletter-editor/drafts", { token: editor.token })).data;
    const plain = mine.find((d) => d.id === id);
    assert.ok(plain.content.includes("<p>Para one</p>"));
    assert.equal(plain.email_subject, "Read this");
    assert.ok(!mine.find((d) => d.id === html.id).content.includes("<script"));
    const theirs = expectOk(await get("/api/newsletter-editor/drafts", { token: memberEditor.token })).data;
    assert.ok(!theirs.some((d) => d.id === id), "other editors don't see it");
  });

  test("editors can only delete their own drafts", async () => {
    const { id } = expectOk(await post("/api/newsletter-editor/drafts", { title: "Mine " + Date.now() }, { token: editor.token }));
    expectOk(await del(`/api/newsletter-editor/drafts/${id}`, { token: memberEditor.token }));
    assert.ok(expectOk(await get("/api/newsletter-editor/drafts", { token: editor.token })).data.some((d) => d.id === id), "still there");
    expectOk(await del(`/api/newsletter-editor/drafts/${id}`, { token: editor.token }));
    assert.ok(!expectOk(await get("/api/newsletter-editor/drafts", { token: editor.token })).data.some((d) => d.id === id));
  });

  test("editors cannot overwrite someone else's draft", { todo: KNOWN.DRAFT_OWNERSHIP }, async () => {
    const { id } = expectOk(await post("/api/newsletter-editor/drafts", { title: "Original" }, { token: editor.token }));
    await post("/api/newsletter-editor/drafts", { id, title: "Hijacked" }, { token: memberEditor.token });
    const d = expectOk(await get("/api/newsletter-editor/drafts", { token: editor.token })).data.find((x) => x.id === id);
    assert.equal(d.title, "Original");
  });

  test("upload a source file", async () => {
    const json = expectOk(await upload("/api/newsletter-editor/upload-source", { file: { data: fixture("sample.pdf"), name: "a.pdf", type: "application/pdf" } }, { token: editor.token }));
    assert.match(json.url, /^\/api\/case-studies\/images\/source\//);
    expectStatus(await upload("/api/newsletter-editor/upload-source", { file: { data: fixture("sample.pdf"), name: "a.pdf", type: "application/pdf" } }), 401);
  });
});

describe("sending from the editor", () => {
  test("a test send goes only to the test address and doesn't mark the issue sent", async () => {
    await subscribe();
    const { id } = expectOk(await post("/api/newsletter-editor/drafts", { title: "Test send " + Date.now(), emailSubject: "Subject line" }, { token: editor.token }));
    const target = uniqueEmail("proof");
    const json = expectOk(await post("/api/newsletter-editor/send", { newsletterId: id, testEmail: target }, { token: editor.token }));
    assert.equal(json.total, 1);
    const done = await drainUntilDone(json.campaignId);
    assert.deepEqual(done.deliveries.map((d) => d.recipient), [target]);
    const [mail] = (await outbox({ to: target })).messages;
    assert.equal(mail.subject, "Subject line", "uses the email subject, not the title");
    assert.ok(mail.html.includes("https://180dcvitc.org/unsubscribe"), "non-subscriber gets the generic link");
    const issue = expectOk(await get("/api/newsletter-editor/drafts", { token: editor.token })).data.find((d) => d.id === id);
    assert.equal(issue.sent_at, null);
  });

  test("a real send reaches every active subscriber", async () => {
    const reader = await subscribe();
    const { id } = expectOk(await post("/api/newsletter-editor/drafts", { title: "Live " + Date.now() }, { token: editor.token }));
    const json = expectOk(await post("/api/newsletter-editor/send", { newsletterId: id }, { token: editor.token }));
    const done = await drainUntilDone(json.campaignId);
    assert.ok(done.deliveries.some((d) => d.recipient === reader.email && d.status === "sent"));
  });

  test("event mail goes to subscribers with their own unsubscribe link", async () => {
    const reader = await subscribe();
    const subject = "Workshop " + Date.now();
    const json = expectOk(await post("/api/newsletter-editor/send-event", { subject, description: "Join us <b>Friday</b>" }, { token: editor.token }));
    await drainUntilDone(json.campaignId);
    const mail = (await outbox({ to: reader.email })).messages.find((m) => m.subject === subject);
    assert.ok(mail);
    assert.ok(mail.html.includes("/unsubscribe/" + reader.token));
    assert.ok(mail.html.includes("&lt;b&gt;Friday"), "description escaped");
    expectStatus(await post("/api/newsletter-editor/send-event", {}, { token: editor.token }), 400);
  });

  test("sending needs an editor session", async () => {
    expectStatus(await post("/api/newsletter-editor/send", { newsletterId: "x" }), 401);
    expectStatus(await post("/api/newsletter-editor/send", { newsletterId: "nope" }, { token: editor.token }), 404);
  });
});

describe("editor access (board)", () => {
  test("board adds and removes authorized emails", async () => {
    const email = uniqueEmail("guest-editor");
    expectOk(await post("/api/newsletter-editor/admin/authorized-emails", { email }, B));
    expectStatus(await post("/api/newsletter-editor/admin/authorized-emails", { email }, B), 409);
    assert.ok(expectOk(await get("/api/newsletter-editor/admin/authorized-emails", B)).data.some((r) => r.email === email));
    expectOk(await del(`/api/newsletter-editor/admin/authorized-emails/${encodeURIComponent(email)}`, B));
    expectStatus(await post("/api/newsletter-editor/otp/send", { email }), 403, "removed email can't log in");
  });

  test("non-board members cannot manage editor access", async () => {
    expectDenied(await get("/api/newsletter-editor/admin/authorized-emails", { token: tokens.director }));
    expectDenied(await post("/api/newsletter-editor/admin/authorized-emails", { email: uniqueEmail("x") }, { token: tokens.member }));
    expectStatus(await get("/api/newsletter-editor/admin/authorized-emails"), 401);
  });
});
