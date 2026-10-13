#!/usr/bin/env node
// Drive the REAL Crewbrain app in a phone viewport and record one webm per shot into video/out/raw/.
// Each shot also writes raw/<name>.json: { marks: { name: seconds }, cuts: [[from, to], ...] }.
// `marks` are story beats compose.mjs can split a take on; `cuts` are waits (server, network, polling)
// that compose removes, so the cut never shows anybody waiting.
//
// Usage: BASE=http://127.0.0.1:8787/ node video/record.mjs [--only=h1,main] [--typed]
//   h1     Highlight 1: Sam creates a helper with one spoken sentence in the full-screen voice overlay
//          (Chromium fake mic plays out/audio/owner-voice.wav). --typed: the typed fallback.
//   main   everything else, in one sandbox: opening split, Highlight 2, the work section, the Close-job climax.
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DIR, OUT, launch, renderPng } from "./lib.mjs";

const BASE = (process.env.BASE || "http://127.0.0.1:8787/").replace(/\/?$/, "/");
const RAW = join(OUT, "raw"), TMP = join(RAW, "_tmp"), SHOTS = join(OUT, "rec-shots");
for (const d of [TMP, SHOTS]) mkdirSync(d, { recursive: true });
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const typed = args.includes("--typed");
const script = JSON.parse(readFileSync(join(DIR, "script.json"), "utf8"));

const VIEW = { width: 390, height: 844 };
const ctxOpts = { viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US", recordVideo: { dir: TMP, size: { width: 390, height: 844 } } };
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

async function step(name, fn) {
  try { log("→", name); return await fn(); } catch (e) { failures++; log("✗", name, "—", String(e.message || e).split("\n")[0]); return undefined; }
}

/** A recorded browser context. mark()/wait() keep the timing sidecar that compose.mjs reads. */
async function recorded(browser, { init = {}, extra = {} } = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, ...extra });
  await ctx.addInitScript((kv) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch {} }, init);
  const page = await ctx.newPage();
  const t0 = Date.now(); // the screencast starts with the first page
  page.setDefaultTimeout(20000);
  const marks = {}, cuts = [];
  const now = () => (Date.now() - t0) / 1000;
  return {
    ctx, page, now,
    mark(name, t = now()) { marks[name] = t; log("  mark", name, marks[name].toFixed(2)); },
    /** Await something slow; the wait is cut except `head` s at its start and `tail` s at its end. */
    async wait(p, { head = 0.5, tail = 0.35 } = {}) {
      const a = now();
      try { return await p; } finally { const b = now(); if (b - a > head + tail + 0.2) cuts.push([+(a + head).toFixed(3), +(b - tail).toFixed(3)]); }
    },
    cut(a, b) { if (b - a > 0.2) cuts.push([+a.toFixed(3), +b.toFixed(3)]); },
    async shot(n) { await page.screenshot({ path: join(SHOTS, `${n}.png`) }).catch(() => {}); },
    async finish(name) {
      marks.start ??= 0; marks.end = now();
      const video = page.video();
      await ctx.close();
      const src = video && (await video.path());
      if (src && existsSync(src)) {
        renameSync(src, join(RAW, `${name}.webm`));
        writeFileSync(join(RAW, `${name}.json`), JSON.stringify({ marks, cuts }, null, 2));
        log("saved", name, `(${marks.end.toFixed(1)}s, ${cuts.length} cuts, -${cuts.reduce((s, [a, b]) => s + b - a, 0).toFixed(1)}s)`);
      }
    },
  };
}

// ---------------- app helpers ----------------
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
const abs = (u) => new URL(u, BASE).href;
const who = (ids, re) => ids.find((i) => re.test(i.name));

/** Fill (no per-character typing) and send; wait for the creator's JSON reply (cut) and its render. */
async function ownerSay(r, text, { typeDelay = 0 } = {}) {
  const { page } = r;
  await closeSheets(page);
  const input = page.locator("#composer-input");
  await input.click();
  if (typeDelay) await input.pressSequentially(text, { delay: typeDelay }); else await input.fill(text);
  await sleep(450);
  const resp = page.waitForResponse((x) => x.url().includes("api/creator/message") && x.request().method() === "POST", { timeout: 90000 });
  await page.locator("#send-btn").click();
  const res = await r.wait(resp.catch(() => null), { head: 0.7 });
  await sleep(500);
  try { return res ? await res.json() : null; } catch { return null; }
}
/** Helper chat (streaming): fill, send, wait until the helper's message is in the chat. */
async function helperSay(r, text, { photo, typeDelay = 22 } = {}) {
  const { page } = r;
  const sel = "#chat > .msg.in:not(.pending):not(.typing), #chat > .owner-update, #chat > .owner-answer, #chat > .action-chip";
  const before = await page.locator(sel).count();
  if (photo) {
    const fc = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null);
    await page.locator("#attach-btn").click();
    const chooser = await fc;
    if (chooser) await chooser.setFiles(photo); else await page.locator("#attach-input").setInputFiles(photo);
    await sleep(700);
  }
  const input = page.locator("#composer-input");
  await input.click();
  await input.pressSequentially(text, { delay: typeDelay }); // very fast typing: motion, not a wait
  await sleep(300);
  await page.locator("#send-btn").click();
  // Keep the first ~1.2 s ("Checking your notes…", the sources found) and the arrival; cut the rest.
  await r.wait(page.waitForFunction(([s, n]) => document.querySelectorAll(s).length > n && !document.querySelector("#chat .pending, #chat .typing"), [sel, before], { timeout: 60000 }).catch(() => null), { head: 1.2, tail: 0.2 });
  await sleep(300);
}
async function closeSheets(page) {
  for (let i = 0; i < 3; i++) {
    const c = page.locator(".onsite-close:visible, .sheet-close:visible").first();
    if (!(await c.count())) break;
    await c.click().catch(() => page.keyboard.press("Escape"));
    await sleep(400);
  }
}
async function menuTab(page, tab) {
  await page.locator("#menu-btn").click();
  await sleep(350);
  await page.locator(tab).first().click();
  await sleep(700);
}
async function smoothScroll(page, sel, px, ms) {
  await page.evaluate(([sel, px, ms]) => new Promise((res) => {
    const el = document.querySelector(sel) || document.scrollingElement;
    const y0 = el.scrollTop, t0 = performance.now();
    const f = (t) => { const k = Math.min(1, (t - t0) / ms); el.scrollTop = y0 + px * (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2); k < 1 ? requestAnimationFrame(f) : res(); };
    requestAnimationFrame(f);
  }), [sel, px, ms]);
}
async function gotoLink(r, url) {
  await r.page.goto(abs(url), { waitUntil: "domcontentloaded" });
  await r.wait(r.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}), { head: 0.2, tail: 0.2 });
  await sleep(500);
}
/** Unrecorded owner setup: create + approve a helper by text. Returns the approve response. */
async function createHelper(page, prompt, answers) {
  const say = async (t) => {
    await closeSheets(page);
    await page.locator("#composer-input").fill(t);
    const resp = page.waitForResponse((x) => x.url().includes("api/creator/message"), { timeout: 90000 }).catch(() => null);
    await page.locator("#send-btn").click();
    try { return await (await resp).json(); } catch { return null; }
  };
  let body = await say(prompt);
  for (let turn = 0; turn < 4 && !(body?.proposal) && !(await page.locator("#approve-btn").count()); turn++) {
    const reply = (body?.reply || "").toLowerCase();
    log("  creator asked:", reply.slice(0, 120));
    body = await say(answers.find(([re]) => re.test(reply))?.[1] || answers.at(-1)[1]);
  }
  const ap = page.waitForResponse((x) => /api\/agents\/[^/]+\/approve/.test(x.url()), { timeout: 30000 });
  await page.locator("#approve-btn").last().click();
  const out = await (await ap).json();
  await page.locator("[data-testid=share-sheet]").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await closeSheets(page);
  return out;
}

const flashing = join(DIR, "assets", "flashing.png");
{
  const b = await launch(chromium);
  if (!existsSync(flashing)) await renderPng(b, join(DIR, "assets", "flashing.html"), flashing, { width: 900, height: 1200 });
  await b.close();
}

// ======================= Highlight 1: one spoken sentence =======================
if (want("h1")) await step("h1 voice", async () => {
  const wav = join(OUT, "audio", "owner-voice.wav");
  if (!existsSync(wav)) throw new Error("run video/tts.mjs first (owner-voice.wav)");
  const ids = await identities(); // a fresh sandbox: no helpers yet
  const sam = who(ids, /^Sam/);
  const vb = await launch(chromium, { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`, "--autoplay-policy=no-user-gesture-required"] });
  const r = await recorded(vb, { init: { "cb.onboarded.owner": "1" }, extra: { permissions: ["microphone"] } });
  const { page } = r;
  await gotoLink(r, sam.url);
  r.mark("start");
  await sleep(1300);
  let viaVoice = false;
  if (!typed) viaVoice = await step("voice overlay", async () => {
    await page.locator("#mic-btn").click();
    const tap = r.now();
    await page.locator("#voice-overlay").waitFor({ state: "visible", timeout: 5000 });
    await r.wait(page.waitForFunction(() => document.querySelector("#voice-overlay")?.dataset.state === "listening", null, { timeout: 20000 }), { head: 0.6, tail: 0.2 });
    r.mark("listening");
    r.mark("speech", tap + 5.1); // owner-voice.wav has 5 s of silence before Sam speaks
    // Sam's sentence plays ~3 s after the mic opens; the caption follows; then the approval sheet.
    const sheet = page.locator("#voice-overlay .vo-sheet");
    const got = await r.wait(sheet.waitFor({ state: "visible", timeout: 70000 }).then(() => true).catch(() => false), { head: 9, tail: 0.6 });
    await r.shot("h1-overlay");
    if (!got) throw new Error("no approval sheet in the overlay");
    await sleep(400);
    r.mark("sheet");
    const card = page.locator("#voice-overlay .approval-card").first();
    await sleep(2200);
    // slow pan over the card
    await page.evaluate(() => { const s = document.querySelector("#voice-overlay .vo-sheet"); s && (s.dataset.pan = "1"); });
    const panSel = "#voice-overlay .vo-sheet";
    const ov = await page.evaluate((s) => { const el = document.querySelector(s); return el ? el.scrollHeight - el.clientHeight : 0; }, panSel);
    if (ov > 20) { await smoothScroll(page, panSel, ov, 9000); await sleep(700); }
    else await sleep(2500);
    r.mark("approve");
    const btn = card.locator("#approve-btn, button.yellow").first();
    await btn.scrollIntoViewIfNeeded();
    await sleep(300);
    const ap = page.waitForResponse((x) => /api\/agents\/[^/]+\/approve/.test(x.url()), { timeout: 30000 }).catch(() => null);
    await btn.click();
    await r.wait(ap, { head: 0.5, tail: 0.2 });
    await sleep(1500);
    await r.shot("h1-approved");
    // End voice: Esc clears the sheet, then End; the cards move into the chat
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(300);
    await page.evaluate(() => document.querySelector("#voice-end-btn")?.click());
    await page.locator("#voice-overlay").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await sleep(1400);
    return true;
  });
  if (!viaVoice) await step("typed fallback", async () => {
    if (await page.locator("#voice-overlay").isVisible().catch(() => false)) await page.locator("#voice-end-btn").click().catch(() => {});
    r.mark("listening");
    const body = await ownerSay(r, script.ownerVoice.text.replace(/,/g, ""));
    if (!body?.proposal) throw new Error("no proposal: " + (body?.reply || "").slice(0, 120));
    r.mark("sheet");
    const card = page.locator(".approval-card").last();
    await card.scrollIntoViewIfNeeded();
    await sleep(2500);
    r.mark("approve");
    const ap = page.waitForResponse((x) => /api\/agents\/[^/]+\/approve/.test(x.url()), { timeout: 30000 }).catch(() => null);
    await page.locator("#approve-btn").last().click();
    await r.wait(ap);
    await sleep(1500);
  });
  await step("share sheet: Text / QR", async () => {
    // Approving opens the share sheet by itself; open it from the card only if it isn't up.
    if (!(await page.locator("[data-testid=share-sheet]").isVisible().catch(() => false))) {
      const again = page.locator(".approval-card .btn.ghost", { hasText: /links/i }).last();
      await again.scrollIntoViewIfNeeded();
      await again.click({ timeout: 5000 });
    }
    const sheet = page.locator("[data-testid=share-sheet]").last();
    await r.wait(sheet.waitFor({ state: "visible", timeout: 10000 }), { head: 0.3, tail: 0.2 });
    // sms:/mailto: links: keep the row's "sent" state, skip the OS hand-off (headless has no Messages app)
    await page.evaluate(() => document.querySelectorAll('a[href^="sms:"], a[href^="mailto:"]').forEach((a) => a.addEventListener("click", (e) => e.preventDefault())));
    await sleep(1000);
    const texts = page.locator("[data-testid=share-sheet] .ss-text");
    for (let i = 0; i < Math.min(2, await texts.count()); i++) { await texts.nth(i).click({ force: true }); await sleep(1000); }
    await r.shot("h1-share");
    await page.locator("[data-testid=share-sheet] .qr-btn:visible").first().click({ force: true });
    await page.locator("[data-testid=onsite-qr]").waitFor({ state: "visible", timeout: 8000 });
    await sleep(2800);
    await r.shot("h1-qr");
  });
  await r.finish("h1-voice");
  await vb.close();
});

// ======================= main sandbox =======================
if (want("main")) {
  const ids = await identities();
  const sam = who(ids, /^Sam/), anita = who(ids, /^Anita/), marco = who(ids, /^Marco/);
  log("identities:", ids.map((i) => i.name).join(", "));
  const browser = await launch(chromium);
  // ---- unrecorded setup: Juno for the Patels, Rex for Bay Roofing ----
  const st = {};
  await step("setup helpers", async () => {
    const ctx = await browser.newContext({ viewport: VIEW });
    await ctx.addInitScript(() => localStorage.setItem("cb.onboarded.owner", "1"));
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(abs(sam.url), { waitUntil: "networkidle" });
    const juno = await createHelper(page, "Make a helper for the Patels about their install at 42 Oak St, keep it until 30 days after handover",
      [[/who|household|homeowner|name|audience/, "The Patel household"], [/when|until|end|long|expire|handover/, "30 days after handover"], [/./, "Yes, that's right"]]);
    await sleep(800);
    const rex = await createHelper(page, "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm",
      [[/who|crew|audience|name|team/, "Bay Roofing's crew on the Oak St job"], [/when|until|end|long|expire/, "Until the job closes Friday at 6pm"], [/./, "Yes, go ahead"]]);
    st.juno = juno?.agent?.id; st.rex = rex?.agent?.id;
    log("  juno", st.juno, "rex", st.rex);
    await ctx.close();
    if (!st.juno || !st.rex) throw new Error("helpers not created");
  });
  if (!st.juno || !st.rex) { await browser.close(); throw new Error("setup failed"); }
  const initAnita = { [`cb.welcomed.${st.juno}`]: "1", lang: "en" };
  const initMarco = { [`cb.welcomed.${st.rex}`]: "1", lang: "es" };
  const persona = async (name, idn, init, fn) => step(name, async () => {
    const r = await recorded(browser, { init });
    await gotoLink(r, idn.url);
    r.mark("start");
    await sleep(700);
    await fn(r);
    await r.finish(name);
  });
  const owner = async (name, fn) => step(name, async () => {
    const r = await recorded(browser, { init: { "cb.onboarded.owner": "1" } });
    await gotoLink(r, sam.url);
    r.mark("start");
    await sleep(700);
    await fn(r);
    await r.finish(name);
  });

  // ---- opening split: the same question to both helpers ----
  await persona("open-juno", anita, initAnita, async (r) => { await helperSay(r, "What's the crew's access code for the side gate?"); await sleep(2600); });
  await persona("open-rex", marco, initMarco, async (r) => { await helperSay(r, "¿Cuál es el código de acceso de la puerta?"); await sleep(2600); });

  // ---- Highlight 2 ----
  await persona("h2-rex", marco, initMarco, async (r) => {
    await helperSay(r, "¿Dónde estacionamos y qué reglas de seguridad hay en el techo?");
    await sleep(1100);
    // open the source it cited: the excerpt, with its lock
    const chip = r.page.locator("#chat .msg.in .cite", { hasText: /Site Brief/i }).last();
    if (await chip.count()) {
      await chip.scrollIntoViewIfNeeded();
      await chip.click();
      await sleep(1100);
      await smoothScroll(r.page, ".sheet .sheet-body, .sheet", 200, 900);
      await sleep(900);
      await r.shot("h2-rex");
      await r.page.locator(".sheet-close:visible").first().click().catch(() => {});
      await sleep(900);
    } else await sleep(2000);
  });
  await persona("h2-juno", anita, initAnita, async (r) => {
    await helperSay(r, "What does my warranty cover?");
    await sleep(1000);
    await helperSay(r, "Can you give me the gate code the roofers use?");
    await sleep(1100);
    await r.shot("h2-juno");
  });

  // ---- it also gets work done ----
  await persona("w-rex-photo", marco, initMarco, async (r) => { await helperSay(r, "Tapajuntas rota junto a la ventila norte.", { photo: flashing, typeDelay: 55 }); await sleep(2400); await r.shot("w-rex-photo"); });
  await owner("w-inbox", async (r) => {
    await menuTab(r.page, "#tab-inbox");
    await sleep(900);
    const it = r.page.locator(".inbox-item", { hasText: /tapajuntas|flash|Marco|photo/i }).first();
    await it.waitFor({ timeout: 10000 });
    await it.click();
    await sleep(3200);
    await r.shot("w-inbox");
  });
  await persona("w-rex-relay", marco, { ...initMarco, lang: "en" }, async (r) => { await helperSay(r, "Tell the Patels the dumpster comes at 7:30 tomorrow."); await sleep(2400); await r.shot("w-rex-relay"); });
  await owner("w-owner-relay", async (r) => {
    await ownerSay(r, "What's new?");
    const ok = r.page.locator(".relay-approve-btn").last();
    await ok.waitFor({ state: "visible", timeout: 15000 });
    await ok.scrollIntoViewIfNeeded();
    await sleep(2200);
    const resp = r.page.waitForResponse((x) => x.url().includes("/answer"), { timeout: 20000 }).catch(() => null);
    await ok.click();
    await r.wait(resp);
    await sleep(2000);
    await r.shot("w-owner-relay");
  });
  await persona("w-anita-update", anita, initAnita, async (r) => {
    await r.wait(r.page.locator(".owner-update").last().waitFor({ timeout: 15000 }).catch(() => {}));
    await r.page.evaluate(() => { const c = document.querySelector("#chat"); c.scrollTop = 0; });
    await sleep(500);
    await smoothScroll(r.page, "#chat", 3000, 2600);
    await sleep(1100);
    await r.shot("w-anita-update");
  });
  await persona("w-juno-ask", anita, initAnita, async (r) => { await helperSay(r, "Could you also add an EV charger in our garage?"); await sleep(2600); await r.shot("w-juno-ask"); });
  await owner("w-owner-answer", async (r) => {
    await ownerSay(r, "Tell Anita yes, we can add an EV charger after the inspection");
    const b = r.page.locator("#reply-send-btn").last();
    await b.waitFor({ state: "visible", timeout: 30000 });
    await b.scrollIntoViewIfNeeded();
    await sleep(2000);
    const resp = r.page.waitForResponse((x) => x.url().includes("/answer"), { timeout: 30000 }).catch(() => null);
    await b.click();
    await r.wait(resp);
    await r.page.locator("[data-testid=brain-improved]").last().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(2800);
    await r.shot("w-owner-answer");
  });

  // ---- Highlight 3: close Rex while Marco's chat is open ----
  await step("climax", async () => {
    const crew = await recorded(browser, { init: { ...initMarco, lang: "en" } }); // "This helper has ended", in English
    await gotoLink(crew, marco.url);
    crew.mark("start");
    const o = await recorded(browser, { init: { "cb.onboarded.owner": "1" } });
    await gotoLink(o, sam.url);
    o.mark("start");
    await sleep(600);
    await ownerSay(o, "Show my helpers");
    await sleep(900);
    await ownerSay(o, "Close Rex", { typeDelay: 70 });
    const b = o.page.getByRole("button", { name: /Close .* now/i }).last();
    await b.waitFor({ state: "visible", timeout: 30000 });
    await b.scrollIntoViewIfNeeded();
    await sleep(1000);
    // Marco's chat is still open: he scrolls back to the gate code he got (before Sam taps)
    const tScroll = crew.now();
    crew.cut(0.8, tScroll - 0.6);
    await crew.page.evaluate(() => { const c = document.querySelector("#chat"); c && (c.dataset.y = c.scrollTop); });
    await smoothScroll(crew.page, "#chat", -900, 1500);
    await sleep(300);
    await smoothScroll(crew.page, "#chat", 900, 1200);
    o.mark("tap");
    const resp = o.page.waitForResponse((x) => /close/.test(x.url()) && x.request().method() === "POST", { timeout: 20000 }).catch(() => null);
    await b.click();
    await o.wait(resp, { head: 0.4, tail: 0.2 });
    await sleep(1000);
    o.mark("done");
    await o.shot("c-owner-done");
    // crew: Marco asks again, right after the close; the chat ends
    // He starts another question; the chat ends on its next check (often mid-sentence)
    const input = crew.page.locator("#composer-input");
    if (await input.isVisible().catch(() => false)) {
      await input.click({ timeout: 1500 }).catch(() => {});
      await input.pressSequentially("What time does the dumpster come?", { delay: 30, timeout: 3000 }).catch(() => {});
      await sleep(250);
      await crew.page.locator("#send-btn").click({ timeout: 1500 }).catch(() => {});
    }
    await crew.wait(crew.page.locator("#ended-screen").waitFor({ state: "visible", timeout: 15000 }), { head: 0.5, tail: 0.2 });
    crew.mark("ended");
    await sleep(2000);
    await crew.shot("c-crew");
    await crew.finish("c-crew");
    // owner: the brain shows the site brief back at Office only
    await menuTab(o.page, "#tab-brain");
    o.mark("brain");
    const item = o.page.locator(".brain-item", { hasText: /Site Brief/i }).first();
    if (await item.count()) {
      await item.evaluate((el) => new Promise((res) => { // ease the list to the Site Brief (nearest scrolling ancestor)
        let sc = el.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        sc ||= document.scrollingElement;
        const dy = el.getBoundingClientRect().top - 220, y0 = sc.scrollTop, t0 = performance.now();
        if (Math.abs(dy) < 20) return res();
        const f = (t) => { const k = Math.min(1, (t - t0) / 1400); sc.scrollTop = y0 + dy * (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2); k < 1 ? requestAnimationFrame(f) : res(); };
        requestAnimationFrame(f);
      }));
      await item.evaluate((el) => {
        const st = document.createElement("style");
        st.textContent = "@keyframes cbpulse{0%,100%{box-shadow:0 0 0 0 rgba(245,196,0,0)}50%{box-shadow:0 0 0 6px rgba(245,196,0,.9)}} .cb-spot{animation:cbpulse 1s ease-in-out 4;border-radius:10px}";
        document.head.append(st); el.classList.add("cb-spot");
      }).catch(() => {});
    }
    await sleep(1000);
    // tap it: the lock sheet shows who can see it now
    if (await item.count()) { await item.click().catch(() => {}); await sleep(1100); await smoothScroll(o.page, ".sheet .sheet-body, .sheet", 240, 900); await sleep(1000); }
    await o.shot("c-brain");
    await o.finish("c-owner");
  });
  await browser.close();
}

rmSync(TMP, { recursive: true, force: true });
log(`done (${failures} failed steps). raw:`, readdirSync(RAW).filter((f) => f.endsWith(".webm")).join(", "));
process.exit(failures ? 1 : 0);
