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
};

export async function api(path, body, method) {
  const opts = { method: method || (body !== undefined ? "POST" : "GET"), credentials: "same-origin", headers: {} };
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, opts); }
  catch (e) { return { ok: false, status: 0, data: { error: "Network error — check your connection." } }; }
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
    h("div", { class: "sheet-head" }, h("h3", {}, title), h("button", { class: "sheet-close", type: "button", "aria-label": "Close", onclick: closeSheet }, "✕")),
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

export function shareSheet(links, { title = "Share links", helperName = "" } = {}) {
  const qrImg = h("img", { alt: "QR code", width: 200, height: 200 });
  const qrName = h("div", { class: "qr-name" });
  const qrBox = h("div", { class: "qr-box", "data-testid": "qr-box" }, qrImg, qrName);
  const rows = [];
  const select = async (i) => {
    rows.forEach((r, j) => r.classList.toggle("sel", i === j));
    const l = links[i]; qrName.textContent = `Scan · ${l.name}`;
    try {
      const qrcode = await loadQR();
      const qr = qrcode(0, "M"); qr.addData(l.url); qr.make();
      qrImg.src = qr.createDataURL(6, 2);
    } catch { qrBox.hidden = true; }
  };
  const list = h("div", { class: "links" }, links.map((l, i) => {
    const copyBtn = h("button", { class: "btn small ghost copy-btn", type: "button", onclick: async (e) => {
      e.stopPropagation(); const ok = await copyText(l.url); copyBtn.textContent = ok ? "Copied ✓" : "Copy failed"; setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
    } }, "Copy");
    const shareBtn = navigator.share ? h("button", { class: "btn small", type: "button", "aria-label": `Share ${l.name}'s link`, html: ICON.share, onclick: async (e) => {
      e.stopPropagation();
      try { await navigator.share({ title: helperName || "Crewbrain", text: `${l.name}, here's your personal ${helperName || "helper"} link:`, url: l.url }); } catch {}
    } }) : h("button", { class: "btn small ghost qr-btn", type: "button", onclick: (e) => { e.stopPropagation(); select(i); } }, "QR");
    const row = h("div", { class: "link-row", "data-member": l.memberId, onclick: () => select(i) },
      h("div", { style: "min-width:0" }, h("span", { class: "nm" }, l.name), h("span", { class: "url" }, l.url)), copyBtn, shareBtn);
    rows.push(row); return row;
  }));
  const body = links.length
    ? h("div", { class: "stack" },
        h("p", { class: "muted", style: "font-size:.92rem" }, "Each person gets their own link. It stops working the moment the job ends."),
        qrBox, list)
    : h("div", { class: "empty" }, "No links yet — approve the helper first.");
  const panel = openSheet(title, body, { className: "share-sheet", testid: "share-sheet" });
  if (links.length) select(0);
  return panel;
}

/* ---------- voice ---------- */
const STATE_TEXT = { connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" };
/** Wires a mic button to voice.js (loaded lazily). Text input keeps working without it. */
export function wireVoice({ btn, stateEl, mode, agentId, onTranscript, onReply }) {
  let session = null;
  const setState = (s) => {
    const text = STATE_TEXT[s] || (s && s !== "idle" && s !== "stopped" ? String(s) : "");
    if (!text) { stateEl.hidden = true; stateEl.innerHTML = ""; return; }
    stateEl.hidden = false;
    stateEl.innerHTML = '<span class="wave"><i></i><i></i><i></i><i></i><i></i></span>';
    stateEl.append(text);
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
    catch { stop(); toast("Voice isn't available right now — type instead.", "err"); return; }
    try {
      session = await mod.startVoice({
        mode, agentId,
        onState: (s) => { if (session || s) setState(s); if (s === "stopped" || s === "closed") stop(); },
        onTranscript: (text, who) => onTranscript?.(text, who),
        onReply: (json) => onReply?.(json),
        onError: (msg) => { stop(); toast(msg || "Voice stopped.", "err"); },
      });
      if (!session) stop();
    } catch (e) { stop(); toast((e && e.message) || "Couldn't start voice — type instead.", "err"); }
  });
  return { stop };
}

export function scrollToEnd(el) { requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })); }
export function typingBubble() { return h("div", { class: "msg in typing", "aria-label": "Thinking" }, h("i"), h("i"), h("i")); }
