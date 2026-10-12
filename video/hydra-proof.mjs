#!/usr/bin/env node
// Runs the same HydraDB query as two audiences and saves the returned source titles (real results) for the proof scene.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT } from "./lib.mjs";
const KEY = process.env.HYDRA_DB_API_KEY || execFileSync("security", ["find-generic-password", "-a", "crewbrain", "-s", "HYDRA_DB_API_KEY", "-w"], { encoding: "utf8" }).trim();
const query = "what is the gate code and the margin";
const audiences = {
  household: ["group:crewbrain:household:job_oak42", "group:crewbrain:customers"],
  crew: ["group:crewbrain:crew:job_oak42", "group:crewbrain:crews"],
};
const out = { query, database: "crewbrain_rivera", collection: "brain", at: new Date().toISOString(), results: {} };
for (const [k, acl] of Object.entries(audiences)) {
  const r = await fetch("https://api.hydradb.com/query", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "API-Version": "2", "Content-Type": "application/json" },
    body: JSON.stringify({ database: "crewbrain_rivera", collection: "brain", query, type: "knowledge", query_by: "hybrid", mode: "fast", max_results: 8, graph_context: false, acl }) });
  const j = await r.json().catch(() => ({}));
  const d = j?.data ?? j;
  const titles = [];
  for (const c of d?.chunks ?? []) { const t = c.title || c.source_title || c.metadata?.title || c.id || c.source_id; if (t && !titles.includes(t)) titles.push(t); }
  out.results[k] = { acl, status: r.status, titles };
  console.log(k, r.status, titles);
  if (!titles.length) console.log(JSON.stringify(j).slice(0, 600));
}
writeFileSync(join(OUT, "hydra-proof.json"), JSON.stringify(out, null, 2));
writeFileSync(join(OUT, "hydra-proof.js"), "window.PROOF = " + JSON.stringify(out) + ";");
