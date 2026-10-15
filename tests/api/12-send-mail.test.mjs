// "Send Mail": board emails anyone; directors only their own department.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { post, tokens, expectOk, expectStatus, outbox, outboxMark, waitForMail, findCampaign, drainUntilDone, uniqueEmail } from "../lib/api.mjs";

describe("send mail", () => {
  test("board sends to a few addresses right away; body is escaped", async () => {
    const a = uniqueEmail("mail-a"), b = uniqueEmail("mail-b");
    const mark = await outboxMark();
    const subject = "Board note " + Date.now();
    const json = expectOk(await post("/api/send-email", { to: `${a}, ${b}; not-an-email`, subject, body: "Line 1\n<b>raw</b>" }, { token: tokens.board }));
    assert.match(json.message, /sent to 2/);
    const [mail] = await waitForMail(a, mark);
    await waitForMail(b, mark);
    assert.equal(mail.subject, subject);
    assert.ok(mail.html.includes("&lt;b&gt;raw&lt;/b&gt;"));
  });

  test("more than 10 recipients are queued and sent by the cron", async () => {
    const list = Array.from({ length: 12 }, (_, i) => uniqueEmail("bulk" + i));
    const subject = "Bulk note " + Date.now();
    const json = expectOk(await post("/api/send-email", { to: list.join(","), subject, body: "Hello all" }, { token: tokens.board }));
    assert.equal(json.queued, 12);
    const done = await drainUntilDone((await findCampaign(subject)).id);
    assert.equal(done.campaign.sent, 12);
    assert.equal(done.deliveries.filter((d) => d.status === "sent").length, 12);
  });

  test("a director can only email their own department", async () => {
    const D = { token: tokens.director };
    const subject = "Dept note " + Date.now();
    const mark = await outboxMark();
    expectOk(await post("/api/send-email", { to: "member@test.180dcvitc.org, member2@test.180dcvitc.org, outsider@example.com", subject, body: "Hi team" }, D));
    await waitForMail("member@test.180dcvitc.org", mark);
    const { messages } = await outbox({ since: mark });
    assert.ok(!messages.some((m) => m.recipient === "member2@test.180dcvitc.org"), "other department dropped");
    assert.ok(!messages.some((m) => m.recipient === "outsider@example.com"), "outsiders dropped");
    expectStatus(await post("/api/send-email", { to: "member2@test.180dcvitc.org", subject: "x", body: "y" }, D), 403);
  });

  test("members cannot send; fields are required", async () => {
    expectStatus(await post("/api/send-email", { to: "a@b.co", subject: "x", body: "y" }, { token: tokens.member }), 403);
    expectStatus(await post("/api/send-email", { to: "a@b.co", subject: "x" }, { token: tokens.board }), 400);
    expectStatus(await post("/api/send-email", { to: "nope", subject: "x", body: "y" }, { token: tokens.board }), 400);
  });

});
