// Role transfers: board-approved and two-party (both accept) handovers.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, post, put, tokens, users, expectOk, expectStatus, expectDenied, newMember } from "../lib/api.mjs";

const B = { token: tokens.board };

async function directorAndSuccessor() {
  const from = await newMember("handover-from");
  const to = await newMember("handover-to");
  expectOk(await put(`/api/members/${from.id}/role`, { newRoleId: "operations_director", departmentId: "operations" }, B));
  expectOk(await post("/api/role-transfers", { fromUserId: from.id, toUserId: to.id, roleId: "operations_director" }, B));
  const { data } = expectOk(await get("/api/role-transfers", B));
  const transfer = data.find((t) => t.from_user_id === from.id && t.to_user_id === to.id);
  assert.ok(transfer, "transfer listed as pending");
  return { from, to, transfer };
}

const roleOf = async (m) => expectOk(await post("/api/auth/token-login", { token: m.token })).roleId;

describe("board-approved transfers", () => {
  test("approving moves the role and drops the giver to General Member", async () => {
    const { from, to, transfer } = await directorAndSuccessor();
    expectOk(await post(`/api/role-transfers/${transfer.id}/approve`, {}, B));
    assert.equal(await roleOf(to), "operations_director");
    assert.equal(await roleOf(from), "member");
    expectStatus(await post(`/api/role-transfers/${transfer.id}/approve`, {}, B), 400, "already processed");
  });

  test("rejecting leaves both roles unchanged", async () => {
    const { from, to, transfer } = await directorAndSuccessor();
    expectOk(await post(`/api/role-transfers/${transfer.id}/reject`, {}, B));
    assert.equal(await roleOf(from), "operations_director");
    assert.equal(await roleOf(to), "member");
  });

  test("board roles cannot be transferred", async () => {
    const to = await newMember("board-heir");
    expectOk(await post("/api/role-transfers", { fromUserId: users["board2@test.180dcvitc.org"].id, toUserId: to.id, roleId: "secretary" }, B));
    const { data } = expectOk(await get("/api/role-transfers", B));
    const t = data.find((x) => x.to_user_id === to.id);
    expectStatus(await post(`/api/role-transfers/${t.id}/approve`, {}, B), 400);
  });

  test("missing ids are a 400; unknown transfer is a 404", async () => {
    expectStatus(await post("/api/role-transfers", { fromUserId: "a" }, B), 400);
    expectStatus(await post("/api/role-transfers/does-not-exist/approve", {}, B), 404);
  });

  test("only board can create, list or approve transfers", async () => {
    expectDenied(await get("/api/role-transfers", { token: tokens.director }));
    expectDenied(await post("/api/role-transfers", { fromUserId: "a", toUserId: "b", roleId: "member" }, { token: tokens.member }));
  });
});

describe("two-party transfers", () => {
  test("both people see it, and it completes once both accept", async () => {
    const { from, to, transfer } = await directorAndSuccessor();
    for (const m of [from, to]) {
      const { data } = expectOk(await get("/api/my-role-transfers", { token: m.token }));
      assert.ok(data.some((t) => t.id === transfer.id));
    }
    const first = expectOk(await post(`/api/my-role-transfers/${transfer.id}/accept`, {}, { token: from.token }));
    assert.match(first.message, /waiting/i);
    assert.equal(await roleOf(to), "member", "nothing changes after one acceptance");
    const second = expectOk(await post(`/api/my-role-transfers/${transfer.id}/accept`, {}, { token: to.token }));
    assert.match(second.message, /swapped/i);
    assert.equal(await roleOf(to), "operations_director");
    assert.equal(await roleOf(from), "member");
  });

  test("either person can decline", async () => {
    const { to, transfer } = await directorAndSuccessor();
    expectOk(await post(`/api/my-role-transfers/${transfer.id}/decline`, {}, { token: to.token }));
    expectStatus(await post(`/api/my-role-transfers/${transfer.id}/accept`, {}, { token: to.token }), 400);
  });

  test("someone not involved cannot accept or decline", async () => {
    const { transfer } = await directorAndSuccessor();
    expectStatus(await post(`/api/my-role-transfers/${transfer.id}/accept`, {}, { token: tokens.member }), 403);
    expectStatus(await post(`/api/my-role-transfers/${transfer.id}/decline`, {}, { token: tokens.member }), 403);
  });
});
