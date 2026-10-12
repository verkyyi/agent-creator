// Shared helpers for the Crewbrain owner app and helper chat. Relative URLs only.

export const ICON = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  helpers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.5"/><path d="M16 13.5a4.5 4.5 0 0 1 5 4.5"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  drive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8.5 4h7l5 9-3.5 6h-10L3.5 13z"/><path d="M8.5 4l5 9h7M3.5 13h10l-3.5 6"/></svg>',
  gmail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5l8.5 7 8.5-7"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5.5-5 4 3.5 3-2.5L20 17"/></svg>',
  answer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5l2 2 4-4"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
  issue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/></svg>',
  source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>',
};

/** An inline SVG icon as a DOM node. */
export const icon = (name, cls = "ico-i") => h("span", { class: cls, "aria-hidden": "true", html: ICON[name] || "" });

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
