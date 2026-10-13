#!/usr/bin/env node
// Runs the real test suite and saves its output for the terminal scene (no numbers are typed by hand).
// Usage (repo root): node video/tests-proof.mjs   ->  out/tests-run.json + out/tests-run.js
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIR, OUT } from "./lib.mjs";
const root = join(DIR, "..");
const command = "NODE_ENV=test npx tsx --test test/*.test.ts";
const t0 = Date.now();
const r = spawnSync("bash", ["-lc", command], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env } });
const out = (r.stdout || "") + (r.stderr || "");
const lines = out.split("\n");
const oks = lines.filter((l) => /^(not )?ok \d+ - /.test(l));
const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, "m")) || [])[1] ?? NaN);
const res = {
  command, exit: r.status, at: new Date().toISOString(), seconds: (Date.now() - t0) / 1000,
  commit: execFileSync("git", ["-C", root, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(),
  tests: num("tests"), pass: num("pass"), fail: num("fail"), durationMs: num("duration_ms"),
  tail: oks.slice(-9), summary: lines.filter((l) => /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(l)),
};
writeFileSync(join(OUT, "tests-run.json"), JSON.stringify(res, null, 2));
writeFileSync(join(OUT, "tests-run.js"), "window.TESTS = " + JSON.stringify(res) + ";");
console.log(`exit ${res.exit}: ${res.pass}/${res.tests} pass, ${res.fail} fail (${res.seconds.toFixed(1)}s) @ ${res.commit}`);
process.exit(r.status ?? 1);
