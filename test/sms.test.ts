// SMS channel. Run: NODE_ENV=test npx tsx --test test/sms.test.ts
// Offline (no model keys): replies come from the deterministic paths. Twilio is stubbed.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
delete process.env.HYDRA_DB_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SMS_WEBHOOK_URL;
delete process.env.SMS_PROVIDER;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_FROM_NUMBER;

const store = await import("../src/store.ts");
const { buildApp } = await import("../src/server.ts");
const { DEMO_TOKENS } = await import("../src/seed.ts");
const sms = await import("../src/sms.ts");
const { setCreatorEngine } = await import("../src/creator.ts");

const app = buildApp();
const BASE = "http://localhost";
const HOOK = `${BASE}/sms/twilio`;
type Session = { cookie: string };

async function signIn(name: string): Promise<Session> {
  const r = await app.request(`${BASE}/i/${DEMO_TOKENS[name]}`);
  const m = /cb_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  assert.ok(m, `no session for ${name}`);
  return { cookie: `cb_session=${m![1]}` };
}
async function call(s: Session, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { cookie: s.cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await app.request(`${BASE}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, json, text };
}
const post = (s: Session, p: string, b: unknown = {}) => call(s, "POST", p, b);
const say = (s: Session, text: string) => post(s, "api/creator/message", { text });
async function publish(sam: Session, p: any) {
  const r = await post(sam, `api/agents/${p.agentId}/approve`, { rev: p.rev });
  assert.equal(r.status, 200, r.text);
  return p.agentId as string;
}
async function liveJuno(sam: Session) {
  await say(sam, "Make a helper for the Patels about their install");
  const r = await say(sam, "30 days after handover");
  assert.ok(r.json?.proposal, r.text);
  return publish(sam, r.json.proposal);
}
async function liveRex(sam: Session) {
  const r = await say(sam, "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm");
  assert.ok(r.json?.proposal, r.text);
  return publish(sam, r.json.proposal);
}

/** A signed Twilio webhook POST (signature over the URL + sorted params with the test secret). */
async function twilioPost(params: Record<string, string>, opts: { signature?: string } = {}) {
  const sig = opts.signature ?? sms.twilioSignature(sms.TEST_SECRET, HOOK, params);
  const r = await app.request(HOOK, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams(params).toString() });
  const text = await r.text();
  const messages = [...text.matchAll(/<Message>([\s\S]*?)<\/Message>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  return { status: r.status, text, messages, all: messages.join(" ") };
}
const text = (from: string, body: string) => twilioPost({ From: from, To: "+15005550006", Body: body, MessageSid: "SM" + Math.random().toString(16).slice(2) });
const MARCO = "+15105550167", ANITA = "+14155550142";

const realFetch = globalThis.fetch;
beforeEach(() => { store.reset(); sms._resetIndex(); setCreatorEngine(null); });
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM_NUMBER;
});

test("signature: valid accepted, missing or forged rejected with 403", async () => {
  const p = { From: "+19995550000", Body: "hi" };
  assert.equal((await twilioPost(p)).status, 200);
  assert.equal((await twilioPost(p, { signature: "" })).status, 403);
  assert.equal((await twilioPost(p, { signature: sms.twilioSignature("wrong-secret", HOOK, p) })).status, 403);
  // Tampering with a param after signing breaks it.
  const sig = sms.twilioSignature(sms.TEST_SECRET, HOOK, p);
  const r = await app.request(HOOK, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams({ ...p, Body: "changed" }).toString() });
  assert.equal(r.status, 403);
  // The scheme: HMAC-SHA1 over URL + name/value pairs sorted by name, base64.
  const { createHmac } = await import("node:crypto");
  assert.equal(sms.twilioSignature("k", "https://x/y?q=1", { b: "2", a: "1" }), createHmac("sha1", "k").update("https://x/y?q=1a1b2").digest("base64"));
});

test("unknown number gets the polite not-connected reply", async () => {
  const r = await text("+19995550000", "When do you come?");
  assert.equal(r.status, 200);
  assert.match(r.text, /^<\?xml/);
  assert.deepEqual(r.messages, ["This number isn't connected to a CrewBrain helper."]);
});

test("routes to the member's active helper through core.chat; SWITCH lists helpers", async () => {
  const sam = await signIn("sam");
  assert.match((await text(MARCO, "What's the plan today?")).all, /isn't connected/, "no helper yet");
  const rex = await liveRex(sam);
  const r = await text(MARCO, "What's the plan today?");
  assert.equal(r.status, 200);
  assert.ok(r.messages.length >= 1 && r.messages.length <= 3, r.text);
  for (const m of r.messages) assert.ok(m.length <= 160, m);
  assert.doesNotMatch(r.all, /isn't connected|SECRET/);
  const log = store.db.chatLog[`${rex}:marco`] ?? [];
  assert.equal(log.at(-2)?.text, "What's the plan today?", "same chat log as the web");
  // Anita (household) is not in Rex's audience: nothing reaches her by text either.
  assert.match((await text(ANITA, "What's the plan today?")).all, /isn't connected/);
  const sw = await text(MARCO, "switch");
  assert.match(sw.all, /1\) Rex/);
  assert.match((await text(MARCO, "switch 1")).all, /will answer your texts/);
  assert.equal(store.db.members.find((m) => m.id === "marco")!.smsAgentId, rex);
  assert.match((await text(MARCO, "HELP")).all, /STOP/);
});

test("gated action by SMS: crew 'Found rot, logging it' files an issue in the owner's inbox", async () => {
  const sam = await signIn("sam");
  const rex = await liveRex(sam);
  const r = await text(MARCO, "Found rot, logging it");
  assert.match(r.all, /Logged for Sam/);
  const issue = store.db.inbox.find((i) => i.kind === "issue" && i.fromId === "marco");
  assert.ok(issue, "issue filed");
  assert.equal(issue!.agentId, rex);
  assert.ok(store.db.events.some((e) => e.kind === "action.log_issue" && e.actorId === "marco"));
  assert.ok(store.db.events.some((e) => e.kind === "sms.inbound" && e.actorId === "marco"));
});

test("closed helper replies with its ended sentence", async () => {
  const sam = await signIn("sam");
  const rex = await liveRex(sam);
  assert.equal((await post(sam, `api/agents/${rex}/close`)).status, 200);
  const r = await text(MARCO, "What's the plan today?");
  assert.deepEqual(r.messages, ["This helper was closed by the owner."]);
});

test("owner answer is delivered by SMS (Twilio REST stubbed); fictional numbers never are", async () => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test"; process.env.TWILIO_AUTH_TOKEN = sms.TEST_SECRET; process.env.TWILIO_FROM_NUMBER = "+15005550006";
  const calls: { url: string; body: URLSearchParams; auth: string }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).startsWith("https://api.twilio.com/")) {
      calls.push({ url: String(url), body: new URLSearchParams(String(init.body)), auth: String(init.headers.Authorization) });
      return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  const sam = await signIn("sam"), anita = await signIn("anita");
  const juno = await liveJuno(sam);
  // A real-looking number set through the owner's tap (the set_phone card's request).
  const set = await post(sam, "api/members/anita/phone", { phone: "(415) 867-5309" });
  assert.equal(set.status, 200, set.text);
  assert.equal(set.json.member.phone, "+14158675309");
  assert.equal(sms.lookupPhone("+14158675309")?.memberId, "anita", "indexed for inbound routing");
  assert.equal((await post(anita, "api/members/raj/phone", { phone: "+14155550199" })).status, 403, "only the owner sets phones");

  const q = await post(anita, `api/agents/${juno}/chat`, { text: "Can you also paint the garage door blue?" });
  assert.equal(q.status, 200, q.text);
  const item = store.db.inbox.find((i) => i.kind === "question" && i.fromId === "anita");
  assert.ok(item, q.text);
  const a = await post(sam, `api/inbox/${item!.id}/answer`, { text: "We don't paint, sorry. Try Bay Painters." });
  assert.equal(a.status, 200, a.text);
  await sms.smsIdle();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /Accounts\/AC_test\/Messages\.json$/);
  assert.equal(calls[0].body.get("To"), "+14158675309");
  assert.equal(calls[0].body.get("From"), "+15005550006");
  assert.match(calls[0].body.get("Body")!, /Sam answered .*Bay Painters/);
  assert.match(calls[0].auth, /^Basic /);
  assert.ok(store.db.events.some((e) => e.kind === "sms.outbound" && e.detail?.status === "sent"));

  // Raj keeps his fictional 555-01xx number: an invite by SMS is logged as simulated, never sent.
  const inv = await post(sam, `api/agents/${juno}/sms-invite`, {});
  assert.equal(inv.status, 200, inv.text);
  await sms.smsIdle();
  assert.equal(calls.filter((c) => c.body.get("To") === "+14155550143").length, 0);
  assert.ok(store.db.smsLog!.some((x) => x.memberId === "raj" && x.status === "simulated" && x.kind === "invite"));
  assert.equal(calls.filter((c) => c.body.get("To") === "+14158675309").length, 2, "Anita got the invite too");
});

test("STOP opts out: no more outbound texts until START", async () => {
  const sam = await signIn("sam");
  await liveRex(sam);
  const r = await text(MARCO, "STOP");
  assert.match(r.all, /won't get more texts/);
  assert.equal(store.db.members.find((m) => m.id === "marco")!.smsOptOut, true);
  const before = (store.db.smsLog ?? []).length;
  sms.notifyMember(store.db.members.find((m) => m.id === "marco"), "hello", "test");
  assert.equal(store.db.smsLog!.at(-1)!.status, "skipped:opted_out");
  assert.equal(store.db.smsLog!.length, before + 1);
  assert.match((await text(MARCO, "START")).all, /back on/);
  assert.equal(store.db.members.find((m) => m.id === "marco")!.smsOptOut, false);
});

test("set_phone creator tool returns a confirm card; simulator runs the same handler", async () => {
  const sam = await signIn("sam");
  setCreatorEngine(async (input) => {
    const t = input.tools.find((x) => x.name === "set_phone")!;
    const out: any = await t.run({ member: "Tess", phone: "510 555 0100" });
    assert.equal(out.saved, false);
    return "Tap to save Tess's number.";
  });
  const r = await say(sam, "Tess's cell is 510 555 0100");
  assert.equal(r.json.card.type, "confirm", r.text);
  assert.equal(r.json.card.request.path, "api/members/tess/phone");
  assert.equal(r.json.card.request.body.phone, "+15105550100");
  assert.equal(store.db.members.find((m) => m.id === "tess")!.phone, "+15105550168", "nothing saved before the tap");
  setCreatorEngine(null);

  await liveRex(sam);
  const sim = await post(sam, "sms/simulate", { member: "marco", text: "Found rot, logging it" });
  assert.equal(sim.status, 200, sim.text);
  assert.match(sim.json.parts.join(" "), /Logged for Sam/);
  const th = await call(sam, "GET", "sms/simulate/thread?member=marco");
  assert.deepEqual(th.json.messages.map((m: any) => m.dir), ["in", "out"]);
  const marco = await signIn("marco");
  assert.equal((await post(marco, "sms/simulate", { member: "marco", text: "hi" })).status, 403, "owner only");
  assert.equal((await call(marco, "GET", "sms.html")).status, 404);
});

test("splitSms keeps ≤ 3 parts of ≤ 160 chars", () => {
  const parts = sms.splitSms("word ".repeat(200), 160, 3);
  assert.equal(parts.length, 3);
  for (const p of parts) assert.ok(p.length <= 160);
  assert.match(parts[2], /…$/);
  assert.equal(sms.normalizePhone("415-555-0142"), "+14155550142");
  assert.equal(sms.normalizePhone("12"), undefined);
  assert.ok(sms.isFictional("+15105550167"));
  assert.ok(!sms.isFictional("+14158675309"));
});
