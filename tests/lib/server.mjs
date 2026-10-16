// Starts the admin-api worker locally (wrangler dev) on a fresh, throwaway
// D1/R2 state directory, so every run begins from an empty database.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import http from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
export const ADMIN_API_DIR = join(here, "..", "..", "apps", "admin-api");

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export const GOOGLE_TEST_CLIENT_ID = "test-client.apps.googleusercontent.com";

// Stand-in for Google's token endpoint. The authorization code a test sends is
// base64url JSON of the ID-token claims it wants back; the endpoint checks the
// client secret and PKCE verifier are present like Google would.
async function startFakeGoogle() {
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const form = new URLSearchParams(raw);
      const reply = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.url !== "/token" || form.get("client_secret") !== "test-secret" || !form.get("code_verifier")) {
        return reply(400, { error: "invalid_request" });
      }
      let claims;
      try {
        claims = JSON.parse(Buffer.from(form.get("code") || "", "base64url").toString());
      } catch {
        return reply(400, { error: "invalid_grant" });
      }
      const payload = { iss: "https://accounts.google.com", aud: GOOGLE_TEST_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, email_verified: true, ...claims };
      reply(200, { id_token: `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s` });
    });
  });
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  srv.unref();
  return `http://127.0.0.1:${srv.address().port}/token`;
}

export async function startServer({ mode, recipient, log = false, production = false }) {
  const port = await freePort();
  const stateDir = mkdtempSync(join(tmpdir(), "180dc-test-"));
  const vars = {
    ENVIRONMENT: production ? "production" : "development",
    EMAIL_TEST_MODE: mode,
    // Keep runs hermetic: no fetches to the live newsletter site.
    NEWSLETTER_SITE_URL: "",
    GOOGLE_CLIENT_ID: GOOGLE_TEST_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_TOKEN_URL: await startFakeGoogle(),
  };
  if (recipient) vars.EMAIL_TEST_RECIPIENT = recipient;
  const args = [
    "wrangler", "dev", "-c", "wrangler.toml", "--local", "--test-scheduled",
    "--port", String(port), "--persist-to", stateDir,
  ];
  for (const [k, v] of Object.entries(vars)) args.push("--var", `${k}:${v}`);

  const child = spawn("pnpm", args, {
    cwd: ADMIN_API_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  let output = "";
  const onData = (d) => {
    output += d;
    if (log) process.stderr.write(d);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("wrangler dev exited early:\n" + output.slice(-4000));
    }
    try {
      const res = await fetch(baseUrl + "/api/newsletter/subscribers/count");
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (Date.now() >= deadline) {
    stopProcess(child);
    throw new Error("wrangler dev did not become ready:\n" + output.slice(-4000));
  }

  return {
    baseUrl,
    stateDir,
    output: () => output,
    async stop() {
      stopProcess(child);
      await new Promise((r) => setTimeout(r, 500));
      rmSync(stateDir, { recursive: true, force: true });
    },
  };
}

function stopProcess(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

// Runs SQL against the local D1 of a running test server. Slow (~3 s), so the
// suite only uses it for setup the API cannot do (reading the seeded dev
// token). Async on purpose: blocking the event loop that long lets the worker
// close idle keep-alive sockets under the HTTP client.
export async function d1(stateDir, database, sql) {
  const { stdout } = await promisify(execFile)(
    "pnpm",
    ["wrangler", "d1", "execute", database, "-c", "wrangler.toml", "--local", "--persist-to", stateDir, "--json", "--command", sql],
    { cwd: ADMIN_API_DIR, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout.slice(stdout.indexOf("["))).flatMap((r) => r.results || []);
}
