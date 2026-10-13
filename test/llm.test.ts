// Auth through the fleet credential pool, with a stand-in session-cred script and a
// stand-in proxy: the SDK child gets the proxy address + the minted credential, the
// credential is revoked after the turn and never leaks into a log or a response.
// Plus the access log: one JSON line per request, no cookie or invite token in it.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
delete process.env.HYDRA_DB_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const tmp = mkdtempSync(join(tmpdir(), "crewbrain-llm-"));
const LOGS = join(tmp, "logs");
process.env.ACCESS_LOG_DIR = LOGS;
after(() => rmSync(tmp, { recursive: true, force: true }));

// The stand-in proxy: records the Authorization header it was given.
const seen: string[] = [];
const proxy = createServer((req, res) => { seen.push(String(req.headers.authorization)); res.end("{}"); });
await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", () => r()));
const PORT = (proxy.address() as any).port;
after(() => proxy.close());

const CRED = "fcp1.TESTSESSIONCREDENTIAL-abcdef0123456789";
const calls = join(tmp, "calls");
function fakeCredScript(mode: "ok" | "fail" | "off") {
  const f = join(tmp, `cred-${mode}.sh`);
  writeFileSync(f, `#!/bin/bash
echo "$*" >> "${calls}"
case "$1" in
  on) [ "${mode}" = off ] && exit 3; exit 0 ;;
  mint) [ "${mode}" = fail ] && exit 1; printf 'direct\\t${PORT}\\t${CRED}\\n' ;;
  revoke) exit 0 ;;
esac`);
  return f;
}

const llm = await import("../src/llm.ts");
const store = await import("../src/store.ts");
const { buildApp } = await import("../src/server.ts");
const { DEMO_TOKENS } = await import("../src/seed.ts");

let lastOptions: any;
function stubQuery(result: { is_error?: boolean; subtype?: string; result: string }) {
  llm.setQuery(async function* ({ options }) {
    lastOptions = options;
    await fetch(`${options.env.ANTHROPIC_BASE_URL}/v1/messages`, { method: "POST", headers: { authorization: `Bearer ${options.env.CLAUDE_CODE_OAUTH_TOKEN}` } });
    yield { type: "result", subtype: "success", is_error: false, ...result };
  });
}
const warns: string[] = [];
const origWarn = console.warn;
console.warn = (...a: unknown[]) => { warns.push(a.join(" ")); };
after(() => { console.warn = origWarn; llm.setQuery(null); });

beforeEach(() => { seen.length = 0; warns.length = 0; rmSync(calls, { force: true }); lastOptions = undefined; store.reset(); });

test("a turn mints a session credential, runs through the proxy, and revokes it", async () => {
  process.env.FLEET_SESSION_CRED = fakeCredScript("ok");
  stubQuery({ result: "Hello from Claude" });
  const out = await llm.claude("sys", "hi");
  assert.equal(out, "Hello from Claude");
  assert.equal(lastOptions.env.ANTHROPIC_BASE_URL, `http://127.0.0.1:${PORT}`);
  assert.equal(lastOptions.env.CLAUDE_CODE_OAUTH_TOKEN, CRED);
  assert.equal(lastOptions.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
  assert.equal(lastOptions.env.ANTHROPIC_API_KEY, undefined);
  assert.deepEqual(seen, [`Bearer ${CRED}`], "the proxy saw the session credential");
  const log = readFileSync(calls, "utf8");
  assert.match(log, /^on\nmint --provider claude --sid crewbrain-\d+-\d+\nrevoke --sid crewbrain-\d+-\d+\n$/);
  assert.ok(llm.llmStatus.ok);
});

test("models are limited to Sonnet 5.5 and Haiku 5.5", async () => {
  process.env.FLEET_SESSION_CRED = fakeCredScript("ok");
  stubQuery({ result: "ok" });
  await llm.claude("sys", "hi", { model: "claude-opus-5-5" });
  assert.equal(lastOptions.model, "claude-sonnet-5-5");
  await llm.claude("sys", "hi", { model: "claude-haiku-5-5" });
  assert.equal(lastOptions.model, "claude-haiku-5-5");
});

test("an error result is never a reply, and the credential never reaches the log", async () => {
  process.env.FLEET_SESSION_CRED = fakeCredScript("ok");
  stubQuery({ is_error: true, subtype: "success", result: `Not logged in · Please run /login (token ${CRED})` });
  assert.equal(await llm.claude("sys", "hi"), null);
  assert.ok(!llm.llmStatus.ok);
  assert.ok(warns.some((w) => w.includes("Not logged in")));
  assert.ok(warns.every((w) => !w.includes(CRED) && !w.includes("TESTSESSIONCREDENTIAL")), warns.join("\n"));
});

test("no credential: chat answers from the notes with a plain-words notice, no internal error, no token", async () => {
  process.env.FLEET_SESSION_CRED = fakeCredScript("fail");
  stubQuery({ result: "should not be called" });
  const sign = async (n: string) => /cb_session=([^;]+)/.exec((await app.request(`http://x/i/${DEMO_TOKENS[n]}`)).headers.get("set-cookie") ?? "")![1];
  const app = buildApp();
  const sam = await sign("sam");
  const post = (cookie: string, path: string, body: unknown) => app.request(`http://x/${path}`, { method: "POST", headers: { cookie: `cb_session=${cookie}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  await post(sam, "api/creator/message", { text: "Make a helper for the Patels about their install" });
  const p = await (await post(sam, "api/creator/message", { text: "30 days after handover" })).json() as any;
  await post(sam, `api/agents/${p.proposal.agentId}/approve`, { rev: p.proposal.rev });
  const anita = await sign("anita");
  const r = await post(anita, `api/agents/${p.proposal.agentId}/chat`, { text: "When is the inspection?" });
  const text = await r.text();
  assert.equal(r.status, 200, text);
  const j = JSON.parse(text);
  assert.match(j.notice, /unavailable/);
  assert.ok(!/fcp1\.|Not logged in|rc \d/.test(text), text);
  assert.equal(lastOptions, undefined, "the SDK is not started without a credential");
});

test("access log: one JSON line per request with the visitor's fields, no cookie or invite token", async () => {
  process.env.FLEET_SESSION_CRED = fakeCredScript("off");
  const app = buildApp();
  const inv = DEMO_TOKENS.anita;
  const r = await app.request(`http://x/crewbrain/i/${inv}?a=1`, { headers: { "x-forwarded-for": "203.0.113.9, 100.64.0.1", "user-agent": "TestUA/1.0", referer: `https://example.com/page?q=1` } });
  const cookie = /cb_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")![1];
  await app.request("http://x/api/me", { headers: { cookie: `cb_session=${cookie}`, "x-forwarded-for": "203.0.113.9" } });
  await app.request("http://x/api/health");
  const f = join(LOGS, "access.log");
  assert.ok(existsSync(f));
  const raw = readFileSync(f, "utf8");
  assert.ok(!raw.includes(inv) && !raw.includes(cookie), "no invite token or session cookie in the log");
  const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
  const [signin, me, health] = lines.slice(-3);
  assert.equal(signin.method, "GET");
  assert.equal(signin.path, "/crewbrain/i/[token]");
  assert.equal(signin.status, 302);
  assert.equal(signin.ip, "203.0.113.9");
  assert.equal(signin.ua, "TestUA/1.0");
  assert.equal(signin.referer, "https://example.com/page");
  assert.equal(signin.member, "anita");
  assert.ok(signin.tenant);
  assert.equal(typeof signin.ms, "number");
  assert.ok(!Number.isNaN(Date.parse(signin.ts)));
  assert.equal(me.path, "/api/me");
  assert.equal(me.status, 200);
  assert.equal(me.member, "anita");
  assert.equal(health.member, undefined);
});
