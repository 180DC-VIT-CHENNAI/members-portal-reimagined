// Public "request consulting" form and the board's accept/reject replies.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, post, del, tokens, expectOk, expectStatus, expectDenied, outboxMark, waitForMail, uniqueEmail } from "../lib/api.mjs";

const B = { token: tokens.board };

async function submit() {
  const email = uniqueEmail("ngo");
  expectOk(await post("/api/consulting-request", { name: "Asha", email, phone: "9999999999", organization: "Helping Hands", roleInOrg: "Founder", requirement: "Need a fundraising plan" }));
  const { data } = expectOk(await get("/api/consulting-requests", B));
  return data.find((r) => r.email === email);
}

describe("consulting requests", () => {
  test("a visitor submits one; board sees it pending", async () => {
    const r = await submit();
    assert.equal(r.status, "pending");
    assert.equal(r.organization, "Helping Hands");
  });

  test("all required fields are checked", async () => {
    expectStatus(await post("/api/consulting-request", { name: "A", email: uniqueEmail("x"), phone: "1", organization: "O" }), 400);
    expectStatus(await post("/api/consulting-request", { name: "A", email: "bad", phone: "1", organization: "O", requirement: "R" }), 400);
  });

  test("accepting emails the client the board's reply (escaped)", async () => {
    const r = await submit();
    const mark = await outboxMark();
    expectOk(await post(`/api/consulting-requests/${r.id}/accept`, { emailSubject: "Let's work together", emailBody: "Hi Asha,\nWe'd love to help <script>x</script>" }, B));
    const [mail] = await waitForMail(r.email, mark);
    assert.equal(mail.subject, "Let's work together");
    assert.ok(mail.html.includes("&lt;script&gt;"), "body is HTML-escaped");
    assert.ok(mail.html.includes("Hi Asha,<br>"), "newlines become line breaks");
    const after = expectOk(await get("/api/consulting-requests", B)).data.find((x) => x.id === r.id);
    assert.equal(after.status, "accepted");
    expectStatus(await post(`/api/consulting-requests/${r.id}/reject`, { emailSubject: "x", emailBody: "y" }, B), 400, "already processed");
  });

  test("rejecting also emails the client", async () => {
    const r = await submit();
    const mark = await outboxMark();
    expectOk(await post(`/api/consulting-requests/${r.id}/reject`, { emailSubject: "Sorry", emailBody: "Not this time" }, B));
    await waitForMail(r.email, mark);
    expectStatus(await post(`/api/consulting-requests/${r.id}/accept`, {}, B), 400);
  });

  test("a reply needs a subject and body; unknown id is 404", async () => {
    const r = await submit();
    expectStatus(await post(`/api/consulting-requests/${r.id}/accept`, { emailSubject: "x" }, B), 400);
    expectStatus(await post("/api/consulting-requests/nope/accept", { emailSubject: "x", emailBody: "y" }, B), 404);
  });

  test("board deletes a request", async () => {
    const r = await submit();
    expectOk(await del(`/api/consulting-requests/${r.id}`, B));
    assert.ok(!expectOk(await get("/api/consulting-requests", B)).data.some((x) => x.id === r.id));
    expectStatus(await del(`/api/consulting-requests/${r.id}`, B), 404);
  });

  test("only board can see or answer requests", async () => {
    const r = await submit();
    expectDenied(await get("/api/consulting-requests", { token: tokens.director }));
    expectDenied(await post(`/api/consulting-requests/${r.id}/accept`, { emailSubject: "x", emailBody: "y" }, { token: tokens.director }));
    expectDenied(await del(`/api/consulting-requests/${r.id}`, { token: tokens.member }));
  });
});
