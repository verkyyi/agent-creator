#!/bin/bash
# Daily visit summary from logs/access.log (+ rolled access-*.log):
# requests, unique IPs, page views, signed-in members, top referers.
#   scripts/visits.sh [days=7] [log dir=logs]
set -euo pipefail
cd "$(dirname "$0")/.."
DAYS="${1:-7}" DIR="${2:-${ACCESS_LOG_DIR:-logs}}"
[ -d "$DIR" ] || { echo "visits: no $DIR directory yet (no traffic logged)"; exit 0; }
PATH="/opt/homebrew/bin:$PATH" exec node --input-type=module - "$DAYS" "$DIR" <<'JS'
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const [days, dir] = [Number(process.argv[2]) || 7, process.argv[3]];
const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
const byDay = new Map();
for (const f of readdirSync(dir).filter((f) => /^access.*\.log$/.test(f))) {
  for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const d = String(e.ts || "").slice(0, 10);
    if (d < since) continue;
    const s = byDay.get(d) ?? { req: 0, ips: new Set(), pages: 0, members: new Set(), refs: new Map() };
    s.req++;
    if (e.ip) s.ips.add(e.ip);
    if (e.member) s.members.add(e.member);
    const p = String(e.path || "").replace(/^\/crewbrain/, "") || "/";
    if (e.method === "GET" && (p === "/" || p.endsWith(".html") || p.startsWith("/i/"))) s.pages++;
    if (e.referer) { const h = (() => { try { return new URL(e.referer).host; } catch { return e.referer; } })(); s.refs.set(h, (s.refs.get(h) ?? 0) + 1); }
    byDay.set(d, s);
  }
}
if (!byDay.size) { console.log(`no visits since ${since}`); process.exit(0); }
console.log("date        requests  unique_ips  page_views  members  top_referers");
for (const [d, s] of [...byDay].sort()) {
  const refs = [...s.refs].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => `${h}(${n})`).join(" ") || "-";
  console.log(`${d}  ${String(s.req).padStart(8)}  ${String(s.ips.size).padStart(10)}  ${String(s.pages).padStart(10)}  ${String(s.members.size).padStart(7)}  ${refs}`);
}
JS
