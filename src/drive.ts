// Google Drive → company brain, through a HydraDB connector with permission capture.
//
// Flow (owner only, real workspaces only):
//   connect  → Google OAuth (authorization code, offline, drive.readonly; `state` bound to the
//              owner's session + sandbox), or the admin path: a refresh token already stored in
//              the Keychain by scripts/connect-drive.mjs (GOOGLE_DRIVE_REFRESH_TOKEN)
//   create   → POST /connectors (google_drive; credentials per its credential_schema:
//              client_id, client_secret, refresh_token) into crewbrain_<tenant> / drive_<sandbox>
//   discover → GET /connectors/{id}/discover: the owner picks ONE folder
//   configure→ POST /connectors/{id}/configure with a resource rule acl = Office only, so nothing
//              reaches a helper until the owner relabels. Per-file Drive sharing captured by
//              HydraDB still wins for that file (their docs); our own second check (local lock)
//              still applies on top for helpers.
//   status   → GET /connectors/{id}/status until lifecycle "active"; then POST /context/list
//              mirrors each synced file as a light local Source (id, title, lock, connectorId).
//
// Isolation: everything is stored in the sandbox's own `db.drive[tenantId]`, the HydraDB
// collection is `drive_<sandboxId>`, and the refresh token is never stored by us (HydraDB holds it).
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { createHash, randomBytes } from "node:crypto";
import { db, now, record, save, sandboxId } from "./store.ts";
import { aclFor } from "./retrieval.ts";
import { dbName, hydraCall } from "./memory.ts";
import * as core from "./core.ts";
import type { DriveConn, Member, Source } from "./types.ts";

type Env = { Variables: { member: Member } };

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const REDIRECT_DEFAULT = "https://macmini.tail435588.ts.net:10000/crewbrain/oauth/google/callback";
export const redirectUri = () => process.env.GOOGLE_OAUTH_REDIRECT_URI || REDIRECT_DEFAULT;
export const driveCollection = (sb = sandboxId()) => `drive_${sb}`;
/** The resource rule every new folder gets: our "Office only" principal. */
export const OFFICE_ONLY = aclFor({ sharing: "internal" });
export const DEMO_MESSAGE = "Available in your own CrewBrain workspace";
export const SHARING_NOTE = "Files shared with anyone or with a customer in Drive keep that sharing. Everything else in the folder starts as Office only: no helper uses a file until you relabel it.";

const client = () => ({ id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "", secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "" });
const hasHydra = () => !!process.env.HYDRA_DB_API_KEY;

// ---------- who may connect ----------
/** Real external data only outside the public demo: ALLOW_REAL_CONNECTORS=1 AND an owner flag
 *  (the member's `realConnectors`, or this sandbox listed in REAL_CONNECTOR_SANDBOXES). */
export function availability(owner: Member): { ok: true } | { ok: false; reason: "demo" | "not_configured"; message: string } {
  if (owner.role !== "owner") throw new core.HttpError(403, { error: "forbidden" });
  const flagged = owner.realConnectors === true || (process.env.REAL_CONNECTOR_SANDBOXES ?? "").split(",").map((x) => x.trim()).filter(Boolean).includes(sandboxId());
  if (process.env.ALLOW_REAL_CONNECTORS !== "1" || !flagged) return { ok: false, reason: "demo", message: DEMO_MESSAGE };
  const c = client();
  if (!c.id || !c.secret || !hasHydra()) return { ok: false, reason: "not_configured", message: "Google Drive isn't set up on this server yet. See docs/DRIVE.md." };
  return { ok: true };
}
function requireAvailable(owner: Member) {
  const a = availability(owner);
  if (!a.ok) throw new core.HttpError(403, { error: a.reason === "demo" ? "connectors_disabled" : "drive_not_configured", reply: a.message });
}

// ---------- OAuth state: one use, 10 minutes, bound to session + sandbox + owner ----------
interface Pending { sandboxId: string; tenantId: string; memberId: string; session: string; exp: number }
const pending = new Map<string, Pending>();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function authUrl(owner: Member, sessionToken: string): string {
  requireAvailable(owner);
  for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
  const state = randomBytes(24).toString("base64url");
  pending.set(state, { sandboxId: sandboxId(), tenantId: owner.tenantId, memberId: owner.id, session: hash(sessionToken), exp: Date.now() + 10 * 60_000 });
  const q = new URLSearchParams({
    client_id: client().id, redirect_uri: redirectUri(), response_type: "code", scope: DRIVE_SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${GOOGLE_AUTH}?${q}`;
}

/** Consumes `state` (one use) and checks it against the callback's session and sandbox. */
export function checkState(state: string | undefined, sessionToken: string | undefined): Pending | undefined {
  if (!state) return undefined;
  const p = pending.get(state);
  pending.delete(state);
  if (!p || p.exp < Date.now() || !sessionToken) return undefined;
  if (p.sandboxId !== sandboxId() || p.session !== hash(sessionToken)) return undefined;
  const s = db.sessions.find((x) => x.token === sessionToken);
  if (!s || s.memberId !== p.memberId || s.tenantId !== p.tenantId) return undefined;
  return p;
}

export async function exchangeCode(code: string): Promise<string> {
  const c = client();
  const r = await fetch(GOOGLE_TOKEN, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { refresh_token?: string; error?: string };
  if (!r.ok || !j.refresh_token) throw new core.HttpError(502, { error: "google_exchange_failed", reply: "Google didn't give CrewBrain offline access. Try connecting again." });
  return j.refresh_token;
}

// ---------- HydraDB connector ----------
/** Create the connector with the refresh token (never stored on our side) and discover folders. */
export async function connectWithRefreshToken(owner: Member, refreshToken: string): Promise<DriveConn> {
  requireAvailable(owner);
  const database = dbName(owner.tenantId), collection = driveCollection();
  try { await hydraCall("/databases", { json: { database } }, 15000); } catch (e) { if (!/exist|409|already/i.test(String(e))) console.warn("[drive] database", String(e).slice(0, 200)); }
  const c = client();
  const made = await hydraCall("/connectors", { json: {
    provider: "google_drive", name: `crewbrain-${sandboxId()}-${owner.tenantId}`, database, collection,
    provider_account_scope: `crewbrain_${sandboxId()}_${owner.tenantId}`,
    credentials: { client_id: c.id, client_secret: c.secret, refresh_token: refreshToken },
  } }, 15000);
  const connectorId = String(made?.connector_id ?? "");
  if (!connectorId) throw new core.HttpError(502, { error: "connector_failed", reply: "HydraDB didn't create the Drive connection. Try again." });
  const found = await hydraCall(`/connectors/${encodeURIComponent(connectorId)}/discover`, {}, 20000);
  const folders = ((found?.resources ?? []) as any[]).map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), resource_type: String(r.resource_type ?? "folder") }));
  const conn: DriveConn = { connectorId, collection, state: "picking", folders, connectedBy: owner.id, connectedAt: now().toISOString() };
  (db.drive ??= {})[owner.tenantId] = conn;
  record({ tenantId: owner.tenantId, actorId: owner.id, kind: "drive.connected", detail: { connectorId, collection, folders: folders.length } });
  save();
  return conn;
}

/** Start connecting: the admin path (a stored refresh token) or the Google consent URL. */
export async function startConnect(owner: Member, sessionToken: string): Promise<{ url?: string; drive?: ReturnType<typeof view> }> {
  requireAvailable(owner);
  const stored = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (stored) { await connectWithRefreshToken(owner, stored); return { drive: view(owner) }; }
  return { url: authUrl(owner, sessionToken) };
}

export async function pickFolder(owner: Member, folderId: string) {
  requireAvailable(owner);
  const conn = db.drive?.[owner.tenantId];
  if (!conn) throw new core.HttpError(409, { error: "not_connected", reply: "Connect Google Drive first." });
  const f = conn.folders.find((x) => x.id === folderId);
  if (!f) throw new core.HttpError(400, { error: "unknown_folder", reply: "Pick one of your Drive folders." });
  await hydraCall(`/connectors/${encodeURIComponent(conn.connectorId)}/configure`, { json: {
    resources: [{ resource_id: f.id, resource_type: f.resource_type, name: f.name, acl: OFFICE_ONLY, additional_metadata: { crewbrain_sandbox: sandboxId(), crewbrain_tenant: owner.tenantId } }],
  } }, 20000);
  Object.assign(conn, { folder: f, state: "syncing", error: undefined });
  record({ tenantId: owner.tenantId, actorId: owner.id, kind: "drive.folder", detail: { connectorId: conn.connectorId, folder: f.id, acl: OFFICE_ONLY } });
  save();
  return view(owner);
}

/** Poll status; once active, mirror the synced files as local Office-only records. */
export async function refresh(owner: Member, minIntervalMs = 10_000) {
  const conn = db.drive?.[owner.tenantId];
  if (!conn || conn.state === "picking" || !hasHydra()) return;
  if (conn.checkedAt && Date.now() - Date.parse(conn.checkedAt) < minIntervalMs) return;
  conn.checkedAt = new Date().toISOString();
  try {
    const st = await hydraCall(`/connectors/${encodeURIComponent(conn.connectorId)}/status`, {}, 10000);
    const res = ((st?.resources ?? []) as any[]).find((r) => !conn.folder || r.resource_id === conn.folder.id);
    conn.aclWarning = res?.acl_warning || undefined;
    if (st?.status === "failed") { conn.state = "error"; conn.error = st?.error?.action ?? st?.error?.message ?? "Drive stopped syncing. Connect it again."; }
    else if (st?.lifecycle === "active") { conn.state = "active"; conn.error = undefined; await syncFiles(owner, conn); }
    else conn.state = "syncing";
  } catch (e) { console.warn("[drive] status", (e as Error).message); }
  save();
}

async function syncFiles(owner: Member, conn: DriveConn) {
  const listed: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const d = await hydraCall("/context/list", { json: {
      database: dbName(owner.tenantId), collection: conn.collection, type: "knowledge", page, page_size: 100,
      filters: { additional_metadata: { connector_id: conn.connectorId } }, include_fields: ["title", "timestamp", "additional_metadata"],
    } }, 10000);
    listed.push(...(d?.sources ?? []));
    if (!d?.pagination?.has_next) break;
  }
  const seen = new Set<string>();
  for (const x of listed) {
    const id = String(x.id ?? "");
    if (!id) continue;
    seen.add(id);
    const am = x.additional_metadata ?? {};
    const title = String(x.title || am.title || "Drive file").slice(0, 120);
    let s = db.sources.find((y) => y.id === id && y.tenantId === owner.tenantId);
    if (s && s.connectorId !== conn.connectorId) continue; // never take over another record
    if (!s) {
      s = { id, tenantId: owner.tenantId, title, category: "drive_file", version: 1, sharing: "internal", origin: "drive", connectorId: conn.connectorId,
        updatedAt: x.timestamp ?? now().toISOString(), sections: [{ heading: title, text: `Synced from Google Drive (${conn.folder?.name ?? "folder"}). Its text is searched in your brain.` }] };
      db.sources.push(s);
      if (!owner.sourceScope.includes(id)) owner.sourceScope.push(id);
      record({ tenantId: owner.tenantId, actorId: owner.id, kind: "source.ingested", detail: { id, via: "drive", sharing: "internal", acl: aclFor(s) } });
    } else {
      s.title = title;
      if (x.timestamp) s.updatedAt = x.timestamp;
    }
    s.aclWarning = am.acl_warning ? String(am.acl_warning) : undefined;
    if (am.url) s.driveUrl = String(am.url);
  }
  // Files no longer in the folder leave the brain (and every helper's scope with them).
  db.sources = db.sources.filter((s) => !(s.tenantId === owner.tenantId && s.connectorId === conn.connectorId && !seen.has(s.id)));
}

export function view(owner: Member) {
  const a = availability(owner);
  const conn = db.drive?.[owner.tenantId];
  const files = conn ? db.sources.filter((s) => s.tenantId === owner.tenantId && s.connectorId === conn.connectorId) : [];
  return {
    available: a.ok, ...(a.ok ? {} : { message: a.message }), note: SHARING_NOTE,
    ...(conn ? { connection: {
      state: conn.state, folder: conn.folder?.name, files: files.length, ...(conn.aclWarning ? { aclWarning: conn.aclWarning } : {}),
      ...(conn.error ? { error: conn.error } : {}), ...(conn.state === "picking" ? { folders: conn.folders } : {}),
    } } : {}),
  };
}

// ---------- routes ----------
const ownerOf = (c: Context<Env>) => {
  const m = c.get("member");
  if (!m || m.role !== "owner") throw new core.HttpError(403, { error: "forbidden" });
  return m;
};
const wrap = (fn: (c: Context<Env>) => unknown) => async (c: Context<Env>) => {
  try { return c.json((await fn(c)) as object); } catch (e) {
    if (e instanceof core.HttpError) return c.json(e.body, e.status as any);
    console.error("[drive]", (e as Error).message);
    return c.json({ error: "server_error", reply: "Google Drive didn't answer. Try again." }, 502);
  }
};

/** Mounted at /api/drive behind the session middleware. */
export const driveRoutes = new Hono<Env>();
driveRoutes.get("/", wrap(async (c) => { const o = ownerOf(c); await refresh(o); return view(o); }));
driveRoutes.post("/connect", wrap(async (c) => startConnect(ownerOf(c), getCookie(c, "cb_session") ?? "")));
driveRoutes.post("/folder", wrap(async (c) => pickFolder(ownerOf(c), String((await c.req.json().catch(() => ({}))).folderId ?? ""))));

/** Mounted at the app root: Google sends the browser back here (no /api session middleware). */
export const oauthRoutes = new Hono();
oauthRoutes.get("/oauth/google/callback", async (c) => {
  const p = checkState(c.req.query("state"), getCookie(c, "cb_session"));
  if (!p) return c.text("This Google sign-in isn't valid any more. Start again from CrewBrain.", 400);
  const owner = core.memberById(p.memberId);
  if (!owner || owner.role !== "owner") return c.text("Forbidden", 403);
  if (c.req.query("error") || !c.req.query("code")) return c.redirect("../../?drive=cancelled#brain");
  try {
    await connectWithRefreshToken(owner, await exchangeCode(c.req.query("code")!));
  } catch (e) {
    console.warn("[drive] connect failed", (e as Error).message);
    return c.redirect("../../?drive=failed#brain");
  }
  return c.redirect("../../?drive=pick#brain");
});

/** Test hook. */
export function _pendingStates() { return pending; }
