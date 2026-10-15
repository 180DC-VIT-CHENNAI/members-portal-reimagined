// Club file library: directors upload, members browse/filter/download.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, api, tokens, expectOk, expectStatus, upload } from "../lib/api.mjs";

const D = { token: tokens.director };
const M = { token: tokens.member };

describe("club files", () => {
  test("upload, list with filters, download, delete", async () => {
    const tag = Date.now().toString(36);
    const { id } = expectOk(await upload("/api/club-files/upload", {
      file: { data: Buffer.from("minutes " + tag), name: `minutes-${tag}.txt`, type: "text/plain" },
      category: "events", eventName: "Orientation " + tag, description: "Day one notes",
    }, D));
    expectOk(await upload("/api/club-files/upload", {
      file: { data: Buffer.from("deck"), name: `deck-${tag}.pdf`, type: "application/pdf" },
      category: "projects", projectName: "NGO " + tag,
    }, D));

    const all = expectOk(await get("/api/club-files", M)).files;
    const f = all.find((x) => x.id === id);
    assert.equal(f.category, "events");
    assert.equal(f.uploaded_by_name, "Marketing Director");
    assert.equal(expectOk(await get(`/api/club-files?category=events&eventName=${encodeURIComponent("orientation " + tag)}`, M)).files.length, 1);
    assert.equal(expectOk(await get(`/api/club-files?search=day%20one`, M)).files.filter((x) => x.id === id).length, 1);
    assert.ok(expectOk(await get("/api/club-files/events", M)).events.includes("Orientation " + tag));
    assert.ok(expectOk(await get("/api/club-files/projects", M)).projects.includes("NGO " + tag));

    const dl = await get(`/api/club-files/${id}/download`, M);
    assert.equal(dl.status, 200);
    assert.equal(dl.text, "minutes " + tag);
    assert.match(dl.headers.get("content-disposition"), /attachment; filename="minutes-/);

    expectStatus(await api("DELETE", `/api/club-files/${id}`, M), 403);
    expectOk(await api("DELETE", `/api/club-files/${id}`, D));
    expectStatus(await get(`/api/club-files/${id}/download`, M), 404);
  });

  test("members cannot upload; no file is a 400", async () => {
    expectStatus(await upload("/api/club-files/upload", { file: { data: Buffer.from("x"), name: "x.txt", type: "text/plain" } }, M), 403);
    expectStatus(await upload("/api/club-files/upload", { category: "events" }, D), 400);
  });

  test("advisory members can browse; logged-out visitors cannot", async () => {
    expectOk(await get("/api/club-files", { token: tokens.advisory }));
    expectStatus(await get("/api/club-files"), 401);
  });
});
