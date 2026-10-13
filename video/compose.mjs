#!/usr/bin/env node
// Assemble the demo: scenes + phone-framed app footage + caption cards + narration + subtitles + a quiet music bed.
// Usage: node video/compose.mjs [--force-scenes] [--only-segments]   (output: video/out/crewbrain-demo-v3.mp4)
//
// Pacing is data-driven (lib.mjs timeline): every segment lasts its trimmed narration + TAIL (+ a `hold` on the
// climax beats), so narration never stops for more than ~0.5 s (1.5 s at the climax). App footage is cut to
// fit: the waits record.mjs logged in raw/<name>.json are removed, frozen stretches over 1.2 s (ffmpeg
// freezedetect) are cut down, then the clip is sped up (≤3x) or slowed (≥0.5x) to the segment length.
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import QRCode from "qrcode";
import { icon, ICON_NAMES } from "../public/icons.js";
import { DIR, OUT, FPS, XFADE, LEAD, PHONE, loadScript, timeline, launch, renderPng, renderScene, probeDuration, ff } from "./lib.mjs";

const args = process.argv.slice(2);
const forceScenes = args.includes("--force-scenes");
const onlySegments = args.includes("--only-segments");
const CLIPS = join(OUT, "clips"), CARDS = join(OUT, "cards"), RAW = join(OUT, "raw"), SUBS = join(OUT, "subs"), AUD = join(OUT, "audio"), TRIM = join(OUT, "audio", "trim");
for (const d of [CLIPS, CARDS, RAW, SUBS, TRIM]) mkdirSync(d, { recursive: true });
const FINAL = join(OUT, "crewbrain-demo-v3.mp4");
const FREEZE_MIN = 1.2, FREEZE_KEEP = 0.9, MAX_SPEED = 3, MIN_SPEED = 0.5;
const PUSH = 0.012; // camera push-in per side over a segment (1.2 % → 2.4 % zoom)

const script = loadScript();
const mtime = (f) => (existsSync(f) ? statSync(f).mtimeMs : 0);

// ---------- scene data: icons (one source: public/icons.js), closing URL + QR ----------
const icons = Object.fromEntries(ICON_NAMES.map((n) => [n, icon(n, { size: 24 })]));
writeFileSync(join(OUT, "scene-icons.js"), `window.ICONS = ${JSON.stringify(icons)};
window.renderIcons = () => document.querySelectorAll("i[data-i]").forEach((el) => { el.innerHTML = window.ICONS[el.dataset.i] || ""; });
document.addEventListener("DOMContentLoaded", window.renderIcons);\n`);
writeFileSync(join(OUT, "closing.js"), `window.CLOSING = ${JSON.stringify({ url: script.url, repo: script.repo, qr: await QRCode.toDataURL(script.url, { margin: 1, width: 800, errorCorrectionLevel: "M" }) })};\n`);

// ---------- narration: trim the TTS file's own leading/trailing silence ----------
function narrationFile(s) {
  const src = join(AUD, s.audio ? `${s.audio}.mp3` : `seg-${s.id}.mp3`);
  const out = join(TRIM, `${s.id}.wav`);
  if (!existsSync(src)) throw new Error(`missing ${src}: run video/tts.mjs`);
  if (mtime(out) < mtime(src)) {
    // trim the ends, and shorten any pause inside a line to 0.55 s (cut from its middle)
    const sr = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04";
    const log = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", src, "-af", "silencedetect=noise=-40dB:d=0.6", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
    const sil = [...log.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => [+m[1] - +m[2], +m[1]]);
    const cutp = sil.filter(([x, y]) => x > 0.05 && y - x > 0.6).map(([x, y]) => [x + 0.275, y - 0.275]);
    const drop = cutp.length ? `aselect='not(${cutp.map(([x, y]) => `between(t,${x.toFixed(3)},${y.toFixed(3)})`).join("+")})',asetpts=N/SR/TB,` : "";
    ff(["-i", src, "-af", `${drop}${sr},areverse,${sr},areverse,aresample=48000`, "-ac", "2", "-c:a", "pcm_s16le", out]);
  }
  return out;
}
const audioOf = {};
const { segs, total } = timeline(script, (s) => (audioOf[s.id] = probeDuration(narrationFile(s))));
console.log(`timeline total ${total.toFixed(2)}s (${segs.length} segments)`);
for (const s of segs) console.log(`  ${String(s.id).padEnd(10)} start ${s.start.toFixed(2).padStart(6)}  len ${s.len.toFixed(2).padStart(5)}  narration ${s.audio.toFixed(2)}`);

// ---------- subtitles ----------
function chunks(text, max = 74) {
  const sentences = text.match(/[^.!?]+[.!?]+["”]?\s*|[^.!?]+$/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    if (s.length <= max) { out.push(s); continue; }
    let cur = "";
    for (const p of s.split(/(?<=[,:;])\s+/)) {
      if (p.length > max) { for (const w of p.split(" ")) { if ((cur + " " + w).trim().length > max) { out.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim(); } }
      else if ((cur + " " + p).trim().length > max) { if (cur) out.push(cur.trim()); cur = p; }
      else cur = (cur + " " + p).trim();
    }
    if (cur) out.push(cur.trim());
  }
  return out;
}
function cues(seg) {
  const cs = chunks(seg.narration);
  const weight = cs.map((c) => c.length + 10), sum = weight.reduce((a, b) => a + b, 0);
  let t = LEAD;
  return cs.map((text, i) => { const d = (weight[i] / sum) * seg.audio; const c = { text, a: t, b: t + d }; t += d; return c; });
}
const srtTime = (x) => {
  const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

// ---------- app footage ----------
function sidecar(name) {
  const f = join(RAW, `${name}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { marks: {}, cuts: [] };
}
const subtract = (ranges, cuts) => ranges.flatMap(([a, b]) => {
  let parts = [[a, b]];
  for (const [c, d] of cuts) parts = parts.flatMap(([x, y]) => (d <= x || c >= y ? [[x, y]] : [[x, c], [d, y]].filter(([p, q]) => q - p > 0.04)));
  return parts;
});
const sel = (ranges) => ranges.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+");
function freezes(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", `freezedetect=n=-50dB:d=${FREEZE_MIN}`, "-map", "0:v", "-f", "null", "-"], { encoding: "utf8" });
  return parseFreezes(r.stderr || "", probeDuration(file));
}
function parseFreezes(log, dur) {
  const out = [];
  let s = null;
  for (const line of log.split("\n")) {
    const a = /freeze_start: ([\d.]+)/.exec(line), b = /freeze_end: ([\d.]+)/.exec(line);
    if (a) s = Number(a[1]);
    if (b && s != null) { out.push([s, Number(b[1])]); s = null; }
  }
  if (s != null) out.push([s, dur]);
  return out;
}
const fitLog = [];
/** raw/<name>.webm [from..to] -> mp4 of exactly L seconds at the phone-screen size. */
function fitFootage(v, L, out, tag) {
  const raw = join(RAW, `${v.raw}.webm`);
  const w = PHONE.screen.w, h = PHONE.screen.h;
  if (!existsSync(raw)) {
    console.warn(`  ${tag}: no footage ${v.raw} — blank screen`);
    ff(["-f", "lavfi", "-i", `color=c=0x0b0e12:s=${w}x${h}:r=${FPS}`, "-t", String(L), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
    fitLog.push({ tag, raw: v.raw, missing: true });
    return;
  }
  const { marks, cuts } = sidecar(v.raw);
  const D0 = probeDuration(raw);
  const at = (k, dflt) => (k == null ? dflt : k in marks ? marks[k] : Number.isFinite(+k) ? +k : (console.warn(`  ${tag}: no mark ${k}`), dflt));
  const a = Math.max(0, at(v.from ?? "start", 0)), b = Math.min(D0, at(v.to ?? "end", D0));
  // 1) the take's range minus logged waits -> constant-fps intermediate
  const keep = subtract([[a, b]], cuts);
  const mid = out.replace(/\.mp4$/, "-mid.mp4");
  ff(["-i", raw, "-vf", `fps=${FPS},select='${sel(keep)}',setpts=N/${FPS}/TB,scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1,format=yuv420p`,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", mid]);
  // 2) frozen stretches > FREEZE_MIN cut to FREEZE_KEEP (the final one keeps a little more for reading)
  const D1 = probeDuration(mid);
  const fz = freezes(mid);
  const fcuts = fz.map(([s, e]) => [s + (e >= D1 - 0.05 ? 1.1 : FREEZE_KEEP), e]).filter(([s, e]) => e - s > 0.1);
  const keep2 = subtract([[0, D1]], fcuts);
  const D = keep2.reduce((t, [x, y]) => t + y - x, 0);
  // 3) fit to L: speed up (≤3x, else keep the end), or slow down (≥0.5x), then hold whatever is left
  let speed = D / L, pre = "", hold = 0;
  if (speed > MAX_SPEED) { pre = `trim=start=${(D - L * MAX_SPEED).toFixed(3)},setpts=PTS-STARTPTS,`; speed = MAX_SPEED; }
  else if (speed < MIN_SPEED) { hold = L - D / MIN_SPEED; speed = MIN_SPEED; }
  ff(["-i", mid, "-vf", `select='${sel(keep2)}',setpts=N/${FPS}/TB,${pre}setpts=PTS/${speed.toFixed(5)},fps=${FPS},tpad=stop_mode=clone:stop_duration=${(hold + 1).toFixed(3)},trim=duration=${L.toFixed(3)},format=yuv420p`,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", out]);
  const rec = { tag, raw: v.raw, range: [+a.toFixed(2), +b.toFixed(2)], waitsCut: +(b - a - D1).toFixed(2), freezesCut: +(D1 - D).toFixed(2), footage: +D.toFixed(2), len: +L.toFixed(2), speed: +speed.toFixed(2), hold: +hold.toFixed(2) };
  fitLog.push(rec);
  console.log(`  ${tag}: ${v.raw} [${rec.range}] waits -${rec.waitsCut}s freezes -${rec.freezesCut}s -> ${rec.footage}s -> ${L.toFixed(2)}s (x${rec.speed}${hold ? `, hold ${hold.toFixed(2)}s` : ""})`);
}

// ---------- music bed: a soft synthesized pad (Am F C G), written once ----------
function bed(seconds) {
  const f = join(AUD, `bed-${Math.ceil(seconds)}.wav`);
  if (existsSync(f)) return f;
  const SR = 48000, n = Math.ceil(seconds * SR);
  const buf = Buffer.alloc(44 + n * 4);
  const midi = (m) => 440 * 2 ** ((m - 69) / 12);
  const chords = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]]; // Am F C G
  const CH = 8, XF = 2.5;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = Math.floor(t / CH), u = t - k * CH;
    let L = 0, R = 0;
    for (const [ci, gain] of [[k, 1], [k - 1, 0]]) {
      let g = gain ? Math.min(1, u / XF) : Math.max(0, 1 - u / XF);
      if (ci < 0 || g <= 0) continue;
      g = Math.sin((g * Math.PI) / 2);
      for (const [j, m] of chords[((ci % 4) + 4) % 4].entries()) {
        const fr = midi(m), amp = (j === 0 ? 0.55 : 0.32) * g;
        L += amp * (Math.sin(2 * Math.PI * fr * 0.999 * t) + 0.15 * Math.sin(4 * Math.PI * fr * t));
        R += amp * (Math.sin(2 * Math.PI * fr * 1.001 * t + 0.7) + 0.15 * Math.sin(4 * Math.PI * fr * t + 0.3));
      }
    }
    const lfo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.07 * t);
    const fade = Math.min(1, t / 2, (seconds - t) / 2.5);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L * 0.18 * lfo * fade)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R * 0.18 * lfo * fade)) * 32767), 46 + i * 4);
  }
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  const tmp = f.replace(/\.wav$/, "-dry.wav");
  writeFileSync(tmp, buf);
  ff(["-i", tmp, "-af", "lowpass=f=900,aecho=0.8:0.6:120|260:0.25|0.18,lowpass=f=1400", "-c:a", "pcm_s16le", f]);
  return f;
}

const PERSONA = [
  [/^(h1|w-inbox|w-owner|c-owner)/, "Sam · owner", "owner"],
  [/rex|c-crew/, "Marco · crew · Rex", "hardhat"],
  [/juno|anita/, "Anita · homeowner · Juno", "house"],
];

const browser = await launch(chromium);
try {
  const framePng = join(CARDS, "phone-frame.png");
  await renderPng(browser, join(DIR, "scenes", "phone-frame.html"), framePng, { width: PHONE.w, height: PHONE.h, transparent: true });
  const ind = {};
  for (const n of [1, 2, 3]) { ind[n] = join(CARDS, `indicator-${n}.png`); await renderPng(browser, join(DIR, "scenes", "indicator.html"), ind[n], { query: `n=${n}`, transparent: true }); }
  const splitBg = join(CARDS, "split.png");
  await renderPng(browser, join(DIR, "scenes", "split.html"), splitBg);

  let srt = "", n = 1;
  for (const seg of segs) {
    const out = join(CLIPS, `v3-${seg.id}.mp4`);
    const cs = cues(seg);
    for (const c of cs) srt += `${n++}\n${srtTime(seg.start + c.a)} --> ${srtTime(seg.start + c.b)}\n${c.text}\n\n`;
    const mode = seg.visual.type === "app" ? "app" : "scene";
    const subPngs = [];
    for (const [i, c] of cs.entries()) {
      const f = join(SUBS, `v3-${seg.id}-${i}.png`);
      await renderPng(browser, join(DIR, "scenes", "sub.html"), f, { query: new URLSearchParams({ text: c.text, mode }).toString(), transparent: true });
      subPngs.push({ f, ...c });
    }

    const base = join(CLIPS, `v3-${seg.id}-base.mp4`);
    const v = seg.visual;
    if (v.type === "scene") {
      const sceneFile = join(DIR, "scenes", `${v.scene}.html`);
      const deps = [sceneFile, join(DIR, "scenes", "base.css"), join(OUT, "hydra-proof.js"), join(OUT, "tests-run.js")];
      const fresh = existsSync(base) && Math.abs(probeDuration(base) - seg.len) < 0.05 && deps.every((d) => mtime(base) > mtime(d));
      if (forceScenes || !fresh) {
        const r = await renderScene(browser, sceneFile, base, seg.len);
        console.log(`  scene ${v.scene}: ${r.frames} frames (anim end ${r.animEnd.toFixed(1)}s)`);
      }
    } else if (v.type === "split") {
      const l = join(CLIPS, `v3-${seg.id}-l.mp4`), r = join(CLIPS, `v3-${seg.id}-r.mp4`);
      fitFootage(v.left, seg.len, l, `${seg.id}/left`);
      fitFootage(v.right, seg.len, r, `${seg.id}/right`);
      const { x: sx, y: sy } = PHONE.screen, dx = sx - PHONE.x;
      const XL = 420, XR = 1036;
      ff(["-loop", "1", "-framerate", String(FPS), "-i", splitBg, "-i", l, "-i", r, "-loop", "1", "-framerate", String(FPS), "-i", framePng,
        "-filter_complex", `[0:v][1:v]overlay=${XL + dx}:${sy}[a];[a][2:v]overlay=${XR + dx}:${sy}[b];[b][3:v]overlay=${XL}:${PHONE.y}[c];[c][3:v]overlay=${XR}:${PHONE.y},format=yuv420p[v]`,
        "-map", "[v]", "-t", seg.len.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", base]);
    } else {
      const [, who, ico] = PERSONA.find(([re]) => re.test(v.raw)) || [null, "", ""];
      const card = join(CARDS, `v3-card-${seg.id}.png`);
      await renderPng(browser, join(DIR, "scenes", "card.html"), card, { query: new URLSearchParams({ kicker: seg.kicker || "", headline: seg.headline || "", caption: seg.caption || "", who, icon: ico }).toString() });
      const app = join(CLIPS, `v3-${seg.id}-app.mp4`);
      fitFootage(v, seg.len, app, seg.id);
      const { x, y } = PHONE.screen;
      ff(["-loop", "1", "-framerate", String(FPS), "-i", card, "-i", app, "-loop", "1", "-framerate", String(FPS), "-i", framePng,
        "-filter_complex", `[0:v][1:v]overlay=${x}:${y}[b];[b][2:v]overlay=${PHONE.x}:${PHONE.y},format=yuv420p[v]`,
        "-map", "[v]", "-t", seg.len.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", base]);
    }
    // a slow, sub-pixel camera push-in (perspective, bilinear): no shot ever sits on a frozen frame
    const frames = Math.round(seg.len * FPS), Z = PUSH;
    const z = `(${Z}*in/${frames})`;
    const push = `perspective=x0=W*${z}:y0=H*${z}:x1=W*(1-${z}):y1=H*${z}:x2=W*${z}:y2=H*(1-${z}):x3=W*(1-${z}):y3=H*(1-${z}):interpolation=linear:eval=frame`;
    // highlight indicator + burned-in subtitles
    const inputs = ["-i", base];
    let graph = `[0:v]${push}[p];`, last = "p", k = 1;
    if (seg.highlight) { inputs.push("-loop", "1", "-framerate", String(FPS), "-i", ind[seg.highlight]); graph += `[p][1:v]overlay=0:0[i];`; last = "i"; k = 2; }
    subPngs.forEach((s, i) => {
      inputs.push("-loop", "1", "-framerate", String(FPS), "-i", s.f);
      graph += `[${last}][${k + i}:v]overlay=0:0:enable='between(t,${s.a.toFixed(3)},${s.b.toFixed(3)})'[s${i}];`;
      last = `s${i}`;
    });
    graph += `[${last}]format=yuv420p[v]`;
    ff([...inputs, "-filter_complex", graph, "-map", "[v]", "-t", seg.len.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out]);
  }
  writeFileSync(FINAL.replace(/\.mp4$/, ".srt"), srt);
  writeFileSync(join(OUT, "fit-log.json"), JSON.stringify(fitLog, null, 2));
} finally {
  await browser.close();
}
if (onlySegments) process.exit(0);

// ---------- final assembly: crossfades, narration at −16 LUFS, the bed ~12 LU under it and ducked under the voice ----------
const inputs = [];
for (const s of segs) inputs.push("-i", join(CLIPS, `v3-${s.id}.mp4`));
for (const s of segs) inputs.push("-i", join(TRIM, `${s.id}.wav`));
inputs.push("-i", bed(total + 1));
let g = "", prev = "0:v";
for (let i = 1; i < segs.length; i++) {
  g += `[${prev}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${(segs[i].start).toFixed(3)}[x${i}];`;
  prev = `x${i}`;
}
const N = segs.length;
segs.forEach((s, i) => { const ms = Math.round((s.start + LEAD) * 1000); g += `[${N + i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms}[a${i}];`; });
g += segs.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${N}:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-2:LRA=11,aresample=48000,asplit=2[nar][key];`;
g += `[${2 * N}:a]atrim=0:${total.toFixed(3)},aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-27:TP=-9:LRA=5,aresample=48000[bed0];`;
g += `[bed0][key]sidechaincompress=threshold=0.02:ratio=5:attack=60:release=700:makeup=1[bed];`;
g += `[nar][bed]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false,aresample=48000[aout]`;
ff([...inputs, "-filter_complex", g, "-map", `[${prev}]`, "-map", "[aout]", "-t", total.toFixed(3),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(FPS),
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", FINAL]);
console.log(`\nwrote ${FINAL} (${probeDuration(FINAL).toFixed(2)}s)`);
// narration-only track for the gap check in verify.mjs
const narOnly = join(OUT, "crewbrain-demo-v3-narration.wav");
ff([...segs.flatMap((s) => ["-i", join(TRIM, `${s.id}.wav`)]), "-filter_complex",
  segs.map((s, i) => { const ms = Math.round((s.start + LEAD) * 1000); return `[${i}:a]adelay=${ms}|${ms}[a${i}];`; }).join("") + segs.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${N}:normalize=0,apad,atrim=0:${total.toFixed(3)}[o]`,
  "-map", "[o]", narOnly]);
