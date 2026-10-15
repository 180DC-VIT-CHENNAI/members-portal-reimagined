// Letter Studio (separate OTP login): board-managed access, member list,
// PDF upload/preview, and emailing a letter with the PDF attached.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { get, post, del, tokens, expectOk, expectStatus, expectDenied, otpLogin, outboxMark, waitForMail, upload, fixture, uniqueEmail } from "../lib/api.mjs";

const B = { token: tokens.board };
let L; // letter studio session

before(async () => {
  const email = uniqueEmail("hr");
  expectOk(await post("/api/letter-studio/admin/authorized-emails", { email }, B));
  L = { token: (await otpLogin("letter", email)).token, email };
});

describe("access", () => {
  test("only board-authorized emails can log in (members are not enough)", async () => {
    expectStatus(await post("/api/letter-studio/otp/send", { email: "member@test.180dcvitc.org" }), 403);
    expectStatus(await post("/api/letter-studio/otp/send", { email: "bad" }), 400);
    const me = expectOk(await get("/api/letter-studio/me", { token: L.token }));
    assert.equal(me.email, L.email);
  });

  test("board manages the list; duplicates are a 409; removed emails can't log in", async () => {
    const email = uniqueEmail("tmp-hr");
    expectOk(await post("/api/letter-studio/admin/authorized-emails", { email }, B));
    expectStatus(await post("/api/letter-studio/admin/authorized-emails", { email }, B), 409);
    assert.ok(expectOk(await get("/api/letter-studio/admin/authorized-emails", B)).data.some((r) => r.email === email));
    expectOk(await del(`/api/letter-studio/admin/authorized-emails/${encodeURIComponent(email)}`, B));
    expectStatus(await post("/api/letter-studio/otp/send", { email }), 403);
  });

  test("non-board members can't manage letter access", async () => {
    expectDenied(await get("/api/letter-studio/admin/authorized-emails", { token: tokens.director }));
    expectDenied(await post("/api/letter-studio/admin/authorized-emails", { email: uniqueEmail("x") }, { token: tokens.member }));
  });

  test("logout ends the session", async () => {
    const s = await otpLogin("letter", L.email);
    expectOk(await post("/api/letter-studio/logout", {}, { token: s.token }));
    expectStatus(await get("/api/letter-studio/me", { token: s.token }), 401);
  });
});

describe("letters", () => {
  test("the member picker lists members but not advisory members", async () => {
    const { data } = expectOk(await get("/api/letter-studio/members", { token: L.token }));
    assert.ok(data.some((u) => u.email === "member@test.180dcvitc.org"));
    assert.ok(!data.some((u) => u.power_level === 30));
    expectStatus(await get("/api/letter-studio/members", { token: tokens.board }), 401, "member tokens don't open the studio");
  });

  test("upload a PDF, preview it, and email it as an attachment", async () => {
    const { key } = expectOk(await upload("/api/letter-studio/upload", { file: { data: fixture("sample.pdf"), name: "offer.pdf", type: "application/pdf" }, docnum: "180DC/APP/001" }, { token: L.token }));
    assert.match(key, /^letters\/180DC-APP-001-[a-f0-9]{8}\.pdf$/);

    const preview = await get(`/api/letter-studio/files/${key}?t=${L.token}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "application/pdf");
    expectStatus(await get(`/api/letter-studio/files/${key}?t=wrong`), 401);
    expectStatus(await get(`/api/letter-studio/files/source/x.pdf?t=${L.token}`), 400, "only letters/ keys");

    const to = uniqueEmail("appointee");
    const mark = await outboxMark();
    expectOk(await post("/api/letter-studio/send", { fileKey: key, recipientEmail: to, docType: "appointment", name: "Priya", position: "Analyst", team: "Marketing", docnum: "180DC/APP/001" }, { token: L.token }));
    const [mail] = await waitForMail(to, mark);
    assert.equal(mail.subject, "Your Appointment Letter | 180 Degrees Consulting VIT Chennai — Priya");
    assert.deepEqual(mail.attachments, [key.split("/").pop()]);
  });

  test("validation", async () => {
    expectStatus(await upload("/api/letter-studio/upload", { file: { data: Buffer.from("x"), name: "x.docx", type: "application/msword" } }, { token: L.token }), 400);
    expectStatus(await post("/api/letter-studio/send", { fileKey: "letters/x.pdf" }, { token: L.token }), 400);
    expectStatus(await post("/api/letter-studio/send", { fileKey: "source/x.pdf", recipientEmail: "a@b.co" }, { token: L.token }), 400);
    expectStatus(await post("/api/letter-studio/send", { fileKey: "letters/missing.pdf", recipientEmail: "a@b.co" }, { token: L.token }), 404);
    expectStatus(await post("/api/letter-studio/send", { fileKey: "letters/x.pdf", recipientEmail: "a@b.co" }), 401);
  });
});
