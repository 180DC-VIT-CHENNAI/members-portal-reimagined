// Public "request an account" form and board approval.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, post, tokens, expectOk, expectStatus, expectDenied, outboxMark, waitForMail, uniqueEmail } from "../lib/api.mjs";

const B = { token: tokens.board };

async function submit(email, extra = {}) {
  expectOk(await post("/api/signup-requests", { name: "Applicant", email, message: "Hi", departmentId: "marketing", ...extra }));
  const { requests } = expectOk(await get("/api/signup-requests", B));
  return requests.results.find((r) => r.email === email);
}

describe("signup requests", () => {
  test("a visitor submits a request and board sees it as pending", async () => {
    const email = uniqueEmail("apply");
    const req = await submit(email);
    assert.ok(req);
    assert.equal(req.status, "pending");
    assert.equal(req.department_id, "marketing");
    const dash = expectOk(await get("/api/dashboard", B));
    assert.ok(dash.pendingRequests.some((r) => r.email === email));
  });

  test("name, email and department are required", async () => {
    expectStatus(await post("/api/signup-requests", { email: uniqueEmail("x"), departmentId: "tech" }), 400);
    expectStatus(await post("/api/signup-requests", { name: "X", email: "bad", departmentId: "tech" }), 400);
    expectStatus(await post("/api/signup-requests", { name: "X", email: uniqueEmail("x") }), 400);
  });

  test("approving creates the member in that department and emails a token", async () => {
    const email = uniqueEmail("approve");
    const req = await submit(email);
    const mark = await outboxMark();
    const json = expectOk(await post(`/api/signup-requests/${req.id}/approve`, {}, B));
    const login = expectOk(await post("/api/auth/session", { token: json.token }));
    assert.equal(login.email, email);
    assert.equal(login.departmentId, "marketing");
    const [mail] = await waitForMail(email, mark);
    assert.ok(mail.html.includes(json.token));
    const { requests } = expectOk(await get("/api/signup-requests", B));
    assert.ok(!requests.results.some((r) => r.id === req.id), "no longer pending");
  });

  test("rejecting removes it from the pending list", async () => {
    const req = await submit(uniqueEmail("reject"));
    expectOk(await post(`/api/signup-requests/${req.id}/reject`, {}, B));
    const { requests } = expectOk(await get("/api/signup-requests", B));
    assert.ok(!requests.results.some((r) => r.id === req.id));
  });

  test("unknown request id is a 404", async () => {
    expectStatus(await post("/api/signup-requests/nope/approve", {}, B), 404);
  });

  test("the form is limited to 5 submissions per hour per IP", async () => {
    const ip = "203.0.113.70";
    let last;
    for (let i = 0; i < 6; i++) last = await post("/api/signup-requests", { name: "R", email: uniqueEmail("rl"), departmentId: "tech" }, { ip });
    expectStatus(last, 429);
  });

  test("only board can list, approve or reject", async () => {
    expectDenied(await get("/api/signup-requests", { token: tokens.director }));
    expectDenied(await post("/api/signup-requests/x/approve", {}, { token: tokens.member }));
    expectDenied(await post("/api/signup-requests/x/reject", {}, { token: tokens.member }));
  });
});
