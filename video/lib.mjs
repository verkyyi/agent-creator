// Shared helpers for the CrewBrain demo video pipeline.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DIR = dirname(fileURLToPath(import.meta.url));
export const OUT = join(DIR, "out");
export const W = 1920, H = 1080, FPS = 30;
// Pacing (data-driven; see README): every segment is its narration + TAIL, plus any deliberate `hold`.
export const XFADE = 0.3;          // crossfade between segments (s)
export const LEAD = 0.15;          // narration starts this long after a segment begins
export const TAIL = 0.3;           // after the narration ends
export const MAX_GAP = 1.0;        // longest stretch without narration (the climax `hold` may reach 1.5)
// Phone placement on the 1920x1080 canvas (must match scenes/card.html .shadow and phone-frame.html)
export const PHONE = { x: 1314, y: 64, w: 464, h: 967, screen: { x: 1330, y: 80, w: 432, h: 935 } };

export const loadScript = () => JSON.parse(readFileSync(join(DIR, "script.json"), "utf8"));

export function probeDuration(file) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
}

/** Narration length per segment (trimmed audio, see compose.mjs) -> start/len for every segment. */
export function timeline(script, audioLen) {
  let t = 0;
  const segs = script.segments.map((s) => {
    const audio = audioLen(s);
    const need = LEAD + audio + TAIL + Math.min(s.hold || 0, 1.5 - LEAD - TAIL) + XFADE;
    const len = Math.round(Math.max(need, (s.minLen || 0) + XFADE) * FPS) / FPS;
    const seg = { ...s, audio, len, start: t };
    t += len - XFADE;
    return seg;
  });
  return { segs, total: t + XFADE };
}
function probeIf(f) { try { return existsSync(f) ? probeDuration(f) : null; } catch { return null; } }

export async function launch(chromium, opts = {}) {
  return chromium.launch({ headless: true, ...opts });
}

/** Render a static page (file path + optional query) to PNG. */
export async function renderPng(browser, file, out, { width = W, height = H, query = "", transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href + (query ? `?${query}` : ""));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}

/**
 * Render an animated HTML scene frame-by-frame (deterministic: Web Animations are paused and seeked),
 * piping JPEG frames into ffmpeg. Frames stop once all finite animations end; the last frame is held.
 */
export async function renderScene(browser, file, out, duration) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const end = await page.evaluate(() => {
    const anims = document.getAnimations();
    anims.forEach((a) => a.pause());
    let end = 0;
    for (const a of anims) {
      const t = a.effect.getComputedTiming();
      if (Number.isFinite(t.endTime)) end = Math.max(end, t.endTime);
    }
    return end / 1000;
  });
  const animFrames = Math.min(Math.ceil((end + 0.3) * FPS), Math.round(duration * FPS));
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", `tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-r", String(FPS), out], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));
  for (let i = 0; i < animFrames; i++) {
    const ms = (i / FPS) * 1000;
    await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.currentTime = ms; }), ms);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  await page.close();
  return { frames: animFrames, animEnd: end };
}

export function ff(args) {
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}
