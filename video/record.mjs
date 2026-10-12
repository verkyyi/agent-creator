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

if (args.includes("--reset")) {
  const b0 = await launch(chromium); const c0 = await b0.newContext(); const p0 = await c0.newPage();
  await p0.goto(abs(owner.url)).catch(() => {});
  const rr = await c0.request.post(BASE + "api/reset", { data: {} }).catch((e) => ({ status: () => e.message }));
  log("reset:", rr.status()); await b0.close();
}
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

// ---------------- chat-first helpers ----------------
async function skipOnboarding(page, showMs = 0) {
  const ob = page.locator("[data-testid=onboarding]");
  if (await ob.isVisible().catch(() => false)) {
    await sleep(showMs);
    await page.locator("#ob-skip").click().catch(() => page.getByRole("button", { name: /skip|start/i }).first().click());
    await sleep(800);
  }
}
async function menuTab(page, tab) {
  await page.locator("#menu-btn").click();
  await sleep(500);
  await page.locator(tab).first().click();
  await sleep(1200);
}
async function closeSheets(page) {
  for (let i = 0; i < 3; i++) {
    const c = page.locator(".onsite-close:visible, .sheet .sheet-close:visible").first();
    if (!(await c.count())) break;
    await c.click().catch(() => page.keyboard.press("Escape"));
    await sleep(600);
  }
}
async function ownerChat(page, text) { await closeSheets(page); return send(page, text, "api/creator/message"); }
async function approveLast(page) {
  const btn = page.locator("#approve-btn").last();
  await btn.waitFor({ state: "visible", timeout: 30000 });
  const card = page.locator(".approval-card").last();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(2500);
  const box = await card.boundingBox().catch(() => null);
  if (box && box.height > 600) { await gentleScroll(page, Math.min(box.height - 450, 700), 25); await sleep(1500); }
  await btn.scrollIntoViewIfNeeded();
  const ap = page.waitForResponse((r) => /api\/agents\/[^/]+\/approve/.test(r.url()), { timeout: 30000 }).catch(() => null);
  await btn.click();
  const r = await ap;
  try { return r ? await r.json() : null; } catch { return null; }
}
async function createViaChat(page, prompt, answers) {
  let body = await ownerChat(page, prompt);
  for (let turn = 0; turn < 4; turn++) {
    if (body?.proposal || (await page.locator("#approve-btn").count())) break;
    const reply = (body?.reply || "").toLowerCase();
    log("creator asked:", reply.slice(0, 140));
    const a = answers.find(([re]) => re.test(reply))?.[1] || answers.at(-1)[1];
    body = await ownerChat(page, a);
  }
  return approveLast(page);
}
async function openOwner(showOnboardingMs = 0) {
  const r = await recorded(browser);
  await r.page.goto(abs(owner.url), { waitUntil: "domcontentloaded" });
  await r.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await sleep(1000);
  await step("onboarding", () => skipOnboarding(r.page, showOnboardingMs));
  return r;
}
async function openPersona(identity, b = browser, extra = {}, { lang, talk = false, showWelcomeMs = 2500 } = {}) {
  const r = await recorded(b, extra);
  await r.page.goto(abs(identity.url), { waitUntil: "domcontentloaded" });
  await r.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await sleep(1000);
  await step("welcome", async () => {
    const w = r.page.locator("[data-testid=welcome]");
    if (!(await w.isVisible().catch(() => false))) return;
    if (lang) { await sleep(1200); await w.getByRole("button", { name: lang }).click().catch(() => {}); }
    await sleep(showWelcomeMs);
    await r.page.locator(talk ? "#welcome-talk" : "#welcome-type").click();
    await sleep(800);
  });
  return r;
}
const anita = () => find((i) => /anita/i.test(i.name)) || homeownerId();
const marco = () => find((i) => /marco/i.test(i.name)) || crewId();

// ---------------- seg 3: teach the brain (chat-first) ----------------
if (want(3)) await step("seg 3 brain", async () => {
  const r = await openOwner(3500);
  const { page } = r;
  await step("photo via chat attach", async () => {
    await page.locator("#attach-owner-btn").click();
    await sleep(700);
    await pickFile(page, "#attach-photo-btn", "#attach-photo-input", warranty);
  });
  await step("approve draft", async () => {
    const approve = page.locator("#draft-approve-btn, .save-knowledge-btn").last();
    await approve.waitFor({ state: "visible", timeout: 90000 });
    await sleep(3000);
    const b = page.locator("button[data-sharing=customer]").last();
    if (await b.count()) { await b.scrollIntoViewIfNeeded(); await b.click({ timeout: 3000 }).catch(() => {}); }
    await sleep(1200);
    await approve.scrollIntoViewIfNeeded();
    await approve.click();
    await sleep(3000);
  });
  await step("gate code by chat", async () => {
    await ownerChat(page, "Remember the side gate code is now 5520, crew only");
    const save = page.locator(".save-knowledge-btn").last();
    await save.waitFor({ state: "visible", timeout: 30000 });
    await save.scrollIntoViewIfNeeded();
    await sleep(2500);
    await save.click();
    await sleep(3000);
  });
  await step("brain list", async () => { await menuTab(page, "#tab-brain"); await sleep(1500); await gentleScroll(page, 700, 30); await sleep(2500); });
  await r.finish("seg-3");
});

// ---------------- seg 4: create Juno + Rex in chat ----------------
if (want(4)) await step("seg 4 create", async () => {
  const r = await openOwner(0);
  const { page } = r;
  const juno = await step("create Juno", () => createViaChat(page,
    "Make a helper for the Patels about their install at 42 Oak St, keep it until 30 days after handover",
    [[/who|household|homeowner|name|audience/, "The Patel household"], [/when|until|end|long|expire|handover/, "30 days after handover"], [/./, "Yes, that's right"]]));
  if (juno?.agent) { state.juno = { id: juno.agent.id, links: juno.links }; saveState(); }
  await step("share sheet + QR", async () => {
    const sheet = page.locator(".share-sheet").last();
    await sheet.waitFor({ state: "visible", timeout: 15000 });
    await sleep(2500);
    await sheet.locator(".qr-btn").first().click();
    await page.locator("[data-testid=onsite-qr]").waitFor({ state: "visible", timeout: 8000 });
    await sleep(2500);
    await page.locator(".onsite-close").first().click().catch(() => page.keyboard.press("Escape"));
    await sleep(800);
  });
  await closeSheets(page);
  await sleep(1200);
  const rex = await step("create Rex", () => createViaChat(page,
    "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm",
    [[/who|crew|audience|name|team/, "Bay Roofing's crew on the Oak St job"], [/when|until|end|long|expire/, "Until the job closes Friday at 6pm"], [/./, "Yes, go ahead"]]));
  if (rex?.agent) { state.rex = { id: rex.agent.id, links: rex.links }; saveState(); }
  await sleep(2500);
  await closeSheets(page);
  await step("show helpers", async () => { await ownerChat(page, "Show my helpers"); await sleep(3500); });
  await r.finish("seg-4");
});

// ---------------- seg 5: helpers at work ----------------
if (want(5)) {
  await step("seg 5a Anita + Juno", async () => {
    const r = await openPersona(anita());
    await step("ask warranty", () => send(r.page, "What does my panel warranty cover?", "/chat"));
    await sleep(3500);
    await step("ask battery", () => send(r.page, "Could you also add an EV charger in our garage?", "/chat"));
    await sleep(3000);
    await r.finish("seg-5-a-juno");
  });
  await step("seg 5b Marco + Rex in Spanish", async () => {
    const r = await openPersona(marco(), voiceBrowser, { permissions: ["microphone"] }, { lang: "Español", talk: true, showWelcomeMs: 1500 });
    const { page } = r;
    const voiced = await step("voice question", async () => {
      await page.waitForFunction(() => /c[oó]digo|puerta|5520|55\s?20/i.test(document.querySelector("#chat, main, body").innerText.split("Hola").pop()), null, { timeout: 35000 });
      await sleep(7000);
      if ((await page.locator("#mic-btn").getAttribute("aria-pressed")) === "true") await page.locator("#mic-btn").click().catch(() => {});
      return true;
    });
    if (!voiced) {
      if ((await page.locator("#mic-btn").getAttribute("aria-pressed").catch(() => null)) === "true") await page.locator("#mic-btn").click().catch(() => {});
      await step("typed Spanish fallback", () => send(page, "¿Cuál es el código de la puerta para el trabajo de Oak Street?", "/chat"));
    }
    await sleep(3000);
    await step("attach flashing photo", () => pickFile(page, "#attach-btn", "#attach-input", flashing));
    await sleep(1200);
    await step("log issue", () => send(page, "La tapajuntas está rota en la ventila norte. Avísale a Sam.", "/chat"));
    await sleep(4000);
    await r.finish("seg-5-b-rex");
  });
  await step("seg 5 owner inbox", async () => {
    const r = await openOwner(0);
    await step("inbox tab", async () => { await menuTab(r.page, "#tab-inbox"); await sleep(1500); });
    await step("open issue", async () => {
      const it = r.page.locator(".inbox-item", { hasText: /flash|tapajuntas|issue|Marco/i }).first();
      await it.waitFor({ timeout: 10000 });
      await sleep(1500); await it.click(); await sleep(4500);
      await r.page.locator(".sheet-close").first().click().catch(() => {});
    });
    await r.finish("seg-5-inbox");
  });
  await step("seg 5c owner summary + reply", async () => {
    const r = await openOwner(0);
    await step("what's new", async () => { await ownerChat(r.page, "What's new from my helpers?"); await sleep(5000); });
    await step("reply Anita", async () => {
      await ownerChat(r.page, "Tell Anita yes, we can add one after the inspection");
      const b = r.page.locator("#reply-send-btn").last();
      await b.waitFor({ state: "visible", timeout: 30000 });
      await b.scrollIntoViewIfNeeded();
      await sleep(2500);
      await b.click();
      await sleep(3000);
    });
    await r.finish("seg-5-c-owner");
  });
  await step("seg 5d Anita sees answer", async () => {
    const r = await openPersona(anita());
    await r.page.locator("text=/Sam answered/i").first().waitFor({ timeout: 10000 }).catch(() => {});
    await gentleScroll(r.page, 2000, 10);
    await sleep(4000);
    await r.finish("seg-5-d-anita");
  });
}

// ---------------- seg 6: prove the locks ----------------
if (want(6)) {
  await step("seg 6a Juno refuses", async () => {
    const r = await openPersona(anita());
    await step("gate code", () => send(r.page, "What's the gate code for the side gate?", "/chat"));
    await sleep(3000);
    await step("price book", () => send(r.page, "What do you charge per watt? Can I see your price book?", "/chat"));
    await sleep(3000);
    await r.finish("seg-6-a-juno");
  });
  if (otherOwner) await step("seg 6b other company sees nothing", async () => {
    const r = await recorded(browser);
    await r.page.goto(abs(otherOwner.url));
    await sleep(1500);
    await skipOnboarding(r.page, 0).catch(() => {});
    await step("ask creator", () => ownerChat(r.page, "What's the gate code at 42 Oak St for Rivera?"));
    await sleep(3500);
    await r.finish("seg-6-b-other");
  });
  await step("seg 6c/d close Rex live", async () => {
    const crew = await openPersona(marco(), browser, {}, { showWelcomeMs: 0 });
    const crewStart = Date.now();
    await step("crew asks", () => send(crew.page, "¿Dónde dejo la escalera hoy?", "/chat"));
    const o = await openOwner(0);
    let closedAt = Date.now();
    await step("close Rex", async () => {
      await ownerChat(o.page, "Close Rex");
      const b = o.page.getByRole("button", { name: /Close .* now/i }).last();
      await b.waitFor({ state: "visible", timeout: 30000 });
      await b.scrollIntoViewIfNeeded();
      await sleep(2000);
      await b.click();
      closedAt = Date.now();
      await sleep(3000);
    });
    await step("brief relocked", async () => {
      await menuTab(o.page, "#tab-brain");
      const item = o.page.locator(".brain-item", { hasText: /brief|Oak St|gate/i }).first();
      if (await item.count()) await item.scrollIntoViewIfNeeded();
      await sleep(3500);
    });
    await o.finish("seg-6-c-owner");
    await step("crew chat ended", async () => {
      const ended = crew.page.locator("#ended-screen");
      try { await ended.waitFor({ state: "visible", timeout: 6000 }); }
      catch { await send(crew.page, "¿Sigue igual el código?", "/chat").catch(() => {}); await ended.waitFor({ state: "visible", timeout: 10000 }); }
      await sleep(3500);
    });
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
