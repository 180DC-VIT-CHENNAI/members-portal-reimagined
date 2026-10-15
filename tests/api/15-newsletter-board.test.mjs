// Board newsletter tools: drafts, uploads, sending through the queue (one
// personalised email per subscriber), delivery tracking and retries.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, del, tokens, expectOk, expectStatus, expectDenied,
  subscribe, outbox, outboxMark, drainUntilDone, findCampaign, upload, fixture, runCron,
} from "../lib/api.mjs";
import { KNOWN } from "../lib/known-issues.mjs";

const B = { token: tokens.board };
// The board list route is broken (KNOWN-5), so read issues via the public route.
const issue = async (id) => expectOk(await get(`/api/newsletter/${id}`)).data;

describe("drafts", () => {
  test("create gets the next issue slug; update keeps it; delete removes it", async () => {
    const a = expectOk(await post("/api/newsletter", { title: "Issue A", description: "d", content: "<p>a</p>" }, B));
    const b = expectOk(await post("/api/newsletter", { title: "Issue B", content: "<p>b</p>" }, B));
    const [na, nb] = [await issue(a.id), await issue(b.id)];
    assert.match(na.slug, /^issue-\d\d$/);
    assert.equal(Number(nb.slug.slice(6)), Number(na.slug.slice(6)) + 1);
    expectOk(await post("/api/newsletter", { id: a.id, title: "Issue A v2" }, B));
    const updated = await issue(a.id);
    assert.equal(updated.title, "Issue A v2");
    assert.equal(updated.slug, na.slug);
    assert.equal((await issue(na.slug)).id, a.id, "issues can be fetched by slug");
    expectOk(await del(`/api/newsletter/${b.id}`, B));
    expectStatus(await get(`/api/newsletter/${b.id}`), 404);
    expectStatus(await post("/api/newsletter", {}, B), 400);
  });

  test("board lists every newsletter", { todo: KNOWN.NEWSLETTER_ADMIN_ROUTE }, async () => {
    const { id } = expectOk(await post("/api/newsletter", { title: "Listed " + Date.now() }, B));
    const { data } = expectOk(await get("/api/newsletter/admin", B));
    assert.ok(data.some((n) => n.id === id));
  });

  test("upload a source PDF", async () => {
    const json = expectOk(await upload("/api/newsletter/upload-source", { file: { data: fixture("sample.pdf"), name: "issue.pdf", type: "application/pdf" } }, B));
    assert.match(json.key, /^source\/.+\.pdf$/);
    expectStatus(await upload("/api/newsletter/upload-source", { file: { data: Buffer.from("x"), name: "x.exe", type: "x" } }, B), 400);
  });

  test("only board manages newsletters", async () => {
    for (const who of ["director", "member"]) {
      expectDenied(await get("/api/newsletter/admin/subscribers", { token: tokens[who] }), who);
      expectDenied(await post("/api/newsletter", { title: "x" }, { token: tokens[who] }), who);
      expectDenied(await post("/api/newsletter/send", { newsletterId: "x" }, { token: tokens[who] }), who);
    }
  });
});

describe("sending", () => {
  test("each subscriber gets their own email and link; late unsubscribes are skipped", async () => {
    const readers = [await subscribe(), await subscribe(), await subscribe()];
    const { id } = expectOk(await post("/api/newsletter", { title: "Big issue " + Date.now(), description: "Inside", content: "<p>Story</p>" }, B));
    const subs = expectOk(await get("/api/newsletter/admin/subscribers", B)).data;
    const active = subs.filter((s) => s.active === 1).length;

    const mark = await outboxMark();
    const sent = expectOk(await post("/api/newsletter/send", { newsletterId: id }, B));
    assert.equal(sent.queued, active);
    // Unsubscribes after the campaign was queued but before it sends.
    expectOk(await post(`/api/newsletter/unsubscribe/${readers[2].token}`, {}));

    const done = await drainUntilDone(sent.campaignId);
    assert.equal(done.campaign.status, "done");
    const skipped = done.deliveries.find((d) => d.recipient === readers[2].email);
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.error, "unsubscribed");

    const { messages } = await outbox({ since: mark });
    for (const r of readers.slice(0, 2)) {
      const mail = messages.find((m) => m.recipient === r.email);
      assert.ok(mail, "email to " + r.email);
      assert.ok(mail.html.includes("https://180dcvitc.org/unsubscribe/" + r.token), "personal footer link");
      assert.ok(!mail.html.includes("%%UNSUBSCRIBE_URL%%"), "placeholder replaced");
      assert.equal(mail.headers["List-Unsubscribe"], `<https://180dcvitc.org/api/newsletter/unsubscribe/${r.token}>`);
      assert.equal(mail.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
      for (const other of readers) if (other !== r) assert.ok(!mail.html.includes(other.token), "no one else's link");
    }
    assert.ok(!messages.some((m) => m.recipient === readers[2].email), "unsubscribed reader not emailed");

    assert.ok((await issue(id)).sent_at, "marked as sent");
    assert.ok(expectOk(await get("/api/newsletter")).data.some((n) => n.id === id), "now in the public archive");
  });

  test("a finished campaign doesn't send twice when the cron runs again", async () => {
    await subscribe();
    const { id } = expectOk(await post("/api/newsletter", { title: "Once " + Date.now() }, B));
    const { campaignId } = expectOk(await post("/api/newsletter/send", { newsletterId: id }, B));
    await drainUntilDone(campaignId);
    const mark = await outboxMark();
    await runCron();
    await runCron();
    assert.equal((await outbox({ since: mark })).messages.filter((m) => m.subject.startsWith("Once ")).length, 0);
  });

  test("a rejected address is marked failed; retry-failed tries only that one again", async () => {
    const good = await subscribe();
    // @reject.invalid is refused like a 550 in test mode.
    const bad = "bounce." + Date.now() + "@reject.invalid";
    expectOk(await post("/api/newsletter/subscribe", { email: bad }));
    const { id } = expectOk(await post("/api/newsletter", { title: "Retry " + Date.now() }, B));
    const { campaignId } = expectOk(await post("/api/newsletter/send", { newsletterId: id }, B));
    let done = await drainUntilDone(campaignId);
    const failed = done.deliveries.find((d) => d.recipient === bad);
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /550/);
    assert.equal(done.deliveries.find((d) => d.recipient === good.email).status, "sent");

    const mark = await outboxMark();
    const json = expectOk(await post(`/api/admin/email-queue/${campaignId}/retry-failed`, {}, B));
    assert.ok(json.retrying >= 1);
    expectStatus(await post(`/api/admin/email-queue/${campaignId}/retry-failed`, {}, B), 409, "can't retry while sending");
    done = await drainUntilDone(campaignId);
    assert.equal(done.deliveries.find((d) => d.recipient === bad).attempts, 2, "tried again");
    assert.equal(done.deliveries.find((d) => d.recipient === good.email).attempts, 1, "not re-sent");
    assert.equal((await outbox({ since: mark, to: good.email })).messages.length, 0);
  });

  test("a recipient refused with a 4xx is failed and the queue moves on", async () => {
    const busy = "busy." + Date.now() + "@tempfail.invalid";
    const subject = "Greylist " + Date.now();
    const to = [busy, ...Array.from({ length: 10 }, (_, i) => `ok${i}.${Date.now()}@test.180dcvitc.org`)];
    expectOk(await post("/api/send-email", { to: to.join(","), subject, body: "x" }, B));
    const done = await drainUntilDone((await findCampaign(subject)).id);
    assert.equal(done.campaign.status, "done");
    assert.equal(done.campaign.sent, 10);
    const d = done.deliveries.find((x) => x.recipient === busy);
    assert.equal(d.status, "failed");
    assert.match(d.error, /450/);
  });

  test("a session timeout pauses the campaign instead of failing anyone", async () => {
    const slow = "slow." + Date.now() + "@timeout.invalid";
    const subject = "Timeout " + Date.now();
    const to = [slow, ...Array.from({ length: 10 }, (_, i) => `t${i}.${Date.now()}@test.180dcvitc.org`)];
    expectOk(await post("/api/send-email", { to: to.join(","), subject, body: "x" }, B));
    const campaign = await findCampaign(subject);
    await runCron();
    await new Promise((r) => setTimeout(r, 1500));
    const json = expectOk(await get(`/api/admin/email-queue/${campaign.id}/deliveries`, B));
    assert.equal(json.campaign.status, "pending", "still queued for the next run");
    assert.equal(json.campaign.cursor, 0);
    assert.equal(json.deliveries.length, 0, "nobody marked failed");
    assert.match(json.campaign.last_error, /timeout/i);
    // After 5 runs in a row without progress it gives up (and stops blocking
    // the queue); retry-failed can restart it later.
    const final = await drainUntilDone(campaign.id);
    assert.equal(final.campaign.status, "failed");
    assert.match(final.campaign.last_error, /max attempts/);
  });

  test("send needs a real newsletter", async () => {
    expectStatus(await post("/api/newsletter/send", {}, B), 400);
    expectStatus(await post("/api/newsletter/send", { newsletterId: "nope" }, B), 404);
  });
});

describe("queue status", () => {
  test("board sees hourly usage and recent campaigns", async () => {
    const json = expectOk(await get("/api/admin/email-queue", B));
    assert.equal(json.hourlyLimit, 500);
    assert.equal(typeof json.hourlyCount, "number");
    assert.ok(Array.isArray(json.recent) && json.recent.length > 0);
    expectDenied(await get("/api/admin/email-queue", { token: tokens.director }));
    expectDenied(await get(`/api/admin/email-queue/${json.recent[0].id}/deliveries`, { token: tokens.director }));
    expectStatus(await get("/api/admin/email-queue/nope/deliveries", B), 404);
  });
});
