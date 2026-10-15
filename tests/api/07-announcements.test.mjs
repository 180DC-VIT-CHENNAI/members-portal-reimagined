// Board announcements shown on every member's dashboard.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, post, del, tokens, expectOk, expectStatus } from "../lib/api.mjs";

const B = { token: tokens.board };

describe("announcements", () => {
  test("board posts one; every member sees it, HTML stripped", async () => {
    const title = "Recruitment drive " + Date.now();
    expectOk(await post("/api/announcements", { title: title + "<script>x</script>", content: "Apply <b>now</b>" }, B));
    const { data } = expectOk(await get("/api/announcements", { token: tokens.member }));
    const a = data.find((x) => x.title.startsWith(title));
    assert.ok(a);
    assert.ok(!/[<>]/.test(a.title + a.content), "tags removed");
    const dash = expectOk(await get("/api/dashboard", { token: tokens.advisory }));
    assert.ok(dash.announcements.some((x) => x.id === a.id));
  });

  test("board deletes an announcement", async () => {
    const title = "Temp " + Date.now();
    expectOk(await post("/api/announcements", { title, content: "x" }, B));
    const a = expectOk(await get("/api/announcements", B)).data.find((x) => x.title === title);
    expectOk(await del(`/api/announcements/${a.id}`, B));
    assert.ok(!expectOk(await get("/api/announcements", B)).data.some((x) => x.id === a.id));
  });

  test("title and content are required", async () => {
    expectStatus(await post("/api/announcements", { title: "x" }, B), 400);
  });

  test("only board can post or delete", async () => {
    expectStatus(await post("/api/announcements", { title: "x", content: "y" }, { token: tokens.director }), 403);
    expectStatus(await del("/api/announcements/x", { token: tokens.member }), 403);
  });

  test("board is limited to 5 announcements per hour per IP", async () => {
    const ip = "203.0.113.80";
    let last;
    for (let i = 0; i < 6; i++) last = await post("/api/announcements", { title: "rl" + i, content: "x" }, { ...B, ip });
    expectStatus(last, 429);
  });
});
