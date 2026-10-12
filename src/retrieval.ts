import type { Group, Sharing, Source } from "./types.ts";

// Retrieval runs AS THE AUDIENCE. Each source carries an access list (HydraDB `acl`)
// derived from its lock; a helper searches with its audience's principals only, so a
// locked document never comes back from the search. The app then intersects the result
// with the helper's approved source IDs (defense in depth). The local index mirrors the
// same rule and is the fallback when HydraDB is unavailable or still indexing.

export interface Chunk { sourceId: string; title: string; section: string; text: string; version: number; score: number }

const P = "group:crewbrain";

export function aclFor(s: Pick<Source, "sharing" | "jobId">): string[] {
  if (s.sharing === "internal") return ["__private__"];
  if (s.sharing === "crew") return s.jobId ? [`${P}:crew:${s.jobId}`] : [`${P}:crews`];
  return s.jobId ? [`${P}:household:${s.jobId}`, `${P}:crew:${s.jobId}`] : [`${P}:customers`, `${P}:crews`];
}

export function principalsFor(g: Pick<Group, "kind" | "jobId">): string[] {
  return g.kind === "crew" ? [`${P}:crew:${g.jobId}`, `${P}:crews`] : [`${P}:household:${g.jobId}`, `${P}:customers`];
}

function aclAllows(acl: string[], principals: string[]) {
  return acl.some((a) => a === "__public__" || principals.includes(a));
}

const STOP = new Set("the a an and or of to for is are what when where how do does can i we my our it in on at with this that be will you your me".split(" "));
const tokens = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g)?.filter((t) => !STOP.has(t)) ?? [];

// Spanish crew questions still need to hit English documents in offline mode.
const ES: Record<string, string> = { codigo: "code", puerta: "gate", estacionar: "park", estaciono: "park", basura: "dumpster", contenedor: "dumpster", seguridad: "safety", arnes: "harness", techo: "roof", perro: "dog", horario: "schedule", hoy: "today" };

export function localSearch(query: string, sources: Source[], principals: string[], allowedIds: string[], k = 4): Chunk[] {
  const q = tokens(query).map((t) => ES[t] ?? t);
  const out: Chunk[] = [];
  for (const s of sources) {
    if (!allowedIds.includes(s.id) || !aclAllows(aclFor(s), principals)) continue;
    for (const sec of s.sections) {
      const body = tokens(`${sec.heading} ${sec.text}`);
      const head = tokens(sec.heading);
      let score = 0;
      for (const t of q) {
        if (body.includes(t)) score += 1;
        if (head.includes(t)) score += 1;
        if (body.some((b) => b.length > 4 && t.length > 4 && (b.startsWith(t.slice(0, 5)) || t.startsWith(b.slice(0, 5))))) score += 0.5;
      }
      if (score >= Math.min(2, q.length)) out.push({ sourceId: s.id, title: s.title, section: sec.heading, text: sec.text, version: s.version, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

// ---------------- HydraDB ----------------

const BASE = "https://api.hydradb.com";
const COLLECTION = "brain";
const key = () => process.env.HYDRA_DB_API_KEY;
const dbName = (tenantId: string) => `crewbrain_${tenantId}`;
export const hydraState: Record<string, "off" | "starting" | "indexing" | "ready" | "error"> = {};

async function hydra(path: string, init: RequestInit & { json?: unknown; form?: FormData } = {}, timeoutMs = 6000) {
  const headers: Record<string, string> = { Authorization: `Bearer ${key()}`, "API-Version": "2" };
  let body: BodyInit | undefined;
  if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  if (init.form) body = init.form;
  const r = await fetch(BASE + path, { method: init.method ?? (body ? "POST" : "GET"), headers, body, signal: AbortSignal.timeout(timeoutMs) });
  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok || j?.success === false) throw new Error(`hydra ${path} ${r.status} ${JSON.stringify(j?.error ?? j).slice(0, 200)}`);
  return j?.data ?? j;
}

function docText(s: Source) {
  return s.sections.map((x) => `## ${x.heading}\n${x.text}`).join("\n\n");
}

export async function hydraIngest(tenantId: string, sources: Source[]) {
  if (!key() || !sources.length) return;
  const form = new FormData();
  form.set("type", "knowledge");
  form.set("database", dbName(tenantId));
  form.set("collection", COLLECTION);
  form.set("app_knowledge", JSON.stringify(sources.map((s) => ({
    id: s.id, database: dbName(tenantId), collection: COLLECTION, title: s.title, type: s.origin,
    timestamp: s.updatedAt ?? new Date().toISOString(), content: { text: docText(s) },
    acl: aclFor(s), additional_metadata: { version: s.version, category: s.category },
  }))));
  return hydra("/context/ingest", { form }, 15000);
}

export async function hydraSetAcl(tenantId: string, s: Source) {
  if (!key() || hydraState[tenantId] === "off" || hydraState[tenantId] === "error") return;
  try {
    await hydra(`/context/${encodeURIComponent(s.id)}/metadata`, { method: "PATCH", json: { database: dbName(tenantId), collection: COLLECTION, acl: aclFor(s) } });
  } catch (e) { console.warn("[hydra] acl update failed", (e as Error).message); }
}

export async function hydraBoot(tenantId: string, sources: Source[]) {
  if (!key()) { hydraState[tenantId] = "off"; return; }
  hydraState[tenantId] = "starting";
  try {
    try { await hydra("/databases", { json: { database: dbName(tenantId) } }, 15000); } catch (e) { if (!/exist|409|already/i.test(String(e))) console.warn("[hydra] create", String(e)); }
    for (let i = 0; i < 40; i++) {
      const st = await hydra(`/databases/status?database=${dbName(tenantId)}`).catch(() => null);
      if (st?.infra?.ready_for_ingestion) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    const ids = sources.map((s) => s.id).join(",");
    const statusOf = async () => ((await hydra(`/context/status?database=${dbName(tenantId)}&collection=${COLLECTION}&ids=${encodeURIComponent(ids)}`).catch(() => null))?.statuses ?? []) as any[];
    const known = new Set((await statusOf()).filter((x) => x.indexing_status && x.indexing_status !== "errored" && x.success !== false).map((x) => x.id));
    const missing = sources.filter((s) => !known.has(s.id));
    if (missing.length) await hydraIngest(tenantId, missing); // re-ingesting queued items would reset their place
    hydraState[tenantId] = "indexing";
    for (let i = 0; i < 480; i++) {
      const list = await statusOf();
      if (list.length && list.every((x) => ["completed", "graph_creation"].includes(x.indexing_status))) { hydraState[tenantId] = "ready"; break; }
      if (list.some((x) => x.indexing_status === "errored")) console.warn("[hydra] indexing errored", JSON.stringify(list).slice(0, 300));
      await new Promise((r) => setTimeout(r, 15000));
    }
    console.log(`[hydra] ${tenantId}: ${hydraState[tenantId]}`);
  } catch (e) {
    hydraState[tenantId] = "error";
    console.warn("[hydra] boot failed", (e as Error).message);
  }
}

export async function search(tenantId: string, query: string, sources: Source[], principals: string[], allowedIds: string[]): Promise<{ chunks: Chunk[]; engine: "hydradb" | "local" }> {
  const allowed = sources.filter((s) => allowedIds.includes(s.id));
  if (key() && hydraState[tenantId] === "ready") {
    try {
      const d = await hydra("/query", { json: { database: dbName(tenantId), collection: COLLECTION, query, type: "knowledge", query_by: "hybrid", mode: "fast", max_results: 8, graph_context: false, acl: principals } }, 5000);
      const chunks: Chunk[] = [];
      for (const c of d?.chunks ?? []) {
        const src = allowed.find((s) => s.id === (c.id ?? c.source_id)); // second check: approved scope + current lock
        if (!src || !aclAllows(aclFor(src), principals)) continue;
        chunks.push({ sourceId: src.id, title: src.title, section: sectionOf(src, c.chunk_content), text: c.chunk_content, version: src.version, score: c.relevancy_score ?? 0 });
      }
      if (chunks.length) return { chunks: chunks.slice(0, 4), engine: "hydradb" };
    } catch (e) { console.warn("[hydra] query failed, using local", (e as Error).message); }
  }
  return { chunks: localSearch(query, sources, principals, allowedIds), engine: "local" };
}

function sectionOf(s: Source, text: string) {
  return s.sections.find((x) => text?.includes(x.text.slice(0, 40)) || text?.includes(x.heading))?.heading ?? s.sections[0]?.heading ?? "";
}

export function sharingFromLabel(x: string): Sharing | undefined {
  return (["internal", "crew", "customer"] as const).find((s) => s === x);
}
