// The creator as a tool-using agent, with a scripted stand-in for the model
// (creator.setCreatorEngine). Proves the server keeps every guarantee whatever the model
// asks for: tools never publish/close/relabel, audiences and end times are validated,
// conversation context reaches the model, and tool handlers run in the visitor's sandbox
// even when called from outside the request's async context.
// Run: NODE_ENV=test npx tsx --test test/creator.test.ts
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "crewbrain-creator-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
process.env.DEMO_LEGACY_TOKENS = "0";
process.env.SANDBOX_DIR = join(tmp, "sandboxes");
process.env.ACCESS_LOG_DIR = join(tmp, "logs");
for (const k of ["HYDRA_DB_API_KEY", "OPENAI_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]) delete process.env[k];

const store = await import("../src/store.ts");
const creator = await import("../src/creator.ts");
const { buildApp } = await import("../src/server.ts");
const app = buildApp();
afterEach(() => creator.setCreatorEngine(null));

type Jar = Record<string, string>;
async function req(jar: Jar, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") };
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await app.request(`http://x/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const sc of r.headers.getSetCookie?.() ?? []) { const m = /^([^=]+)=([^;]*)/.exec(sc); if (m) jar[m[1]] = m[2]; }
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
}
// A fresh visitor sandbox, signed in as `who`.
async function visitor(...who: string[]) {
  const jar: Jar = {};
  const r = await req(jar, "GET", "api/demo/identities");
  const links: Record<string, string> = Object.fromEntries(r.json.identities.map((i: any) => [i.name.split(" ")[0].toLowerCase(), new URL(i.url, "http://x/").pathname.slice(1)]));
  const jars: Record<string, Jar> = {};
  for (const w of who) { const j = { ...jar }; const s = await req(j, "GET", links[w]); assert.equal(s.status, 302, s.text); jars[w] = j; }
  return jars;
}
const say = (jar: Jar, text: string) => req(jar, "POST", "api/creator/message", { text });

// Tool calls the way the SDK makes them: from a callback outside the request's async context.
type Input = import("../src/creator.ts").EngineInput;
const call = (input: Input, name: string, args: Record<string, unknown> = {}) =>
  store.inSandbox(undefined, () => input.tools.find((t) => t.name === name)!.run(args)) as Promise<any>;

async function proposeJuno(sam: Jar) {
  creator.setCreatorEngine(async (input) => {
    const ctx = await call(input, "get_context");
    const handover = ctx.jobs.find((j: any) => j.handover).handover;
    const r = await call(input, "propose_helper", { audience_group_id: "grp_patel_household", kind: "homeowner_helper", purpose: "Answers the Patels' install questions.", ends_at_iso: new Date(Date.parse(handover) + 30 * 864e5).toISOString() });
    assert.equal(r.ok, true, JSON.stringify(r));
    return "Here's Juno for the Patels. Tap Approve to publish.";
  });
  return say(sam, "Make a helper for the Patels until 30 days after handover");
}

test("propose_helper never publishes: the proposal waits for the owner's tap", async () => {
  const { sam, anita } = await visitor("sam", "anita");
  const r = await proposeJuno(sam);
  assert.equal(r.status, 200, r.text);
  const p = r.json.proposal;
  assert.ok(p, r.text);
  assert.equal(p.summary, "Answers the Patels' install questions.");
  assert.equal(r.json.agent.state, "awaiting_approval");
  assert.ok(p.knows.length > 0, "the server picked the sources");
  assert.ok(p.knows.every((k: any) => !/price|margin/i.test(k.title)), "no internal knowledge");
  // The tool ran from outside the request context, yet the helper is in this visitor's sandbox.
  assert.equal((await req(sam, "GET", "api/agents")).json.agents.find((a: any) => a.id === p.agentId)?.state, "awaiting_approval");
  assert.ok(!store.db.agents.some((a) => a.id === p.agentId), "nothing leaked into the default sandbox");
  // Not reachable until approved.
  const before = await req(anita, "POST", `api/agents/${p.agentId}/chat`, { text: "When is the inspection?" });
  assert.notEqual(before.status, 200);
  const ap = await req(sam, "POST", `api/agents/${p.agentId}/approve`, { rev: p.rev });
  assert.equal(ap.status, 200, ap.text);
  assert.equal(ap.json.agent.state, "active");
  const log = (await req(sam, "GET", "api/creator/log")).json.messages;
  assert.ok(log.some((m: any) => m.role === "creator" && m.proposal?.agentId === p.agentId), "the proposal is in the creator log");
});

test("close_helper and change_lock only return confirm cards; nothing changes until the tap", async () => {
  const { sam } = await visitor("sam");
  const p = (await proposeJuno(sam)).json.proposal;
  await req(sam, "POST", `api/agents/${p.agentId}/approve`, { rev: p.rev });
  const brain = (await req(sam, "GET", "api/brain")).json.items;
  const src = brain.find((s: any) => s.sharing === "customer");
  creator.setCreatorEngine(async (input) => {
    const c = await call(input, "close_helper", { helper: "Juno" });
    assert.equal(c.closed, false);
    const l = await call(input, "change_lock", { source: src.title, lock: "internal" });
    assert.equal(l.changed, false);
    return "Two cards are up. Tap to confirm each.";
  });
  const r = await say(sam, "Close Juno and make that guide office only");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.cards.length, 2);
  assert.equal(r.json.card.type, "confirm");
  assert.deepEqual(r.json.cards.map((c: any) => c.request.path), [`api/agents/${p.agentId}/close`, `api/brain/${src.id}/label`]);
  assert.equal((await req(sam, "GET", "api/agents")).json.agents.find((a: any) => a.id === p.agentId).state, "active", "still live");
  assert.equal((await req(sam, "GET", "api/brain")).json.items.find((s: any) => s.id === src.id).sharing, "customer", "lock unchanged");
});

test("propose_helper rejects an unknown audience, a wrong kind and a past or unreadable end time", async () => {
  const { sam } = await visitor("sam");
  const errors: string[] = [];
  creator.setCreatorEngine(async (input) => {
    const future = new Date(Date.now() + 5 * 864e5).toISOString();
    for (const args of [
      { audience_group_id: "grp_globex_crew", kind: "crew_briefing", purpose: "x", ends_at_iso: future },
      { audience_group_id: "grp_bay_crew_oak", kind: "homeowner_helper", purpose: "x", ends_at_iso: future },
      { audience_group_id: "grp_patel_household", kind: "homeowner_helper", purpose: "x", ends_at_iso: "2020-01-01T00:00:00Z" },
      { audience_group_id: "grp_patel_household", kind: "homeowner_helper", purpose: "x", ends_text: "whenever" },
      { audience_group_id: "grp_patel_household", kind: "homeowner_helper", purpose: "x" },
    ]) errors.push((await call(input, "propose_helper", args)).error);
    return "When should it end?";
  });
  const r = await say(sam, "Make a helper");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.proposal, undefined);
  assert.equal(errors.length, 5);
  assert.ok(errors.every(Boolean), JSON.stringify(errors));
  assert.match(errors[0], /unknown audience/);
  assert.match(errors[1], /crew_briefing/);
  assert.match(errors[2], /past/);
  assert.equal((await req(sam, "GET", "api/agents")).json.agents.length, 0, "no helper was created");
});

test("Chinese multi-turn: asks the end time, then proposes from the conversation context", async () => {
  const { sam } = await visitor("sam");
  const seen: Input[] = [];
  creator.setCreatorEngine(async (input) => {
    seen.push(input);
    if (input.message === "给屋主建个助手") {
      const ctx = await call(input, "get_context");
      assert.ok(ctx.audiences.some((a: any) => a.audience_group_id === "grp_patel_household" && a.members === 2));
      return "好的，给 Patel 一家。这个助手什么时候结束？";
    }
    // Second turn: the model only knows who it is for from the history.
    assert.ok(input.history.some((h) => h.role === "user" && h.content === "给屋主建个助手"), "history reaches the model");
    assert.ok(input.history.some((h) => h.role === "assistant" && /什么时候结束/.test(h.content)));
    const ctx = await call(input, "get_context");
    const handover = Date.parse(ctx.jobs.find((j: any) => j.handover).handover);
    const r = await call(input, "propose_helper", { audience_group_id: "grp_patel_household", kind: "homeowner_helper", purpose: "回答 Patel 一家关于安装的问题。", ends_at_iso: new Date(handover + 30 * 864e5).toISOString() });
    assert.equal(r.state, "awaiting_approval");
    return "Juno 准备好了，交房后 30 天结束。点“批准”就发布。";
  });
  const r1 = await say(sam, "给屋主建个助手");
  assert.equal(r1.json.reply, "好的，给 Patel 一家。这个助手什么时候结束？");
  assert.equal(r1.json.proposal, undefined);
  const r2 = await say(sam, "交房后30天");
  assert.equal(r2.status, 200, r2.text);
  assert.equal(r2.json.reply, "Juno 准备好了，交房后 30 天结束。点“批准”就发布。", "a model reply is not re-translated");
  assert.equal(r2.json.proposal.summary, "回答 Patel 一家关于安装的问题。");
  assert.equal(r2.json.proposal.audience.groupId, "grp_patel_household");
  assert.match(r2.json.proposal.endsLabel, /Nov 22/);
  assert.equal(seen.length, 2);
  assert.match(seen[1].system, /Rivera Solar/);
  const log = (await req(sam, "GET", "api/creator/log")).json.messages;
  assert.deepEqual(log.map((m: any) => m.role), ["owner", "creator", "owner", "creator"]);
});

test("draft_reply returns a draft only; remember_note a knowledge draft; a relay can't be replied to", async () => {
  const { sam } = await visitor("sam");
  creator.setCreatorEngine(async (input) => {
    const bad = await call(input, "draft_reply", { inbox_id: "inb_nope", text: "hi" });
    assert.ok(bad.error);
    const n = await call(input, "remember_note", { text: "门禁密码每周一更换", lock: "crew" });
    assert.equal(n.saved, false);
    return "记下了，选好谁能看再保存。";
  });
  const r = await say(sam, "记住：门禁密码每周一更换，只给工人看");
  assert.equal(r.json.card.type, "knowledge_draft");
  assert.equal(r.json.card.sharing, "crew");
  assert.equal(r.json.replyDraft, undefined);
});

test("offline (no engine): the deterministic fallback still answers", async () => {
  const { sam } = await visitor("sam");
  const r = await say(sam, "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm");
  assert.ok(r.json.proposal, r.text);
  assert.equal(r.json.proposal.summary, undefined);
});
