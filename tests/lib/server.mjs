// Starts the admin-api worker locally (wrangler dev) on a fresh, throwaway
// D1/R2 state directory, so every run begins from an empty database.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

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

export async function startServer({ mode, recipient, log = false, production = false }) {
  const port = await freePort();
  const stateDir = mkdtempSync(join(tmpdir(), "180dc-test-"));
  const vars = {
    ENVIRONMENT: production ? "production" : "development",
    EMAIL_TEST_MODE: mode,
    // Keep runs hermetic: no fetches to the live newsletter site.
    NEWSLETTER_SITE_URL: "",
  };
  if (recipient) vars.EMAIL_TEST_RECIPIENT = recipient;
  const args = [
    "wrangler", "dev", "--local", "--test-scheduled",
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
    ["wrangler", "d1", "execute", database, "--local", "--persist-to", stateDir, "--json", "--command", sql],
    { cwd: ADMIN_API_DIR, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout.slice(stdout.indexOf("["))).flatMap((r) => r.results || []);
}
