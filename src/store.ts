import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { seed, DEMO_TOKENS } from "./seed.ts";
import type { DB, EventRec } from "./types.ts";

// Every visitor gets a sandbox: a fresh copy of the seed (both companies, all seven
// identities) with its own random invite tokens, stored in data/sandboxes/<id>.json.
// A request runs inside one sandbox (AsyncLocalStorage) and `db` always means that
// sandbox's document, so nothing one visitor does reaches another. Writes are
// synchronous so a revocation is durable before the response that confirms it.
//
// The "default" sandbox is the old single document with the fixed DEMO_TOKENS. It
// exists only for tests and local dev (NODE_ENV=test or DEMO_LEGACY_TOKENS=1): those
// tokens are in the repo, so a public deployment must not honour them.

export const SANDBOX_DIR = () => process.env.SANDBOX_DIR ?? "data/sandboxes";
export const SANDBOX_TTL_MS = Number(process.env.SANDBOX_TTL_DAYS ?? 7) * 864e5;
export const SANDBOX_MAX = Number(process.env.SANDBOX_MAX ?? 500);
const PERSIST = () => process.env.NODE_ENV !== "test" || !!process.env.SANDBOX_DIR;
export const legacyTokens = () => process.env.DEMO_LEGACY_TOKENS === "1" || (process.env.NODE_ENV === "test" && process.env.DEMO_LEGACY_TOKENS !== "0");

export interface Sandbox { id: string; db: DB; persist: boolean }
const ID_RE = /^[a-f0-9]{16}$/;
const loaded = new Map<string, Sandbox>();
const als = new AsyncLocalStorage<{ sb: Sandbox }>();

function legacySeed(): DB {
  const d = seed();
  d.inviteTokens = legacyTokens() ? { ...DEMO_TOKENS } : {};
  return d;
}
const legacy: Sandbox = { id: "default", db: legacySeed(), persist: false };
// Outside any request (boot, tests calling core directly) and for a request that names
// no sandbox: the default one. In production it has no invite tokens, so nobody can sign in to it.
const current = (): Sandbox => als.getStore()?.sb ?? legacy;

export const db: DB = new Proxy({} as DB, {
  get: (_, k) => (current().db as any)[k],
  set: (_, k, v) => { (current().db as any)[k] = v; return true; },
  has: (_, k) => k in current().db,
  ownKeys: () => Reflect.ownKeys(current().db),
  getOwnPropertyDescriptor: (_, k) => ({ ...Reflect.getOwnPropertyDescriptor(current().db, k), configurable: true }),
});
export const sandboxId = () => current().id;
export const isDefaultSandbox = () => current() === legacy;

const fileOf = (id: string) => join(SANDBOX_DIR(), `${id}.json`);

export function save() {
  const sb = current();
  if (!sb.persist) return;
  mkdirSync(SANDBOX_DIR(), { recursive: true });
  writeFileSync(fileOf(sb.id), JSON.stringify(sb.db));
}

function newTokens(db: DB) {
  db.inviteTokens = Object.fromEntries(db.members.map((m) => [m.id, randomBytes(12).toString("hex")]));
}

export function createSandbox(): Sandbox {
  const id = randomBytes(8).toString("hex");
  const d = seed();
  newTokens(d);
  const sb: Sandbox = { id, db: d, persist: PERSIST() };
  loaded.set(id, sb);
  const store = als.getStore();
  if (store) store.sb = sb; // the rest of this request runs in the new sandbox
  save();
  gc();
  return sb;
}

// A sandbox by id: memory first, then its file. Expired or unknown = undefined.
export function getSandbox(id: string | undefined): Sandbox | undefined {
  if (!id) return undefined;
  if (id === "default") return legacy;
  if (!ID_RE.test(id)) return undefined;
  const hit = loaded.get(id);
  if (hit) return hit;
  if (!PERSIST()) return undefined;
  const f = fileOf(id);
  try {
    if (Date.now() - statSync(f).mtimeMs > SANDBOX_TTL_MS) return undefined;
    const sb: Sandbox = { id, db: JSON.parse(readFileSync(f, "utf8")) as DB, persist: true };
    loaded.set(id, sb);
    return sb;
  } catch { return undefined; }
}

// Invite tokens are `<sandbox id>.<random>` (legacy ones are bare). -> the sandbox and member.
export function resolveInvite(token: string): { sb: Sandbox; memberId: string } | undefined {
  const dot = token.indexOf(".");
  const sb = dot > 0 ? getSandbox(token.slice(0, dot)) : legacyTokens() ? legacy : undefined;
  const rand = dot > 0 ? token.slice(dot + 1) : token;
  if (!sb) return undefined;
  const mid = Object.entries(sb.db.inviteTokens ?? {}).find(([, t]) => t === rand)?.[0];
  return mid ? { sb, memberId: mid } : undefined;
}
export function inviteToken(memberId: string): string | undefined {
  const sb = current();
  const t = sb.db.inviteTokens?.[memberId];
  return t ? (sb === legacy ? t : `${sb.id}.${t}`) : undefined;
}

const touched = new Map<string, number>();
// Run fn inside a sandbox; a visit keeps its file fresh (mtime = last seen, at most once a minute).
export function inSandbox<T>(sb: Sandbox | undefined, fn: () => T): T {
  if (sb?.persist && (touched.get(sb.id) ?? 0) < Date.now() - 60_000) {
    touched.set(sb.id, Date.now());
    try { const t = new Date(); utimesSync(fileOf(sb.id), t, t); } catch { /* not saved yet */ }
  }
  return als.run({ sb: sb ?? legacy }, fn);
}

// Drop sandboxes unseen for SANDBOX_TTL_MS, then the least recently seen beyond SANDBOX_MAX.
export function gc(nowMs = Date.now()) {
  const dir = SANDBOX_DIR();
  let files: { id: string; seen: number }[] = [];
  try {
    files = readdirSync(dir).filter((f) => /^[a-f0-9]{16}\.json$/.test(f))
      .map((f) => ({ id: f.slice(0, 16), seen: statSync(join(dir, f)).mtimeMs }));
  } catch { /* no directory yet */ }
  const known = new Map(files.map((f) => [f.id, f.seen]));
  for (const id of loaded.keys()) if (!known.has(id)) known.set(id, Date.now()); // in-memory only (tests)
  const all = [...known].map(([id, seen]) => ({ id, seen })).sort((a, b) => b.seen - a.seen);
  const drop = all.filter((x, i) => nowMs - x.seen > SANDBOX_TTL_MS || i >= SANDBOX_MAX);
  for (const x of drop) {
    loaded.delete(x.id);
    touched.delete(x.id);
    try { unlinkSync(join(dir, `${x.id}.json`)); } catch { /* already gone */ }
  }
  return drop.map((x) => x.id);
}

// The pre-sandbox single document is archived, never deleted.
export function archiveLegacyFile(file = process.env.DATA_FILE ?? "data/db.json") {
  if (!existsSync(file)) return;
  const to = `${file}.archived-${new Date().toISOString().slice(0, 10)}`;
  if (!existsSync(to)) renameSync(file, to);
}

// Back to the seed — the caller's own sandbox only; its invite links and sign-ins stay valid.
export function reset() {
  const sb = current();
  const keep = { inviteTokens: sb.db.inviteTokens, sessions: sb === legacy ? [] : sb.db.sessions };
  sb.db = seed();
  Object.assign(sb.db, keep);
  if (sb === legacy) sb.db.inviteTokens = legacyTokens() ? { ...DEMO_TOKENS } : {};
  save();
}

// Trusted server time. The offset exists only for the demo/test clock and is
// changed through an owner-only endpoint that is disabled unless TEST_CLOCK=1.
export function now(): Date {
  return new Date(Date.now() + db.clockOffsetMs);
}

export function record(e: Omit<EventRec, "at">) {
  db.events.push({ at: now().toISOString(), ...e });
  save();
}

export function id(prefix: string) {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

export function hashConfig(config: unknown) {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
}

