// Company-brain routes. Run: NODE_ENV=test npx tsx --test test/brain.test.ts
// Offline: no HydraDB, no OpenAI. The router is mounted in a tiny app with a fake sign-in.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
delete process.env.HYDRA_DB_API_KEY;
delete process.env.OPENAI_API_KEY;

const { Hono } = await import("hono");
const store = await import("../src/store.ts");
const { brainRoutes } = await import("../src/brain.ts");
const { detectPreference, remember, recall, forget, _clearMemory } = await import("../src/memory.ts");
import type { Agent, Member } from "../src/types.ts";

const app = new Hono<{ Variables: { member: Member } }>();
app.use("/api/*", async (c, next) => {
  const m = store.db.members.find((x) => x.id === c.req.header("x-member"));
  if (!m) return c.json({ error: "unauthenticated" }, 401);
  c.set("member", m);
  return next();
});
app.route("/api/x", brainRoutes);
app.route("/api", brainRoutes);

const req = (who: string, path: string, body?: unknown) =>
  app.request(`http://localhost/${path}`, body === undefined ? { headers: { "x-member": who } } : { method: "POST", headers: { "x-member": who, "content-type": "application/json" }, body: JSON.stringify(body) });

function addRex(sourceIds: string[], state: Agent["state"] = "active") {
  const a: Agent = {
    id: "agt_rex", tenantId: "rivera", ownerId: "sam", templateId: "crew_briefing", state, activeRev: 1,
    revisions: [{ rev: 1, createdAt: new Date().toISOString(), config: {
      job: "42 Oak St", audienceGroupId: "grp_bay_crew_oak", name: "Rex", avatar: "hardhat", tone: "direct", jobId: "job_oak42",
      sources: sourceIds.map((id) => ({ id, version: 1 })), tools: [], escalationMemberId: "sam",
      expiresAt: new Date(Date.now() + 86400_000).toISOString(), timeZone: "America/Los_Angeles" } }],
  };
  store.db.agents.push(a);
  return a;
}

beforeEach(() => { store.reset(); _clearMemory(); });

test("text ingest creates a brain item with the chosen lock", async () => {
  const r = await req("sam", "api/x/ingest/text", { title: "Gate rules", text: "# Parking\nPark on Elm St.\n\n# Gate\nCode is 1234.", sharing: "crew" });
  assert.equal(r.status, 200);
  const { item } = await r.json();
  assert.equal(item.sharing, "crew");
  assert.equal(item.origin, "doc");
  assert.equal(item.version, 1);
  const s = store.db.sources.find((x) => x.id === item.id)!;
  assert.deepEqual(s.sections.map((x) => x.heading), ["Parking", "Gate"]);
  assert.ok(store.db.members.find((m) => m.id === "sam")!.sourceScope.includes(item.id));
  // default lock is Office only; non-owners can't ingest
  const d = await (await req("sam", "api/x/ingest/text", { text: "Supplier discount is 12 percent" })).json();
  assert.equal(d.item.sharing, "internal");
  assert.equal((await req("marco", "api/x/ingest/text", { text: "hi" })).status, 403);
});

test("excerpt: owner ok; crew only via an active helper that includes it; homeowner refused", async () => {
  assert.equal((await req("sam", "api/sources/src_price_book/excerpt")).status, 200);
  // crew member, helper does not exist → 404
  assert.equal((await req("marco", "api/sources/src_site_brief_oak/excerpt?agentId=agt_rex")).status, 404);
  const rex = addRex(["src_site_brief_oak", "src_safety"]);
  const ok = await req("marco", "api/sources/src_site_brief_oak/excerpt?agentId=agt_rex&section=Access");
  assert.equal(ok.status, 200);
  const ex = await ok.json();
  assert.equal(ex.section, "Access");
  assert.match(ex.text, /4417/);
  assert.match(ex.updatedLabel, /^Updated /);
  // not in the helper's approved knowledge
  assert.equal((await req("marco", "api/sources/src_price_book/excerpt?agentId=agt_rex")).status, 403);
  // homeowner is not in Rex's audience
  assert.equal((await req("anita", "api/sources/src_site_brief_oak/excerpt?agentId=agt_rex")).status, 403);
  // relocked to Office only → refused even though the helper lists it
  store.db.sources.find((s) => s.id === "src_site_brief_oak")!.sharing = "internal";
  assert.equal((await req("marco", "api/sources/src_site_brief_oak/excerpt?agentId=agt_rex")).status, 403);
  // closed helper → refused
  store.db.sources.find((s) => s.id === "src_site_brief_oak")!.sharing = "crew";
  rex.state = "revoked";
  assert.equal((await req("marco", "api/sources/src_site_brief_oak/excerpt?agentId=agt_rex")).status, 403);
  // other company's owner can't read it
  assert.equal((await req("gail", "api/sources/src_site_brief_oak/excerpt")).status, 404);
});

test("ask finds the price book for the owner; non-owners can't ask", async () => {
  const r = await req("sam", "api/x/ask?q=" + encodeURIComponent("price book margin"));
  assert.equal(r.status, 200);
  const { results } = await r.json();
  assert.ok(results.length > 0);
  assert.equal(results[0].title, "Price Book 2026");
  assert.equal(results[0].lockLabel, "Office only");
  assert.equal(results[0].section, "Margins");
  assert.equal((await req("marco", "api/x/ask?q=price")).status, 403);
  // Gail never sees Rivera's brain
  const g = await (await req("gail", "api/x/ask?q=price%20book")).json();
  assert.ok(!g.results.some((x: any) => /Price Book/.test(x.title)));
});

test("ask finds freshly ingested knowledge", async () => {
  await req("sam", "api/x/ingest/text", { title: "Inverter supplier", text: "Our inverter supplier is Volta Supply in Fresno.", sharing: "internal" });
  const { results } = await (await req("sam", "api/x/ask?q=inverter%20supplier")).json();
  assert.equal(results[0]?.title, "Inverter supplier");
});

test("voice note needs OpenAI", async () => {
  const fd = new FormData();
  fd.append("audio", new File([new Uint8Array(10)], "n.webm", { type: "audio/webm" }));
  const r = await app.request("http://localhost/api/x/ingest/voice-note", { method: "POST", headers: { "x-member": "sam" }, body: fd });
  assert.equal(r.status, 503);
});

test("file ingest reads a text file", async () => {
  const fd = new FormData();
  fd.append("file", new File(["Roof warranty\n\nShingles carry a 25-year warranty."], "warranty.txt", { type: "text/plain" }));
  fd.append("sharing", "customer");
  const r = await app.request("http://localhost/api/x/ingest/file", { method: "POST", headers: { "x-member": "sam" }, body: fd });
  assert.equal(r.status, 200);
  const { item } = await r.json();
  assert.equal(item.sharing, "customer");
  assert.equal(item.title, "warranty");
});

test("memory: preferences are detected and kept per person", async () => {
  assert.equal(detectPreference("¿Cuál es el código de la puerta?"), "Prefers Spanish");
  assert.equal(detectPreference("keep it short please"), "Prefers short answers");
  assert.equal(detectPreference("What is the gate code?"), undefined);
  remember("rivera", "marco", "agt_rex", "¿Dónde estaciono hoy?");
  assert.deepEqual(await recall("rivera", "marco"), ["Prefers Spanish"]);
  assert.deepEqual(await recall("rivera", "tess"), []);
  await forget("rivera", "marco", "agt_rex");
  assert.deepEqual(await recall("rivera", "marco"), []);
});
