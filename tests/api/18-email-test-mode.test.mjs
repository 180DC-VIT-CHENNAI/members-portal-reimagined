// Safety net for the dev-only email test mode itself: it can never be active
// in production, so tests can't accidentally email real people from prod.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../lib/server.mjs";

test("EMAIL_TEST_MODE is ignored when ENVIRONMENT=production", { timeout: 180000 }, async () => {
  const server = await startServer({ mode: "capture", production: true });
  try {
    const res = await fetch(server.baseUrl + "/api/dev/outbox");
    assert.equal(res.status, 404, "outbox not exposed in production");
  } finally {
    await server.stop();
  }
});
