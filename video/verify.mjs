#!/usr/bin/env node
// Checks a cut: narration gaps, dead air, frozen video, loudness; writes a contact sheet (one frame per 10 s).
// Usage: node video/verify.mjs [video/out/crewbrain-demo-v3.mp4]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { OUT, probeDuration, ff } from "./lib.mjs";
const file = process.argv[2] || join(OUT, "crewbrain-demo-v3.mp4");
const nar = file.replace(/\.mp4$/, "-narration.wav");
const run = (args) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" }).stderr || "";
const pairs = (log, a, b, dur) => {
  const out = []; let s = null;
  for (const l of log.split("\n")) {
    const x = new RegExp(`${a}: ?([\\d.]+)`).exec(l), y = new RegExp(`${b}: ?([\\d.]+)`).exec(l);
    if (x) s = +x[1];
    if (y && s != null) { out.push([s, +y[1]]); s = null; }
  }
  if (s != null) out.push([s, dur]);
  return out.map(([p, q]) => `${p.toFixed(2)}–${q.toFixed(2)} (${(q - p).toFixed(2)}s)`);
};
const dur = probeDuration(file);
console.log(`file ${file}\nduration ${dur.toFixed(2)}s (${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")})`);
console.log("silence, full mix (−38 dB, ≥1.0 s):", pairs(run(["-i", file, "-af", "silencedetect=noise=-38dB:d=1.0", "-f", "null", "-"]), "silence_start", "silence_end", dur).join(", ") || "none");
if (existsSync(nar)) console.log("gaps in narration (−38 dB, ≥1.0 s):", pairs(run(["-i", nar, "-af", "silencedetect=noise=-38dB:d=1.0", "-f", "null", "-"]), "silence_start", "silence_end", dur).join(", ") || "none");
console.log("frozen video (≥1.2 s):", pairs(run(["-i", file, "-vf", "freezedetect=n=-60dB:d=1.2", "-map", "0:v", "-f", "null", "-"]), "freeze_start", "freeze_end", dur).join(", ") || "none");
const lu = run(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
console.log("loudness:", (/I:\s+(-?[\d.]+) LUFS/.exec(lu.split("Summary:").pop()) || [])[1], "LUFS integrated, true peak", (/Peak:\s+(-?[\d.]+) dBFS/.exec(lu.split("Summary:").pop()) || [])[1], "dBFS");
const sheet = file.replace(/\.mp4$/, "-contact.png");
const n = Math.ceil(dur / 10);
ff(["-i", file, "-vf", `fps=1/10,scale=480:-1,tile=5x${Math.ceil(n / 5)}:padding=6:margin=6:color=white`, "-frames:v", "1", "-update", "1", sheet]);
console.log("contact sheet:", sheet, `(${n} frames, one per 10 s)`);
