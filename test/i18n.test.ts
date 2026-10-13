// Any-language replies and UI tables. Run: NODE_ENV=test npx tsx --test test/i18n.test.ts
// Offline: no network; only seeded (Spanish) translations exist, everything else stays English.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
process.env.I18N_DIR = mkdtempSync(join(tmpdir(), "cb-i18n-"));
delete process.env.HYDRA_DB_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const store = await import("../src/store.ts");
const { buildApp } = await import("../src/server.ts");
const { DEMO_TOKENS } = await import("../src/seed.ts");
const { localize, detectLang, sameShape } = await import("../src/i18n.ts");
const { EN, ES } = await import("../public/strings.js" as string) as { EN: Record<string, unknown>; ES: Record<string, unknown> };

const app = buildApp();
const BASE = "http://localhost";
type Session = { cookie: string };
async function signIn(name: string): Promise<Session> {
  const r = await app.request(`${BASE}/i/${DEMO_TOKENS[name as keyof typeof DEMO_TOKENS]}`);
  const m = /cb_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  assert.ok(m, `no cb_session for ${name}`);
  return { cookie: `cb_session=${m![1]}` };
}
const get = (s: Session, path: string) => app.request(`${BASE}/${path}`, { headers: { cookie: s.cookie } });
const post = (s: Session, path: string, body: unknown) =>
  app.request(`${BASE}/${path}`, { method: "POST", headers: { cookie: s.cookie, "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => { store.reset(); });

test("localize: seeded Spanish offline, from the user's words or the client's pick", async () => {
  const en = "That's not something I can see. I've passed your question to {owner}.";
  assert.equal(await localize(en, { userText: "¿Cuál es el código del portón?", vars: { owner: "Sam" } }), "Eso no lo puedo ver. Le pasé tu pregunta a Sam.");
  assert.equal(await localize(en, { userText: "gate code", lang: "es-MX", vars: { owner: "Sam" } }), "Eso no lo puedo ver. Le pasé tu pregunta a Sam.");
});

test("localize: English passthrough; unseeded languages fall back to English offline", async () => {
  const en = "I've sent your update to {owner} to approve.";
  assert.equal(await localize(en, { userText: "Tell the homeowners we arrive at 8", vars: { owner: "Sam" } }), "I've sent your update to Sam to approve.");
  assert.equal(await localize(en, { userText: "Báo cho chủ nhà biết chúng tôi đến lúc 8 giờ", vars: { owner: "Sam" } }), "I've sent your update to Sam to approve.");
  assert.equal(await localize(en, { lang: "auto", vars: { owner: "Sam" } }), "I've sent your update to Sam to approve.");
});

test("detectLang: scripts, diacritics and common words", () => {
  assert.equal(detectLang("What's the gate code?"), "en");
  assert.equal(detectLang("¿Dónde nos estacionamos?"), "es");
  assert.equal(detectLang("大门密码是多少？"), "zh");
  assert.equal(detectLang("門のコードは何ですか"), "ja");
  assert.equal(detectLang("게이트 코드가 뭐예요?"), "ko");
  assert.equal(detectLang("Какой код ворот?"), "ru");
  assert.equal(detectLang("ما هو رمز البوابة؟"), "ar");
  assert.equal(detectLang("Mã cổng là gì?"), "vi");
  assert.equal(detectLang("Où est-ce que nous garons la voiture demain?"), "fr");
});

test("chat: a Spanish question that escalates gets the seeded Spanish refusal", async () => {
  const sam = await signIn("sam");
  const r = await (await post(sam, "api/creator/message", { text: "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm" })).json() as any;
  await post(sam, `api/agents/${r.proposal.agentId}/approve`, { rev: r.proposal.rev });
  const marco = await signIn("marco");
  const out = await (await post(marco, `api/agents/${r.proposal.agentId}/chat`, { text: "¿Cuál es el salario del dueño en la empresa?" })).json() as any;
  if (out.refused) assert.match(out.reply, /^Eso no lo puedo ver\. Le pasé tu pregunta a \w+\.$/);
  const en = await (await post(marco, `api/agents/${r.proposal.agentId}/chat`, { text: "What is the owner's salary at the company?" })).json() as any;
  if (en.refused) assert.match(en.reply, /^That's not something I can see\./);
});

test("api/i18n/es returns the full key set", async () => {
  const s = await signIn("marco");
  const r = await get(s, "api/i18n/es");
  assert.equal(r.status, 200);
  const j = await r.json() as any;
  assert.equal(j.lang, "es");
  assert.ok(sameShape(EN, j.strings), "same keys and shape as English");
  assert.deepEqual(j.strings, ES);
});

test("api/i18n/es carries the owner UI section (v2 table)", async () => {
  const s = await signIn("sam");
  const j = await (await get(s, "api/i18n/es")).json() as any;
  assert.equal(j.version, 2);
  const own = j.strings.owner, enOwn = (EN as any).owner;
  assert.ok(own && typeof own === "object", "owner section present");
  assert.ok(Object.keys(enOwn).length >= 5, "owner section is substantial");
  assert.ok(sameShape(enOwn, own), "owner keys match English");
  assert.notEqual(own.create.title, enOwn.create.title, "owner strings are Spanish");
  assert.ok(Array.isArray(own.create.suggestions) && own.create.suggestions.length === enOwn.create.suggestions.length);
});

test("api/i18n: a v1 cache file (no owner section) is ignored; a v2 file is served", async () => {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(process.env.I18N_DIR!, { recursive: true });
  const { owner: _o, ...v1 } = EN as any;
  writeFileSync(join(process.env.I18N_DIR!, "fr.json"), JSON.stringify(v1));
  const s = await signIn("sam");
  const stale = await (await get(s, "api/i18n/fr")).json() as any;
  assert.equal(stale.lang, "en", "v1 file not used");
  const v2 = JSON.parse(JSON.stringify(EN)); v2.owner.create.title = "Que vous faut-il ?";
  writeFileSync(join(process.env.I18N_DIR!, "fr.v2.json"), JSON.stringify(v2));
  const fresh = await (await get(s, "api/i18n/fr")).json() as any;
  assert.equal(fresh.lang, "fr");
  assert.equal(fresh.strings.owner.create.title, "Que vous faut-il ?");
});

test("api/me and proposals carry the company time zone for client-side dates", async () => {
  const sam = await signIn("sam");
  const me = await (await get(sam, "api/me")).json() as any;
  assert.equal(me.member.timeZone, "America/Los_Angeles");
  const r = await (await post(sam, "api/creator/message", { text: "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm" })).json() as any;
  assert.equal(r.proposal.timeZone, "America/Los_Angeles");
  assert.ok(Number.isFinite(Date.parse(r.proposal.endsAt)));
});

test("api/i18n: unknown language offline → English table with 200", async () => {
  const s = await signIn("marco");
  for (const l of ["vi", "xx-YY", "not a lang"]) {
    const r = await get(s, `api/i18n/${encodeURIComponent(l)}`);
    assert.equal(r.status, 200);
    const j = await r.json() as any;
    assert.equal(j.lang, "en");
    assert.deepEqual(j.strings, EN);
  }
});
