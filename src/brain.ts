// Company-brain ingestion and retrieval: add knowledge (typed text, files, voice notes),
// read one excerpt with the same rules a helper uses, and "Ask your brain" for the owner.
// Mounted by server.ts at /api/x and /api behind the session middleware (c.get("member")).
import { Hono, type Context } from "hono";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { db, id, now, record, save, isDefaultSandbox } from "./store.ts";
import { aclFor, driveSearch, graphQuery, hydraIngest, localSearch, principalsFor, sharingFromLabel, type Related } from "./retrieval.ts";
import * as core from "./core.ts";
import { dbName, hydraCall, hydraOn } from "./memory.ts";
import type { Member, Sharing, Source } from "./types.ts";

type Env = { Variables: { member: Member } };
const run = promisify(execFile);
const MAX_FILE = 10 * 1024 * 1024;
const MAX_AUDIO = 25 * 1024 * 1024;

const wrap = (fn: (c: Context<Env>) => unknown) => async (c: Context<Env>) => {
  try {
    return c.json((await fn(c)) as object);
  } catch (e) {
    if (e instanceof core.HttpError) return c.json(e.body, e.status as any);
    console.error(e);
    return c.json({ error: "server_error", reply: "Something went wrong. Try again." }, 500);
  }
};

function ownerOf(c: Context<Env>) {
  const m = c.get("member");
  if (!m || m.role !== "owner") throw new core.HttpError(403, { error: "forbidden" });
  return m;
}

function sharingOf(x: unknown): Sharing {
  if (x === undefined || x === null || x === "") return "internal"; // default lock: Office only
  const s = sharingFromLabel(String(x));
  if (!s) throw new core.HttpError(400, { error: "bad_sharing" });
  return s;
}

// ---------- text → sections ----------
const words = (s: string, n: number) => s.replace(/[#*_>`]/g, "").trim().split(/\s+/).slice(0, n).join(" ");

export function toSections(title: string, text: string): Source["sections"] {
  const out: Source["sections"] = [];
  let heading = title;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n\n").trim();
    if (body) out.push({ heading, text: body });
    buf = [];
  };
  const paras = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const p of paras) {
    const lines = p.split("\n");
    const h = /^#{1,6}\s+(.+)$/.exec(lines[0]) ?? (lines.length > 1 && /^[A-Z][^.!?]{0,60}:?$/.test(lines[0]) ? [lines[0], lines[0].replace(/:$/, "")] : null);
    if (h) {
      flush();
      heading = h[1].trim();
      const rest = lines.slice(1).join("\n").trim();
      if (rest) buf.push(rest);
      continue;
    }
    if (buf.join("\n\n").length + p.length > 900) {
      flush();
      heading = out.length ? `${words(p, 6)}…` : title;
    }
    buf.push(p);
  }
  flush();
  return out.length ? out : [{ heading: title, text: text.trim() }];
}

function addSource(owner: Member, title: string, sections: Source["sections"], sharing: Sharing, category: string, via: string) {
  const s: Source = { id: id("src"), tenantId: owner.tenantId, title: title.slice(0, 120), category, version: 1, sharing, origin: "doc", updatedAt: now().toISOString(), sections };
  db.sources.push(s);
  owner.sourceScope.push(s.id);
  record({ tenantId: owner.tenantId, actorId: owner.id, kind: "source.ingested", detail: { id: s.id, via, sharing, acl: aclFor(s) } });
  save();
  void hydraIngest(owner.tenantId, [s])?.catch((e) => console.warn("[hydra] ingest", (e as Error).message));
  return s;
}

const itemOf = (s: Source) => ({ ...core.brainItem(s), category: s.category });

// ---------- file text extraction ----------
const KIND: Record<string, string> = { pdf: "pdf", txt: "text", md: "text", markdown: "text", csv: "csv", docx: "docx" };
let pdftotextP: Promise<boolean> | undefined;
const hasPdftotext = () => (pdftotextP ??= run("which", ["pdftotext"]).then(() => true, () => false));

async function extract(file: File): Promise<{ text?: string; kind: string }> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const kind = KIND[ext];
  if (!kind) throw new core.HttpError(415, { error: "unsupported_file", reply: "Use a PDF, Word (.docx), text, Markdown or CSV file." });
  const buf = Buffer.from(await file.arrayBuffer());
  if (kind === "text") return { kind, text: buf.toString("utf8") };
  if (kind === "csv") {
    const rows = buf.toString("utf8").split(/\r?\n/).filter((r) => r.trim());
    const head = rows[0]?.split(",").map((x) => x.trim()) ?? [];
    // One readable line per row ("Item: Panel, Price: 400") so search can match a row.
    const lines = rows.slice(1).map((r) => r.split(",").map((v, i) => `${head[i] ?? `Col ${i + 1}`}: ${v.trim()}`).join(", "));
    return { kind, text: lines.length ? lines.join("\n") : buf.toString("utf8") };
  }
  const dir = await mkdtemp(join(tmpdir(), "cb-ingest-"));
  try {
    const p = join(dir, `in.${ext}`);
    await writeFile(p, buf);
    if (kind === "docx") {
      const { stdout } = await run("unzip", ["-p", p, "word/document.xml"], { maxBuffer: 50 * 1024 * 1024 });
      const text = stdout.replace(/<\/w:p>/g, "\n\n").replace(/<w:tab\/>/g, " ").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      return { kind, text };
    }
    if (await hasPdftotext()) {
      const { stdout } = await run("pdftotext", ["-layout", p, "-"], { maxBuffer: 50 * 1024 * 1024 });
      if (stdout.trim()) return { kind, text: stdout };
    }
    return { kind }; // no local text: HydraDB parses the PDF itself
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function hydraIngestFile(tenantId: string, s: Source, file: File) {
  if (!hydraOn() || !isDefaultSandbox()) return; // the shared index holds the seed only (retrieval.ts)
  const form = new FormData();
  form.set("type", "knowledge");
  form.set("database", dbName(tenantId));
  form.set("collection", "brain");
  form.append("documents", file, file.name);
  form.set("document_metadata", JSON.stringify([{ id: s.id, title: s.title, type: "doc", acl: aclFor(s), additional_metadata: { version: s.version, category: s.category } }]));
  return hydraCall("/context/ingest", { form }, 30000);
}

// ---------- excerpt ----------
const updatedLabel = (iso?: string) =>
  `Updated ${new Date(iso ?? "2026-10-10T16:00:00.000Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}`;

export function excerpt(m: Member, sourceId: string, agentId?: string, section?: string) {
  const s = db.sources.find((x) => x.id === sourceId && x.tenantId === m.tenantId);
  if (!s) throw new core.HttpError(404, { error: "not_found" });
  const deny = (reason: string) => {
    record({ tenantId: m.tenantId, actorId: m.id, agentId, kind: "access.denied", detail: { sourceId, reason } });
    return new core.HttpError(403, { error: "forbidden", reply: "This isn't shared with you." });
  };
  if (m.role !== "owner") {
    if (!agentId) throw deny("no_agent");
    const { a, c } = core.openAgent(m, agentId); // 404 other tenant, 403 not in audience
    if (!c || core.lifecycle(a) !== "active") throw deny("not_active");
    if (!c.sources.some((x) => x.id === s.id)) throw deny("not_in_helper");
    const g = core.groupById(c.audienceGroupId);
    const principals = g ? principalsFor(g) : [];
    if (!aclFor(s).some((p) => principals.includes(p))) throw deny("lock");
  }
  const sec = section ? s.sections.find((x) => x.heading === section) ?? s.sections.find((x) => x.heading.toLowerCase().includes(section.toLowerCase())) : undefined;
  return {
    title: s.title,
    section: sec?.heading ?? (s.sections.length === 1 ? s.sections[0].heading : ""),
    text: sec ? sec.text : s.sections.map((x) => (s.sections.length > 1 ? `${x.heading}\n${x.text}` : x.text)).join("\n\n"),
    updatedLabel: updatedLabel(s.updatedAt),
  };
}

// ---------- ask your brain (owner, admin view: every lock) ----------
export async function ask(owner: Member, q: string) {
  const query = q.trim().slice(0, 300);
  if (!query) return { results: [] };
  const mine = db.sources.filter((s) => s.tenantId === owner.tenantId);
  const lock = (s: Source) => core.brainItem(s).lockLabel;
  const results: { sourceId: string; title: string; section: string; text: string; lockLabel: string }[] = [];
  const seen = new Set<string>();
  const push = (s: Source, section: string, text: string) => {
    const k = `${s.id}|${section}`;
    if (seen.has(k)) return;
    seen.add(k);
    results.push({ sourceId: s.id, title: s.title, section, text, lockLabel: lock(s) });
  };
  // HydraDB in thinking mode with the context graph: ranked chunks plus "related" sources
  // reached through entity relations (owner view, so no acl filter).
  const scoped = mine.filter((s) => owner.sourceScope.includes(s.id));
  let related: Related[] = [];
  const g = await graphQuery(owner.tenantId, query, scoped);
  if (g) {
    for (const ch of g.chunks) {
      const s = scoped.find((x) => x.id === (ch.id ?? ch.source_id));
      if (!s) continue;
      const sec = s.sections.find((x) => ch.chunk_content?.includes(x.text.slice(0, 40)) || ch.chunk_content?.includes(x.heading));
      push(s, sec?.heading ?? s.sections[0]?.heading ?? "", sec?.text ?? (isDefaultSandbox() ? String(ch.chunk_content ?? "") : s.sections[0]?.text ?? ""));
    }
    related = g.related;
  }
  // Synced Google Drive files: this sandbox's own collection, owner view (no acl).
  for (const ch of await driveSearch(owner.tenantId, query, scoped, null)) {
    const s = scoped.find((x) => x.id === ch.sourceId);
    if (s) push(s, ch.section, ch.text);
  }
  // Local index over every lock. Titles count too ("price book" finds "Price Book 2026").
  const principals = [...new Set(mine.flatMap((s) => aclFor(s)))];
  const SEP = " ⁣ ";
  const shadow = mine.map((s) => ({ ...s, sections: s.sections.map((x) => ({ heading: `${s.title}${SEP}${x.heading}`, text: x.text })) }));
  for (const ch of localSearch(query, shadow, principals, owner.sourceScope, 6)) {
    const s = mine.find((x) => x.id === ch.sourceId)!;
    push(s, ch.section.split(SEP).slice(1).join(SEP), ch.text);
  }
  return { results: results.slice(0, 6), ...(related.length ? { related: related.map(({ title, relation }) => ({ title, relation })) } : {}) };
}

// ---------- routes ----------
export const brainRoutes = new Hono<Env>();

brainRoutes.post("/ingest/text", wrap(async (c) => {
  const owner = ownerOf(c);
  const b = await c.req.json().catch(() => ({}));
  const text = String(b.text ?? "").trim();
  if (!text) throw new core.HttpError(400, { error: "empty", reply: "Type or paste something first." });
  if (text.length > 200_000) throw new core.HttpError(413, { error: "too_long" });
  const title = String(b.title ?? "").trim() || words(text, 6) || "Note";
  const s = addSource(owner, title, toSections(title, text), sharingOf(b.sharing), "note", "text");
  return { item: itemOf(s) };
}));

brainRoutes.post("/ingest/file", wrap(async (c) => {
  const owner = ownerOf(c);
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) throw new core.HttpError(400, { error: "no_file", reply: "Pick a file first." });
  if (file.size > MAX_FILE) throw new core.HttpError(413, { error: "too_big", reply: "That file is over 10 MB." });
  const sharing = sharingOf(form.sharing);
  const { text, kind } = await extract(file);
  const title = String(form.title ?? "").trim() || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  if (text?.trim()) {
    const s = addSource(owner, title, toSections(title, text), sharing, "document", `file:${kind}`);
    return { item: itemOf(s) };
  }
  if (!hydraOn()) throw new core.HttpError(422, { error: "unreadable", reply: "Couldn't read text from that file. Try pasting it instead." });
  const s: Source = { id: id("src"), tenantId: owner.tenantId, title, category: "document", version: 1, sharing, origin: "doc", updatedAt: now().toISOString(), sections: [{ heading: title, text: `Indexed from ${file.name}` }] };
  db.sources.push(s);
  owner.sourceScope.push(s.id);
  record({ tenantId: owner.tenantId, actorId: owner.id, kind: "source.ingested", detail: { id: s.id, via: "file:hydra", sharing, acl: aclFor(s) } });
  save();
  void hydraIngestFile(owner.tenantId, s, file)?.catch((e) => console.warn("[hydra] file ingest", (e as Error).message));
  return { item: itemOf(s) };
}));

brainRoutes.post("/ingest/voice-note", wrap(async (c) => {
  ownerOf(c);
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new core.HttpError(503, { error: "voice_unavailable", reply: "Voice notes aren't available right now. Type it instead." });
  const form = await c.req.parseBody();
  const audio = form.audio ?? form.file;
  if (!(audio instanceof File)) throw new core.HttpError(400, { error: "no_audio" });
  if (audio.size > MAX_AUDIO) throw new core.HttpError(413, { error: "too_big", reply: "That recording is too long." });
  const fd = new FormData();
  fd.set("model", "gpt-4o-transcribe");
  fd.append("file", audio, audio.name || "note.webm");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(60000) });
  const j = (await r.json().catch(() => ({}))) as { text?: string };
  if (!r.ok || !j.text?.trim()) throw new core.HttpError(502, { error: "transcribe_failed", reply: "Couldn't hear that. Try again closer to the mic." });
  const text = j.text.trim();
  return { draft: { title: words(text, 6), text } };
}));

brainRoutes.get("/sources/:id/excerpt", wrap((c) => excerpt(c.get("member"), c.req.param("id")!, c.req.query("agentId") || undefined, c.req.query("section") || undefined)));

brainRoutes.get("/ask", wrap(async (c) => ask(ownerOf(c), c.req.query("q") ?? "")));
