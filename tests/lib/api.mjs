// Small HTTP client for the admin-api under test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const state = JSON.parse(
  readFileSync(process.env.TEST_STATE_FILE, "utf8"),
);
export const BASE = state.baseUrl;
export const ORIGIN = "http://localhost:5173";

// The worker rate-limits per CF-Connecting-IP. Every call gets a fresh fake IP
// unless a test passes `ip` on purpose (rate-limit tests reuse one).
let ipCounter = Math.floor(Math.random() * 200);
export function freshIp() {
  ipCounter++;
  return `10.${process.pid % 250}.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}`;
}

export async function api(method, path, opts = {}) {
  const headers = {
    "CF-Connecting-IP": opts.ip || freshIp(),
    ...(opts.headers || {}),
  };
  if (opts.origin !== false) headers.Origin = opts.origin || ORIGIN;
  if (opts.token) headers.Authorization = "Bearer " + opts.token;
  let body;
  if (opts.form) {
    body = opts.form;
  } else if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

export const get = (p, o) => api("GET", p, o);
export const post = (p, body, o = {}) => api("POST", p, { ...o, body });
export const put = (p, body, o = {}) => api("PUT", p, { ...o, body });
export const del = (p, o) => api("DELETE", p, o);

export function expectOk(res, msg) {
  assert.ok(
    res.status >= 200 && res.status < 300,
    `${msg || "expected 2xx"}: got ${res.status} ${res.text.slice(0, 300)}`,
  );
  return res.json;
}

export function expectStatus(res, status, msg) {
  assert.equal(
    res.status,
    status,
    `${msg || "status"}: expected ${status}, got ${res.status} ${res.text.slice(0, 300)}`,
  );
  return res.json;
}

// A request the caller is not allowed to make. Project routes answer 404
// "not found or inaccessible" so they don't reveal projects the caller can't
// see; that counts as a denial. Several routes report
// "Forbidden" with a 500 (they throw from requireBoard into a 500 handler);
// that is a known issue (tests/README.md), so 500 counts only when the
// message says forbidden.
export function expectDenied(res, msg) {
  const ok =
    res.status === 401 ||
    res.status === 403 ||
    (res.status === 404 && /inaccessible/i.test(res.text)) ||
    (res.status === 500 && /forbidden|unauthori[sz]ed|requires/i.test(res.text));
  assert.ok(ok, `${msg || "expected denial"}: got ${res.status} ${res.text.slice(0, 300)}`);
}

// ---------- dev outbox (EMAIL_TEST_MODE) ----------
export async function outbox({ since = 0, to } = {}) {
  const q = new URLSearchParams({ since: String(since) });
  if (to) q.set("to", to);
  const res = await get("/api/dev/outbox?" + q);
  return expectOk(res, "dev outbox");
}

export async function outboxMark() {
  return (await outbox()).lastId;
}

// Waits until at least `count` messages to `to` were recorded after `since`.
export async function waitForMail(to, since, count = 1, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { messages } = await outbox({ since, to });
    if (messages.length >= count) return messages;
    if (Date.now() > deadline)
      assert.fail(`expected ${count} email(s) to ${to}, got ${messages.length}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// Runs the every-minute cron (queue drain) once and waits for it.
export async function runCron() {
  const res = await fetch(BASE + "/__scheduled?cron=*+*+*+*+*");
  assert.equal(res.status, 200, "cron trigger");
  // The scheduled handler runs in waitUntil; give it time to finish.
  await new Promise((r) => setTimeout(r, 1500));
}

// Runs the cron until the campaign is done. A run that is still sending keeps
// the campaign "processing", so only pending campaigns get a new run.
export async function drainUntilDone(campaignId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await get(`/api/admin/email-queue/${campaignId}/deliveries`, { token: state.tokens.board });
    const c = res.json?.campaign;
    if (c && (c.status === "done" || c.status === "failed")) return res.json;
    if (Date.now() > deadline) assert.fail(`campaign ${campaignId} still ${c?.status} after ${timeoutMs} ms`);
    if (!c || c.status === "pending") await runCron();
    else await new Promise((r) => setTimeout(r, 500));
  }
}

// Newest queued campaign whose subject matches (bulk sends return only a count
// for meets, so tests look the campaign up here).
export async function findCampaign(subjectPart) {
  const { recent } = expectOk(await get("/api/admin/email-queue", { token: state.tokens.board }));
  const found = recent.find((r) => r.subject.includes(subjectPart));
  assert.ok(found, `campaign with subject containing "${subjectPart}"`);
  return found;
}

export function uniqueEmail(prefix = "user") {
  return `${prefix}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@test.180dcvitc.org`;
}

export const tokens = state.tokens;
export const users = state.users;

// Creates a throwaway General Member (so tests that revoke, rotate or delete
// never touch the shared accounts) and returns { email, token, id }.
export async function newMember(prefix = "temp", departmentId = "business_strategy") {
  const email = uniqueEmail(prefix);
  const res = await post("/api/members", { email, name: prefix + " user", departmentId }, { token: tokens.board });
  const json = expectOk(res, "create member");
  await post("/api/auth/session", { token: json.token });
  const list = expectOk(await get("/api/users", { token: tokens.board }));
  const user = list.data.find((u) => u.email === email);
  return { email, token: json.token, id: user.id };
}

// Multipart upload helper: fields is { name: string | { file, name, type } }.
export async function upload(path, fields, opts = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v && typeof v === "object" && "data" in v) form.append(k, new Blob([v.data], { type: v.type }), v.name);
    else form.append(k, v);
  }
  return api("POST", path, { ...opts, form });
}

export function fixture(name) {
  return readFileSync(new URL("../fixtures/" + name, import.meta.url));
}

export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Subscribes an address through the public form and returns its unsubscribe
// token (taken from the welcome email's List-Unsubscribe header).
export async function subscribe(email = uniqueEmail("reader")) {
  const mark = await outboxMark();
  expectOk(await post("/api/newsletter/subscribe", { email, name: "Reader" }));
  const [welcome] = await waitForMail(email, mark);
  const token = /unsubscribe\/([a-f0-9]{48})>/.exec(welcome.headers["List-Unsubscribe"] || "")?.[1];
  assert.ok(token, "welcome email carries a personal unsubscribe token");
  return { email, token, welcome };
}

// Logs into the newsletter editor or letter studio through the OTP flow,
// reading the code from the captured email.
export async function otpLogin(kind, email) {
  const base = kind === "letter" ? "/api/letter-studio" : "/api/newsletter-editor";
  // OTPs are looked up by created_at, which has 1 s precision; a second code
  // in the same second can lose to the older one.
  await new Promise((r) => setTimeout(r, 1100));
  const mark = await outboxMark();
  expectOk(await post(base + "/otp/send", { email }), "otp send");
  const [mail] = await waitForMail(email, mark);
  const code = /letter-spacing:6px[^>]*>(\d{6})</.exec(mail.html)?.[1];
  assert.ok(code, "OTP code in email");
  const json = expectOk(await post(base + "/otp/verify", { email, code }), "otp verify");
  return { token: json.token, code };
}
