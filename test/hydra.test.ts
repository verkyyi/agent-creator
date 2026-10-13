// HydraDB depth: the feedback loop (escalate → owner answers → POST /feedback with ground
// truth) and graph context for the owner. fetch is stubbed; no network.
// Run: NODE_ENV=test npx tsx --test test/hydra.test.ts
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
process.env.HYDRA_DB_API_KEY = "dummy-test-key";
delete process.env.OPENAI_API_KEY;
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const store = await import("../src/store.ts");
const { buildApp } = await import("../src/server.ts");
const { DEMO_TOKENS } = await import("../src/seed.ts");
const { hydraState, relatedFrom } = await import("../src/retrieval.ts");

const app = buildApp();
const BASE = "http://localhost";
type Session = { cookie: string };

async function signIn(name: string): Promise<Session> {
  const r = await app.request(`${BASE}/i/${DEMO_TOKENS[name]}`);
  const m = /cb_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  assert.ok(m, `no session for ${name}`);
  return { cookie: `cb_session=${m![1]}` };
}
async function post(s: Session, path: string, body: unknown = {}) {
  const r = await app.request(`${BASE}/${path}`, { method: "POST", headers: { cookie: s.cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}
async function get(s: Session, path: string) {
  const r = await app.request(`${BASE}/${path}`, { headers: { cookie: s.cookie } });
  return { status: r.status, json: await r.json().catch(() => undefined) };
}
const say = (s: Session, text: string) => post(s, "api/creator/message", { text });

// ---- fetch stub ----
type Call = { path: string; body: any };
let calls: Call[] = [];
let graph: any = { query_paths: [], chunk_relations: [] };
let queryChunks: any[] = [];
let seq = 0;
const realFetch = globalThis.fetch;
const env = (data: unknown, meta: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: true, data, error: null, meta }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  store.reset();
  calls = []; queryChunks = []; seq = 0;
  graph = { query_paths: [], chunk_relations: [] };
  hydraState.rivera = "ready";
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (!url.startsWith("https://api.hydradb.com")) return realFetch(input, init);
    const path = url.slice("https://api.hydradb.com".length);
    let body: any;
    try { body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body; } catch { body = init?.body; }
    calls.push({ path, body });
    if (path.startsWith("/query")) {
      const isMemory = body?.type === "memory";
      return env(isMemory ? { chunks: [] } : { chunks: queryChunks, graph_context: body?.graph_context ? graph : undefined }, { request_id: `req-${++seq}` });
    }
    return env({});
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; delete hydraState.rivera; });

const tick = () => new Promise((r) => setTimeout(r, 20));

test("feedback loop: escalated question keeps HydraDB's request_id; owner's answer is reported as ground truth", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const r1 = await say(sam, "Make a helper for the Patels about their install");
  assert.ok(r1.status === 200);
  const r2 = await say(sam, "30 days after handover");
  const p = r2.json.proposal;
  assert.equal((await post(sam, `api/agents/${p.agentId}/approve`, { rev: p.rev })).status, 200);

  const q = await post(anita, `api/agents/${p.agentId}/chat`, { text: "Do you also service hot tubs?" });
  assert.equal(q.json.refused, true, q.text);
  const searchCall = calls.filter((c) => c.path === "/query" && c.body?.type === "knowledge" && c.body?.acl).at(-1);
  assert.ok(searchCall, "helper search went to HydraDB");
  const rec = store.db.inbox.find((i) => /hot tubs/.test(i.text))!;
  assert.ok(rec.hydraRequestId, "inbox item stores the HydraDB request id");
  assert.match(rec.hydraRequestId!, /^req-\d+$/);

  const ans = await post(sam, `api/inbox/${rec.id}/answer`, { text: "Yes, we service hot tub circuits on request.", sharing: "customer" });
  assert.equal(ans.status, 200, ans.text);
  assert.equal(ans.json.brainImproved, true);
  await tick();
  const fb = calls.find((c) => c.path === "/feedback");
  assert.ok(fb, "POST /feedback was sent");
  assert.equal(fb!.body.request_id, rec.hydraRequestId);
  assert.equal(fb!.body.source, "agent");
  assert.equal(fb!.body.rating, "negative");
  assert.equal(fb!.body.database, "crewbrain_rivera");
  assert.deepEqual(fb!.body.ground_truth, { answer: "Yes, we service hot tub circuits on request.", source_ids: [ans.json.knowledge.id] });
  assert.match(fb!.body.feedback, /could not answer 'Do you also service hot tubs\?'.*source src_/);
  const ev = store.db.events.find((e) => e.kind === "hydra.feedback");
  assert.equal(ev?.detail?.ok, true);
});

test("feedback loop: no request id (HydraDB not ready) → no feedback, no brainImproved", async () => {
  hydraState.rivera = "indexing";
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  await say(sam, "Make a helper for the Patels about their install");
  const p = (await say(sam, "30 days after handover")).json.proposal;
  await post(sam, `api/agents/${p.agentId}/approve`, { rev: p.rev });
  await post(anita, `api/agents/${p.agentId}/chat`, { text: "Do you also service hot tubs?" });
  const rec = store.db.inbox.find((i) => /hot tubs/.test(i.text))!;
  assert.equal(rec.hydraRequestId, undefined);
  const ans = await post(sam, `api/inbox/${rec.id}/answer`, { text: "Yes.", sharing: "customer" });
  assert.equal(ans.json.brainImproved, undefined);
  await tick();
  assert.ok(!calls.some((c) => c.path === "/feedback"));
});

const triplet = (chunk: string, s: string, pred: string, o: string) => ({ triplets: [{ source: { name: s }, relation: { canonical_predicate: pred, chunk_id: chunk }, target: { name: o } }] });

test("graph context: job status uses thinking mode + graph_context and returns related chips", async () => {
  const sam = await signIn("sam");
  queryChunks = [{ id: "src_install_oak", chunk_uuid: "src_install_oak_chunk_0000", chunk_content: "Install" }];
  graph = {
    chunk_relations: [triplet("src_install_oak_chunk_0000", "patels", "has scheduled", "panel install"), triplet("src_price_book_chunk_0000", "oak st job", "has margin of", "27")],
    query_paths: [triplet("src_site_brief_oak_chunk_0000", "42 oak st", "has homeowner note", "dog in backyard"), triplet("src_unknown_chunk_0000", "x", "y", "z")],
  };
  const r = await say(sam, "What's going on at 42 Oak St?");
  assert.equal(r.status, 200, r.text);
  const q = calls.find((c) => c.path === "/query" && c.body?.mode === "thinking");
  assert.ok(q, "thinking-mode query sent");
  assert.equal(q!.body.graph_context, true);
  assert.equal(q!.body.acl, undefined, "owner view: no acl");
  assert.equal(r.json.card.type, "answer");
  assert.deepEqual(r.json.card.related.map((x: any) => x.title), ["Install Timeline: 42 Oak St", "Price Book 2026", "Site Brief: 42 Oak St"]);
  assert.equal(r.json.card.related[0].relation, "patels has scheduled panel install");
  assert.ok(r.json.card.results.some((x: any) => x.title === "Install Timeline: 42 Oak St"));
});

test("graph context: job status falls back to local job sources + open inbox when HydraDB isn't ready", async () => {
  hydraState.rivera = "indexing";
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  await say(sam, "Make a helper for the Patels about their install");
  const p = (await say(sam, "30 days after handover")).json.proposal;
  await post(sam, `api/agents/${p.agentId}/approve`, { rev: p.rev });
  await post(anita, `api/agents/${p.agentId}/chat`, { text: "Do you also service hot tubs?" });
  calls = [];
  const r = await say(sam, "status of the Oak St job");
  assert.equal(r.status, 200);
  assert.ok(!calls.some((c) => c.path === "/query" && c.body?.mode === "thinking"));
  const titles = r.json.card.results.map((x: any) => x.title);
  assert.ok(titles.includes("Install Timeline: 42 Oak St") && titles.includes("Site Brief: 42 Oak St"), titles.join());
  assert.ok(r.json.card.open.some((i: any) => /hot tubs/.test(i.text)));
  assert.equal(r.json.card.related, undefined);
  assert.match(r.json.reply, /42 Oak St/);
});

test("ask the brain: owner question carries graph-related items", async () => {
  const sam = await signIn("sam");
  queryChunks = [{ id: "src_care_warranty", chunk_content: "warranty" }];
  graph = { chunk_relations: [triplet("src_care_warranty_chunk_0000", "battery", "has warranty", "10 years")], query_paths: [] };
  const r = await say(sam, "How long is the battery warranty?");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.card.related, [{ title: "Care & Warranty", relation: "battery has warranty 10 years" }]);
  const a = await get(sam, `api/ask?q=${encodeURIComponent("battery warranty")}`);
  assert.ok(a.json.related?.length === 1);
});

test("relatedFrom: maps chunk ids to known sources only, one per source, max 5", () => {
  const srcs = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  const g = { chunk_relations: [triplet("a_chunk_0000", "x", "r1", "y"), triplet("a_chunk_0001", "x", "r2", "y"), triplet("zz_chunk_0000", "q", "r", "w")], query_paths: [triplet("b_chunk_0003", "m", "n", "o")] };
  assert.deepEqual(relatedFrom(g, srcs), [{ sourceId: "a", title: "A", relation: "x r1 y" }, { sourceId: "b", title: "B", relation: "m n o" }]);
  assert.deepEqual(relatedFrom(undefined, srcs), []);
});
