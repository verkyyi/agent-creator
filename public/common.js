// Shared helpers for the CrewBrain owner app and helper chat. Relative URLs only.

import { icon as svgIcon, avatarKey, ICON_NAMES } from "./icons.js";
import { ot, ownerLocale } from "./strings.js";
export { svgIcon, avatarKey };

// Every icon in the one set (icons.js) as an SVG string, keyed by name.
export const ICON = Object.fromEntries(ICON_NAMES.map((n) => [n, svgIcon(n)]));

/** An inline SVG icon as a DOM node. */
export const icon = (name, cls = "ico-i") => h("span", { class: cls, "aria-hidden": "true", html: ICON[name] || "" });

/** A helper's avatar: a rounded tile with its line icon, colored by audience (homeowner green,
 *  crew safety yellow). Takes the avatar key ("house" | "hardhat") or an old emoji. */
export const avatarKeyOf = (av, fallback = "house") => avatarKey(av) || fallback;
/** Avatar key for a helper record; unknown or missing avatars fall back by audience. */
export const helperAvatar = (a) => avatarKey(a?.avatar) || (/crew|roof|brief|site/i.test(`${a?.templateId || ""} ${a?.name || ""} ${a?.job || ""}`) ? "hardhat" : "house");
export function avatar(av, cls = "", fallback = "house") {
  const k = avatarKeyOf(av, fallback);
  return h("span", { class: `avatar av-${k} ${cls}`.trim(), "data-avatar": k, html: svgIcon(k) });
}

/* ---------- plain-language labels ---------- */
// Labels are getters so they read the owner table loaded after import.
const originOf = (k) => ({ icon: k, get label() { return ot(`common.origin.${k}`); } });
export const ORIGIN = { drive: originOf("drive"), gmail: originOf("gmail"), photo: originOf("photo"), answer: originOf("answer"), doc: originOf("doc") };
export function originBadge(origin) {
  const o = ORIGIN[origin] || ORIGIN.doc;
  return h("span", { class: "origin" }, icon(o.icon), o.label);
}
export function fmtDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return "";
  try { return d.toLocaleDateString(ownerLocale(), { month: "short", day: "numeric" }); }
  catch { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
}

/* ---------- storage (never throws) ---------- */
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- keyboard-safe layout: track the visual viewport ---------- */
(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const sync = () => {
    root.style.setProperty("--vvh", vv.height + "px");
    if (vv.offsetTop) window.scrollTo(0, 0);
  };
  vv.addEventListener("resize", sync); vv.addEventListener("scroll", sync); sync();
})();

export async function api(path, body, method) {
  const opts = { method: method || (body !== undefined ? "POST" : "GET"), credentials: "same-origin", headers: {} };
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, opts); }
  catch (e) { return { ok: false, status: 0, data: { error: ot("common.netErr") } }; }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

/** Tiny DOM builder: h("div", {class:"x", onclick}, "text", child) */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

let toastTimer;
export function toast(msg, kind) {
  document.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast" + (kind === "err" ? " err" : ""), role: "status" }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

export async function downscale(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- locks ---------- */
const lockOf = (v, cls) => ({ v, cls, get label() { return ot(`common.lock.${v}`); }, get sub() { return ot(`common.lock.${v}Sub`); } });
export const LOCKS = [lockOf("internal", "office"), lockOf("crew", "crew"), lockOf("customer", "home")];
export const lockCls = (s) => (LOCKS.find((l) => l.v === s) || LOCKS[0]).cls;
export const lockChip = (sharing, label) => h("span", { class: "lock " + lockCls(sharing) }, label || (LOCKS.find((l) => l.v === sharing) || LOCKS[0]).label);

export function lockPicker(value) {
  let cur = value || "internal";
  const wrap = h("div", { class: "lock-picker", role: "group", "aria-label": ot("common.lock.whoCanSee"), "data-testid": "lock-picker" });
  const btns = LOCKS.map((l) => {
    const b = h("button", { type: "button", "data-sharing": l.v, "aria-pressed": String(l.v === cur), onclick: () => { cur = l.v; btns.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.sharing === cur))); } },
      lockChip(l.v, l.label), h("small", {}, l.sub));
    return b;
  });
  wrap.append(...btns);
  return { el: wrap, get value() { return cur; } };
}

/* ---------- bottom sheet ---------- */
let current = null;
export function closeSheet() { if (current) { current.back.remove(); current.panel.remove(); current = null; } }
export function openSheet(title, body, { className = "", testid } = {}) {
  closeSheet();
  const back = h("div", { class: "sheet-backdrop", onclick: closeSheet });
  const panel = h("div", { class: "sheet " + className, role: "dialog", "aria-modal": "true", "aria-label": title, "data-testid": testid },
    h("div", { class: "grab" }),
    h("div", { class: "sheet-head" }, h("h3", {}, title), h("button", { class: "sheet-close", type: "button", "aria-label": ot("common.close"), onclick: closeSheet, html: ICON.x })),
    body);
  document.body.append(back, panel);
  current = { back, panel };
  return panel;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

/* ---------- QR + share sheet ---------- */
let qrP;
function loadQR() {
  return (qrP ||= new Promise((res, rej) => {
    if (window.qrcode) return res(window.qrcode);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
    s.onload = () => res(window.qrcode); s.onerror = () => { qrP = null; rej(new Error("qr")); };
    document.head.append(s);
  }));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); return ok;
  }
}

const SI = {
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5l8.5 7 8.5-7"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>',
};
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
function jobShort(job) {
  const j = String(job || "").trim().replace(/[.]+$/, "");
  const street = j.match(/\b(?:\d+\s+)?[A-Z][\w']*(?:\s+[A-Z][\w']*)?\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Way|Ct|Court|Pl)\b\.?/);
  if (street) return ot("common.share.streetJob", { s: street[0].replace(/\.$/, "") });
  if (!j || j.length > 32) return ot("common.share.theJob");
  return /^the\s/i.test(j) ? j : ot("common.share.theX", { j });
}
let meP;
function loadMe() {
  return (meP ||= api("api/me").then((r) => (r.ok ? r.data.member || {} : {})).catch(() => ({})));
}
function btnI(svg, label, attrs = {}) {
  return h(attrs.href ? "a" : "button", { class: "btn small ghost ss-btn", ...(attrs.href ? {} : { type: "button" }), ...attrs }, h("span", { class: "ss-ico", "aria-hidden": "true", html: svg }), h("span", {}, label));
}

/** Full-screen "Show on site" QR view. */
export async function showOnSite(l, helperName) {
  const img = h("img", { alt: ot("common.share.qrAlt", { n: l.name }), class: "onsite-qr" });
  let lock = null;
  const close = () => { view.remove(); document.removeEventListener("keydown", onKey, true); try { lock && lock.release(); } catch {} };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const view = h("div", { class: "onsite", role: "dialog", "aria-modal": "true", "aria-label": ot("common.share.onSite", { n: l.name }), "data-testid": "onsite-qr" },
    h("button", { class: "sheet-close onsite-close", type: "button", "aria-label": ot("common.close"), onclick: close, html: ICON.x }),
    h("div", { class: "onsite-who" }, h("b", {}, l.name), h("span", {}, helperName || ot("common.share.yourHelper"))),
    h("div", { class: "onsite-card" }, img),
    h("p", { class: "onsite-hint" }, ot("common.share.scan")));
  document.body.append(view);
  document.addEventListener("keydown", onKey, true);
  try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch {}
  try {
    const qrcode = await loadQR();
    const qr = qrcode(0, "M"); qr.addData(l.url); qr.make();
    img.src = qr.createDataURL(10, 2);
  } catch { img.replaceWith(h("p", { class: "onsite-url" }, l.url)); }
}

export function shareSheet(links, { title = ot("common.share.title"), helperName = "", endsLabel = "", job = "" } = {}) {
  const helper = helperName || ot("common.share.yourHelper");
  const body = h("div", { class: "stack" });
  const panel = openSheet(title, links.length ? body : h("div", { class: "empty" }, ot("common.share.none")), { className: "share-sheet", testid: "share-sheet" });
  if (!links.length) return panel;

  const render = (me) => {
    const owner = firstName(me.name), company = me.tenantName || ot("common.share.ourTeam");
    const msg = (l) => ot(endsLabel ? "common.share.msgUntil" : "common.share.msg", { first: firstName(l.name), owner, company, helper, job: jobShort(job), ends: endsLabel, url: l.url });
    const smsHref = (l) => "sms:?&body=" + encodeURIComponent(msg(l));
    const subject = ot("common.share.subject", { helper, company });
    const mailHref = (l) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg(l))}`;

    let next = 0;
    const nextBtn = h("a", { class: "btn yellow block ss-all", "data-testid": "send-all" });
    const setNext = (i) => {
      next = i;
      if (i >= links.length) { nextBtn.innerHTML = ""; nextBtn.append(h("span", { class: "ss-ico", html: ICON.check }), ot("common.share.allSent")); nextBtn.removeAttribute("href"); nextBtn.classList.add("done"); return; }
      nextBtn.href = smsHref(links[i]);
      nextBtn.innerHTML = "";
      nextBtn.append(h("span", { class: "ss-ico", "aria-hidden": "true", html: SI.text }), i === 0 ? ot("common.share.sendAll") : ot("common.share.next", { n: links[i].name }));
    };
    nextBtn.addEventListener("click", (e) => {
      if (next >= links.length) { e.preventDefault(); return; }
      rows[next]?.classList.add("sent");
      setTimeout(() => setNext(next + 1), 50);
    });

    const rows = links.map((l, i) => {
      const copyBtn = btnI(SI.copy, ot("common.share.copy"), { onclick: async () => {
        const ok = await copyText(l.url);
        copyBtn.lastChild.textContent = ok ? ot("common.share.copied") : ot("common.share.holdCopy");
        setTimeout(() => (copyBtn.lastChild.textContent = ot("common.share.copy")), 1600);
      } });
      const shareBtn = navigator.share ? btnI(ICON.share, ot("common.share.share"), { "aria-label": ot("common.share.shareAria", { n: l.name }), onclick: async () => {
        try { await navigator.share({ title: subject, text: msg(l).replace(`: ${l.url}`, ":"), url: l.url }); } catch {}
      } }) : null;
      const textA = btnI(SI.text, ot("common.share.text"), { href: smsHref(l), class: "btn small ss-btn ss-text", "aria-label": ot("common.share.textAria", { n: l.name }) });
      return h("div", { class: "link-row", "data-member": l.memberId },
        h("div", { class: "ss-who" }, h("span", { class: "nm" }, l.name), h("span", { class: "url" }, l.url)),
        h("div", { class: "ss-actions" },
          textA,
          btnI(SI.mail, ot("common.share.email"), { href: mailHref(l), "aria-label": ot("common.share.emailAria", { n: l.name }) }),
          btnI(SI.qr, "QR", { class: "btn small ghost ss-btn qr-btn", "aria-label": ot("common.share.qrAria", { n: l.name }), onclick: () => showOnSite(l, helper) }),
          copyBtn, shareBtn));
    });
    rows.forEach((r) => { const t = r.querySelector(".ss-text"); t.onclick = () => r.classList.add("sent"); });
    setNext(0);
    body.replaceChildren(
      links.length > 1 ? nextBtn : null,
      h("div", { class: "links" }, rows),
      h("p", { class: "ss-note" }, icon("lock"), h("span", {}, ot("common.share.note"))));
  };
  render({});
  loadMe().then(render);
  return panel;
}

/* ---------- voice ---------- */
/** Overlay + voice-card strings, from the owner table (English by default). Callers override any of them (a.html passes its own). */
const VOICE_KEYS = ["connecting", "listening", "thinking", "speaking", "title", "end", "mute", "unmute", "captions", "ended", "conversation",
  "results", "showTranscript", "hideTranscript", "autoNote", "you", "helper", "source", "loading", "needsTap", "ttfa"];
export const VOICE_TEXT = Object.defineProperties({ turns: (n) => ot(n === 1 ? "common.voice.turn1" : "common.voice.turnsN", { n }) },
  Object.fromEntries(VOICE_KEYS.map((k) => [k, { enumerable: true, get: () => ot(`common.voice.${k}`) }])));
const textsOf = (texts) => ({ ...VOICE_TEXT, ...(typeof texts === "function" ? texts() : texts || {}) });
const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const CAPTIONS_KEY = "cb.voice.captions";
export const fmtDuration = (ms) => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Full-screen voice view (ChatGPT-style): orb, state line, one live caption, Mute + End.
 *  `onEnd` must stop the session; Esc and the End button both call it. */
export function openVoiceOverlay({ texts, onEnd, onMute } = {}) {
  const T = textsOf(texts);
  const prevFocus = document.activeElement;
  let captionsOn = store.get(CAPTIONS_KEY) !== "0";
  let muted = false, closed = false, raf = 0, actx = null;
  const analysers = [];

  const orb = h("div", { class: "vo-orb", "aria-hidden": "true" }, h("div", { class: "vo-orb-core" }));
  const stateLine = h("div", { class: "vo-state", "aria-live": "polite", role: "status" }, T.connecting);
  const ttfaEl = h("div", { class: "vo-ttfa mono", title: T.ttfa, hidden: true });
  const caption = h("p", { class: "vo-caption", "aria-live": "off", hidden: !captionsOn });
  const capBtn = h("button", { class: "vo-captions-btn", type: "button", "aria-pressed": String(captionsOn) }, T.captions);
  const muteBtn = h("button", { class: "vo-btn vo-mute", id: "voice-mute-btn", type: "button", "aria-pressed": "false", "aria-label": T.mute },
    h("span", { class: "vo-ico", "aria-hidden": "true", html: ICON.mic }), h("span", { class: "vo-lbl" }, T.mute));
  const endBtn = h("button", { class: "vo-btn vo-end", id: "voice-end-btn", type: "button", "aria-label": T.end },
    h("span", { class: "vo-ico", "aria-hidden": "true", html: ICON.x }), h("span", { class: "vo-lbl" }, T.end));
  const sheetSlot = h("div", { class: "vo-sheet-slot" });
  const el = h("div", { class: "voice-overlay", id: "voice-overlay", role: "dialog", "aria-modal": "true", "aria-label": T.title, "data-state": "connecting" },
    h("div", { class: "vo-top" }, capBtn, ttfaEl),
    h("div", { class: "vo-center" }, orb, stateLine, caption),
    h("div", { class: "vo-bottom" }, muteBtn, endBtn),
    sheetSlot);

  capBtn.addEventListener("click", () => {
    captionsOn = !captionsOn; store.set(CAPTIONS_KEY, captionsOn ? "1" : "0");
    capBtn.setAttribute("aria-pressed", String(captionsOn)); caption.hidden = !captionsOn;
  });
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute("aria-label", muted ? T.unmute : T.mute);
    muteBtn.querySelector(".vo-lbl").textContent = muted ? T.unmute : T.mute;
    muteBtn.classList.toggle("on", muted);
    el.classList.toggle("muted", muted);
    try { onMute?.(muted); } catch {}
  });
  endBtn.addEventListener("click", () => { try { onEnd?.(); } catch {} close(); });

  const focusables = () => [...el.querySelectorAll("button, [href], textarea, input, select, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (sheetSlot.firstChild) { sheetSlot.replaceChildren(); endBtn.focus(); return; } endBtn.click(); return; }
    if (e.key !== "Tab") return;
    const f = focusables(); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  };
  document.addEventListener("keydown", onKey, true);
  document.body.append(el);
  document.body.classList.add("voice-open");
  endBtn.focus();

  // Orb level from Web Audio (remote voice + mic). Reduced motion: no pulsing, state color only.
  const level = () => {
    let max = 0;
    for (const { an, buf } of analysers) {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      max = Math.max(max, Math.sqrt(sum / buf.length));
    }
    return Math.min(1, max * 4);
  };
  let smooth = 0;
  const tick = () => {
    if (closed) return;
    smooth = smooth * 0.75 + level() * 0.25;
    orb.style.setProperty("--lvl", smooth.toFixed(3));
    raf = requestAnimationFrame(tick);
  };
  function attach(stream) {
    if (!stream || closed || reducedMotion()) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      actx ||= new AC();
      if (actx.state === "suspended") actx.resume().catch(() => {});
      const src = actx.createMediaStreamSource(stream);
      const an = actx.createAnalyser(); an.fftSize = 512;
      src.connect(an); // analyser only: not connected to the speakers (the <audio> element plays it)
      analysers.push({ an, buf: new Uint8Array(an.fftSize), src });
      if (!raf) raf = requestAnimationFrame(tick);
    } catch {}
  }
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    for (const a of analysers) { try { a.src.disconnect(); } catch {} }
    try { actx?.close(); } catch {}
    document.removeEventListener("keydown", onKey, true);
    el.remove();
    document.body.classList.remove("voice-open");
    try { prevFocus?.focus?.(); } catch {}
  }
  return {
    el,
    get closed() { return closed; },
    get muted() { return muted; },
    setState(s) {
      if (closed) return;
      el.dataset.state = s;
      const text = T[s] || "";
      if (text && stateLine.textContent !== text) stateLine.textContent = text;
      if (s === "thinking" || (s === "listening" && el.dataset.spoke === "1")) { caption.textContent = ""; el.dataset.spoke = ""; }
    },
    setTtfa(ms) { if (closed) return; ttfaEl.hidden = false; ttfaEl.textContent = (ms / 1000).toFixed(1) + " s"; },
    caption(text) { if (closed) return; caption.textContent = text || ""; el.dataset.spoke = "1"; },
    attach,
    /** A card that needs a tap (approval, reply draft, confirm) as a bottom sheet inside the overlay. */
    showSheet(node, title) {
      if (closed || !node) return;
      const panel = h("div", { class: "vo-sheet", role: "dialog", "aria-label": title || T.needsTap },
        h("div", { class: "vo-sheet-head" }, h("b", {}, title || T.needsTap),
          h("button", { class: "sheet-close", type: "button", "aria-label": ot("common.close"), html: ICON.x, onclick: () => { panel.remove(); endBtn.focus(); } })),
        node);
      sheetSlot.append(panel);
      (panel.querySelector("button.yellow, textarea, button") || panel).focus?.();
    },
    close,
  };
}

/** The one card a finished voice session leaves in the chat. summary: { startedAt, endedAt, turns:[{who,text}], citations, actions:[label] }. */
export function voiceCard(summary, { texts, agentId, actionLabel } = {}) {
  const T = textsOf(texts);
  const lines = summary.turns || [];
  const n = lines.filter((x) => x.who === "user").length || lines.length;
  const dur = fmtDuration((summary.endedAt || 0) - (summary.startedAt || 0));
  const results = [];
  for (const c of summary.citations || []) results.push(h("li", { class: "vc-cite" }, citeChip(c, agentId, { prefix: T.source, loading: T.loading })));
  for (const a of summary.actions || []) {
    const label = typeof a === "string" ? a : (actionLabel ? actionLabel(a) : `${a.kind}: ${a.summary || ""}`);
    if (label) results.push(h("li", { class: "vc-action", "data-kind": a.kind || "" }, icon("check"), h("span", {}, label)));
  }
  const tr = h("div", { class: "vc-transcript", hidden: true },
    h("p", { class: "vc-note" }, icon("info"), h("span", {}, T.autoNote)),
    lines.map((x) => h("p", { class: "vc-line " + (x.who === "user" ? "u" : "a") }, h("b", {}, x.who === "user" ? T.you : T.helper), " ", x.text)));
  const toggle = h("button", { class: "vc-toggle", type: "button", "aria-expanded": "false" }, h("span", {}, T.showTranscript), h("span", { class: "chev", "aria-hidden": "true", html: ICON.chevron }));
  toggle.addEventListener("click", () => {
    const open = tr.hidden; tr.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.firstChild.textContent = open ? T.hideTranscript : T.showTranscript;
  });
  const MAX = 3;
  results.slice(MAX).forEach((li) => (li.hidden = true));
  const more = results.length > MAX ? h("button", { class: "vc-more", type: "button", "aria-expanded": "false", onclick: () => {
    results.slice(MAX).forEach((li) => (li.hidden = false)); more.remove();
  } }, ot("common.voice.more", { n: results.length - MAX })) : null;
  return h("div", { class: "voice-card", "data-testid": "voice-card", "data-session": summary.sessionId || "" },
    h("div", { class: "vc-head" }, icon("mic"), h("b", {}, T.conversation), h("span", { class: "vc-meta mono" }, `${dur} · ${T.turns(n)}`)),
    results.length ? [h("div", { class: "vc-label" }, T.results), h("ul", { class: "vc-results" }, results), more] : null,
    lines.length ? [toggle, tr] : null);
}

/** Wires a mic button to voice.js (loaded lazily). Text input keeps working without it.
 *  Voice runs in a full-screen overlay; no transcript bubbles go to the chat while it's live.
 *  When it ends, ONE voice card goes into `log` (or a "Voice ended" toast if nobody spoke),
 *  then onEnd(summary) lets the page add the cards that arrived (proposals, drafts, shares).
 *  - onReply(json): every reply, for page bookkeeping (e.g. "ended"); must not render bubbles.
 *  - summarize(json) -> { citations?, actions? } for the voice card's Results.
 *  - tapCard(json) -> Element|null: a card that needs a tap, shown as a sheet inside the overlay. */
export function wireVoice({ btn, stateEl, mode, agentId, log, onReply, onEnd, summarize, tapCard, actionLabel, texts = {}, voiceErr }) {
  let session = null, ttfa = "", overlay = null, run = null;
  const T = () => textsOf(texts);
  const setState = (s) => {
    overlay?.setState(s);
    if (!stateEl) return;
    const text = T()[s] || (s && s !== "idle" && s !== "stopped" && s !== "closed" ? String(s) : "");
    if (!text) { stateEl.hidden = true; stateEl.innerHTML = ""; ttfa = ""; return; }
    stateEl.hidden = false;
    stateEl.innerHTML = '<span class="wave"><i></i><i></i><i></i><i></i><i></i></span>';
    stateEl.append(h("span", { class: "vs-text" }, text));
    if (ttfa) stateEl.append(h("span", { class: "ttfa mono", title: T().ttfa }, ttfa));
  };
  const onMetrics = (m) => {
    const ms = m && (m.ttfaMs ?? m.ttfa ?? m.firstAudioMs);
    if (typeof ms !== "number" || !isFinite(ms)) return;
    ttfa = (ms / 1000).toFixed(1) + " s";
    overlay?.setTtfa(ms);
  };
  const finish = (r) => {
    if (!r || r.done) return;
    r.done = true;
    const summary = { sessionId: r.sessionId, startedAt: r.startedAt, endedAt: Date.now(), turns: r.turns, citations: r.citations, actions: r.actions, replies: r.replies };
    const spoke = r.turns.some((x) => x.who === "user");
    if (!spoke && !r.replies.some((j) => j && (j.proposal || j.replyDraft || j.card))) { toast(T().ended); }
    else if (log) { log.append(voiceCard(summary, { texts, agentId, actionLabel })); scrollToEnd(log); }
    try { onEnd?.(summary); } catch (e) { console.warn("voice onEnd failed", e); }
  };
  // `starting` covers the seconds between the tap and startVoice() resolving (mic prompt,
  // WebRTC handshake). A tap then must cancel that attempt, not start a second session.
  let starting = null;
  const stop = () => {
    const s = session; session = null;
    const c = starting; starting = null;
    try { c?.abort(); } catch {}
    try { s?.stop(); } catch {}
    const ov = overlay; overlay = null;
    try { ov?.close(); } catch {}
    const r = run; run = null;
    if (r) { r.mic?.getTracks().forEach((t) => { try { t.stop(); } catch {} }); finish(r); }
    btn.classList.remove("live"); btn.innerHTML = ICON.mic; btn.setAttribute("aria-label", ot("common.voice.talk")); btn.setAttribute("aria-pressed", "false"); setState("");
  };
  btn.innerHTML = ICON.mic;
  btn.addEventListener("click", async () => {
    if (session || starting || overlay) return stop();
    btn.classList.add("live"); btn.innerHTML = ICON.stop; btn.setAttribute("aria-label", ot("common.voice.stopTalking")); btn.setAttribute("aria-pressed", "true");
    const r = run = { startedAt: Date.now(), turns: [], citations: [], actions: [], replies: [], mic: null, muted: false, done: false, sessionId: "" };
    overlay = openVoiceOverlay({
      texts, onEnd: stop,
      onMute: (m) => { r.muted = m; r.mic?.getAudioTracks().forEach((t) => (t.enabled = !m)); },
    });
    setState("connecting");
    let mod;
    try { mod = await import("./voice.js"); }
    catch { stop(); toast(voiceErr || ot("common.voice.unavailable"), "err"); return; }
    if (run !== r) return; // ended while voice.js was loading
    const ctrl = new AbortController();
    starting = ctrl;
    const live = () => !ctrl.signal.aborted && run === r;
    const seenCite = new Set();
    try {
      const sess = await mod.startVoice({
        mode, agentId, signal: ctrl.signal,
        onState: (s) => { if (!live()) return; setState(s); if (s === "stopped" || s === "closed") stop(); },
        onTranscript: (text, who) => { if (run === r && text) r.turns.push({ who: who === "user" || who === "owner" ? "user" : "assistant", text }); },
        onCaption: (text) => { if (live()) overlay?.caption(text); },
        onMic: (stream) => { r.mic = stream; if (r.muted) stream.getAudioTracks().forEach((t) => (t.enabled = false)); overlay?.attach(stream); },
        onRemote: (stream) => overlay?.attach(stream),
        onReply: (json) => {
          if (run !== r || !json) { try { onReply?.(json); } catch {} return; }
          r.replies.push(json);
          const add = (summarize ? summarize(json) : null) || {};
          for (const c of [...(json.citations || []), ...(add.citations || [])]) {
            const k = `${c.title}|${c.section || ""}`; if (!seenCite.has(k)) { seenCite.add(k); r.citations.push(c); }
          }
          if (json.action) r.actions.push(json.action);
          for (const a of add.actions || []) r.actions.push(a);
          const node = tapCard?.(json);
          if (node) overlay?.showSheet(node);
          try { onReply?.(json); } catch {}
        },
        onMetrics,
        onError: (msg) => { if (!live()) return; stop(); toast(msg || ot("common.voice.stopped"), "err"); },
      });
      if (!live()) { try { sess?.stop(); } catch {} return; } // cancelled while connecting
      starting = null;
      session = sess;
      r.sessionId = sess?.sessionId || "";
      if (!session) stop();
    } catch (e) { if (!live()) return; stop(); toast((e && e.message) || voiceErr || ot("common.voice.startFail"), "err"); }
  });
  return { stop, start: () => { if (!session && !starting && !overlay) btn.click(); }, get active() { return !!(session || starting || overlay); } };
}

export function scrollToEnd(el) { requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })); }
export function typingBubble() { return h("div", { class: "msg in typing", "aria-label": ot("common.thinking") }, h("i"), h("i"), h("i")); }


/* ---------- citations: "Source: title · section" chip -> excerpt sheet ---------- */
export function citeChip(c, agentId, { prefix = "Source", loading = "Loading…" } = {}) {
  const label = `${prefix}: ${c.title}${c.section ? " · " + c.section : ""}`;
  return h("button", { class: "cite", type: "button", onclick: () => openExcerpt(c, agentId, loading) }, icon("source"), h("span", {}, label));
}
/** References folded into one quiet line ("▸ 2 sources"); tap expands the chips in place, tap again folds them. */
let srcSeq = 0;
export function sourcesToggle(chips, label) {
  const listId = `src-list-${++srcSeq}`;
  const list = h("div", { class: "sources-list cites", id: listId, hidden: true }, chips);
  const btn = h("button", { class: "sources-toggle", type: "button", "aria-expanded": "false", "aria-controls": listId, "data-testid": "sources-toggle" },
    h("span", { class: "caret", "aria-hidden": "true" }, "▸"), h("span", {}, label));
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
  });
  return h("div", { class: "sources" }, btn, list);
}
async function openExcerpt(c, agentId, loading) {
  const body = h("div", { class: "stack" }, h("div", { class: "reading" }, h("div", { class: "spinner" }), loading));
  openSheet(c.title || "Source", body, { testid: "excerpt-sheet", className: "excerpt-sheet" });
  const id = c.sourceId || c.id || c.title;
  const q = `?agentId=${encodeURIComponent(agentId || "")}&section=${encodeURIComponent(c.section || "")}`;
  const r = await api(`api/sources/${encodeURIComponent(id)}/excerpt${q}`);
  body.innerHTML = "";
  if (r.ok && r.data && r.data.text) {
    body.append(
      h("div", { class: "label" }, [r.data.section || c.section, r.data.updatedLabel].filter(Boolean).join(" · ")),
      h("div", { class: "quote excerpt" }, r.data.text));
  } else {
    body.append(h("div", { class: "label" }, ot("common.section")), h("div", { class: "quote" }, c.section || c.title || "—"));
  }
}

/* hide the owner tab bar while typing on a phone, so the composer sits right above the keyboard */
document.addEventListener("focusin", (e) => { if (navigator.maxTouchPoints > 0 && e.target.matches?.("input[type=text], textarea")) document.body.classList.add("kb-open"); });
document.addEventListener("focusout", () => setTimeout(() => { if (!document.activeElement?.matches?.("input[type=text], textarea")) document.body.classList.remove("kb-open"); }, 50));
