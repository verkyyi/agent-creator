// Shared helpers for the Crewbrain owner app and helper chat. Relative URLs only.

import { icon as svgIcon, avatarKey, ICON_NAMES } from "./icons.js";
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
export const ORIGIN = {
  drive: { icon: "drive", label: "From Google Drive" },
  gmail: { icon: "gmail", label: "From Gmail" },
  photo: { icon: "photo", label: "Photo" },
  answer: { icon: "answer", label: "Your answer" },
  doc: { icon: "doc", label: "Document" },
};
export function originBadge(origin) {
  const o = ORIGIN[origin] || ORIGIN.doc;
  return h("span", { class: "origin" }, icon(o.icon), o.label);
}
export function fmtDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  catch (e) { return { ok: false, status: 0, data: { error: "Can't reach Crewbrain. Check your signal and try again." } }; }
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
export const LOCKS = [
  { v: "internal", cls: "office", label: "Office only", sub: "never leaves" },
  { v: "crew", cls: "crew", label: "Crew", sub: "job crew" },
  { v: "customer", cls: "home", label: "Homeowners", sub: "customers" },
];
export const lockCls = (s) => (LOCKS.find((l) => l.v === s) || LOCKS[0]).cls;
export const lockChip = (sharing, label) => h("span", { class: "lock " + lockCls(sharing) }, label || (LOCKS.find((l) => l.v === sharing) || LOCKS[0]).label);

export function lockPicker(value) {
  let cur = value || "internal";
  const wrap = h("div", { class: "lock-picker", role: "group", "aria-label": "Who can see this", "data-testid": "lock-picker" });
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
    h("div", { class: "sheet-head" }, h("h3", {}, title), h("button", { class: "sheet-close", type: "button", "aria-label": "Close", onclick: closeSheet, html: ICON.x })),
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
  if (street) return `the ${street[0].replace(/\.$/, "")} job`;
  if (!j || j.length > 32) return "the job";
  return /^the\s/i.test(j) ? j : "the " + j;
}
let meP;
function loadMe() {
  return (meP ||= api("api/me").then((r) => (r.ok ? r.data.member || {} : {})).catch(() => ({})));
}
function btnI(svg, label, attrs = {}) {
  return h(attrs.href ? "a" : "button", { class: "btn small ghost ss-btn", ...(attrs.href ? {} : { type: "button" }), ...attrs }, h("span", { class: "ss-ico", "aria-hidden": "true", html: svg }), h("span", {}, label));
}

/** Full-screen "Show on site" QR view. */
async function showOnSite(l, helperName) {
  const img = h("img", { alt: `QR code for ${l.name}'s link`, class: "onsite-qr" });
  let lock = null;
  const close = () => { view.remove(); document.removeEventListener("keydown", onKey, true); try { lock && lock.release(); } catch {} };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const view = h("div", { class: "onsite", role: "dialog", "aria-modal": "true", "aria-label": `Show on site: ${l.name}`, "data-testid": "onsite-qr" },
    h("button", { class: "sheet-close onsite-close", type: "button", "aria-label": "Close", onclick: close, html: ICON.x }),
    h("div", { class: "onsite-who" }, h("b", {}, l.name), h("span", {}, helperName || "Your helper")),
    h("div", { class: "onsite-card" }, img),
    h("p", { class: "onsite-hint" }, "Scan with your phone camera"));
  document.body.append(view);
  document.addEventListener("keydown", onKey, true);
  try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch {}
  try {
    const qrcode = await loadQR();
    const qr = qrcode(0, "M"); qr.addData(l.url); qr.make();
    img.src = qr.createDataURL(10, 2);
  } catch { img.replaceWith(h("p", { class: "onsite-url" }, l.url)); }
}

export function shareSheet(links, { title = "Share links", helperName = "", endsLabel = "", job = "" } = {}) {
  const helper = helperName || "Your helper";
  const body = h("div", { class: "stack" });
  const panel = openSheet(title, links.length ? body : h("div", { class: "empty" }, "No links yet. Approve the helper first, then come back here."), { className: "share-sheet", testid: "share-sheet" });
  if (!links.length) return panel;

  const render = (me) => {
    const owner = firstName(me.name), company = me.tenantName || "our team";
    const msg = (l) => `Hi ${firstName(l.name)}, this is ${owner ? owner + " " : ""}from ${company}. ${helper} can answer your questions about ${jobShort(job)}${endsLabel ? ` until ${endsLabel}` : ""}: ${l.url}`;
    const smsHref = (l) => "sms:?&body=" + encodeURIComponent(msg(l));
    const mailHref = (l) => `mailto:?subject=${encodeURIComponent(`${helper} from ${company}`)}&body=${encodeURIComponent(msg(l))}`;

    let next = 0;
    const nextBtn = h("a", { class: "btn yellow block ss-all", "data-testid": "send-all" });
    const setNext = (i) => {
      next = i;
      if (i >= links.length) { nextBtn.innerHTML = ""; nextBtn.append(h("span", { class: "ss-ico", html: ICON.check }), "All sent"); nextBtn.removeAttribute("href"); nextBtn.classList.add("done"); return; }
      nextBtn.href = smsHref(links[i]);
      nextBtn.innerHTML = "";
      nextBtn.append(h("span", { class: "ss-ico", "aria-hidden": "true", html: SI.text }), i === 0 ? "Send to everyone" : `Next: ${links[i].name}`);
    };
    nextBtn.addEventListener("click", (e) => {
      if (next >= links.length) { e.preventDefault(); return; }
      rows[next]?.classList.add("sent");
      setTimeout(() => setNext(next + 1), 50);
    });

    const rows = links.map((l, i) => {
      const copyBtn = btnI(SI.copy, "Copy", { onclick: async () => {
        const ok = await copyText(l.url);
        copyBtn.lastChild.textContent = ok ? "Copied" : "Hold link to copy";
        setTimeout(() => (copyBtn.lastChild.textContent = "Copy"), 1600);
      } });
      const shareBtn = navigator.share ? btnI(ICON.share, "Share…", { "aria-label": `Share ${l.name}'s link`, onclick: async () => {
        try { await navigator.share({ title: `${helper} from ${company}`, text: msg(l).replace(`: ${l.url}`, ":"), url: l.url }); } catch {}
      } }) : null;
      const textA = btnI(SI.text, "Text", { href: smsHref(l), class: "btn small ss-btn ss-text", "aria-label": `Text ${l.name}` });
      return h("div", { class: "link-row", "data-member": l.memberId },
        h("div", { class: "ss-who" }, h("span", { class: "nm" }, l.name), h("span", { class: "url" }, l.url)),
        h("div", { class: "ss-actions" },
          textA,
          btnI(SI.mail, "Email", { href: mailHref(l), "aria-label": `Email ${l.name}` }),
          btnI(SI.qr, "QR", { class: "btn small ghost ss-btn qr-btn", "aria-label": `Show QR for ${l.name}`, onclick: () => showOnSite(l, helper) }),
          copyBtn, shareBtn));
    });
    rows.forEach((r) => { const t = r.querySelector(".ss-text"); t.onclick = () => r.classList.add("sent"); });
    setNext(0);
    body.replaceChildren(
      links.length > 1 ? nextBtn : null,
      h("div", { class: "links" }, rows),
      h("p", { class: "ss-note" }, icon("lock"), h("span", {}, "Each link is personal. A forwarded link won't work for anyone else, and every link stops when the job closes.")));
  };
  render({});
  loadMe().then(render);
  return panel;
}

/* ---------- voice ---------- */
const STATE_TEXT = { connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" };
/** Wires a mic button to voice.js (loaded lazily). Text input keeps working without it. */
export function wireVoice({ btn, stateEl, mode, agentId, onTranscript, onReply, texts = {}, voiceErr }) {
  let session = null, ttfa = "";
  const T = { ...STATE_TEXT, ...texts };
  const setState = (s) => {
    const text = T[s] || (s && s !== "idle" && s !== "stopped" && s !== "closed" ? String(s) : "");
    if (!text) { stateEl.hidden = true; stateEl.innerHTML = ""; ttfa = ""; return; }
    stateEl.hidden = false;
    stateEl.innerHTML = '<span class="wave"><i></i><i></i><i></i><i></i><i></i></span>';
    stateEl.append(h("span", { class: "vs-text" }, text));
    if (ttfa) stateEl.append(h("span", { class: "ttfa mono", title: "Time to first audio" }, ttfa));
  };
  const onMetrics = (m) => {
    const ms = m && (m.ttfaMs ?? m.ttfa ?? m.firstAudioMs);
    if (typeof ms !== "number" || !isFinite(ms)) return;
    ttfa = (ms / 1000).toFixed(1) + " s";
    const old = stateEl.querySelector(".ttfa");
    if (old) old.textContent = ttfa; else if (!stateEl.hidden) stateEl.append(h("span", { class: "ttfa mono", title: "Time to first audio" }, ttfa));
  };
  const stop = () => {
    const s = session; session = null;
    try { s?.stop(); } catch {}
    btn.classList.remove("live"); btn.innerHTML = ICON.mic; btn.setAttribute("aria-label", "Talk"); btn.setAttribute("aria-pressed", "false"); setState("");
  };
  btn.innerHTML = ICON.mic;
  btn.addEventListener("click", async () => {
    if (session) return stop();
    btn.classList.add("live"); btn.innerHTML = ICON.stop; btn.setAttribute("aria-label", "Stop talking"); btn.setAttribute("aria-pressed", "true");
    setState("connecting");
    let mod;
    try { mod = await import("./voice.js"); }
    catch { stop(); toast(voiceErr || "Voice isn't available right now. Type your message instead.", "err"); return; }
    try {
      session = await mod.startVoice({
        mode, agentId,
        onState: (s) => { if (session || s) setState(s); if (s === "stopped" || s === "closed") stop(); },
        onTranscript: (text, who) => onTranscript?.(text, who),
        onReply: (json) => onReply?.(json),
        onMetrics,
        onError: (msg) => { stop(); toast(msg || "Voice stopped. You can type instead.", "err"); },
      });
      if (!session) stop();
    } catch (e) { stop(); toast((e && e.message) || voiceErr || "Couldn't start voice. Type your message instead.", "err"); }
  });
  return { stop, start: () => { if (!session) btn.click(); } };
}

export function scrollToEnd(el) { requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })); }
export function typingBubble() { return h("div", { class: "msg in typing", "aria-label": "Thinking" }, h("i"), h("i"), h("i")); }


/* ---------- citations: "Source: title · section" chip -> excerpt sheet ---------- */
export function citeChip(c, agentId, { prefix = "Source", loading = "Loading…" } = {}) {
  const label = `${prefix}: ${c.title}${c.section ? " · " + c.section : ""}`;
  return h("button", { class: "cite", type: "button", onclick: () => openExcerpt(c, agentId, loading) }, icon("source"), h("span", {}, label));
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
    body.append(h("div", { class: "label" }, "Section"), h("div", { class: "quote" }, c.section || c.title || "—"));
  }
}

/* hide the owner tab bar while typing on a phone, so the composer sits right above the keyboard */
document.addEventListener("focusin", (e) => { if (navigator.maxTouchPoints > 0 && e.target.matches?.("input[type=text], textarea")) document.body.classList.add("kb-open"); });
document.addEventListener("focusout", () => setTimeout(() => { if (!document.activeElement?.matches?.("input[type=text], textarea")) document.body.classList.remove("kb-open"); }, 50));
