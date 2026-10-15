// Cross-cutting protections: security headers, CORS, CSRF, and that every
// member-only route refuses logged-out callers.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { api, get, tokens } from "../lib/api.mjs";

describe("headers", () => {
  test("every response carries the security headers", async () => {
    const res = await get("/api/departments");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(res.headers.get("strict-transport-security"), /max-age=31536000/);
  });

  test("login tokens are never cached", async () => {
    const res = await api("POST", "/api/auth/rotate-token", { token: tokens.member2, body: {} });
    assert.match(res.headers.get("cache-control") || "", /no-store/);
  });
});

describe("CORS", () => {
  // wrangler dev rewrites the production host (180dcvitc.org, from the route in
  // wrangler.toml) to the local one, so use another allowed origin here.
  test("the site's own origins are allowed", async () => {
    const origin = "https://180dc-admin.pages.dev";
    const res = await api("OPTIONS", "/api/departments", { origin, headers: { "Access-Control-Request-Method": "GET" } });
    assert.equal(res.headers.get("access-control-allow-origin"), origin);
    assert.match(res.headers.get("access-control-allow-headers"), /Authorization/);
  });

  test("other origins are not", async () => {
    const res = await api("OPTIONS", "/api/departments", { origin: "https://evil.example", headers: { "Access-Control-Request-Method": "GET" } });
    assert.notEqual(res.headers.get("access-control-allow-origin"), "https://evil.example");
  });
});

describe("CSRF", () => {
  test("form posts from another site are refused", async () => {
    const res = await api("POST", "/api/signup-requests", {
      origin: "https://evil.example",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      rawBody: "name=x&email=x@y.co",
    });
    assert.equal(res.status, 403);
  });

  test("form posts with no Origin are refused too (except one-click unsubscribe)", async () => {
    const res = await api("POST", "/api/signup-requests", {
      origin: false,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      rawBody: "name=x",
    });
    assert.equal(res.status, 403);
  });
});

describe("authentication", () => {
  // One representative route per feature area; all need a member token.
  const memberOnly = [
    ["GET", "/api/dashboard"], ["GET", "/api/users"], ["GET", "/api/roles"],
    ["GET", "/api/members-directory"], ["GET", "/api/members/export"],
    ["GET", "/api/announcements"], ["GET", "/api/projects"], ["GET", "/api/team-instances"],
    ["GET", "/api/club-meets"], ["GET", "/api/inter-dept-meets"], ["GET", "/api/department-meets"],
    ["GET", "/api/case-studies"], ["GET", "/api/club-files"], ["GET", "/api/consulting-requests"],
    ["GET", "/api/signup-requests"], ["GET", "/api/role-transfers"], ["GET", "/api/my-role-transfers"],
    ["GET", "/api/admin/email-queue"], ["GET", "/api/newsletter/admin/subscribers"],
    ["GET", "/api/departments/marketing/overview"],
    ["POST", "/api/send-email"], ["POST", "/api/projects"], ["POST", "/api/club-meets"],
    ["POST", "/api/admin/maintenance"], ["POST", "/api/members"], ["DELETE", "/api/members/x"],
  ];
  test("member-only routes reject logged-out callers with 401", async () => {
    for (const [method, path] of memberOnly) {
      const res = await api(method, path, method === "GET" ? {} : { body: {} });
      assert.equal(res.status, 401, `${method} ${path} -> ${res.status}`);
    }
  });

  test("a revoked or made-up token is the same as none", async () => {
    const res = await get("/api/dashboard", { token: "0".repeat(32) });
    assert.equal(res.status, 401);
  });
});
