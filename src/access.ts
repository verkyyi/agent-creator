import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { MiddlewareHandler } from "hono";
import type { Member } from "./types.ts";

// One JSON line per request in logs/access.log: who came, from where, what they hit.
// Never a cookie, a token, a query string or a body. Rolled by day (access-YYYY-MM-DD.log)
// and by size, kept for KEEP_DAYS.
const MAX_BYTES = 10 * 1024 * 1024;
const KEEP_DAYS = 30;

const dir = () => process.env.ACCESS_LOG_DIR || (process.env.NODE_ENV === "test" ? "" : "logs");

// The invite link carries its token in the path: never write it down.
export const cleanPath = (p: string) => p.replace(/\/i\/[^/?#]+/, "/i/[token]");
export function cleanReferer(r?: string) {
  if (!r) return undefined;
  try { const u = new URL(r); return `${u.origin}${cleanPath(u.pathname)}`; } catch { return undefined; }
}
// Funnel and tailscale serve put the visitor in X-Forwarded-For; the socket is always loopback.
export function clientIp(h: (k: string) => string | undefined) {
  return h("x-forwarded-for")?.split(",")[0].trim() || h("tailscale-client-ip") || h("x-real-ip") || undefined;
}

let day = "";
function rotate(d: string, today: string) {
  const cur = join(d, "access.log");
  if (!existsSync(cur)) return;
  const st = statSync(cur);
  const fileDay = st.mtime.toISOString().slice(0, 10);
  if (fileDay === today && st.size < MAX_BYTES) return;
  let target = join(d, `access-${fileDay}.log`);
  for (let i = 1; existsSync(target); i++) target = join(d, `access-${fileDay}.${i}.log`);
  renameSync(cur, target);
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  for (const f of readdirSync(d)) {
    const m = /^access-(\d{4}-\d{2}-\d{2})/.exec(f);
    if (m && Date.parse(m[1]) < cutoff) unlinkSync(join(d, f));
  }
}

export function writeAccess(entry: Record<string, unknown>) {
  const d = dir();
  if (!d) return;
  try {
    mkdirSync(d, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day || statSize(join(d, "access.log")) >= MAX_BYTES) { rotate(d, today); day = today; }
    appendFileSync(join(d, "access.log"), JSON.stringify(entry) + "\n");
  } catch (e) {
    console.warn("[access] write failed:", (e as Error).message);
  }
}
const statSize = (f: string) => { try { return statSync(f).size; } catch { return 0; } };

export function accessLog(who: (cookie: string | undefined) => Member | undefined): MiddlewareHandler {
  return async (c, next) => {
    const t0 = performance.now();
    let status = 500;
    try {
      await next();
      status = c.res.status;
    } finally {
      const h = (k: string) => c.req.header(k);
      const cookie = /(?:^|;\s*)cb_session=([^;]+)/.exec(h("cookie") ?? "")?.[1];
      // A fresh sign-in sets the cookie on this very response.
      const fresh = /cb_session=([^;]+)/.exec(c.res?.headers.get("set-cookie") ?? "")?.[1];
      const m = who(fresh ?? cookie);
      writeAccess({
        ts: new Date().toISOString(),
        method: c.req.method,
        path: cleanPath(new URL(c.req.url).pathname),
        status,
        ms: Math.round(performance.now() - t0),
        ip: clientIp(h),
        ua: h("user-agent")?.slice(0, 300),
        referer: cleanReferer(h("referer")),
        tsLogin: h("tailscale-user-login") || undefined,
        tenant: m?.tenantId,
        member: m?.id,
      });
    }
  };
}
