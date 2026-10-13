// One sandbox per demo visitor: two visitors see and touch nothing of each other's,
// the fixed repo tokens don't sign anyone in, reset only resets the caller's sandbox,
// idle sandboxes expire and the total is capped. Run: NODE_ENV=test npx tsx --test test/sandbox.test.ts
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "crewbrain-sb-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
process.env.DEMO_LEGACY_TOKENS = "0"; // behave like the public deployment
process.env.SANDBOX_DIR = join(tmp, "sandboxes");
process.env.ACCESS_LOG_DIR = join(tmp, "logs");
process.env.SANDBOX_MAX = "5";
for (const k of ["HYDRA_DB_API_KEY", "OPENAI_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]) delete process.env[k];

const store = await import("../src/store.ts");
const { buildApp } = await import("../src/server.ts");
const { DEMO_TOKENS } = await import("../src/seed.ts");
const app = buildApp();

type Jar = Record<string, string>;
async function req(jar: Jar, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") };
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await app.request(`http://x/crewbrain/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const sc of r.headers.getSetCookie?.() ?? []) { const m = /^([^=]+)=([^;]*)/.exec(sc); if (m) jar[m[1]] = m[2]; }
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
}
async function visitor() {
  const jar: Jar = {};
  const r = await req(jar, "GET", "api/demo/identities");
  assert.equal(r.status, 200);
  assert.ok(jar.cb_sandbox, "a first visit gets a sandbox");
  const links: Record<string, string> = Object.fromEntries(r.json.identities.map((i: any) => [i.name.split(" ")[0].toLowerCase(), i.url.split("/crewbrain/")[1]]));
  return { jar, links, sb: jar.cb_sandbox };
}
const as = async (v: { jar: Jar; links: Record<string, string> }, who: string) => { const r = await req(v.jar, "GET", v.links[who]); assert.equal(r.status, 302, r.text); };
async function makeJuno(v: any) {
  await as(v, "sam");
  await req(v.jar, "POST", "api/creator/message", { text: "Make a helper for the Patels about their install" });
  const p = (await req(v.jar, "POST", "api/creator/message", { text: "30 days after handover" })).json.proposal;
  const ap = await req(v.jar, "POST", `api/agents/${p.agentId}/approve`, { rev: p.rev });
  assert.equal(ap.status, 200, ap.text);
  return p.agentId as string;
}

test("each visitor gets their own sandbox with its own random invite tokens; the repo's fixed tokens don't work", async () => {
  const a = await visitor(), b = await visitor();
  assert.notEqual(a.sb, b.sb);
  assert.equal(Object.keys(a.links).length, 7);
  for (const t of Object.values(DEMO_TOKENS)) assert.ok(!JSON.stringify([a.links, b.links]).includes(t));
  assert.notDeepEqual(a.links, b.links);
  const again = await req(a.jar, "GET", "api/demo/identities");
  assert.equal(a.jar.cb_sandbox, a.sb, "a returning visitor keeps their sandbox");
  assert.deepEqual(again.json.identities.map((i: any) => i.url.split("/crewbrain/")[1]), Object.values(a.links));
  assert.equal((await req({}, "GET", `i/${DEMO_TOKENS.sam}`)).status, 404);
  assert.ok(existsSync(join(process.env.SANDBOX_DIR!, `${a.sb}.json`)));
});

test("two sandboxes see and touch nothing of each other's", async () => {
  const a = await visitor(), b = await visitor();
  const juno = await makeJuno(a);
  await as(b, "sam");
  assert.equal((await req(b.jar, "GET", "api/agents")).json.agents.length, 0, "B's owner sees no helpers of A");
  assert.equal((await req(b.jar, "GET", "api/creator/log")).json.messages.length, 0, "B sees none of A's creator chat");
  assert.ok([403, 404].includes((await req(b.jar, "POST", `api/agents/${juno}/close`)).status), "B can't close A's helper");
  assert.ok([403, 404].includes((await req(b.jar, "GET", `api/agents/${juno}/links`)).status));
  // A's homeowner asks; only A's owner inbox has it.
  await as(a, "anita");
  const chat = await req(a.jar, "POST", `api/agents/${juno}/chat`, { text: "Do you also service hot tubs?" });
  assert.equal(chat.status, 200, chat.text);
  await as(b, "anita");
  assert.ok([403, 404].includes((await req(b.jar, "POST", `api/agents/${juno}/chat`, { text: "hi" })).status), "B's Anita can't use A's Juno");
  await as(a, "sam");
  const inboxA = (await req(a.jar, "GET", "api/inbox")).json;
  await as(b, "sam");
  const inboxB = (await req(b.jar, "GET", "api/inbox")).json;
  assert.ok(JSON.stringify(inboxA).includes("hot tubs"));
  assert.ok(!JSON.stringify(inboxB).includes("hot tubs"));
  // A's invite + B's sandbox cookie: the session decides, still sandbox A.
  const mixed: Jar = { cb_sandbox: b.sb };
  await req(mixed, "GET", a.links.sam);
  assert.equal((await req(mixed, "GET", "api/agents")).json.agents.length, 1);
  assert.ok(mixed.cb_session.startsWith(`${a.sb}.`));
});

test("reset and the clock only affect the caller's sandbox", async () => {
  const a = await visitor(), b = await visitor();
  await makeJuno(a);
  await makeJuno(b);
  const r = await req(a.jar, "POST", "api/reset");
  assert.equal(r.status, 200, r.text);
  assert.equal((await req(a.jar, "GET", "api/agents")).json.agents.length, 0, "A was reset");
  assert.equal((await req(a.jar, "GET", "api/me")).status, 200, "A's sign-in survives its reset");
  assert.equal((await req(b.jar, "GET", "api/agents")).json.agents.length, 1, "B untouched");
  await req(a.jar, "POST", "api/clock", { advanceMinutes: 60 * 24 * 40 });
  const bAgent = (await req(b.jar, "GET", "api/agents")).json.agents[0];
  assert.equal(bAgent.state, "active", "A's clock doesn't expire B's helper");
});

test("idle sandboxes expire after 7 days and the total is capped, oldest first", async () => {
  const old = await visitor();
  const f = join(process.env.SANDBOX_DIR!, `${old.sb}.json`);
  const t = new Date(Date.now() - 8 * 864e5);
  utimesSync(f, t, t);
  const dropped = store.gc();
  assert.ok(dropped.includes(old.sb));
  assert.ok(!existsSync(f));
  await req(old.jar, "GET", "api/demo/identities");
  assert.notEqual(old.jar.cb_sandbox, old.sb, "an expired sandbox is replaced by a fresh one");

  for (let i = 0; i < 7; i++) await visitor();
  store.gc();
  assert.ok(readdirSync(process.env.SANDBOX_DIR!).length <= 5);
});

test("the access log names the sandbox, so visitors can be counted", async () => {
  const a = await visitor();
  await as(a, "sam");
  const lines = readFileSync(join(process.env.ACCESS_LOG_DIR!, "access.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const mine = lines.filter((l) => l.sandbox === a.sb);
  assert.ok(mine.length >= 2, "identities + sign-in");
  assert.ok(mine.some((l) => l.member === "sam"));
  assert.ok(!readFileSync(join(process.env.ACCESS_LOG_DIR!, "access.log"), "utf8").includes(a.links.sam.split("/")[1]), "no invite token");
});
