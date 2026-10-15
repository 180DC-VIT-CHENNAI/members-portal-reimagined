// Club projects: creation by board, department visibility, project roles,
// tasks, completion and the public completed-projects list.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, put, del, tokens, users, expectOk, expectStatus, expectDenied,
  outboxMark, waitForMail, outbox,
} from "../lib/api.mjs";

const B = { token: tokens.board };
const D = { token: tokens.director };

async function createProject(extra = {}) {
  const name = "Client " + Date.now() + Math.random().toString(36).slice(2, 5);
  const json = expectOk(await post("/api/projects", { name, description: "Pro bono", companyOrg: "NGO", deadline: "2031-03-01", departmentIds: ["marketing"], ...extra }, B));
  return { id: json.projectId, name };
}
const findProject = async (id, who = B) => expectOk(await get("/api/projects", who)).data.find((p) => p.id === id);

describe("creating projects", () => {
  test("board creates a project; the year comes from the deadline", async () => {
    const { id } = await createProject();
    const p = await findProject(id);
    assert.equal(p.year, "2031-2032");
    assert.deepEqual(p.departments.map((d) => d.id), ["marketing"]);
  });

  test("directors of assigned departments are emailed", async () => {
    const mark = await outboxMark();
    const { name } = await createProject();
    const [mail] = await waitForMail("director@test.180dcvitc.org", mark);
    assert.equal(mail.subject, "New Project Assigned: " + name);
    const { messages } = await outbox({ since: mark });
    assert.ok(!messages.some((m) => m.recipient === "member@test.180dcvitc.org"), "members are not emailed");
  });

  test("validation: name, departments, and a year or valid deadline", async () => {
    expectStatus(await post("/api/projects", { departmentIds: ["tech"], year: "2030-2031" }, B), 400);
    expectStatus(await post("/api/projects", { name: "x", departmentIds: [], year: "2030" }, B), 400);
    expectStatus(await post("/api/projects", { name: "x", departmentIds: ["tech"] }, B), 400);
    expectStatus(await post("/api/projects", { name: "x", departmentIds: ["tech"], deadline: "not a date" }, B), 400);
  });

  test("only board can create or delete projects", async () => {
    expectStatus(await post("/api/projects", { name: "x", departmentIds: ["marketing"], year: "2030" }, D), 403);
    const { id } = await createProject();
    expectStatus(await del(`/api/projects/${id}`, D), 403);
    expectOk(await del(`/api/projects/${id}`, B));
    assert.equal(await findProject(id), undefined);
  });
});

describe("who sees which project", () => {
  test("members see their department's projects only", async () => {
    const mine = await createProject();
    const theirs = await createProject({ departmentIds: ["finance"] });
    const seen = expectOk(await get("/api/projects", { token: tokens.member })).data.map((p) => p.id);
    assert.ok(seen.includes(mine.id));
    assert.ok(!seen.includes(theirs.id));
  });
});

describe("project roles", () => {
  test("a director of an assigned department assigns a role, and the person is emailed", async () => {
    const { id, name } = await createProject();
    const member = users["member@test.180dcvitc.org"];
    const mark = await outboxMark();
    expectOk(await post(`/api/projects/${id}/roles`, { userId: member.id, roleName: "Analyst" }, D));
    const p = await findProject(id);
    const role = p.roles.find((r) => r.user_id === member.id);
    assert.equal(role.role_name, "Analyst");
    const [mail] = await waitForMail(member.email, mark);
    assert.ok(mail.html.includes(name) || mail.subject.includes(name));
    expectOk(await del(`/api/projects/${id}/roles/${role.id}`, D));
    assert.equal((await findProject(id)).roles.length, 0);
  });

  test("a director of another department cannot assign roles", async () => {
    const { id } = await createProject();
    expectStatus(await post(`/api/projects/${id}/roles`, { userId: users["member2@test.180dcvitc.org"].id, roleName: "X" }, { token: tokens.director2 }), 403);
  });

  test("members cannot assign roles; unknown project is 404", async () => {
    const { id } = await createProject();
    expectStatus(await post(`/api/projects/${id}/roles`, { userId: "x", roleName: "X" }, { token: tokens.member }), 403);
    expectStatus(await post("/api/projects/nope/roles", { userId: "x", roleName: "X" }, B), 404);
    expectStatus(await post(`/api/projects/${id}/roles`, { roleName: "X" }, B), 400);
  });
});

describe("tasks", () => {
  test("create, complete, reopen and complete-all", async () => {
    const { id } = await createProject();
    expectOk(await post(`/api/projects/${id}/tasks`, { title: "Kickoff", assignedTo: users["member@test.180dcvitc.org"].id }, D));
    expectOk(await post(`/api/projects/${id}/tasks`, { title: "Report" }, D));
    let tasks = expectOk(await get(`/api/projects/${id}/tasks`, D)).data;
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].assigned_name, "Marketing Member");
    expectOk(await put(`/api/projects/${id}/tasks/${tasks[0].id}`, { status: "completed" }, D));
    tasks = expectOk(await get(`/api/projects/${id}/tasks`, D)).data;
    assert.equal(tasks[0].status, "completed");
    assert.ok(tasks[0].completed_at);
    expectOk(await put(`/api/projects/${id}/tasks/${tasks[0].id}`, { status: "pending" }, D));
    expectOk(await post(`/api/projects/${id}/tasks/complete-all`, {}, D));
    tasks = expectOk(await get(`/api/projects/${id}/tasks`, D)).data;
    assert.ok(tasks.every((t) => t.status === "completed"));
  });

  test("validation: a title and a known status", async () => {
    const { id } = await createProject();
    expectStatus(await post(`/api/projects/${id}/tasks`, {}, D), 400);
    expectOk(await post(`/api/projects/${id}/tasks`, { title: "t" }, D));
    const [t] = expectOk(await get(`/api/projects/${id}/tasks`, D)).data;
    expectStatus(await put(`/api/projects/${id}/tasks/${t.id}`, { status: "done" }, D), 400);
  });

  test("other departments' directors and members cannot manage tasks", async () => {
    const { id } = await createProject();
    expectDenied(await post(`/api/projects/${id}/tasks`, { title: "x" }, { token: tokens.director2 }));
    expectDenied(await post(`/api/projects/${id}/tasks`, { title: "x" }, { token: tokens.member }));
    expectDenied(await post(`/api/projects/${id}/tasks/complete-all`, {}, { token: tokens.member }));
  });
});

describe("completing projects", () => {
  test("a completed project appears in the public list; reopening removes it", async () => {
    const { id } = await createProject({ name: "Public & <Co> " + Date.now() });
    expectOk(await post(`/api/projects/${id}/complete`, {}, B));
    let pub = expectOk(await get("/api/projects/completed")).data;
    const item = pub.find((p) => p.id === id);
    assert.ok(item, "listed publicly without login");
    assert.ok(!item.name.includes("<"), "HTML-escaped in the public JSON");
    assert.equal((await findProject(id)).status, "completed");
    expectOk(await post(`/api/projects/${id}/reopen`, {}, B));
    pub = expectOk(await get("/api/projects/completed")).data;
    assert.ok(!pub.some((p) => p.id === id));
  });

  test("only board completes, reopens or regenerates", async () => {
    const { id } = await createProject();
    expectStatus(await post(`/api/projects/${id}/complete`, {}, D), 403);
    expectStatus(await post(`/api/projects/${id}/reopen`, {}, D), 403);
    expectStatus(await post("/api/projects/regenerate-completed", {}, D), 403);
    expectOk(await post("/api/projects/regenerate-completed", {}, B));
  });
});
