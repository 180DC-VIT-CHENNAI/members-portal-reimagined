// Members, board/director/advisory accounts, roles, the member directory,
// CSV export, removing members, and what the dashboard shows each role.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, put, del, tokens, users, expectOk, expectStatus, expectDenied,
  outboxMark, waitForMail, newMember, uniqueEmail,
} from "../lib/api.mjs";

const B = { token: tokens.board };

describe("adding members", () => {
  test("board adds a General Member, who gets a login token by email", async () => {
    const email = uniqueEmail("added");
    const mark = await outboxMark();
    const json = expectOk(await post("/api/members", { email, name: "Added", departmentId: "tech" }, B));
    assert.ok(json.token);
    const [mail] = await waitForMail(email, mark);
    assert.ok(mail.html.includes(json.token));
    const login = expectOk(await post("/api/auth/session", { token: json.token }));
    assert.equal(login.roleId, "member");
    assert.equal(login.departmentId, "tech");
  });

  test("name and a valid email are required", async () => {
    expectStatus(await post("/api/members", { email: "bad", name: "X" }, B), 400);
    expectStatus(await post("/api/members", { email: uniqueEmail("n") }, B), 400);
  });

  test("adding an existing member's email fails", async () => {
    const res = await post("/api/members", { email: "member@test.180dcvitc.org", name: "Dup" }, B);
    assert.ok(res.status >= 400, `got ${res.status}`);
  });

  test("only board can add members", async () => {
    for (const who of ["director", "member", "advisory"]) {
      expectDenied(await post("/api/members", { email: uniqueEmail("x"), name: "X" }, { token: tokens[who] }), who);
    }
  });
});

describe("board and director accounts", () => {
  test("board creates a director with a department", async () => {
    const email = uniqueEmail("ops");
    const json = expectOk(await post("/api/board-users", { email, name: "Ops", roleId: "operations_director", departmentId: "operations" }, B));
    const login = expectOk(await post("/api/auth/session", { token: json.token }));
    assert.equal(login.powerLevel, 50);
    assert.equal(login.departmentId, "operations");
  });

  test("the role must exist and be director level or above", async () => {
    expectStatus(await post("/api/board-users", { email: uniqueEmail("x"), roleId: "member" }, B), 400);
    expectStatus(await post("/api/board-users", { email: uniqueEmail("x"), roleId: "no_such_role" }, B), 400);
    expectStatus(await post("/api/board-users", { email: uniqueEmail("x") }, B), 400);
  });

  test("advisory members get power level 30 and their former title", async () => {
    const email = uniqueEmail("adv");
    const json = expectOk(await post("/api/advisory-members", { email, name: "Adv", exTitle: "Ex Treasurer" }, B));
    assert.equal(json.exTitle, "Ex Treasurer");
    const login = expectOk(await post("/api/auth/session", { token: json.token }));
    assert.equal(login.powerLevel, 30);
  });

  test("directors cannot create board or advisory accounts", async () => {
    expectDenied(await post("/api/board-users", { email: uniqueEmail("x"), roleId: "chairperson" }, { token: tokens.director }));
    expectDenied(await post("/api/advisory-members", { email: uniqueEmail("x") }, { token: tokens.director }));
  });
});

describe("roles", () => {
  test("board lists roles, highest first", async () => {
    const { data } = expectOk(await get("/api/roles", B));
    assert.equal(data[0].power_level, 100);
    for (const id of ["chairperson", "member", "advisory", "marketing_director"]) {
      assert.ok(data.some((r) => r.id === id), id);
    }
  });

  test("board creates a custom role below board level", async () => {
    const roleId = "custom_" + Date.now().toString(36);
    expectOk(await post("/api/roles", { roleId, name: "Custom Lead", powerLevel: 40 }, B));
    const { data } = expectOk(await get("/api/roles", B));
    assert.ok(data.some((r) => r.id === roleId && r.power_level === 40));
  });

  test("custom roles cannot reach board level or be invalid", async () => {
    expectStatus(await post("/api/roles", { roleId: "too_high", name: "X", powerLevel: 100 }, B), 400);
    expectStatus(await post("/api/roles", { roleId: "neg", name: "X", powerLevel: 0 }, B), 400);
    expectStatus(await post("/api/roles", { roleId: "str", name: "X", powerLevel: "50" }, B), 400);
  });

  test("changing a member's role takes effect and emails them", async () => {
    const m = await newMember("promote");
    const mark = await outboxMark();
    expectOk(await put(`/api/members/${m.id}/role`, { newRoleId: "crm_director", departmentId: "crm" }, B));
    const login = expectOk(await post("/api/auth/session", { token: m.token }));
    assert.equal(login.roleId, "crm_director");
    assert.equal(login.departmentId, "crm");
    await waitForMail(m.email, mark);
  });

  test("only board can list roles, create roles or change roles", async () => {
    expectDenied(await get("/api/roles", { token: tokens.director }));
    expectDenied(await post("/api/roles", { roleId: "x", name: "x", powerLevel: 5 }, { token: tokens.director }));
    expectDenied(await put(`/api/members/${users["member@test.180dcvitc.org"].id}/role`, { newRoleId: "chairperson" }, { token: tokens.director }));
  });
});

describe("member lists", () => {
  test("board sees everyone in /api/users", async () => {
    const { data } = expectOk(await get("/api/users", B));
    for (const e of ["member@test.180dcvitc.org", "member2@test.180dcvitc.org", "advisory@test.180dcvitc.org"]) {
      assert.ok(data.some((u) => u.email === e), e);
    }
  });

  test("a director sees only their department plus the board", async () => {
    const { data } = expectOk(await get("/api/users", { token: tokens.director }));
    assert.ok(data.some((u) => u.email === "member@test.180dcvitc.org"), "own department member");
    assert.ok(!data.some((u) => u.email === "member2@test.180dcvitc.org"), "other department hidden");
    assert.ok(data.every((u) => u.department_id === "marketing" || u.power_level >= 100));
  });

  test("members cannot list users but can read the directory", async () => {
    expectDenied(await get("/api/users", { token: tokens.member }));
    const { data } = expectOk(await get("/api/members-directory", { token: tokens.member }));
    assert.ok(data.length >= 7);
    assert.ok(!("token" in data[0]));
  });

  test("advisory members can read the directory", async () => {
    expectOk(await get("/api/members-directory", { token: tokens.advisory }));
  });

  test("board exports members as CSV", async () => {
    const res = await get("/api/members/export", B);
    expectOk(res);
    assert.match(res.headers.get("content-type"), /text\/csv/);
    assert.match(res.headers.get("content-disposition"), /members_export\.csv/);
    const [header, ...rows] = res.text.trim().split("\r\n");
    assert.equal(header, "Name,Email,Role,Department,Ex.Title,Created At");
    assert.ok(rows.some((r) => r.includes("member@test.180dcvitc.org")));
    expectDenied(await get("/api/members/export", { token: tokens.director }));
  });
});

describe("removing members", () => {
  test("board removes a member; their token stops working", async () => {
    const m = await newMember("remove");
    expectOk(await del(`/api/members/${m.id}`, B));
    expectStatus(await get("/api/dashboard", { token: m.token }), 401);
    const { data } = expectOk(await get("/api/users", B));
    assert.ok(!data.some((u) => u.email === m.email));
  });

  test("board members cannot be removed", async () => {
    expectStatus(await del(`/api/members/${users["board2@test.180dcvitc.org"].id}`, B), 400);
  });

  test("directors cannot remove members", async () => {
    expectDenied(await del(`/api/members/${users["member@test.180dcvitc.org"].id}`, { token: tokens.director }));
  });
});

describe("dashboard", () => {
  test("board sees pending requests, tokens (masked) and board flags", async () => {
    const json = expectOk(await get("/api/dashboard", B));
    assert.equal(json.user.powerLevel, 100);
    assert.equal(json.flags.canManageBoard, true);
    assert.ok(Array.isArray(json.adminTokens) && json.adminTokens.length > 0);
    for (const t of json.adminTokens) {
      assert.ok(!("token" in t), "full token never returned");
      assert.ok(!Object.values(tokens).includes(t.tokenPreview), "preview is masked");
    }
    assert.equal(typeof json.stats.membersCount, "number");
    assert.equal(json.stats.hourEmailLimit, 500);
    assert.ok(json.departments.some((d) => d.id === "marketing"));
  });

  test("a director can open the hub but not manage the board", async () => {
    const json = expectOk(await get("/api/dashboard", { token: tokens.director }));
    assert.equal(json.flags.canAccessHub, true);
    assert.equal(json.flags.canManageBoard, false);
    assert.deepEqual(json.adminTokens, []);
    assert.deepEqual(json.pendingRequests, []);
  });

  test("a member sees their own profile and no admin data", async () => {
    const json = expectOk(await get("/api/dashboard", { token: tokens.member }));
    assert.equal(json.user.email, "member@test.180dcvitc.org");
    assert.equal(json.flags.canAccessHub, false);
    assert.deepEqual(json.adminTokens, []);
  });
});
