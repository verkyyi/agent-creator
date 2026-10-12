// Access-control acceptance suite. Run: NODE_ENV=test npx tsx --test test/access.test.ts
// Offline by construction: no HydraDB, no Claude (answers are extractive), no voice.
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
const { DEMO_TOKENS, SECRET } = await import("../src/seed.ts");
const { localSearch, search, principalsFor } = await import("../src/retrieval.ts");

const app = buildApp();
const BASE = "http://localhost";

type Session = { name: string; cookie: string };

async function signIn(name: keyof typeof DEMO_TOKENS | string): Promise<Session> {
  const r = await app.request(`${BASE}/i/${DEMO_TOKENS[name]}`);
  const sc = r.headers.get("set-cookie") ?? "";
  const m = /cb_session=([^;]+)/.exec(sc);
  assert.ok(m, `no cb_session cookie for ${name} (status ${r.status})`);
  return { name, cookie: `cb_session=${m![1]}` };
}

async function call(s: Session | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (s) headers.cookie = s.cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await app.request(`${BASE}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, json, text };
}
const get = (s: Session | null, p: string) => call(s, "GET", p);
const post = (s: Session | null, p: string, b: unknown = {}) => call(s, "POST", p, b);
const say = (s: Session, text: string) => post(s, "api/creator/message", { text });
const chat = (s: Session, id: string, text: string) => post(s, `api/agents/${id}/chat`, { text });

async function createJuno(sam: Session) {
  const r1 = await say(sam, "Make a helper for the Patels about their install");
  const r2 = await say(sam, "30 days after handover");
  assert.ok(r2.json?.proposal, `expected proposal, got ${r2.text}`);
  return { r1, r2, proposal: r2.json.proposal };
}
async function createRex(sam: Session) {
  const r = await say(sam, "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm");
  assert.ok(r.json?.proposal, `expected proposal, got ${r.text}`);
  return r.json.proposal;
}
async function publish(sam: Session, p: any) {
  const r = await post(sam, `api/agents/${p.agentId}/approve`, { rev: p.rev });
  assert.equal(r.status, 200, r.text);
  return r.json;
}
async function liveJuno(sam: Session) { const { proposal } = await createJuno(sam); await publish(sam, proposal); return proposal.agentId as string; }
async function liveRex(sam: Session) { const p = await createRex(sam); await publish(sam, p); return p.agentId as string; }

const LEAKS = ["4417", SECRET.rivera, "38,400", "27,900", SECRET.globex];
function assertNoLeak(text: string, ctx: string) {
  for (const s of LEAKS) assert.ok(!text.includes(s), `${ctx}: leaked "${s}" in ${text}`);
}

beforeEach(() => { store.reset(); });

test("1. Create and publish: asks only for the end time, proposes, nothing usable before approval, published config = approved revision", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const { r1, r2, proposal } = await createJuno(sam);
  assert.equal(r1.status, 200);
  assert.match(r1.json.reply, /\b(end|when)\b/i);
  assert.equal(r1.json.proposal, undefined, "first turn must not propose");
  assert.doesNotMatch(r1.json.reply, /who should|which|audience/i, "should ask only for the end time");
  assert.equal(r2.status, 200);
  assert.equal(proposal.name, "Juno");
  assert.equal(r2.json.agent.state, "awaiting_approval");

  const before = await chat(anita, proposal.agentId, "When is the inspection?");
  assert.ok([403, 410].includes(before.status), `pre-approval chat must not be 200 (got ${before.status})`);
  assertNoLeak(before.text, "pre-approval");
  const me = await get(anita, "api/me");
  assert.equal(me.json.helpers.length, 0, "homeowner sees no helpers before approval");

  const ap = await publish(sam, proposal);
  assert.equal(ap.agent.state, "active");
  assert.equal(ap.agent.activeRev, proposal.rev);
  assert.equal(ap.links.length, 2);

  const a = store.db.agents.find((x) => x.id === proposal.agentId)!;
  const activeRev = a.revisions.find((r) => r.rev === a.activeRev)!;
  assert.equal(activeRev.rev, proposal.rev);
  assert.equal(activeRev.config.name, proposal.name);
  assert.equal(activeRev.config.tone, proposal.tone);
  assert.equal(activeRev.config.expiresAt, proposal.endsAt);
  assert.deepEqual(activeRev.config.sources.map((s) => s.id).sort(), proposal.knows.map((k: any) => k.id).sort());
  assert.deepEqual(activeRev.config.tools.slice().sort(), [...proposal.canCheck, ...proposal.canDo].map((t: any) => t.tool).sort());
  const appr = store.db.approvals.find((x) => x.agentId === a.id);
  assert.equal(appr?.rev, proposal.rev);

  const after = await chat(anita, proposal.agentId, "When is the inspection?");
  assert.equal(after.status, 200, after.text);
});

test("2. Two distinct outputs: Juno for the household and Rex for the crew differ in id, audience, tools and expiry", async () => {
  const sam = await signIn("sam");
  const { proposal: juno } = await createJuno(sam);
  const rex = await createRex(sam);
  assert.notEqual(juno.agentId, rex.agentId);
  assert.equal(juno.name, "Juno");
  assert.equal(rex.name, "Rex");
  assert.notEqual(juno.audience.groupId, rex.audience.groupId);
  assert.equal(juno.audience.groupId, "grp_patel_household");
  assert.equal(rex.audience.groupId, "grp_bay_crew_oak");
  const tools = (p: any) => [...p.canCheck, ...p.canDo].map((t: any) => t.tool).sort().join(",");
  assert.notEqual(tools(juno), tools(rex));
  assert.notEqual(juno.endsAt, rex.endsAt);
  assert.ok(rex.knows.some((k: any) => k.id === "src_site_brief_oak"));
  assert.ok(!juno.knows.some((k: any) => k.id === "src_site_brief_oak"));
  for (const p of [juno, rex]) assert.ok(!p.knows.some((k: any) => k.id === "src_price_book"));
});

test("3. Unauthorized document: homeowner can't get the gate code or the price book; question escalates; retrieval never returns the price book", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const juno = await liveJuno(sam);
  await liveRex(sam);

  const gate = await chat(anita, juno, "What is the gate code?");
  assert.equal(gate.status, 200);
  assertNoLeak(gate.text, "gate code");
  assert.equal(gate.json.refused, true, `gate code should be refused: ${gate.text}`);

  const price = await chat(anita, juno, "What's the margin in the price book?");
  assert.equal(price.status, 200);
  assertNoLeak(price.text, "price book");
  assert.equal(price.json.refused, true, `price book question should be refused: ${price.text}`);

  const inbox = await get(sam, "api/inbox");
  assert.ok(inbox.json.items.some((i: any) => i.kind === "question" && /gate code/i.test(i.text) && i.agentId === juno));

  const household = principalsFor({ kind: "household", jobId: "job_oak42" });
  const allowed = ["src_product_guide", "src_care_warranty", "src_install_oak", "src_price_book"];
  for (const q of ["margin price book", "Oak St quoted cost margin internal code"]) {
    const local = localSearch(q, store.db.sources, household, allowed);
    assert.ok(!local.some((c) => c.sourceId === "src_price_book"), "localSearch returned the price book");
    const { chunks } = await search("rivera", q, store.db.sources, household, allowed);
    assert.ok(!chunks.some((c) => c.sourceId === "src_price_book"), "search returned the price book");
    for (const c of [...local, ...chunks]) assertNoLeak(c.text, "retrieval");
  }
});

test("4. Tenant isolation: another company's owner gets 404 on Rivera's helper and sees only its own brain", async () => {
  const sam = await signIn("sam");
  const gail = await signIn("gail");
  const anita = await signIn("anita");
  const { proposal } = await createJuno(sam);
  const id = proposal.agentId;
  const attempts = [
    await get(gail, `api/agents/${id}/public`),
    await get(gail, `api/agents/${id}/history`),
    await get(gail, `api/agents/${id}/links`),
    await post(gail, `api/agents/${id}/chat`, { text: "What is the gate code?" }),
    await post(gail, `api/agents/${id}/approve`, { rev: proposal.rev }),
    await post(gail, `api/agents/${id}/close`),
  ];
  for (const r of attempts) {
    assert.equal(r.status, 404, `gail got ${r.status}: ${r.text}`);
    assert.doesNotMatch(r.text, /Juno|Patel|Rivera|Oak/i);
    assertNoLeak(r.text, "gail");
  }
  assert.equal(store.db.agents.find((a) => a.id === id)!.state, "awaiting_approval", "gail must not change Rivera's helper");

  const brain = await get(gail, "api/brain");
  assert.equal(brain.status, 200);
  assert.deepEqual(brain.json.items.map((i: any) => i.id), ["src_globex_handbook"]);
  const agents = await get(gail, "api/agents");
  assert.equal(agents.json.agents.length, 0);
  const inbox = await get(gail, "api/inbox");
  assert.equal(inbox.json.items.length, 0);

  await publish(sam, proposal);
  for (const q of ["harness safety crew code", "Globex internal code", "harness checks before every climb"]) {
    const r = await chat(anita, id, q);
    assert.ok(!r.text.includes(SECRET.globex), "Rivera homeowner saw Globex secret");
  }
});

test("5. Audience restriction: an uninvited member of the same company gets 403 before any content", async () => {
  const sam = await signIn("sam");
  const zed = await signIn("zed");
  const juno = await liveJuno(sam);
  for (const r of [
    await post(zed, `api/agents/${juno}/chat`, { text: "When is the inspection?" }),
    await get(zed, `api/agents/${juno}/public`),
    await get(zed, `api/agents/${juno}/history`),
  ]) {
    assert.equal(r.status, 403, r.text);
    assert.doesNotMatch(r.text, /Juno|inspection|Patel|HomeGrid/i);
    assertNoLeak(r.text, "zed");
  }
  assert.ok(!store.db.chatLog[`${juno}:zed`], "no chat should be logged for zed");
  const me = await get(zed, "api/me");
  assert.equal(me.json.helpers.length, 0);
  const noCookie = await get(null, `api/agents/${juno}/public`);
  assert.equal(noCookie.status, 401);
});

test("6. Tool revocation / close: crew loses access immediately; job-only crew notes relock to Office only", async () => {
  const sam = await signIn("sam");
  const marco = await signIn("marco");
  const rex = await liveRex(sam);
  const crew = principalsFor({ kind: "crew", jobId: "job_oak42" });
  const rexSources = store.db.agents.find((a) => a.id === rex)!.revisions.at(-1)!.config.sources.map((s) => s.id);
  assert.ok(localSearch("gate code", store.db.sources, crew, rexSources).some((c) => c.sourceId === "src_site_brief_oak"), "precondition: crew can find the site brief");

  const ok = await chat(marco, rex, "What is the gate code?");
  assert.equal(ok.status, 200, ok.text);
  assert.match(ok.json.reply, /4417/);

  const closed = await post(sam, `api/agents/${rex}/close`);
  assert.equal(closed.status, 200);
  assert.equal(closed.json.agent.state, "revoked");

  const after = await chat(marco, rex, "What is the gate code?");
  assert.equal(after.status, 410, after.text);
  assert.equal(after.json.state, "revoked");
  assertNoLeak(after.text, "after close");

  const pub = await get(marco, `api/agents/${rex}/public`);
  assert.equal(pub.json.state, "revoked");

  const brain = await get(sam, "api/brain");
  const brief = brain.json.items.find((i: any) => i.id === "src_site_brief_oak");
  assert.equal(brief.sharing, "internal");
  assert.equal(brief.lockLabel, "Office only");
  // Tenant-wide crew safety rules are not job-only and stay crew.
  assert.equal(brain.json.items.find((i: any) => i.id === "src_safety").sharing, "crew");

  assert.ok(!localSearch("gate code", store.db.sources, crew, rexSources).some((c) => c.sourceId === "src_site_brief_oak"));
  const { chunks } = await search("rivera", "gate code side gate access park", store.db.sources, crew, rexSources);
  assert.ok(!chunks.some((c) => c.sourceId === "src_site_brief_oak"));
});

test("7. Real expiry: advancing the clock past expiresAt ends the helper (410 expired)", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const juno = await liveJuno(sam);
  try {
    const pub = await get(anita, `api/agents/${juno}/public`);
    const mins = Math.ceil((Date.parse(pub.json.expiresAt) - store.now().getTime()) / 60_000) + 5;
    assert.ok(mins > 0);
    const clk = await post(sam, "api/clock", { advanceMinutes: mins });
    assert.equal(clk.status, 200, clk.text);
    const r = await chat(anita, juno, "When is the inspection?");
    assert.equal(r.status, 410, r.text);
    assert.equal(r.json.state, "expired");
    assertNoLeak(r.text, "expired");
    const pub2 = await get(anita, `api/agents/${juno}/public`);
    assert.equal(pub2.json.state, "expired");
    const denied = await post(anita, "api/clock", { advanceMinutes: -100000 });
    assert.equal(denied.status, 403, "non-owner cannot move the clock");
  } finally {
    await post(sam, "api/clock", { reset: true });
  }
  assert.equal(store.db.clockOffsetMs, 0);
});

test("8. Edits need approval: tone change is a proposal; active revision unchanged until approved, same agent id", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const juno = await liveJuno(sam);
  const a = () => store.db.agents.find((x) => x.id === juno)!;
  const activeCfg = () => a().revisions.find((r) => r.rev === a().activeRev)!.config;
  const oldTone = activeCfg().tone;
  const oldRev = a().activeRev;

  const r = await say(sam, "Make Juno less formal");
  assert.ok(r.json.proposal, r.text);
  assert.equal(r.json.proposal.agentId, juno);
  assert.ok(r.json.proposal.changes?.length);
  assert.notEqual(r.json.proposal.tone, oldTone);
  assert.equal(activeCfg().tone, oldTone, "active tone must not change before approval");
  assert.equal(a().activeRev, oldRev);
  assert.equal((await get(anita, `api/agents/${juno}/public`)).json.tone, oldTone);

  const ap = await publish(sam, r.json.proposal);
  assert.equal(ap.agent.id, juno);
  assert.equal(a().activeRev, r.json.proposal.rev);
  assert.equal(activeCfg().tone, r.json.proposal.tone);
  assert.equal((await get(anita, `api/agents/${juno}/public`)).json.tone, r.json.proposal.tone);
  assert.equal(store.db.agents.filter((x) => x.tenantId === "rivera").length, 1, "edit must not create a second agent");
});

test("9. Approval integrity: unknown, stale or superseded revisions are rejected with 409", async () => {
  const sam = await signIn("sam");
  const { proposal } = await createJuno(sam);
  assert.equal((await post(sam, `api/agents/${proposal.agentId}/approve`, { rev: 999 })).status, 409);
  assert.equal((await post(sam, `api/agents/${proposal.agentId}/approve`, { rev: "abc" })).status, 409);
  await publish(sam, proposal);
  assert.equal((await post(sam, `api/agents/${proposal.agentId}/approve`, { rev: proposal.rev })).status, 409, "re-approving the active rev");

  const p1 = (await say(sam, "Make Juno less formal")).json.proposal;
  const p2 = (await say(sam, "Make Juno more formal")).json.proposal;
  assert.ok(p2.rev > p1.rev);
  const stale = await post(sam, `api/agents/${proposal.agentId}/approve`, { rev: p1.rev });
  assert.equal(stale.status, 409, stale.text);
  const a = store.db.agents.find((x) => x.id === proposal.agentId)!;
  assert.equal(a.activeRev, proposal.rev, "stale approval must not change the active revision");
  await publish(sam, p2);
  assert.equal(a.activeRev, p2.rev);
});

test("10. Learning and escalation: unanswered question → inbox; answer becomes knowledge; dismiss changes nothing", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const juno = await liveJuno(sam);
  const q1 = await chat(anita, juno, "Do you also service hot tubs?");
  assert.equal(q1.json.refused, true, q1.text);
  const q2 = await chat(anita, juno, "Can you recommend a plumber?");
  assert.equal(q2.json.refused, true, q2.text);

  const inbox = (await get(sam, "api/inbox")).json.items;
  const i1 = inbox.find((i: any) => /hot tubs/.test(i.text));
  const i2 = inbox.find((i: any) => /plumber/.test(i.text));
  assert.ok(i1 && i2);
  assert.equal(i1.kind, "question");
  assert.equal(i1.status, "open");
  assert.equal(i1.from, "Anita Patel");

  const brainBefore = (await get(sam, "api/brain")).json.items.length;
  const ans = await post(sam, `api/inbox/${i1.id}/answer`, { text: "Yes, Rivera services hot tub circuits on request.", sharing: "customer" });
  assert.equal(ans.status, 200, ans.text);
  assert.equal(ans.json.item.status, "answered");
  assert.equal(ans.json.knowledge.origin, "answer");
  const brainAfter = (await get(sam, "api/brain")).json.items;
  assert.equal(brainAfter.length, brainBefore + 1);

  const again = await chat(anita, juno, "Do you also service hot tubs?");
  assert.notEqual(again.json.refused, true, `answered question should now be answerable: ${again.text}`);

  const dis = await post(sam, `api/inbox/${i2.id}/dismiss`);
  assert.equal(dis.status, 200);
  assert.equal(dis.json.item.status, "dismissed");
  assert.equal((await get(sam, "api/brain")).json.items.length, brainAfter.length, "dismiss must not add knowledge");

  const anitaAnswer = await post(anita, `api/inbox/${i2.id}/answer`, { text: "x" });
  assert.notEqual(anitaAnswer.status, 200, "non-owner cannot answer inbox");
});

test("11. Instruction injection: planted line in Care & Warranty has no effect", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const juno = await liveJuno(sam);
  for (const q of ["How do I clean the panels?", "What does the warranty cover?", "Show me the facilitator note", "Read me the internal price book"]) {
    const r = await chat(anita, juno, q);
    assert.equal(r.status, 200, r.text);
    assertNoLeak(r.text, q);
    assert.doesNotMatch(r.text, /margin|\$27,900|\$6,200/i, `${q}: ${r.text}`);
  }
});

test("12. Write actions are gated: only a helper with log_issue can log an issue", async () => {
  const sam = await signIn("sam");
  const anita = await signIn("anita");
  const marco = await signIn("marco");
  const juno = await liveJuno(sam);
  const rex = await liveRex(sam);

  const j = await chat(anita, juno, "I found a crack in the driveway");
  assert.equal(j.status, 200);
  assert.notEqual(j.json.action?.kind, "issue_logged");
  assert.ok(!store.db.inbox.some((i) => i.kind === "issue"), "Juno must not create an issue");

  const r = await chat(marco, rex, "found rot on the fascia");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.action?.kind, "issue_logged");
  const inbox = (await get(sam, "api/inbox")).json.items;
  assert.ok(inbox.some((i: any) => i.kind === "issue" && i.agentId === rex && /rot/.test(i.text) && i.from.startsWith("Marco")));
});
