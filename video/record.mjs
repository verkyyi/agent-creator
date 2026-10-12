#!/usr/bin/env node
// Drive the REAL Crewbrain app in a phone viewport and record one webm per segment/persona into video/out/raw/.
// Usage: BASE=http://127.0.0.1:8787/ node video/record.mjs [--only=3,4,5,6] [--placeholder]
//   --placeholder  record the public landing page as stand-in footage (raw/placeholder.webm) — no app needed.
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DIR, OUT, launch, renderPng } from "./lib.mjs";

const BASE = (process.env.BASE || "http://127.0.0.1:8787/").replace(/\/?$/, "/");
const RAW = join(OUT, "raw"), TMP = join(RAW, "_tmp");
mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean).map(Number);
const want = (n) => !only.length || only.includes(n);
const STATE = join(RAW, "state.json");
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const saveState = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
const trims = {};

const VIEW = { width: 390, height: 844 };
const ctxOpts = { viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US", recordVideo: { dir: TMP, size: { width: 390, height: 844 } } };
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn) {
  try { log("→", name); return await fn(); } catch (e) { log("✗", name, "—", String(e.message || e).split("\n")[0]); return undefined; }
}
/** Start a recorded context; returns { page, finish(name) } which saves raw/<name>.webm */
async function recorded(browser, extra = {}) {
  const t0 = Date.now();
  const ctx = await browser.newContext({ ...ctxOpts, ...extra });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  return {
    ctx, page, t0,
    async finish(name) {
      const video = page.video();
      await ctx.close();
      const src = video && (await video.path());
      if (src && existsSync(src)) { const dst = join(RAW, `${name}.webm`); renameSync(src, dst); log("saved", dst); }
    },
  };
}
async function type(page, sel, text) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  await el.click();
  await el.fill("");
  await el.pressSequentially(text, { delay: 38 + Math.round(Math.random() * 20) });
  await sleep(350);
}
async function send(page, text, urlPart) {
  await type(page, "#composer-input", text);
  const resp = page.waitForResponse((r) => r.url().includes(urlPart) && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
  await page.locator("#send-btn").first().click();
  const r = await resp;
  let body = null;
  try { body = r ? await r.json() : null; } catch {}
  await sleep(1800); // let the reply render and be read
  return body;
}
async function gentleScroll(page, px = 600, steps = 12) {
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await sleep(60); }
}
async function pickFile(page, triggerSel, inputSel, file) {
  const chooser = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null);
  await page.locator(triggerSel).first().click().catch(() => {});
  const fc = await chooser;
  if (fc) await fc.setFiles(file);
  else await page.locator(inputSel).first().setInputFiles(file);
}

// ---------------- placeholder mode ----------------
if (args.includes("--placeholder")) {
  const browser = await launch(chromium);
  const r = await recorded(browser);
  await r.page.goto("https://verkyyi.github.io/agent-creator/", { waitUntil: "networkidle" }).catch(() => {});
  await sleep(2500);
  for (let i = 0; i < 10; i++) { await gentleScroll(r.page, 500, 20); await sleep(1200); }
  await r.finish("placeholder");
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
}

// ---------------- assets ----------------
const warranty = join(DIR, "assets", "warranty-card.png");
const flashing = join(DIR, "assets", "flashing.png");
const esWav = join(OUT, "audio", "es-question.wav");
{
  const b = await launch(chromium);
  if (!existsSync(warranty)) await renderPng(b, join(DIR, "assets", "warranty-card.html"), warranty, { width: 1200, height: 900 });
  if (!existsSync(flashing)) await renderPng(b, join(DIR, "assets", "flashing.html"), flashing, { width: 900, height: 1200 });
  await b.close();
}

// ---------------- identities ----------------
async function identities() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + "api/demo/identities");
      if (r.ok) return (await r.json()).identities || [];
      log("identities HTTP", r.status);
    } catch (e) { log("waiting for app at", BASE, "-", e.cause?.code || e.message); }
    await sleep(2000);
  }
  throw new Error(`app not reachable at ${BASE}`);
}
const abs = (u) => (u ? new URL(u, BASE).href : u);
let ids = await identities();
log("identities:", ids.map((i) => `${i.name} (${i.role})`).join(", "));
const find = (pred) => ids.find(pred);
const owner = find((i) => i.role === "owner" && /sam|rivera/i.test(i.name)) || find((i) => i.role === "owner");
const otherOwner = ids.find((i) => i.role === "owner" && i !== owner);
const homeownerId = () => find((i) => /patel|homeowner/i.test(`${i.name} ${i.role}`));
const crewId = () => find((i) => /bay|crew|roof/i.test(`${i.name} ${i.role}`) && i.role !== "owner");

const browser = await launch(chromium);
const voiceBrowser = await launch(chromium, {
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${esWav}%noloop`],
});

async function ownerPage() {
  const r = await recorded(browser);
  await r.page.goto(abs(owner.url), { waitUntil: "domcontentloaded" });
  await r.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await sleep(1200);
  return r;
}
/** Converse with the creator until an approval card shows; answer follow-ups from the reply text. */
async function createHelper(page, prompt, answers) {
  let body = await send(page, prompt, "api/creator/message");
  for (let turn = 0; turn < 4; turn++) {
    if (body?.proposal || (await page.locator(".approval-card").count())) break;
    const reply = (body?.reply || "").toLowerCase();
    log("creator asked:", reply.slice(0, 140));
    const a = answers.find(([re]) => re.test(reply))?.[1] || answers.at(-1)[1];
    body = await send(page, a, "api/creator/message");
  }
  const card = page.locator(".approval-card").last();
  await card.waitFor({ state: "visible", timeout: 30000 });
  await card.scrollIntoViewIfNeeded();
  await sleep(1500);
  // slow pan over the card so viewers can read it
  const box = await card.boundingBox();
  if (box && box.height > 600) await gentleScroll(page, Math.min(box.height - 500, 700), 25);
  await sleep(2500);
  const approved = page.waitForResponse((r) => /api\/agents\/[^/]+\/approve/.test(r.url()), { timeout: 30000 }).catch(() => null);
  const btn = card.locator("#approve-btn");
  await ((await btn.count()) ? btn : page.locator("#approve-btn").last()).click();
  const r = await approved;
  let res = null;
  try { res = r ? await r.json() : null; } catch {}
  await step("share sheet", async () => { await page.locator(".share-sheet").first().waitFor({ state: "visible", timeout: 10000 }); await sleep(3500); });
  await step("dismiss share sheet", async () => {
    const close = page.locator(".sheet-close, .share-sheet [aria-label='Close']").first();
    if (await close.count()) await close.click(); else await page.keyboard.press("Escape");
    await sleep(800);
  });
  return res;
}

// ---------------- seg 3: build the brain ----------------
if (want(3)) await step("seg 3 brain", async () => {
  const r = await ownerPage();
  const { page } = r;
  await step("open brain tab", async () => { await page.locator("#tab-brain").click(); await sleep(1500); });
  await step("snap warranty card", async () => { await pickFile(page, "#snap-btn", "#photo-input", warranty); });
  await step("wait for draft + approve", async () => {
    // draft sheet: #draft-approve-btn (fallback #approve-btn); lock picker: button[data-sharing]
    const approve = page.locator("#draft-approve-btn, [data-testid=draft-sheet] #approve-btn").first();
    await approve.waitFor({ state: "visible", timeout: 90000 });
    await sleep(3000); // read the draft
    await step("pick Homeowners lock", async () => {
      const b = page.locator("[data-testid=draft-sheet] button[data-sharing=customer], .lock-picker button[data-sharing=customer]").first();
      if (await b.count()) { await b.scrollIntoViewIfNeeded(); await b.click({ timeout: 3000 }); }
    });
    await sleep(1200);
    await approve.scrollIntoViewIfNeeded();
    await approve.click();
  });
  await step("item in brain", async () => {
    await page.locator(".brain-item", { hasText: /SunPeak|warranty/i }).first().waitFor({ timeout: 20000 });
    await sleep(2500);
  });
  await step("scroll brain list", async () => { await gentleScroll(page, 900, 40); await sleep(2500); await gentleScroll(page, -900, 20); await sleep(1500); });
  await r.finish("seg-3");
});

// ---------------- seg 4: create Juno + Rex ----------------
if (want(4)) await step("seg 4 create", async () => {
  const r = await ownerPage();
  const { page } = r;
  await step("open create tab", async () => { await page.locator("#tab-create").click(); await sleep(1200); });
  const juno = await step("create Juno", () => createHelper(page,
    "Make a helper for the Patels about their install at 42 Oak St, keep it until 30 days after handover",
    [[/who|household|homeowner|name|audience/, "The Patel household"], [/when|until|end|long|expire|handover/, "30 days after handover"], [/./, "Yes, that's right"]]));
  if (juno?.agent) { state.juno = { id: juno.agent.id, links: juno.links }; saveState(); }
  await sleep(1500);
  const rex = await step("create Rex", () => createHelper(page,
    "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm",
    [[/who|crew|audience|name|team/, "Bay Roofing's crew on the Oak St job"], [/when|until|end|long|expire/, "Until the job closes Friday at 6pm"], [/./, "Yes, go ahead"]]));
  if (rex?.agent) { state.rex = { id: rex.agent.id, links: rex.links }; saveState(); }
  await step("helpers tab", async () => { await page.locator("#tab-helpers").click(); await sleep(3500); });
  await r.finish("seg-4");
});

// links for helpers: approve response -> identities -> owner API
async function helperUrl(which) {
  const s = state[which];
  if (s?.links?.length) return abs(s.links[0].url);
  ids = await identities().catch(() => ids);
  const id = which === "juno" ? homeownerId() : crewId();
  if (id) return abs(id.url);
  throw new Error(`no link for ${which}`);
}
async function personaPage(which, b = browser, extra = {}) {
  const r = await recorded(b, extra);
  await r.page.goto(await helperUrl(which), { waitUntil: "domcontentloaded" });
  await r.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  return r;
}

// ---------------- seg 5: helpers at work ----------------
if (want(5)) {
  await step("seg 5a Juno answers with source", async () => {
    const r = await personaPage("juno");
    await step("ask warranty", () => send(r.page, "What does my panel warranty cover?", "/chat"));
    await sleep(3500);
    await step("request walkthrough", () => send(r.page, "Can someone walk us through the system in person next week?", "/chat"));
    await sleep(3500);
    await r.finish("seg-5-a-juno");
  });
  await step("seg 5b Rex in Spanish + issue", async () => {
    const r = await personaPage("rex", voiceBrowser, { permissions: ["microphone"] });
    const { page } = r;
    const before = await page.locator("body").innerText().catch(() => "");
    const voiced = await step("voice question", async () => {
      await page.locator("#mic-btn").click();
      // fake mic plays es-question.wav (~9s). Wait for a Spanish answer to appear.
      await page.waitForFunction((b) => { const t = document.body.innerText; return t.length > b.length + 40 && /c[oó]digo|puerta/i.test(t); }, before.length, { timeout: 30000 });
      await sleep(6000);
      await page.locator("#mic-btn").click().catch(() => {}); // stop
      return true;
    });
    if (!voiced) await step("typed Spanish fallback", () => send(page, "¿Cuál es el código de la puerta para el trabajo de Oak Street?", "/chat"));
    await sleep(3000);
    await step("attach flashing photo", () => pickFile(page, "#attach-btn", "#attach-input", flashing));
    await sleep(1200);
    await step("log issue", () => send(page, "Flashing cracked at the north vent. Log it for Sam.", "/chat"));
    await sleep(4000);
    await r.finish("seg-5-b-rex");
  });
  await step("seg 5c owner inbox", async () => {
    const r = await ownerPage();
    await r.page.locator("#tab-inbox").click();
    await r.page.locator(".inbox-item").first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(4000);
    await r.finish("seg-5-c-inbox");
  });
}

// ---------------- seg 6: prove the locks ----------------
if (want(6)) {
  await step("seg 6a Juno refuses", async () => {
    const r = await personaPage("juno");
    await step("gate code", () => send(r.page, "What's the gate code for the job?", "/chat"));
    await sleep(3000);
    await step("price book", () => send(r.page, "What do you charge per watt? Can I see your price book?", "/chat"));
    await sleep(3000);
    await r.finish("seg-6-a-juno");
  });
  if (otherOwner) await step("seg 6b other company sees nothing", async () => {
    const r = await recorded(browser);
    await r.page.goto(abs(otherOwner.url));
    await sleep(1500);
    await step("brain tab", async () => { await r.page.locator("#tab-brain").click(); await sleep(2500); });
    await step("ask creator", async () => { await r.page.locator("#tab-create").click(); await send(r.page, "What's the gate code at 42 Oak St?", "api/creator/message"); });
    await sleep(3000);
    await r.finish("seg-6-b-other");
  });
  await step("seg 6c/d close job live", async () => {
    const crew = await personaPage("rex");
    const crewStart = Date.now();
    await step("crew asks", () => send(crew.page, "Which ladder spot is clear today?", "/chat"));
    const o = await ownerPage();
    await step("helpers tab", async () => { await o.page.locator("#tab-helpers").click(); await sleep(1500); });
    let closedAt = Date.now();
    await step("close Rex", async () => {
      const card = o.page.locator(".helper-card", { hasText: /Rex/ }).first();
      await card.scrollIntoViewIfNeeded();
      await sleep(1000);
      await card.locator(".close-job-btn").click();
      await sleep(1200);
      await o.page.locator(".confirm-close-btn").first().click();
      closedAt = Date.now();
      await sleep(2500);
    });
    await step("brief relocked", async () => {
      await o.page.locator("#tab-brain").click();
      await sleep(1200);
      const item = o.page.locator(".brain-item", { hasText: /brief|Oak St|gate/i }).first();
      if (await item.count()) await item.scrollIntoViewIfNeeded();
      await sleep(3500);
    });
    await o.finish("seg-6-c-owner");
    await step("crew chat ended", async () => {
      const ended = crew.page.locator("#ended-screen");
      try { await ended.waitFor({ state: "visible", timeout: 6000 }); }
      catch { await send(crew.page, "Is the gate still the same code?", "/chat"); await ended.waitFor({ state: "visible", timeout: 10000 }); }
      await sleep(3500);
    });
    // in the crew recording, skip the wait while the owner was acting: start ~2s before the close tap
    trims["seg-6-d-crew"] = Math.max(0, (closedAt - crewStart) / 1000 - 2);
    await crew.finish("seg-6-d-crew");
  });
}

await browser.close();
await voiceBrowser.close();
// apply trims (cut the head of recordings where we were waiting on another persona)
const { ff } = await import("./lib.mjs");
for (const [name, start] of Object.entries(trims)) {
  const f = join(RAW, `${name}.webm`);
  if (!existsSync(f) || start < 1) continue;
  const t = join(RAW, `${name}.trim.webm`);
  ff(["-ss", start.toFixed(2), "-i", f, "-c:v", "libvpx", "-b:v", "4M", "-an", t]);
  renameSync(t, f);
  log(`trimmed ${start.toFixed(1)}s off ${name}`);
}
rmSync(TMP, { recursive: true, force: true });
log("done. raw clips:", readdirSync(RAW).filter((f) => f.endsWith(".webm")).join(", "));
