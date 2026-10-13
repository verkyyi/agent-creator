// Streaming chat (POST api/agents/:id/chat?stream=1). Run: NODE_ENV=test npx tsx --test test/stream.test.ts
// Offline: no Claude (answers are extractive), no HydraDB.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
delete process.env.HYDRA_DB_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const store = await import("../src/store.ts");
const { buildApp } = await import("../src/server.ts");
const { DEMO_TOKENS } = await import("../src/seed.ts");

const app = buildApp();
const BASE = "http://localhost";
type Session = { cookie: string };

async function signIn(name: string): Promise<Session> {
  const r = await app.request(`${BASE}/i/${DEMO_TOKENS[name as keyof typeof DEMO_TOKENS]}`);
  const m = /cb_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  assert.ok(m, `no cb_session for ${name}`);
  return { cookie: `cb_session=${m![1]}` };
}
async function post(s: Session, path: string, body: unknown) {
  return app.request(`${BASE}/${path}`, { method: "POST", headers: { cookie: s.cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function liveRex(sam: Session) {
  const r = await (await post(sam, "api/creator/message", { text: "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm" })).json() as any;
  assert.ok(r.proposal, JSON.stringify(r));
  const ap = await post(sam, `api/agents/${r.proposal.agentId}/approve`, { rev: r.proposal.rev });
  assert.equal(ap.status, 200);
  return r.proposal.agentId as string;
}
function parseSSE(text: string) {
  return text.split(/\n\n/).filter((b) => b.trim()).map((b) => {
    const event = /^event: ?(.*)$/m.exec(b)?.[1] ?? "message";
    const data = b.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.replace(/^data: ?/, "")).join("\n");
    return { event, data: data ? JSON.parse(data) : undefined };
  });
}

beforeEach(() => { store.reset(); });

test("stream: status → sources → reply → done, cited and timed", async () => {
  const rex = await liveRex(await signIn("sam"));
  const r = await post(await signIn("marco"), `api/agents/${rex}/chat?stream=1`, { text: "What's the gate code?" });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/event-stream/);
  const ev = parseSSE(await r.text());
  assert.deepEqual(ev.map((e) => e.event), ["status", "sources", "reply", "done"]);
  assert.ok(ev[0].data.text);
  assert.ok(ev[1].data.citations.length > 0, "sources lists what retrieval found");
  const reply = ev[2].data;
  assert.ok(reply.reply && !reply.refused, JSON.stringify(reply));
  assert.ok(reply.citations.length > 0);
  assert.equal(typeof reply.ms, "number");
});

test("stream: same answer as the non-stream route", async () => {
  const rex = await liveRex(await signIn("sam"));
  const marco = await signIn("marco");
  const plain = await (await post(marco, `api/agents/${rex}/chat`, { text: "What's the gate code?" })).json() as any;
  const ev = parseSSE(await (await post(marco, `api/agents/${rex}/chat?stream=1`, { text: "What's the gate code?" })).text());
  const reply = ev.find((e) => e.event === "reply")!.data;
  assert.equal(reply.reply, plain.reply);
  assert.deepEqual(reply.citations, plain.citations);
});

test("stream: an uninvited person gets a single error event with the non-stream body", async () => {
  const rex = await liveRex(await signIn("sam"));
  const zed = await signIn("zed");
  const plain = await post(zed, `api/agents/${rex}/chat`, { text: "What's the gate code?" });
  const plainBody = await plain.json();
  assert.ok([403, 404].includes(plain.status));
  const ev = parseSSE(await (await post(zed, `api/agents/${rex}/chat?stream=1`, { text: "What's the gate code?" })).text());
  assert.equal(ev.length, 1);
  assert.equal(ev[0].event, "error");
  assert.deepEqual(ev[0].data, plainBody);
  assert.ok(!JSON.stringify(ev).includes("4417"));
});

test("stream: a closed helper sends error ended (410 body)", async () => {
  const sam = await signIn("sam");
  const rex = await liveRex(sam);
  await post(sam, `api/agents/${rex}/close`, {});
  const ev = parseSSE(await (await post(await signIn("marco"), `api/agents/${rex}/chat?stream=1`, { text: "What's the gate code?" })).text());
  assert.deepEqual(ev.map((e) => e.event), ["error"]);
  assert.equal(ev[0].data.error, "ended");
  assert.equal(ev[0].data.state, "revoked");
});

test("stream: a write action emits an action event before the reply", async () => {
  const rex = await liveRex(await signIn("sam"));
  const ev = parseSSE(await (await post(await signIn("marco"), `api/agents/${rex}/chat?stream=1`, { text: "Found a cracked tile on the north side" })).text());
  assert.deepEqual(ev.map((e) => e.event), ["status", "action", "reply", "done"]);
  assert.equal(ev[1].data.kind, "issue_logged");
  assert.equal(ev[2].data.action.kind, "issue_logged");
});

test("helper answers use Haiku when the excerpts are short", async () => {
  const llm = await import("../src/llm.ts");
  const models: string[] = [];
  llm.setQuery(async function* ({ options }) { models.push(options.model); yield { type: "result", subtype: "success", result: "Use the side gate.\nUSED:1" }; });
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  try {
    const rex = await liveRex(await signIn("sam"));
    const ev = parseSSE(await (await post(await signIn("marco"), `api/agents/${rex}/chat?stream=1`, { text: "What's the gate code?" })).text());
    assert.equal(ev.find((e) => e.event === "reply")!.data.reply, "Use the side gate.");
    assert.deepEqual(models, ["claude-haiku-5-5"]);
  } finally {
    llm.setQuery(null);
    delete process.env.ANTHROPIC_API_KEY;
  }
});
