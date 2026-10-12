#!/usr/bin/env node
// Assemble the final 1920x1080 demo: scenes + phone-framed app clips + caption cards + narration + subtitles.
// Usage: node video/compose.mjs [--force-scenes] [--only-segments]   (output: video/out/crewbrain-demo.mp4)
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DIR, OUT, W, H, FPS, XFADE, LEAD, PHONE, loadScript, timeline, launch, renderPng, renderScene, probeDuration, ff } from "./lib.mjs";

const args = process.argv.slice(2);
const forceScenes = args.includes("--force-scenes");
const onlySegments = args.includes("--only-segments");
const CLIPS = join(OUT, "clips"), CARDS = join(OUT, "cards"), RAW = join(OUT, "raw"), SUBS = join(OUT, "subs");
for (const d of [CLIPS, CARDS, RAW, SUBS]) mkdirSync(d, { recursive: true });

const script = loadScript();
const { segs, total } = timeline(script);
console.log(`timeline total ${total.toFixed(2)}s`);
for (const s of segs) console.log(`  seg-${s.id} ${s.name.padEnd(7)} start ${s.start.toFixed(2).padStart(6)}  len ${s.len.toFixed(2)}  narration ${s.audio.toFixed(2)}`);

// ---------- subtitle chunks ----------
function chunks(text, max = 78) {
  const sentences = text.match(/[^.!?]+[.!?]+["”]?\s*|[^.!?]+$/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    if (s.length <= max) { out.push(s); continue; }
    // split on commas/colons first, then words, greedily
    const parts = s.split(/(?<=[,:;])\s+/);
    let cur = "";
    for (const p of parts) {
      if (p.length > max) {
        for (const w of p.split(" ")) {
          if ((cur + " " + w).trim().length > max) { out.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim();
        }
      } else if ((cur + " " + p).trim().length > max) { if (cur) out.push(cur.trim()); cur = p; }
      else cur = (cur + " " + p).trim();
    }
    if (cur) out.push(cur.trim());
  }
  return out;
}
function cues(seg) {
  const cs = chunks(seg.narration);
  const weight = cs.map((c) => c.length + 12);
  const sum = weight.reduce((a, b) => a + b, 0);
  let t = LEAD;
  return cs.map((text, i) => {
    const d = (weight[i] / sum) * seg.audio;
    const cue = { text, a: t, b: t + d };
    t += d;
    return cue;
  });
}
const srtTime = (x) => {
  const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

const browser = await launch(chromium);
try {
  // ---------- static assets ----------
  const framePng = join(CARDS, "phone-frame.png");
  await renderPng(browser, join(DIR, "scenes", "phone-frame.html"), framePng, { width: PHONE.w, height: PHONE.h, transparent: true });
  const warranty = join(DIR, "assets", "warranty-card.png");
  if (!existsSync(warranty)) await renderPng(browser, join(DIR, "assets", "warranty-card.html"), warranty, { width: 1200, height: 900 });

  let srt = "", n = 1;
  const stepOf = { brain: 1, create: 2, use: 3, locks: 4 };
  const whoOf = { owner: "Sam · Owner view", customer: "Homeowner + crew view", mixed: "Owner · homeowner · crew" };

  for (const seg of segs) {
    const out = join(CLIPS, `seg-${seg.id}.mp4`);
    const cs = cues(seg);
    for (const c of cs) { srt += `${n++}\n${srtTime(seg.start + c.a)} --> ${srtTime(seg.start + c.b)}\n${c.text}\n\n`; }
    const mode = seg.visual.type === "app" ? "app" : "scene";
    const subPngs = [];
    for (const [i, c] of cs.entries()) {
      const f = join(SUBS, `seg-${seg.id}-${i}.png`);
      await renderPng(browser, join(DIR, "scenes", "sub.html"), f, { query: new URLSearchParams({ text: c.text, mode }).toString(), transparent: true });
      subPngs.push({ f, ...c });
    }

    // base video (no subtitles) for this segment
    const base = join(CLIPS, `seg-${seg.id}-base.mp4`);
    if (seg.visual.type === "scene") {
      const sceneFile = join(DIR, "scenes", `${seg.visual.scene}.html`);
      const fresh = existsSync(base) && Math.abs(probeDuration(base) - seg.len) < 0.1 && statSync(base).mtimeMs > statSync(sceneFile).mtimeMs;
      if (forceScenes || !fresh) {
        const r = await renderScene(browser, sceneFile, base, seg.len);
        console.log(`  scene ${seg.visual.scene}: ${r.frames} frames rendered (anim end ${r.animEnd.toFixed(1)}s)`);
      }
    } else {
      const card = join(CARDS, `card-${seg.id}.png`);
      await renderPng(browser, join(DIR, "scenes", "card.html"), card, {
        query: new URLSearchParams({ kicker: seg.kicker, headline: seg.headline, caption: seg.caption, step: stepOf[seg.visual.flow] || 0, who: whoOf[seg.visual.persona] || "" }).toString(),
      });
      const app = join(CLIPS, `seg-${seg.id}-app.mp4`);
      fitAppFootage(seg, app);
      const { x, y, w, h } = PHONE.screen;
      ff(["-loop", "1", "-framerate", String(FPS), "-i", card, "-i", app, "-loop", "1", "-framerate", String(FPS), "-i", framePng,
        "-filter_complex", `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[app];[0:v][app]overlay=${x}:${y}[b];[b][2:v]overlay=${PHONE.x}:${PHONE.y},format=yuv420p[v]`,
        "-map", "[v]", "-t", String(seg.len), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "16", base]);
    }
    // burn subtitles (PNG overlays, timed)
    const inputs = ["-i", base];
    let graph = "", last = "0:v";
    subPngs.forEach((s, i) => {
      inputs.push("-loop", "1", "-framerate", String(FPS), "-i", s.f);
      graph += `[${last}][${i + 1}:v]overlay=0:0:enable='between(t,${s.a.toFixed(3)},${s.b.toFixed(3)})'[s${i}];`;
      last = `s${i}`;
    });
    graph += `[${last}]format=yuv420p[v]`;
    ff([...inputs, "-filter_complex", graph, "-map", "[v]", "-t", String(seg.len), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "17", out]);
    console.log(`  seg-${seg.id} clip ok (${probeDuration(out).toFixed(2)}s)`);
  }
  writeFileSync(join(OUT, "crewbrain-demo.srt"), srt);
} finally {
  await browser.close();
}
if (onlySegments) process.exit(0);

// ---------- final assembly ----------
const inputs = [];
for (const s of segs) inputs.push("-i", join(CLIPS, `seg-${s.id}.mp4`));
for (const s of segs) inputs.push("-i", join(OUT, "audio", `seg-${s.id}.mp3`));
let g = "", prev = "0:v", acc = segs[0].len;
for (let i = 1; i < segs.length; i++) {
  const off = (acc - XFADE).toFixed(3);
  g += `[${prev}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${off}[x${i}];`;
  prev = `x${i}`;
  acc += segs[i].len - XFADE;
}
const N = segs.length;
segs.forEach((s, i) => {
  const ms = Math.round((s.start + LEAD) * 1000);
  g += `[${N + i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}];`;
});
g += segs.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${N}:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`;
const final = join(OUT, "crewbrain-demo.mp4");
ff([...inputs, "-filter_complex", g, "-map", `[${prev}]`, "-map", "[aout]", "-t", total.toFixed(3),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(FPS),
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final]);
console.log(`\nwrote ${final} (${probeDuration(final).toFixed(2)}s)`);

// ---------- app footage: concat raw webm(s) for the segment, fit to segment length ----------
function fitAppFootage(seg, out) {
  let raws = existsSync(RAW) ? readdirSync(RAW).filter((f) => new RegExp(`^seg-${seg.id}([-_.].*)?\\.webm$`).test(f)).sort().map((f) => join(RAW, f)) : [];
  raws = raws.filter((f) => { try { return probeDuration(f) > 0.5; } catch { return false; } });
  if (!raws.length && existsSync(join(RAW, "placeholder.webm"))) raws = [join(RAW, "placeholder.webm")];
  if (!raws.length) {
    console.warn(`  seg-${seg.id}: no app footage — using a blank phone screen`);
    ff(["-f", "lavfi", "-i", `color=c=0x0b0e12:s=390x844:r=${FPS}`, "-t", String(seg.len), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
    return;
  }
  const { w, h } = PHONE.screen;
  const tmp = out.replace(/\.mp4$/, "-cat.mp4");
  const ins = raws.flatMap((f) => ["-i", f]);
  const norm = raws.map((_, i) => `[${i}:v]fps=${FPS},scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},setsar=1[n${i}]`).join(";");
  ff([...ins, "-filter_complex", `${norm};${raws.map((_, i) => `[n${i}]`).join("")}concat=n=${raws.length}:v=1:a=0,format=yuv420p[v]`, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", tmp]);
  const D = probeDuration(tmp);
  const L = seg.len;
  let vf;
  if (D > L) {
    const MAXSPEED = 4;
    const speed = D / L;
    // too long even at 4x: keep the last part (results usually matter most), sped up 4x
    vf = speed <= MAXSPEED ? `setpts=PTS*${(L / D).toFixed(6)}` : `trim=start=${(D - L * MAXSPEED).toFixed(3)},setpts=(PTS-STARTPTS)/${MAXSPEED}`;
    console.log(`  seg-${seg.id}: footage ${D.toFixed(1)}s -> ${L.toFixed(1)}s (x${Math.min(speed, MAXSPEED).toFixed(2)})`);
  } else {
    vf = `tpad=stop_mode=clone:stop_duration=${(L - D + 1).toFixed(3)}`;
    console.log(`  seg-${seg.id}: footage ${D.toFixed(1)}s, holding last frame to ${L.toFixed(1)}s`);
  }
  ff(["-i", tmp, "-vf", `${vf},fps=${FPS},trim=duration=${L},format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out]);
}
