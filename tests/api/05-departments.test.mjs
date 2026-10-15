// Department hub: overview, meets, documents, instructions, department
// projects and member lists. Directors manage their own department; board
// manages all.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  get, post, put, del, tokens, expectOk, expectStatus, expectDenied,
  findCampaign, drainUntilDone, outbox,
} from "../lib/api.mjs";
import { KNOWN } from "../lib/known-issues.mjs";

const D = { token: tokens.director }; // marketing director
const inAWeek = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16);

describe("public department list", () => {
  test("lists the six seeded departments without logging in", async () => {
    const { data } = expectOk(await get("/api/departments"));
    const ids = data.map((d) => d.id).sort();
    for (const id of ["business_strategy", "crm", "finance", "marketing", "operations", "tech"]) {
      assert.ok(ids.includes(id), id);
    }
  });
});

describe("own department (director)", () => {
  test("overview returns meets, documents, instructions and projects", async () => {
    const json = expectOk(await get("/api/departments/marketing/overview", D));
    assert.equal(json.departmentId, "marketing");
    for (const k of ["meets", "documents", "instructions", "projects"]) assert.ok(Array.isArray(json[k]), k);
  });

  test("documents: add, list, remove; URL must be valid", async () => {
    const title = "Brand kit " + Date.now();
    expectOk(await post("/api/departments/marketing/documents", { title, fileUrl: "https://drive.google.com/x" }, D));
    let doc = expectOk(await get("/api/departments/marketing/overview", D)).documents.find((d) => d.title === title);
    assert.ok(doc);
    expectOk(await del(`/api/departments/marketing/documents/${doc.id}`, D));
    doc = expectOk(await get("/api/departments/marketing/overview", D)).documents.find((d) => d.title === title);
    assert.equal(doc, undefined);
    expectStatus(await post("/api/departments/marketing/documents", { title: "x", fileUrl: "javascript:alert(1)" }, D), 400);
    expectStatus(await post("/api/departments/marketing/documents", {}, D), 400);
  });

  test("instructions: add with priority, list, remove", async () => {
    const title = "Post schedule " + Date.now();
    expectOk(await post("/api/departments/marketing/instructions", { title, content: "Post daily", priority: "high" }, D));
    const { data } = expectOk(await get("/api/departments/marketing/instructions", D));
    const ins = data.find((i) => i.title === title);
    assert.equal(ins.priority, "high");
    expectOk(await del(`/api/departments/marketing/instructions/${ins.id}`, D));
    expectStatus(await post("/api/departments/marketing/instructions", { title: "x" }, D), 400);
  });

  test("department projects: add and change status", async () => {
    const name = "Campaign " + Date.now();
    expectOk(await post("/api/departments/marketing/projects", { name, description: "Q3", deadline: "2030-01-01" }, D));
    let proj = expectOk(await get("/api/departments/marketing/overview", D)).projects.find((p) => p.name === name);
    assert.ok(proj);
    expectOk(await put(`/api/departments/marketing/projects/${proj.id}/status`, { status: "ongoing" }, D));
    proj = expectOk(await get("/api/departments/marketing/overview", D)).projects.find((p) => p.name === name);
    assert.equal(proj.status, "ongoing");
    expectStatus(await post("/api/departments/marketing/projects", {}, D), 400);
  });

  test("member list shows the department's people", async () => {
    const { data } = expectOk(await get("/api/departments/marketing/members", D));
    assert.ok(data.some((u) => u.email === "member@test.180dcvitc.org"));
    assert.ok(!data.some((u) => u.email === "member2@test.180dcvitc.org"));
  });
});

describe("department meets", () => {
  test("scheduling a meet emails everyone in the department", async () => {
    const title = "Marketing sync " + Date.now();
    const json = expectOk(await post("/api/departments/marketing/meets", { title, scheduledAt: inAWeek(), meetLink: "https://meet.google.com/abc-defg-hij", description: "Weekly" }, D));
    assert.ok(json.meetId);
    const { data: people } = expectOk(await get("/api/departments/marketing/members", D));
    assert.equal(json.emailsQueued, people.length);
    const campaign = await findCampaign(title);
    const result = await drainUntilDone(campaign.id);
    assert.equal(result.campaign.sent, people.length);
    const { messages } = await outbox();
    for (const p of people) {
      const mail = messages.find((m) => m.recipient === p.email && m.subject === "New Meet: " + title);
      assert.ok(mail, "meet email to " + p.email);
      assert.ok(mail.html.includes("meet.google.com/abc-defg-hij"));
    }
    assert.ok(!messages.some((m) => m.recipient === "member2@test.180dcvitc.org" && m.subject === "New Meet: " + title), "other departments not emailed");
  });

  test("members of the department see the meet; deleting removes it", async () => {
    const title = "Delete me " + Date.now();
    const { meetId } = expectOk(await post("/api/departments/marketing/meets", { title, scheduledAt: inAWeek() }, D));
    const { data } = expectOk(await get("/api/department-meets", { token: tokens.member }));
    assert.ok(data.some((m) => m.id === meetId));
    const { data: other } = expectOk(await get("/api/department-meets", { token: tokens.member2 }));
    assert.ok(!other.some((m) => m.id === meetId), "other departments don't see it");
    expectOk(await del(`/api/departments/marketing/meets/${meetId}`, D));
    const after = expectOk(await get("/api/department-meets", { token: tokens.member })).data;
    assert.ok(!after.some((m) => m.id === meetId));
  });

  test("title and time are required; the link must be a URL", async () => {
    expectStatus(await post("/api/departments/marketing/meets", { title: "x" }, D), 400);
    expectStatus(await post("/api/departments/marketing/meets", { title: "x", scheduledAt: inAWeek(), meetLink: "not a url" }, D), 400);
  });

  test("board sees every department's meets", async () => {
    const { data } = expectOk(await get("/api/department-meets", { token: tokens.board }));
    assert.ok(data.some((m) => m.department_id === "marketing"));
  });
});

describe("access control", () => {
  const denied = [
    ["GET", "/api/departments/finance/overview"],
    ["GET", "/api/departments/finance/members"],
    ["GET", "/api/departments/finance/instructions"],
    ["POST", "/api/departments/finance/documents", { title: "x" }],
    ["POST", "/api/departments/finance/instructions", { title: "x", content: "y" }],
    ["POST", "/api/departments/finance/projects", { name: "x" }],
  ];

  test("board can open any department", async () => {
    expectOk(await get("/api/departments/finance/overview", { token: tokens.board }));
  });

  test("a director cannot open another department", { todo: KNOWN.DEPT_ACCESS }, async () => {
    for (const [method, path, body] of denied) {
      const res = method === "GET" ? await get(path, D) : await post(path, body, D);
      expectDenied(res, `${method} ${path}`);
    }
  });

  test("a General Member cannot manage even their own department", { todo: KNOWN.DEPT_ACCESS }, async () => {
    expectDenied(await post("/api/departments/marketing/documents", { title: "x" }, { token: tokens.member }));
    expectDenied(await get("/api/departments/marketing/overview", { token: tokens.member }));
  });
});
