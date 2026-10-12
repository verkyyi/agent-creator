// Per-person memory. Each member gets their own HydraDB memory collection (`mem_<memberId>`)
// inside their company's database, so one person's preferences never reach another person.
// A module-level mirror keeps it working offline and in tests (not persisted; fine for the demo).

const BASE = "https://api.hydradb.com";
const key = () => process.env.HYDRA_DB_API_KEY;
export const dbName = (tenantId: string) => `crewbrain_${tenantId}`;
const coll = (memberId: string) => `mem_${memberId}`;

export async function hydraCall(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}, timeoutMs = 6000) {
  const headers: Record<string, string> = { Authorization: `Bearer ${key()}`, "API-Version": "2" };
  let body: BodyInit | undefined;
  if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  if (init.form) body = init.form;
  const r = await fetch(BASE + path, { method: init.method ?? (body ? "POST" : "GET"), headers, body, signal: AbortSignal.timeout(timeoutMs) });
  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok || j?.success === false) throw new Error(`hydra ${path} ${r.status} ${JSON.stringify(j?.error ?? j).slice(0, 200)}`);
  return j?.data ?? j;
}
export const hydraOn = () => !!key();

interface Mem { id: string; agentId: string; text: string; at: string; hydraId?: string }
const mirror = new Map<string, Mem[]>(); // key: tenantId/memberId

const k = (t: string, m: string) => `${t}/${m}`;
let seq = 0;

export function remember(tenantId: string, memberId: string, agentId: string, text: string) {
  const t = text.trim().slice(0, 2000);
  if (!t) return;
  const list = mirror.get(k(tenantId, memberId)) ?? [];
  const pref = detectPreference(t);
  const mem: Mem = { id: `mem_${memberId}_${agentId}_${Date.now().toString(36)}${(seq++).toString(36)}`, agentId, text: pref ?? t, at: new Date().toISOString() };
  // Locally keep only distilled preferences, de-duplicated, so recall() stays small.
  if (pref && !list.some((x) => x.text === pref)) list.push(mem);
  mirror.set(k(tenantId, memberId), list.slice(-20));
  if (!key()) return;
  const form = new FormData();
  form.set("type", "memory");
  form.set("database", dbName(tenantId));
  form.set("collection", coll(memberId));
  form.set("memories", JSON.stringify([{ id: mem.id, text: t, infer: true, metadata: { agent_id: agentId }, custom_instructions: "Extract only how this person likes answers: language, length, format, and recurring needs." }]));
  void hydraCall("/context/ingest", { form }, 10000)
    .then((d) => { mem.hydraId = d?.results?.[0]?.id ?? mem.id; })
    .catch((e) => console.warn("[memory] ingest", (e as Error).message));
}

export async function recall(tenantId: string, memberId: string): Promise<string[]> {
  const local = (mirror.get(k(tenantId, memberId)) ?? []).map((m) => m.text);
  if (!key()) return local;
  try {
    const d = await hydraCall("/query", { json: { database: dbName(tenantId), collection: coll(memberId), query: "How does this person like answers? Language, length, preferences.", type: "memory", max_results: 5 } }, 4000);
    const got = ((d?.chunks ?? []) as any[]).map((c) => String(c.chunk_content ?? "").trim()).filter(Boolean);
    return [...new Set([...local, ...got])].slice(0, 6);
  } catch (e) {
    console.warn("[memory] recall", (e as Error).message);
    return local;
  }
}

export async function forget(tenantId: string, memberId: string, agentId: string) {
  const list = mirror.get(k(tenantId, memberId)) ?? [];
  const gone = list.filter((m) => m.agentId === agentId);
  mirror.set(k(tenantId, memberId), list.filter((m) => m.agentId !== agentId));
  if (!key() || !gone.length) return;
  try {
    await hydraCall("/context", { method: "DELETE", json: { database: dbName(tenantId), collection: coll(memberId), ids: gone.map((m) => m.hydraId ?? m.id), type: "memory" } });
  } catch (e) { console.warn("[memory] forget", (e as Error).message); }
}

/** Forget every member's memories made through one helper (call when the helper is closed). */
export async function forgetAgent(tenantId: string, agentId: string) {
  const ids = [...mirror.keys()].filter((x) => x.startsWith(`${tenantId}/`)).map((x) => x.slice(tenantId.length + 1));
  await Promise.all(ids.map((mid) => forget(tenantId, mid, agentId)));
}

const SPANISH = /[¿¡ñ]|\b(el|la|los|las|que|qué|dónde|donde|cómo|como|cuál|cuando|cuándo|por favor|gracias|hoy|está|estoy|necesito|puedo|hay|para|código|codigo|puerta|techo|basura)\b/gi;

/** A plain-words preference from one message, or undefined. */
export function detectPreference(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\b(in|en) (spanish|español)\b|habla(s)? español|en español/.test(t)) return "Prefers Spanish";
  if ((text.match(SPANISH) ?? []).length >= 2) return "Prefers Spanish";
  if (/\b(keep it|be) (short|brief)\b|\bshort(er)? answers?\b|\btl;?dr\b|\bjust the (answer|facts)\b|\bfewer words\b/.test(t)) return "Prefers short answers";
  if (/\bmore detail|\bexplain (it )?(fully|in detail)|\bstep[- ]by[- ]step\b/.test(t)) return "Prefers step-by-step detail";
  if (/\b(text|message) me\b|\bdon'?t call\b/.test(t)) return "Prefers text over calls";
  if (/\b(call me|phone me)\b/.test(t)) return "Prefers a phone call";
  if (/\b(mornings?|before \d+ ?am)\b.*\b(best|works|prefer)\b|\bprefer mornings?\b/.test(t)) return "Prefers mornings";
  return undefined;
}

/** Test hook. */
export function _clearMemory() { mirror.clear(); }
