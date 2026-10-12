import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getCookie, setCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import { db, now, record, reset, save } from "./store.ts";
import { DEMO_TOKENS } from "./seed.ts";
import { hydraBoot, hydraIngest, hydraState, sharingFromLabel } from "./retrieval.ts";
import * as core from "./core.ts";
import { voiceRoutes } from "./voice.ts";
import type { Member } from "./types.ts";

type Env = { Variables: { member: Member } };

// Identity is bound on the server: tenant and member come from the session, never the body.
function sessionMember(c: Context): Member | undefined {
  const tok = getCookie(c, "cb_session");
  const s = tok ? db.sessions.find((x) => x.token === tok) : undefined;
  return s ? core.memberById(s.memberId) : undefined;
}

function base(c: Context) {
  if (process.env.PUBLIC_BASE) return process.env.PUBLIC_BASE;
  const u = new URL(c.req.url);
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? u.host;
  const proto = c.req.header("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}${u.pathname.startsWith("/crewbrain") ? "/crewbrain/" : "/"}`;
}

const wrap = (fn: (c: Context<Env>) => unknown) => async (c: Context<Env>) => {
  try {
    return c.json((await fn(c)) as object);
  } catch (e) {
    if (e instanceof core.HttpError) return c.json(e.body, e.status as any);
    console.error(e);
    return c.json({ error: "server_error", reply: "Something went wrong. Try again." }, 500);
  }
};

export function buildApp() {
  const app = new Hono<Env>();

  app.get("/i/:token", (c) => {
    const mid = Object.entries(DEMO_TOKENS).find(([, t]) => t === c.req.param("token"))?.[0];
    const m = mid && core.memberById(mid);
    if (!m) return c.text("This link isn't valid.", 404);
    const token = randomBytes(18).toString("hex");
    db.sessions.push({ token, memberId: m.id, tenantId: m.tenantId });
    save();
    record({ tenantId: m.tenantId, actorId: m.id, kind: "session.start" });
    setCookie(c, "cb_session", token, { httpOnly: true, sameSite: "Lax", path: "/", secure: base(c).startsWith("https"), maxAge: 60 * 60 * 24 * 30 });
    const a = c.req.query("a") ?? core.helpersFor(m).find((x) => x.state === "active")?.id;
    return c.redirect(m.role === "owner" ? "../" : a ? `../a.html?id=${a}` : "../a.html");
  });

  app.get("/api/demo/identities", (c) => {
    const desc: Record<string, string> = {
      sam: "Owner, Rivera Solar & Electric. Creates helpers, approves, closes jobs.",
      anita: "Homeowner at 42 Oak St. Uses Juno.", raj: "Homeowner at 42 Oak St. Uses Juno.",
      marco: "Bay Roofing crew. Uses Rex (try Spanish).", tess: "Bay Roofing crew. Uses Rex.",
      zed: "Not invited. Every helper should refuse.", gail: "Owner of a different company. Sees nothing of Rivera's.",
    };
    return c.json({ identities: Object.entries(DEMO_TOKENS).map(([mid, t]) => ({ name: core.memberById(mid)!.name, role: core.memberById(mid)!.role, description: desc[mid], url: `${base(c)}i/${t}` })) });
  });

  app.get("/api/health", (c) => c.json({ ok: true, now: now().toISOString(), hydra: hydraState, claude: !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY), voice: !!process.env.OPENAI_API_KEY }));

  app.use("/api/*", async (c, next) => {
    if (c.req.path.endsWith("/api/demo/identities") || c.req.path.endsWith("/api/health")) return next();
    const m = sessionMember(c);
    if (!m) return c.json({ error: "unauthenticated", reply: "Open your personal link again." }, 401);
    c.set("member", m);
    return next();
  });

  app.get("/api/me", wrap((c) => {
    const m = c.get("member");
    return { member: { id: m.id, name: m.name, role: m.role, tenantId: m.tenantId, tenantName: core.tenantOf(m.tenantId).name }, helpers: core.helpersFor(m) };
  }));

  app.post("/api/creator/message", wrap(async (c) => core.creatorMessage(c.get("member"), String((await c.req.json()).text ?? ""))));
  app.get("/api/creator/log", wrap((c) => ({ messages: db.creatorLog[c.get("member").id] ?? [] })));
  app.post("/api/agents/:id/approve", wrap(async (c) => core.approve(c.get("member"), c.req.param("id")!, Number((await c.req.json()).rev), base(c))));
  app.post("/api/agents/:id/close", wrap((c) => core.closeAgent(c.get("member"), c.req.param("id")!)));
  app.get("/api/agents", wrap((c) => ({ agents: core.helpersFor(c.get("member")) })));
  app.get("/api/agents/:id/links", wrap((c) => core.links(c.get("member"), c.req.param("id")!, base(c))));
  app.get("/api/agents/:id/public", wrap((c) => core.publicInfo(c.get("member"), c.req.param("id")!)));
  app.get("/api/agents/:id/history", wrap((c) => core.history(c.get("member"), c.req.param("id")!)));
  app.post("/api/agents/:id/chat", wrap(async (c) => {
    const b = await c.req.json();
    return core.chat(c.get("member"), c.req.param("id")!, String(b.text ?? "").slice(0, 2000), typeof b.imageDataUrl === "string" ? b.imageDataUrl : undefined);
  }));

  app.get("/api/brain", wrap((c) => core.brain(c.get("member"))));
  app.post("/api/brain/capture", wrap(async (c) => { const b = await c.req.json(); return core.capture(c.get("member"), b.imageDataUrl, b.hint); }));
  app.post("/api/brain/drafts/:id/approve", wrap(async (c) => {
    const b = await c.req.json();
    const sharing = sharingFromLabel(b.sharing);
    if (!sharing) throw new core.HttpError(400, { error: "bad_sharing" });
    return core.approveCapture(c.get("member"), c.req.param("id")!, { ...b, sharing });
  }));
  app.post("/api/brain/:id/label", wrap(async (c) => {
    const sharing = sharingFromLabel((await c.req.json()).sharing);
    if (!sharing) throw new core.HttpError(400, { error: "bad_sharing" });
    return core.relabel(c.get("member"), c.req.param("id")!, sharing);
  }));

  app.get("/api/inbox", wrap((c) => core.inbox(c.get("member"))));
  app.post("/api/inbox/:id/answer", wrap(async (c) => { const b = await c.req.json(); return core.answerInbox(c.get("member"), c.req.param("id")!, String(b.text ?? ""), sharingFromLabel(b.sharing)); }));
  app.post("/api/inbox/:id/dismiss", wrap((c) => core.dismissInbox(c.get("member"), c.req.param("id")!)));

  // Demo/test clock: owner-only and disabled unless TEST_CLOCK=1.
  app.post("/api/clock", wrap(async (c) => {
    if (process.env.TEST_CLOCK !== "1" || c.get("member").role !== "owner") throw new core.HttpError(403, { error: "forbidden" });
    const b = await c.req.json();
    if (b.reset) db.clockOffsetMs = 0;
    if (b.advanceMinutes) db.clockOffsetMs += Number(b.advanceMinutes) * 60_000;
    save();
    return { now: now().toISOString() };
  }));
  app.post("/api/reset", wrap((c) => {
    if (process.env.TEST_CLOCK !== "1" || c.get("member").role !== "owner") throw new core.HttpError(403, { error: "forbidden" });
    reset();
    for (const t of db.tenants) void hydraIngest(t.id, db.sources.filter((s) => s.tenantId === t.id)).catch(() => {});
    return { ok: true };
  }));

  app.route("/api/voice", voiceRoutes);

  app.use("/*", serveStatic({ root: "./public" }));
  app.get("/", serveStatic({ path: "./public/index.html" }));

  const root = new Hono<Env>();
  root.route("/crewbrain", app);
  root.route("/", app);
  return root;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: buildApp().fetch, port, hostname: "127.0.0.1" }, () => console.log(`crewbrain on http://127.0.0.1:${port}/`));
  for (const t of db.tenants) void hydraBoot(t.id, db.sources.filter((s) => s.tenantId === t.id));
}
