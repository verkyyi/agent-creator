// SMS: people text their helper instead of opening a link. Provider-agnostic; Twilio is the
// first adapter. Off unless configured (SMS_PROVIDER=twilio, or the three TWILIO_* values).
// This file holds the provider, phone helpers, the phone → sandbox index and outbound sends;
// the inbound webhook and simulator live in smsroutes.ts (they run the same core.chat as the web).
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { db, now, record, save, sandboxId, currentSandbox, inSandbox } from "./store.ts";
import type { Member } from "./types.ts";

// ---------- provider ----------
export interface SmsProvider {
  name: string;
  /** Sends one text. Resolves with the provider's message id; throws on failure. */
  send(to: string, body: string): Promise<string | undefined>;
  /** True when the inbound request really came from the provider. */
  verify(url: string, params: Record<string, string>, signature: string | undefined): boolean;
  /** Fetches an MMS attachment (authenticated) as a data: URL. */
  media(url: string, contentType?: string): Promise<string | undefined>;
}

const twilioToken = () => process.env.TWILIO_AUTH_TOKEN || (process.env.NODE_ENV === "test" ? TEST_SECRET : "");
/** In NODE_ENV=test (no TWILIO_AUTH_TOKEN), inbound signatures are checked against this secret. */
export const TEST_SECRET = "test-twilio-secret";

/** Twilio's X-Twilio-Signature: base64(HMAC-SHA1(auth token, url + each param name+value, sorted by name)). */
export function twilioSignature(token: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

const basicAuth = () => "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");

export const twilio: SmsProvider = {
  name: "twilio",
  async send(to, body) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER ?? "", Body: body }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`twilio ${r.status}`);
    return ((await r.json().catch(() => ({}))) as any)?.sid;
  },
  verify(url, params, signature) {
    const token = twilioToken();
    if (!token || !signature) return false;
    const want = Buffer.from(twilioSignature(token, url, params));
    const got = Buffer.from(signature);
    return want.length === got.length && timingSafeEqual(want, got);
  },
  async media(url, contentType) {
    if (!/^https:\/\//.test(url)) return undefined;
    const r = await fetch(url, { headers: process.env.TWILIO_ACCOUNT_SID ? { Authorization: basicAuth() } : {}, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return undefined;
    const type = (r.headers.get("content-type") ?? contentType ?? "").split(";")[0];
    if (!/^image\//.test(type)) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5_000_000) return undefined;
    return `data:${type};base64,${buf.toString("base64")}`;
  },
};

export function smsConfigured() {
  const p = (process.env.SMS_PROVIDER ?? "").toLowerCase();
  if (p && p !== "twilio") return false; // "off"/"none" or a provider we don't have
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}
/** The demo/test build (TEST_CLOCK=1): the simulator page works and outbound texts are logged, never sent. */
export const smsSimulator = () => process.env.TEST_CLOCK === "1";
/** Whether the UI offers SMS (real, or simulated in the demo). */
export const smsAvailable = () => smsConfigured() || smsSimulator();
let provider: SmsProvider = twilio;
/** Tests may swap the provider. */
export function setSmsProvider(p: SmsProvider | null) { provider = p ?? twilio; }
export const smsProvider = () => provider;

// ---------- phones ----------
/** E.164 or undefined. US/Canada 10-digit numbers get +1. */
export function normalizePhone(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  const digits = s.replace(/[^\d]/g, "");
  if (s.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}
/** North American numbers reserved for fiction (555-0100…555-0199): never texted for real. */
export const isFictional = (phone: string) => /^\+1\d{3}55501\d\d$/.test(phone);

// ---------- phone → sandbox index (data/sms-index.json) ----------
type IndexRec = { sandboxId: string; memberId: string; at: string };
const INDEX_FILE = () => process.env.SMS_INDEX_FILE ?? "data/sms-index.json";
const PERSIST_INDEX = () => process.env.NODE_ENV !== "test" || !!process.env.SMS_INDEX_FILE;
let index: Map<string, IndexRec> | undefined;
function loadIndex() {
  if (index) return index;
  index = new Map();
  if (PERSIST_INDEX()) {
    try { for (const [k, v] of Object.entries(JSON.parse(readFileSync(INDEX_FILE(), "utf8")) as Record<string, IndexRec>)) index.set(k, v); } catch { /* none yet */ }
  }
  return index;
}
/** Points a (real) number at this sandbox's member. Fictional demo numbers are never indexed. */
export function indexPhone(phone: string, memberId: string) {
  if (isFictional(phone)) return;
  const ix = loadIndex();
  ix.set(phone, { sandboxId: sandboxId(), memberId, at: new Date().toISOString() });
  if (!PERSIST_INDEX()) return;
  mkdirSync(dirname(INDEX_FILE()), { recursive: true });
  writeFileSync(INDEX_FILE(), JSON.stringify(Object.fromEntries(ix), null, 1));
}
export const lookupPhone = (phone: string) => loadIndex().get(phone);
export function _resetIndex() { index = undefined; }

// ---------- log ----------
export function smsLog(memberId: string, dir: "in" | "out", body: string, status: string, kind?: string) {
  (db.smsLog ??= []).push({ at: now().toISOString(), dir, memberId, body: body.slice(0, 1600), status, ...(kind ? { kind } : {}) });
  if (db.smsLog.length > 500) db.smsLog.splice(0, db.smsLog.length - 500);
}

// ---------- outbound ----------
const SANDBOX_DAILY_MAX = () => Number(process.env.SMS_SANDBOX_DAILY_MAX ?? 30);
const pending = new Set<Promise<unknown>>();
/** Resolves when every fire-and-forget send started so far has finished (tests). */
export async function smsIdle() { while (pending.size) await Promise.allSettled([...pending]); }

/** Sends a text (plain, trimmed to 3 segments). Low level: no member checks. */
export async function sendSms(to: string, body: string): Promise<{ status: string; id?: string }> {
  if (!smsConfigured()) return { status: "skipped:not_configured" };
  if (isFictional(to)) return { status: "skipped:fictional" };
  try { return { status: "sent", id: await provider.send(to, plainSms(body).slice(0, 480)) }; }
  catch (e) { console.warn("[sms] send failed:", (e as Error).message); return { status: "failed" }; }
}

/**
 * Fire-and-forget text to a member, when they have a phone and SMS is on (or simulated).
 * Logs to the sandbox's SMS thread and records an event. Never throws, never blocks the caller.
 */
export function notifyMember(m: Member | undefined, body: string, kind: string) {
  if (!m?.phone || !smsAvailable()) return;
  const sb = currentSandbox(), to = m.phone;
  const dayAgo = now().getTime() - 864e5;
  const sentToday = (db.smsLog ?? []).filter((x) => x.dir === "out" && x.status === "sent" && Date.parse(x.at) > dayAgo).length;
  const why = m.smsOptOut ? "skipped:opted_out" : !smsConfigured() || isFictional(to) ? "simulated" : sentToday >= SANDBOX_DAILY_MAX() ? "skipped:rate_limited" : "";
  const finish = (status: string) => inSandbox(sb, () => {
    smsLog(m.id, "out", body, status, kind);
    record({ tenantId: m.tenantId, actorId: m.id, kind: "sms.outbound", detail: { kind, status } });
    save();
  });
  if (why) { finish(why); return; }
  const p = sendSms(to, body).then((r) => finish(r.status), () => finish("failed"));
  pending.add(p);
  void p.finally(() => pending.delete(p));
}

// ---------- formatting ----------
/** Markdown and decoration out: SMS is plain text. */
export function plainSms(s: string) {
  return s.replace(/\*\*|__|`+|^#+\s*/gm, "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 $2").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
/** Splits text into at most `max` parts of `size` characters at word boundaries; the last part ends with … when cut. */
export function splitSms(text: string, size = 160, max = 3): string[] {
  const words = plainSms(text).split(/(\s+)/);
  const parts: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + w).length <= size) { cur += w; continue; }
    if (cur.trim()) parts.push(cur.trim());
    cur = w.trimStart();
    while (cur.length > size) { parts.push(cur.slice(0, size)); cur = cur.slice(size); }
  }
  if (cur.trim()) parts.push(cur.trim());
  if (parts.length <= max) return parts;
  const out = parts.slice(0, max);
  out[max - 1] = out[max - 1].slice(0, size - 1).replace(/\s+\S*$/, "") + "…";
  return out;
}
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const twiml = (parts: string[]) => `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.map((p) => `<Message>${xml(p)}</Message>`).join("")}</Response>`;
