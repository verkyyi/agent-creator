// Inbound SMS: a text from a known number runs the SAME core.chat as the web (tenant,
// audience, lifecycle and gated actions all apply) and the reply goes back as TwiML.
//   POST /sms/twilio    Twilio webhook, outside cookie auth, X-Twilio-Signature required.
//   /sms/simulate       the owner's local simulator (TEST_CLOCK=1 only; public/sms.html).
import { Hono, type Context } from "hono";
import * as core from "./core.ts";
import { db, getSandbox, inSandbox, legacyTokens, record, save, currentSandbox, type Sandbox } from "./store.ts";
import { lookupPhone, normalizePhone, smsConfigured, smsLog, smsProvider, smsSimulator, splitSms, twiml } from "./sms.ts";
import type { Member } from "./types.ts";

export type Inbound = { from: string; body: string; imageDataUrl?: string; mediaUrl?: string; mediaType?: string };

const NOT_CONNECTED = "This number isn't connected to a CrewBrain helper.";
const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]?\s*$/i;
const START = /^\s*(start|unstop|yes)\s*[.!]?\s*$/i;
const HELP = /^\s*(help|info)\s*[.!?]?\s*$/i;
const SWITCH = /^\s*(switch|helpers?|cambiar)\b\s*(.*)$/i;

/** The sandbox and member a number belongs to. `sb` given (simulator): only that sandbox. */
function resolve(phone: string, sb?: Sandbox): { sb: Sandbox; m: Member } | undefined {
  const find = (s: Sandbox) => s.db.members.find((m) => m.phone === phone);
  if (sb) { const m = find(sb); return m ? { sb, m } : undefined; }
  const ix = lookupPhone(phone);
  const hit = ix && getSandbox(ix.sandboxId);
  const m = hit && hit.db.members.find((x) => x.id === ix!.memberId && x.phone === phone);
  if (hit && m) return { sb: hit, m };
  // Tests and local dev: the fixed default sandbox answers its seeded numbers.
  const def = legacyTokens() ? getSandbox("default") : undefined;
  const dm = def && find(def);
  return def && dm ? { sb: def, m: dm } : undefined;
}

const sourceLine = (cites: { title: string }[] = []) => {
  const titles = [...new Set(cites.map((c) => c.title))].slice(0, 2);
  return titles.length ? `Source: ${titles.join("; ")}` : "";
};

/** One inbound text → the reply parts (≤ 3 SMS). Never throws. */
export async function handleInbound(msg: Inbound, sb?: Sandbox): Promise<string[]> {
  const phone = normalizePhone(msg.from);
  const who = phone ? resolve(phone, sb) : undefined;
  if (!who) return [NOT_CONNECTED];
  return inSandbox(who.sb, async () => {
    const m = db.members.find((x) => x.id === who.m.id)!;
    const text = String(msg.body ?? "").trim().slice(0, 2000);
    smsLog(m.id, "in", text || (msg.imageDataUrl || msg.mediaUrl ? "(photo)" : ""), "received");
    record({ tenantId: m.tenantId, actorId: m.id, kind: "sms.inbound", detail: { photo: !!(msg.imageDataUrl || msg.mediaUrl) } });
    const reply = (parts: string[], kind = "reply") => { for (const p of parts) smsLog(m.id, "out", p, "reply", kind); save(); return parts; };
    const tenant = core.tenantOf(m.tenantId).name;

    if (STOP.test(text)) {
      m.smsOptOut = true;
      record({ tenantId: m.tenantId, actorId: m.id, kind: "sms.opt_out" });
      return reply([`You won't get more texts from ${tenant} on CrewBrain. Reply START to turn them back on.`], "stop");
    }
    if (START.test(text) && m.smsOptOut) {
      m.smsOptOut = false;
      record({ tenantId: m.tenantId, actorId: m.id, kind: "sms.opt_in" });
      return reply([`Texts from ${tenant} are back on. Text your question any time.`], "start");
    }
    if (HELP.test(text)) {
      return reply([`CrewBrain helper for ${tenant}. Text a question and your helper answers from the company's approved notes. SWITCH lists your helpers. STOP opts out. Msg&data rates may apply.`], "help");
    }

    const helpers = core.textableHelpers(m);
    const live = helpers.filter((h) => h.state === "active");
    const sw = SWITCH.exec(text);
    if (sw) {
      const want = sw[2].trim().toLowerCase();
      if (!live.length) return reply([helpers.length ? "None of your helpers is live right now." : NOT_CONNECTED]);
      const pick = want ? (live[Number(want) - 1] ?? live.find((h) => h.name.toLowerCase() === want || h.id === want)) : undefined;
      if (pick) {
        m.smsAgentId = pick.id;
        record({ tenantId: m.tenantId, actorId: m.id, agentId: pick.id, kind: "sms.switch" });
        return reply([`OK, ${pick.name} will answer your texts now.`]);
      }
      const cur = live.find((h) => h.id === m.smsAgentId) ?? live[0];
      return reply(splitSms(`Your helpers: ${live.map((h, i) => `${i + 1}) ${h.name}${h.id === cur.id ? " (current)" : ""}`).join(", ")}. Reply SWITCH and a number to pick one.`));
    }
    if (!helpers.length) return reply([NOT_CONNECTED]);
    // The picked helper while it's live; else the most recent live one; else the most recent (ended → its ended sentence).
    const target = live.find((h) => h.id === m.smsAgentId) ?? live[0] ?? helpers[0];

    let img = msg.imageDataUrl;
    if (!img && msg.mediaUrl) img = await smsProvider().media(msg.mediaUrl, msg.mediaType).catch(() => undefined);
    if (!text && !img) return reply(["Text me a question, or SWITCH to see your helpers."]);
    try {
      const out = await core.chat(m, target.id, text, img);
      const src = sourceLine(out.citations);
      const body = out.reply + ("notice" in out && out.notice ? ` (${out.notice})` : "");
      const parts = splitSms(body, 160, src ? 2 : 3);
      return reply(src ? [...parts, src.slice(0, 160)] : parts);
    } catch (e) {
      if (e instanceof core.HttpError) return reply([String(e.body.reply ?? NOT_CONNECTED)]);
      console.error("[sms]", e);
      return reply(["Something went wrong. Try again in a minute."]);
    }
  });
}

/** The URL Twilio signed: SMS_WEBHOOK_URL when set (behind a proxy), else this request's public URL. */
function webhookUrl(c: Context, base: (c: Context) => string) {
  if (process.env.SMS_WEBHOOK_URL) return process.env.SMS_WEBHOOK_URL;
  const q = new URL(c.req.url).search;
  return `${base(c)}sms/twilio${q}`;
}

export function smsRoutes(base: (c: Context) => string, sessionMember: (c: Context) => Member | undefined) {
  const r = new Hono();
  const xml = (c: Context, parts: string[], status = 200) => c.body(twiml(parts), status as any, { "Content-Type": "text/xml; charset=utf-8" });

  r.post("/twilio", async (c) => {
    if (!smsConfigured() && process.env.NODE_ENV !== "test") return c.text("SMS is not configured.", 404);
    const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const params = Object.fromEntries(Object.entries(form).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    if (!smsProvider().verify(webhookUrl(c, base), params, c.req.header("x-twilio-signature"))) {
      console.warn("[sms] rejected: bad signature");
      return c.text("Forbidden", 403);
    }
    const n = Number(params.NumMedia ?? 0);
    const parts = await handleInbound({ from: params.From ?? "", body: params.Body ?? "", ...(n > 0 && params.MediaUrl0 ? { mediaUrl: params.MediaUrl0, mediaType: params.MediaContentType0 } : {}) });
    return xml(c, parts);
  });

  // ---- simulator: the signed-in owner's own sandbox, TEST_CLOCK=1 only ----
  const owner = (c: Context) => {
    const m = sessionMember(c);
    return smsSimulator() && m?.role === "owner" ? m : undefined;
  };
  const people = (o: Member) => db.members.filter((m) => m.tenantId === o.tenantId && m.id !== o.id);
  r.get("/simulate", (c) => {
    const o = owner(c);
    if (!o) return c.json({ error: "forbidden" }, 403);
    return c.json({ configured: smsConfigured(), members: people(o).map((m) => ({ id: m.id, name: m.name, phone: m.phone ?? null, optedOut: !!m.smsOptOut })) });
  });
  r.get("/simulate/thread", (c) => {
    const o = owner(c);
    const m = o && people(o).find((x) => x.id === c.req.query("member"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    return c.json({ messages: (db.smsLog ?? []).filter((x) => x.memberId === m.id).slice(-100) });
  });
  r.post("/simulate", async (c) => {
    const o = owner(c);
    const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const m = o && people(o).find((x) => x.id === b.member);
    if (!m) return c.json({ error: "forbidden" }, 403);
    if (!m.phone) return c.json({ error: "no_phone", reply: `${m.name} has no phone number yet.` }, 409);
    const parts = await handleInbound({ from: m.phone, body: String(b.text ?? ""), imageDataUrl: typeof b.imageDataUrl === "string" ? b.imageDataUrl : undefined }, currentSandbox());
    return c.json({ parts, twiml: twiml(parts) });
  });
  return r;
}
