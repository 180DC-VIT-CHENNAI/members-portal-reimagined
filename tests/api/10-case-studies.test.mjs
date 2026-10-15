// Case studies: writing, importing from PDF/DOCX, images and source files,
// editing, deleting, and the public list on the website.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, post, put, api, tokens, expectOk, expectStatus, upload, fixture, PNG_1PX } from "../lib/api.mjs";
import { KNOWN } from "../lib/known-issues.mjs";

const B = { token: tokens.board };
const M = { token: tokens.member };
const content = "<p>We helped a <b>school</b> plan its budget.</p><script>alert(1)</script><img src=x onerror=alert(1)><a href=\"javascript:alert(1)\">x</a>";

async function publish(title = "Case " + Date.now()) {
  const json = expectOk(await post("/api/case-studies", { title, tag: "Education", description: "Short", content }, M));
  return { id: json.id, title };
}

describe("publishing", () => {
  test("a member publishes one; it's sanitized and shows publicly", async () => {
    const { id, title } = await publish();
    const { data } = expectOk(await get("/api/content/case-studies"));
    const cs = data.find((x) => x.id === id);
    assert.equal(cs.title, title);
    assert.equal(cs.author_name, "Marketing Member");
    assert.ok(cs.content.includes("<b>school</b>"), "safe tags kept");
    assert.ok(!/<script|onerror|javascript:/i.test(cs.content), "dangerous markup removed");
  });

  test("content must have real text", async () => {
    expectStatus(await post("/api/case-studies", { title: "x", content: "short" }, M), 400);
    expectStatus(await post("/api/case-studies", { title: "x", content: "<script>only script tags</script>" }, M), 400);
    expectStatus(await post("/api/case-studies", { title: "x", content: "x".repeat(100001) }, M), 400);
  });

  test("members list them; logged-out visitors cannot use the member route", async () => {
    const { data } = expectOk(await get("/api/case-studies", M));
    assert.ok(data.length > 0);
    expectStatus(await get("/api/case-studies"), 401);
  });

  test("editing updates the case study", async () => {
    const { id } = await publish();
    expectOk(await put(`/api/case-studies/${id}`, { title: "Edited title", tag: "Health", content: "<p>Updated content here</p>" }, M));
    const cs = expectOk(await get("/api/content/case-studies")).data.find((x) => x.id === id);
    assert.equal(cs.title, "Edited title");
    assert.equal(cs.tag, "Health");
    expectStatus(await put("/api/case-studies/nope", { content: "<p>Updated content</p>" }, M), 404);
  });

  test("only directors and board can delete", async () => {
    const { id } = await publish();
    expectStatus(await api("DELETE", `/api/case-studies/${id}`, M), 403);
    expectOk(await api("DELETE", `/api/case-studies/${id}`, { token: tokens.director }));
    assert.ok(!expectOk(await get("/api/content/case-studies")).data.some((x) => x.id === id));
    expectStatus(await api("DELETE", `/api/case-studies/${id}`, B), 404);
  });
});

describe("importing documents", () => {
  test("a PDF becomes HTML with a suggested title", async () => {
    const json = expectOk(await upload("/api/case-studies/upload-document", { document: { data: fixture("sample.pdf"), name: "case.pdf", type: "application/pdf" } }, M));
    assert.ok(json.content.includes("rural healthcare"));
    assert.equal(json.suggestedTitle, "Case study on rural healthcare");
    assert.ok(json.charCount > 10);
  });

  test("a DOCX becomes HTML", { todo: KNOWN.DOCX_IMPORT }, async () => {
    const json = expectOk(await upload("/api/case-studies/upload-document", { document: { data: fixture("sample.docx"), name: "case.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }, M));
    assert.ok(json.content.includes("donor base"));
    assert.ok(json.suggestedTitle.length > 0);
  });

  test("other file types are refused", async () => {
    expectStatus(await upload("/api/case-studies/upload-document", { document: { data: Buffer.from("hi"), name: "x.txt", type: "text/plain" } }, M), 400);
    expectStatus(await upload("/api/case-studies/upload-document", {}, M), 400);
  });
});

describe("images and source files", () => {
  test("upload an image, fetch it publicly, delete it", async () => {
    const { key, url } = expectOk(await upload("/api/case-studies/upload-image", { image: { data: PNG_1PX, name: "dot.png", type: "image/png" } }, M));
    assert.match(key, /^images\/.+\.png$/);
    const img = await get(url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.equal(img.headers.get("x-content-type-options"), "nosniff");
    expectOk(await api("DELETE", "/api/case-studies/delete-image", { ...M, body: { key } }));
    expectStatus(await get(url), 404);
  });

  test("image uploads must be real image types", async () => {
    expectStatus(await upload("/api/case-studies/upload-image", { image: { data: Buffer.from("<svg/>"), name: "x.svg", type: "image/svg+xml" } }, M), 400);
    expectStatus(await upload("/api/case-studies/upload-image", { image: { data: Buffer.from("x"), name: "x.html", type: "text/html" } }, M), 400);
  });

  test("delete only accepts image/source keys", async () => {
    expectStatus(await api("DELETE", "/api/case-studies/delete-image", { ...M, body: { key: "static/completedProjects.json" } }), 400);
    expectStatus(await api("DELETE", "/api/case-studies/delete-image", { ...M, body: {} }), 400);
  });

  test("source files: PDF/DOCX only", async () => {
    const { key } = expectOk(await upload("/api/case-studies/upload-source", { file: { data: fixture("sample.pdf"), name: "src.pdf", type: "application/pdf" } }, M));
    assert.match(key, /^source\/.+\.pdf$/);
    expectStatus(await upload("/api/case-studies/upload-source", { file: { data: Buffer.from("x"), name: "a.exe", type: "application/octet-stream" } }, M), 400);
  });

  test("path traversal and unknown keys are rejected", async () => {
    expectStatus(await get("/api/case-studies/images/..%2F..%2Fsecret"), 400);
    expectStatus(await get("/api/case-studies/images/images/missing.png"), 404);
  });

  test("logged-out visitors cannot upload", async () => {
    expectStatus(await upload("/api/case-studies/upload-image", { image: { data: PNG_1PX, name: "a.png", type: "image/png" } }), 401);
  });
});
