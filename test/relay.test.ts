// Crew → homeowner relay (action.notify_homeowner). Run: NODE_ENV=test npx tsx --test test/relay.test.ts
// Offline: no Claude, so drafts use the deterministic fallback.
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
const { runVoiceTool } = await import("../src/voicetools.ts");
const { memberById } = await import("../src/core.ts");

const app = buildApp();
const BASE = "http://localhost";
type Session = { name: string; cookie: string };

async function signIn(name: string): Promise<Session> {
  const r = await app.request(`${BASE}/i/${DEMO_TOKENS[name]}`);
  const m = /cb_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  assert.ok(m, `no cb_session cookie for ${name} (status ${r.status})`);
  return { name, cookie: `cb_session=${m![1]}` };
}
async function call(s: Session, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { cookie: s.cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await app.request(`${BASE}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, json, text };
}
const get = (s: Session, p: string) => call(s, "GET", p);
const post = (s: Session, p: string, b: unknown = {}) => call(s, "POST", p, b);
const say = (s: Session, text: string) => post(s, "api/creator/message", { text });
const chat = (s: Session, id: string, text: string) => post(s, `api/agents/${id}/chat`, { text });

async function publish(sam: Session, p: any) {
  const r = await post(sam, `api/agents/${p.agentId}/approve`, { rev: p.rev });
  assert.equal(r.status, 200, r.text);
  return p.agentId as string;
}
async function liveJuno(sam: Session) {
  await say(sam, "Make a helper for the Patels about their install");
  const r = await say(sam, "30 days after handover");
  assert.ok(r.json?.proposal, r.text);
  assert.ok(!r.json.proposal.canDo.some((t: any) => t.tool === "action.notify_homeowner"), "Juno must not get notify_homeowner");
  return publish(sam, r.json.proposal);
}
async function liveRex(sam: Session) {
  const r = await say(sam, "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm");
  assert.ok(r.json?.proposal, r.text);
  assert.ok(r.json.proposal.canDo.some((t: any) => t.tool === "action.notify_homeowner"), "Rex proposal should offer notify_homeowner");
  return publish(sam, r.json.proposal);
}
const relays = () => store.db.inbox.filter((i) => i.kind === "relay");
const updates = (agentId: string, mid: string) => (store.db.chatLog[`${agentId}:${mid}`] ?? []).filter((m) => m.action?.kind === "owner_update");

beforeEach(() => { store.reset(); });

test("crew relay files an inbox item; nothing reaches the household before approval", async () => {
  const sam = await signIn("sam"), marco = await signIn("marco"), anita = await signIn("anita");
  const juno = await liveJuno(sam);
  const rex = await liveRex(sam);
  const r = await chat(marco, rex, "Tell the homeowner we'll arrive at 8 tomorrow");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.reply, "I've sent your update to Sam to approve.");
  assert.equal(r.json.action.kind, "relay_requested");
  assert.equal(relays().length, 1);
  const item = relays()[0];
  assert.equal(item.fromId, "marco");
  assert.equal(item.targetGroupId, "grp_patel_household");
  assert.match(item.text, /arrive at 8 tomorrow/);
  assert.ok(store.db.events.some((e) => e.kind === "action.notify_homeowner"));

  // Spanish phrasing also relays.
  const es = await chat(marco, rex, "Avísale a la dueña que el contenedor llega a las 7:30");
  assert.equal(es.status, 200, es.text);
  assert.match(es.json.reply, /Sam/);
  assert.equal(relays().length, 2);

  // Nothing in Anita's Juno thread yet.
  const h = await get(anita, `api/agents/${juno}/history`);
  assert.equal(h.status, 200);
  assert.ok(!h.text.includes("arrive at 8"), "delivered before approval");
  assert.equal(updates(juno, "anita").length, 0);

  // Owner sees it in What's new and in the inbox, with an approval card.
  const news = await say(sam, "What's new?");
  assert.match(news.json.reply, /Marco wants to tell the Patels: .*arrive at 8/);
  assert.equal(news.json.card?.type, "relays");
  const inbox = await get(sam, "api/inbox");
  const row = inbox.json.items.find((i: any) => i.id === item.id);
  assert.equal(row.kind, "relay");
  assert.equal(row.targetName, "Patel household");
  assert.equal(row.deliverable, true);

  // "Tell Marco …" must not approve a relay.
  await say(sam, "Tell Marco thanks");
  assert.equal(relays()[0].status, "open");
  assert.equal(updates(juno, "anita").length, 0);
});

test("owner approval delivers the (edited) text to both household members' Juno history", async () => {
  const sam = await signIn("sam"), marco = await signIn("marco"), anita = await signIn("anita"), raj = await signIn("raj");
  const juno = await liveJuno(sam);
  const rex = await liveRex(sam);
  await chat(marco, rex, "Let the Patels know the dumpster comes at 7:30");
  const item = relays()[0];
  const text = "The dumpster arrives at 7:30 AM by the garage.";
  const r = await post(sam, `api/inbox/${item.id}/answer`, { text });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.item.status, "answered");
  for (const [s, mid] of [[anita, "anita"], [raj, "raj"]] as const) {
    const h = await get(s, `api/agents/${juno}/history`);
    const msg = h.json.messages.find((m: any) => m.action?.kind === "owner_update");
    assert.ok(msg, `${mid} did not get the update`);
    assert.equal(msg.text, `Update from Rivera Solar & Electric: ${text}`);
    assert.equal(msg.action.summary, text);
  }
  // Marco hears it went out; events recorded.
  const mh = await get(marco, `api/agents/${rex}/history`);
  assert.ok(mh.json.messages.some((m: any) => m.action?.kind === "relay_sent"));
  assert.ok(store.db.events.some((e) => e.kind === "relay.approved"));
  assert.ok(store.db.events.some((e) => e.kind === "relay.delivered"));
  // Second approval is refused.
  assert.equal((await post(sam, `api/inbox/${item.id}/answer`, { text })).status, 409);
});

test("no live household helper: approval is refused and the item stays open", async () => {
  const sam = await signIn("sam"), marco = await signIn("marco");
  const rex = await liveRex(sam);
  await chat(marco, rex, "Tell the homeowner we'll arrive at 8 tomorrow");
  const item = relays()[0];
  const row = (await get(sam, "api/inbox")).json.items.find((i: any) => i.id === item.id);
  assert.equal(row.deliverable, false);
  const r = await post(sam, `api/inbox/${item.id}/answer`, { text: item.text });
  assert.equal(r.status, 409);
  assert.match(r.json.reply, /no live helper/);
  assert.equal(relays()[0].status, "open");
});

test("Juno (homeowner helper) cannot use notify_homeowner, by chat or by voice", async () => {
  const sam = await signIn("sam"), anita = await signIn("anita");
  const juno = await liveJuno(sam);
  await chat(anita, juno, "Tell the homeowner the crew arrives at 8");
  assert.equal(relays().length, 0);
  const v = await runVoiceTool(memberById("anita")!, juno, "notify_homeowner", { message: "the crew arrives at 8" });
  assert.equal((v as any).error, "not_allowed");
  assert.equal(relays().length, 0);
  assert.ok(store.db.events.some((e) => e.kind === "access.denied" && (e.detail as any)?.tool === "action.notify_homeowner"));
});

test("closed Rex can't relay (chat 410, voice ended)", async () => {
  const sam = await signIn("sam"), marco = await signIn("marco");
  await liveJuno(sam);
  const rex = await liveRex(sam);
  assert.equal((await post(sam, `api/agents/${rex}/close`)).status, 200);
  const r = await chat(marco, rex, "Tell the homeowner we'll arrive at 8 tomorrow");
  assert.equal(r.status, 410);
  const v = await runVoiceTool(memberById("marco")!, rex, "notify_homeowner", { message: "we'll arrive at 8 tomorrow" });
  assert.equal((v as any).error, "ended");
  assert.equal(relays().length, 0);
});

test("voice notify_homeowner on live Rex files a relay", async () => {
  const sam = await signIn("sam");
  await liveJuno(sam);
  const rex = await liveRex(sam);
  const v: any = await runVoiceTool(memberById("marco")!, rex, "notify_homeowner", { message: "we'll arrive at 8 tomorrow" });
  assert.equal(v.ok, true);
  assert.equal(relays().length, 1);
  assert.ok(!relays()[0].text.includes("4417"));
});
