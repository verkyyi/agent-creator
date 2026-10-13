// Google Drive → brain through a HydraDB connector. fetch is stubbed; no network.
// Run: NODE_ENV=test npx tsx --test test/drive.test.ts
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.TEST_CLOCK = "1";
process.env.HYDRA_DB_API_KEY = "dummy-test-key";
process.env.GOOGLE_OAUTH_CLIENT_ID = "cid.apps.googleusercontent.com";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "csecret";
delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
delete process.env.OPENAI_API_KEY;
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const store = await import("../src/store.ts");
const { buildApp } = await import("../src/server.ts");
const { DEMO_TOKENS } = await import("../src/seed.ts");
const drive = await import("../src/drive.ts");
const { search, principalsFor } = await import("../src/retrieval.ts");

const app = buildApp();
const BASE = "http://localhost";
type Session = { cookie: string; token: string };

async function signIn(name: string): Promise<Session> {
  const r = await app.request(`${BASE}/i/${DEMO_TOKENS[name]}`);
  const m = /cb_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  assert.ok(m, `no session for ${name}`);
  return { cookie: `cb_session=${m![1]}`, token: m![1] };
}
async function req(s: Session, path: string, body?: unknown) {
  const r = await app.request(`${BASE}/${path}`, body === undefined ? { headers: { cookie: s.cookie } } : { method: "POST", headers: { cookie: s.cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, location: r.headers.get("location") };
}

// ---- fetch stub ----
type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
let status: any = { status: "checking", lifecycle: "ingesting", resources: [] };
let listed: any[] = [];
let chunks: any[] = [];
const realFetch = globalThis.fetch;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  store.reset();
  delete store.db.drive;
  calls = [];
  status = { status: "checking", lifecycle: "ingesting", resources: [] };
  listed = [];
  chunks = [];
  process.env.ALLOW_REAL_CONNECTORS = "1";
  process.env.REAL_CONNECTOR_SANDBOXES = "default";
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    const raw = init.body;
    const body = typeof raw === "string" ? (raw.startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw))) : raw instanceof URLSearchParams ? Object.fromEntries(raw) : undefined;
    const method = init.method ?? "GET";
    calls.push({ url, method, body });
    const p = new URL(url).pathname;
    if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "at", refresh_token: "rt-secret", expires_in: 3600 });
    if (p === "/databases") return json({ success: false, error: { message: "already exists" } }, 409);
    if (p === "/connectors" && method === "POST") return json({ connector_id: "conn_1", lifecycle: "pending_setup" });
    if (p.endsWith("/discover")) return json({ provider: "google_drive", resources: [{ id: "fold_jobs", name: "Jobs", resource_type: "folder" }, { id: "fold_hr", name: "HR", resource_type: "folder" }] });
    if (p.endsWith("/configure")) return json({ connector_id: "conn_1", configured: 1 });
    if (p.endsWith("/status")) return json(status);
    if (p === "/context/list") return json({ success: true, data: { sources: listed, pagination: { has_next: false } } });
    if (p.startsWith("/context/") && p.endsWith("/metadata")) return json({ success: true, data: { acl_updated: true } });
    if (p === "/query") return json({ success: true, data: { chunks } });
    return json({ success: true, data: {} });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const only = (pred: (c: Call) => boolean) => calls.filter(pred);

test("demo mode refuses: no OAuth URL, the button explains", async () => {
  delete process.env.ALLOW_REAL_CONNECTORS;
  const sam = await signIn("sam");
  const v = await req(sam, "api/drive");
  assert.equal(v.json.available, false);
  assert.equal(v.json.message, "Available in your own CrewBrain workspace");
  const c = await req(sam, "api/drive/connect", {});
  assert.equal(c.status, 403);
  assert.equal(c.json.reply, "Available in your own CrewBrain workspace");
  assert.equal(c.json.url, undefined);
  // env alone isn't enough: the owner/sandbox flag is required too
  process.env.ALLOW_REAL_CONNECTORS = "1";
  process.env.REAL_CONNECTOR_SANDBOXES = "";
  assert.equal((await req(sam, "api/drive/connect", {})).status, 403);
  assert.equal(calls.length, 0, "nothing external was called");
});

test("helpers can't connect Drive", async () => {
  const marco = await signIn("marco");
  assert.equal((await req(marco, "api/drive/connect", {})).status, 403);
});

test("OAuth state is bound to the session and sandbox, single use", async () => {
  const sam = await signIn("sam");
  const r = await req(sam, "api/drive/connect", {});
  assert.equal(r.status, 200);
  const u = new URL(r.json.url);
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("scope"), drive.DRIVE_SCOPE);
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("redirect_uri"), "https://macmini.tail435588.ts.net:10000/crewbrain/oauth/google/callback");
  const state = u.searchParams.get("state")!;

  // another session (a second sign-in of the same owner) can't use it
  const other = await signIn("sam");
  const bad = await app.request(`${BASE}/crewbrain/oauth/google/callback?code=c1&state=${state}`, { headers: { cookie: other.cookie } });
  assert.equal(bad.status, 400);
  // and it was consumed by that attempt
  const again = await app.request(`${BASE}/crewbrain/oauth/google/callback?code=c1&state=${state}`, { headers: { cookie: sam.cookie } });
  assert.equal(again.status, 400);
  // a forged state fails too
  assert.equal((await app.request(`${BASE}/oauth/google/callback?code=c1&state=nope`, { headers: { cookie: sam.cookie } })).status, 400);
  assert.equal(only((c) => c.url.includes("oauth2.googleapis.com")).length, 0, "no code exchange on a bad state");

  // the right session: code exchanged, connector created, folders discovered
  const st2 = new URL((await req(sam, "api/drive/connect", {})).json.url).searchParams.get("state")!;
  const ok = await app.request(`${BASE}/crewbrain/oauth/google/callback?code=c2&state=${st2}`, { headers: { cookie: sam.cookie } });
  assert.equal(ok.status, 302);
  assert.match(ok.headers.get("location") ?? "", /^\.\.\/\.\.\/\?drive=pick/);
  const ex = only((c) => c.url.includes("oauth2.googleapis.com"))[0];
  assert.equal(ex.body.code, "c2");
  assert.equal(ex.body.grant_type, "authorization_code");
});

test("connector create / discover / configure bodies; folder defaults to Office only", async () => {
  const sam = await signIn("sam");
  const owner = store.db.members.find((m) => m.id === "sam")!;
  await drive.connectWithRefreshToken(owner, "rt-secret");
  const create = only((c) => c.url.endsWith("/connectors") && c.method === "POST")[0];
  assert.equal(create.body.provider, "google_drive");
  assert.equal(create.body.database, `crewbrain_${owner.tenantId}`);
  assert.equal(create.body.collection, "drive_default");
  assert.deepEqual(create.body.credentials, { client_id: "cid.apps.googleusercontent.com", client_secret: "csecret", refresh_token: "rt-secret" });
  assert.equal(only((c) => c.url.endsWith("/connectors/conn_1/discover")).length, 1);
  assert.ok(!JSON.stringify(store.db).includes("rt-secret"), "the refresh token is never stored locally");

  const v = await req(sam, "api/drive");
  assert.equal(v.json.connection.state, "picking");
  assert.deepEqual(v.json.connection.folders.map((f: any) => f.name), ["Jobs", "HR"]);
  assert.match(v.json.note, /Files shared with anyone or with a customer in Drive keep that sharing/);

  assert.equal((await req(sam, "api/drive/folder", { folderId: "nope" })).status, 400);
  const pick = await req(sam, "api/drive/folder", { folderId: "fold_jobs" });
  assert.equal(pick.status, 200);
  const conf = only((c) => c.url.endsWith("/connectors/conn_1/configure"))[0];
  assert.equal(conf.body.resources.length, 1);
  const r0 = conf.body.resources[0];
  assert.equal(r0.resource_id, "fold_jobs");
  assert.equal(r0.resource_type, "folder");
  assert.equal(r0.name, "Jobs");
  assert.deepEqual(r0.acl, ["__private__"]);
});

test("status active → synced files listed as Office only; acl_warning shown; relabel PATCHes the acl", async () => {
  const sam = await signIn("sam");
  const owner = store.db.members.find((m) => m.id === "sam")!;
  await drive.connectWithRefreshToken(owner, "rt-secret");
  await drive.pickFolder(owner, "fold_jobs");

  let v = await req(sam, "api/drive");
  assert.equal(v.json.connection.state, "syncing");
  assert.equal(only((c) => c.url.endsWith("/context/list")).length, 0);

  status = { status: "healthy", lifecycle: "active", resources: [{ resource_id: "fold_jobs", status: "ok", acl_warning: "Couldn't read sharing for 1 file" }] };
  listed = [
    { id: "gd_roof", title: "Roof spec", timestamp: "2026-10-12T10:00:00Z", additional_metadata: { connector_id: "conn_1", resource_id: "fold_jobs", url: "https://drive.google.com/x" } },
    { id: "gd_hr", title: "Wages", additional_metadata: { connector_id: "conn_1", acl_warning: "indexed tenant-public" } },
  ];
  Object.values(store.db.drive!)[0].checkedAt = undefined; // skip the poll throttle
  v = await req(sam, "api/drive");
  assert.equal(v.json.connection.state, "active");
  assert.equal(v.json.connection.files, 2);
  assert.equal(v.json.connection.aclWarning, "Couldn't read sharing for 1 file");
  const listCall = only((c) => c.url.endsWith("/context/list"))[0];
  assert.equal(listCall.body.collection, "drive_default");
  assert.deepEqual(listCall.body.filters, { additional_metadata: { connector_id: "conn_1" } });

  const b = await req(sam, "api/brain");
  const roof = b.json.items.find((i: any) => i.id === "gd_roof");
  assert.equal(roof.origin, "drive");
  assert.equal(roof.lockLabel, "Office only");
  assert.equal(roof.synced, "drive");
  assert.equal(b.json.items.find((i: any) => i.id === "gd_hr").aclWarning, "indexed tenant-public");

  const lab = await req(sam, "api/brain/gd_roof/label", { sharing: "crew" });
  assert.equal(lab.status, 200);
  await new Promise((r) => setTimeout(r, 10));
  const patch = only((c) => c.method === "PATCH" && c.url.includes("/context/gd_roof/metadata"))[0];
  assert.ok(patch, "acl PATCH sent");
  assert.deepEqual(patch.body, { database: `crewbrain_${owner.tenantId}`, collection: "drive_default", acl: ["group:crewbrain:crews"] });
});

test("retrieval: Drive chunks pass the second check only when the local lock allows", async () => {
  const owner = store.db.members.find((m) => m.id === "sam")!;
  await drive.connectWithRefreshToken(owner, "rt-secret");
  await drive.pickFolder(owner, "fold_jobs");
  status = { status: "healthy", lifecycle: "active", resources: [] };
  listed = [{ id: "gd_roof", title: "Roof spec", additional_metadata: {} }, { id: "gd_hr", title: "Wages", additional_metadata: {} }];
  await drive.refresh(owner, 0);
  chunks = [
    { id: "gd_roof", chunk_content: "Use 30-year shingles.", relevancy_score: 0.9 },
    { id: "gd_hr", chunk_content: "Wages are 40/h.", relevancy_score: 0.8 },
    { id: "gd_unknown", chunk_content: "Someone else's file.", relevancy_score: 0.7 },
  ];
  const crew = principalsFor({ kind: "crew", jobId: "job_oak42" });
  const ids = ["gd_roof", "gd_hr", "gd_unknown"];
  let r = await search(owner.tenantId, "shingles", store.db.sources, crew, ids);
  assert.equal(r.chunks.filter((c) => c.sourceId.startsWith("gd_")).length, 0, "Office only: nothing reaches a helper");
  const q = only((c) => c.url.endsWith("/query")).at(-1)!;
  assert.equal(q.body.collection, "drive_default");
  assert.deepEqual(q.body.acl, crew);

  store.db.sources.find((s) => s.id === "gd_roof")!.sharing = "crew";
  r = await search(owner.tenantId, "shingles", store.db.sources, crew, ids);
  assert.deepEqual(r.chunks.filter((c) => c.sourceId.startsWith("gd_")).map((c) => c.sourceId), ["gd_roof"]);
  assert.equal(r.chunks[0].text, "Use 30-year shingles.");
  // not in the helper's approved scope → dropped
  r = await search(owner.tenantId, "shingles", store.db.sources, crew, []);
  assert.equal(r.chunks.filter((c) => c.sourceId.startsWith("gd_")).length, 0);
});

test("another sandbox never sees this sandbox's Drive connection", async () => {
  const owner = store.db.members.find((m) => m.id === "sam")!;
  await drive.connectWithRefreshToken(owner, "rt-secret");
  const sb = store.createSandbox();
  store.inSandbox(sb, () => {
    assert.equal(store.db.drive, undefined);
    assert.equal(store.db.sources.some((s) => s.connectorId), false);
  });
  // the default sandbox restored for later tests
});
