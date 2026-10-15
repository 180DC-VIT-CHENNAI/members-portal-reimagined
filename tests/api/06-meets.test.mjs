// Club-wide and inter-department meets, re-sending meet notifications, and
// hiding meet links a day after the meet.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, del, tokens, expectOk, expectStatus, expectDenied,
  findCampaign, drainUntilDone, outbox, runCron,
} from "../lib/api.mjs";

const B = { token: tokens.board };
const D = { token: tokens.director };
const at = (hoursFromNow) => new Date(Date.now() + hoursFromNow * 36e5).toISOString().replace("T", " ").slice(0, 19);

describe("club-wide meets", () => {
  test("a director schedules one; every member is queued an email", async () => {
    const title = "General body " + Date.now();
    const json = expectOk(await post("/api/club-meets", { title, scheduledAt: at(48), meetLink: "https://meet.google.com/club" }, D));
    const { data: everyone } = expectOk(await get("/api/users", B));
    const eligible = everyone.filter((u) => !(u.role_id === "advisory" && !u.department_id));
    assert.equal(json.emailsQueued, eligible.length);
    const advisoryNoDept = everyone.find((u) => u.email === "advisory@test.180dcvitc.org");
    const campaign = await findCampaign(title);
    await drainUntilDone(campaign.id);
    const { messages } = await outbox();
    const sentTo = new Set(messages.filter((m) => m.subject === "New Meet: " + title).map((m) => m.recipient));
    assert.equal(sentTo.size, eligible.length);
    assert.ok(!sentTo.has(advisoryNoDept.email), "advisory members without a department are skipped");
    const { data } = expectOk(await get("/api/club-meets", { token: tokens.member }));
    assert.ok(data.some((m) => m.title === title && m.meet_link === "https://meet.google.com/club"));
  });

  test("members cannot schedule or delete club meets", async () => {
    expectStatus(await post("/api/club-meets", { title: "x", scheduledAt: at(1) }, { token: tokens.member }), 403);
    expectStatus(await del("/api/club-meets/whatever", { token: tokens.member }), 403);
  });

  test("validation: title, time and a real URL", async () => {
    expectStatus(await post("/api/club-meets", { title: "x" }, D), 400);
    expectStatus(await post("/api/club-meets", { title: "x", scheduledAt: at(1), meetLink: "ftp//nope" }, D), 400);
  });

  test("a director deletes a club meet", async () => {
    const title = "Cancelled " + Date.now();
    const { meetId } = expectOk(await post("/api/club-meets", { title, scheduledAt: at(5) }, D));
    expectOk(await del(`/api/club-meets/${meetId}`, D));
    const { data } = expectOk(await get("/api/club-meets", B));
    assert.ok(!data.some((m) => m.id === meetId));
  });
});

describe("meet link visibility", () => {
  test("the link is shown until 24 hours after the meet, then hidden", async () => {
    const recent = expectOk(await post("/api/club-meets", { title: "Recent " + Date.now(), scheduledAt: at(-12), meetLink: "https://meet.google.com/recent" }, B));
    const old = expectOk(await post("/api/club-meets", { title: "Old " + Date.now(), scheduledAt: at(-30), meetLink: "https://meet.google.com/old" }, B));
    const { data } = expectOk(await get("/api/club-meets", { token: tokens.member }));
    assert.equal(data.find((m) => m.id === recent.meetId).meet_link, "https://meet.google.com/recent");
    assert.equal(data.find((m) => m.id === old.meetId).meet_link, null);
  });

  test("the same rule applies to department and inter-department meets", async () => {
    const dm = expectOk(await post("/api/departments/marketing/meets", { title: "Old dept " + Date.now(), scheduledAt: at(-30), meetLink: "https://meet.google.com/olddept" }, D));
    const im = expectOk(await post("/api/inter-dept-meets", { title: "Old inter " + Date.now(), scheduledAt: at(-30), meetLink: "https://meet.google.com/oldinter", departments: ["marketing"] }, D));
    const dlist = expectOk(await get("/api/department-meets", { token: tokens.member })).data;
    assert.equal(dlist.find((m) => m.id === dm.meetId).meet_link, null);
    const ilist = expectOk(await get("/api/inter-dept-meets", { token: tokens.member })).data;
    assert.equal(ilist.find((m) => m.id === im.meetId).meet_link, null);
  });
});

describe("inter-department meets", () => {
  test("emails only the chosen departments", async () => {
    const title = "Joint " + Date.now();
    const json = expectOk(await post("/api/inter-dept-meets", { title, scheduledAt: at(24), departments: "marketing,finance" }, D));
    const { data: everyone } = expectOk(await get("/api/users", B));
    const expected = everyone.filter((u) => ["marketing", "finance"].includes(u.department_id));
    assert.equal(json.emailsQueued, expected.length);
    await drainUntilDone((await findCampaign(title)).id);
    const sentTo = new Set((await outbox()).messages.filter((m) => m.subject === "New Meet: " + title).map((m) => m.recipient));
    assert.ok(sentTo.has("member@test.180dcvitc.org") && sentTo.has("member2@test.180dcvitc.org"));
    assert.ok(!everyone.filter((u) => u.department_id === "tech").some((u) => sentTo.has(u.email)), "tech not emailed");
  });

  test("departments are required", async () => {
    expectStatus(await post("/api/inter-dept-meets", { title: "x", scheduledAt: at(1) }, D), 400);
    expectStatus(await post("/api/inter-dept-meets", { title: "x", scheduledAt: at(1), departments: [] }, D), 400);
  });

  test("a director deletes it; members cannot", async () => {
    const { meetId } = expectOk(await post("/api/inter-dept-meets", { title: "Del " + Date.now(), scheduledAt: at(3), departments: ["tech"] }, D));
    expectStatus(await del(`/api/inter-dept-meets/${meetId}`, { token: tokens.member }), 403);
    expectOk(await del(`/api/inter-dept-meets/${meetId}`, D));
  });
});

describe("re-sending a meet notification", () => {
  test("queues the email again for the meet's audience", async () => {
    const title = "Resend " + Date.now();
    const { meetId } = expectOk(await post("/api/departments/marketing/meets", { title, scheduledAt: at(10) }, D));
    const json = expectOk(await post(`/api/meets/department_meet/${meetId}/send-notification`, {}, D));
    assert.ok(json.emailsQueued > 0);
  });

  test("a director cannot notify another department's meet", async () => {
    const { meetId } = expectOk(await post("/api/departments/finance/meets", { title: "Fin " + Date.now(), scheduledAt: at(10) }, { token: tokens.director2 }));
    expectStatus(await post(`/api/meets/department_meet/${meetId}/send-notification`, {}, D), 403);
  });

  test("unknown type is 400, unknown meet is 404, members are 403", async () => {
    expectStatus(await post("/api/meets/party/x/send-notification", {}, D), 400);
    expectStatus(await post("/api/meets/club_meet/nope/send-notification", {}, D), 404);
    expectStatus(await post("/api/meets/club_meet/nope/send-notification", {}, { token: tokens.member }), 403);
  });
});

describe("legacy pending-email queue", () => {
  test("board can flush it; others cannot", async () => {
    const json = expectOk(await post("/api/meets/process-queue", {}, B));
    assert.equal(typeof json.emailsSent, "number");
    expectStatus(await post("/api/meets/process-queue", {}, D), 403);
  });
});
