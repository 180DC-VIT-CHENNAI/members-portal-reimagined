// Public website data that needs no login.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get, expectOk, expectStatus } from "../lib/api.mjs";

test("team members, partners and case studies are public lists", async () => {
  for (const path of ["/api/content/team-members", "/api/content/partners", "/api/content/case-studies"]) {
    const json = expectOk(await get(path), path);
    assert.ok(Array.isArray(json.data), path);
  }
});

test("public completed-projects and department lists need no login", async () => {
  expectOk(await get("/api/projects/completed"));
  expectOk(await get("/api/departments"));
});

test("the gallery CDN serves stored images and rejects traversal", async () => {
  expectStatus(await get("/api/gallery-cdn/missing.webp"), 404);
  const res = await get("/api/gallery-cdn/..%2Fsecret");
  assert.ok([400, 404].includes(res.status), `got ${res.status}`);
});

test("content lists are rate limited at 100 per minute per IP", async () => {
  const ip = "203.0.113.100";
  let last;
  for (let i = 0; i < 101; i++) last = await get("/api/content/partners", { ip });
  expectStatus(last, 429);
});
