// Owner's Brain tab: what the company brain knows, how to add to it, and who each piece reaches.
// Usage: import { renderBrain } from "./brain.js"; renderBrain(document.querySelector("#view-brain"));
// Relative URLs only. Uses the shared helpers from common.js unless the caller passes its own.
import * as common from "./common.js";

const { h, lockChip, lockPicker, closeSheet, downscale } = common;

const SVG = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  cam: SVG('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  file: SVG('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M12 17v-6M9 14l3-3 3 3"/>'),
  type: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>'),
  mic: SVG('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  search: SVG('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  drive: SVG('<path d="M8 3h8l6 11-4 7H6l-4-7z"/><path d="M8 3l6 11h8M2 14h12"/>'),
  mail: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  answer: SVG('<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10l2 2 4-4"/>'),
  note: SVG('<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h4"/>'),
};

const ORIGIN = {
  drive: [IC.drive, "From Google Drive"], gmail: [IC.mail, "From Gmail"], photo: [IC.cam, "Photo"],
  answer: [IC.answer, "Your answer"], doc: [IC.file, "Document"], note: [IC.note, "Note"],
};
const originOf = (it) => ORIGIN[it.origin === "doc" && it.category === "note" ? "note" : it.origin] || ORIGIN.doc;

// Plain-words locks for every add flow. Default is Office only.
const LOCK_WORDS = [
  { v: "internal", label: "Office only", sub: "Never leaves the office" },
  { v: "crew", label: "Crew", sub: "The crews on your jobs" },
  { v: "customer", label: "Homeowners", sub: "Customers and crews" },
];
function plainLockPicker(value = "internal") {
  let cur = value;
  const btns = LOCK_WORDS.map((l) => h("button", { type: "button", class: "bx-lock", "data-sharing": l.v, "aria-pressed": String(l.v === cur),
    onclick: () => { cur = l.v; btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sharing === cur))); } },
    lockChip(l.v, l.label), h("span", { class: "bx-lock-sub" }, l.sub)));
  return { el: h("div", { class: "bx-locks", role: "group", "aria-label": "Who can find this", "data-testid": "lock-picker" }, btns), get value() { return cur; } };
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function injectStyle() {
  if (document.getElementById("bx-style")) return;
  document.head.append(h("style", { id: "bx-style" }, `
.bx-head h2 { margin: 0 0 .25rem; }
.bx-head p { margin: 0 0 1rem; color: var(--muted); }
.bx-actions { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.bx-actions .btn { flex: 1 1 10rem; min-height: 48px; }
.bx-ask { display: flex; gap: .5rem; margin-bottom: .75rem; }
.bx-ask input { flex: 1; min-width: 0; min-height: 48px; padding: 0 .9rem; border: 2px solid var(--line); border-radius: 10px; background: var(--sheet); }
.bx-ask button { min-width: 48px; min-height: 48px; }
.bx-results { display: grid; gap: .5rem; margin-bottom: 1rem; }
.bx-result { border: 1px solid var(--line); border-radius: 10px; padding: .75rem .85rem; background: var(--sheet); }
.bx-result .t { font-weight: 700; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.bx-result .sec { color: var(--muted); font-size: .85rem; }
.bx-result p { margin: .35rem 0 0; font-size: .95rem; line-height: 1.4; }
.bx-list { border: 1px solid var(--line); border-radius: 10px; background: var(--sheet); overflow: hidden; }
.bx-ic { width: 2.4rem; height: 2.4rem; grid-row: span 2; display: grid; place-items: center; border-radius: 8px; background: var(--paper); color: var(--muted); }
.bx-ic svg, .bx-opt svg { width: 22px; height: 22px; }
.bx-foot { color: var(--muted); font-size: .85rem; text-align: center; margin: 1rem 0 2rem; }
.bx-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; }
.bx-opt { min-height: 96px; display: grid; place-items: center; gap: .35rem; padding: .8rem; border: 2px solid var(--line); border-radius: 12px; background: var(--sheet); font-weight: 700; cursor: pointer; text-align: center; }
.bx-opt svg { width: 30px; height: 30px; color: var(--chalk); }
.bx-opt small { font-weight: 400; color: var(--muted); font-size: .8rem; }
.bx-locks { display: grid; gap: .45rem; }
.bx-lock { display: flex; align-items: center; gap: .6rem; min-height: 52px; padding: .5rem .75rem; border: 2px solid var(--line); border-radius: 10px; background: var(--sheet); text-align: left; cursor: pointer; }
.bx-lock[aria-pressed="true"] { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.bx-lock-sub { color: var(--muted); font-size: .9rem; }
.bx-excerpt { white-space: pre-wrap; line-height: 1.45; background: var(--paper); border-radius: 8px; padding: .75rem; max-height: 40vh; overflow: auto; margin: 0; }
.bx-sheet input[type=text], .bx-sheet textarea { width: 100%; min-height: 48px; padding: .6rem .75rem; border: 2px solid var(--line); border-radius: 10px; background: var(--sheet); box-sizing: border-box; }
.bx-sheet textarea { min-height: 160px; resize: vertical; }
.bx-rec { display: grid; place-items: center; gap: .6rem; padding: 1rem 0; }
.bx-rec .btn { min-width: 160px; min-height: 56px; }
.bx-timer { font-family: var(--f-mono); font-size: 1.4rem; }
`));
}

export async function renderBrain(el, opts = {}) {
  const api = opts.api || common.api;
  const toast = opts.toast || common.toast;
  const sheet = opts.sheet || common.openSheet;
  injectStyle();
  let items = [];

  const photoInput = h("input", { id: "photo-input", type: "file", accept: "image/*", capture: "environment", hidden: true });
  const fileInput = h("input", { id: "file-input", type: "file", accept: ".pdf,.txt,.md,.docx,.csv,application/pdf,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document", hidden: true });
  const addBtn = h("button", { class: "btn yellow", id: "add-knowledge-btn", type: "button", html: IC.plus + "Add knowledge" });
  const snapBtn = h("button", { class: "btn ghost", id: "snap-btn", type: "button", html: IC.cam + "Snap a photo" });
  const q = h("input", { type: "search", id: "ask-input", placeholder: "Ask your brain — e.g. gate code, warranty", "aria-label": "Ask your brain", enterkeyhint: "search" });
  const results = h("div", { class: "bx-results", "aria-live": "polite" });
  const list = h("div", { class: "bx-list", id: "brain-list" });

  el.innerHTML = "";
  el.append(
    h("div", { class: "bx-head" }, h("h2", {}, "Your company brain"),
      h("p", {}, "Everything your helpers can know. Each piece has a lock that decides who can find it.")),
    h("form", { class: "bx-ask", role: "search", onsubmit: (e) => { e.preventDefault(); ask(); } }, q,
      h("button", { class: "btn", type: "submit", "aria-label": "Search", html: IC.search })),
    results,
    h("div", { class: "bx-actions" }, addBtn, snapBtn),
    photoInput, fileInput, list,
    h("p", { class: "bx-foot" }, "Stored in your private HydraDB brain. Each lock decides who can find it."));

  async function load(flashId) {
    const r = await api("api/brain");
    if (!r.ok) { toast(r.data.error || "Couldn't load the brain.", "err"); return; }
    items = r.data.items || [];
    renderList(flashId);
  }

  function renderList(flashId) {
    list.innerHTML = "";
    if (!items.length) { list.append(h("div", { class: "empty" }, "Nothing here yet. Tap Add knowledge to teach Crewbrain.")); return; }
    for (const it of [...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))) {
      const [icon, words] = originOf(it);
      list.append(h("button", { class: "brain-item" + (it.id === flashId ? " flash" : ""), type: "button", "data-id": it.id, onclick: () => openItem(it) },
        h("span", { class: "bx-ic", html: icon }),
        h("span", { class: "t" }, it.title),
        h("span", { class: "chev", "aria-hidden": "true" }, "›"),
        h("span", { class: "meta" }, lockChip(it.sharing, it.lockLabel), h("span", {}, words), h("span", {}, `Updated ${fmtDate(it.updatedAt)}`))));
    }
  }

  async function ask() {
    const text = q.value.trim();
    results.innerHTML = "";
    if (!text) return;
    results.append(h("div", { class: "muted" }, "Searching…"));
    const r = await api(`api/x/ask?q=${encodeURIComponent(text)}`);
    results.innerHTML = "";
    if (!r.ok) { toast(r.data.error || "Couldn't search.", "err"); return; }
    const rs = r.data.results || [];
    if (!rs.length) { results.append(h("div", { class: "empty" }, "Nothing in your brain matches that yet.")); return; }
    for (const x of rs) {
      const sharing = /Office/.test(x.lockLabel) ? "internal" : /Crew|crews/.test(x.lockLabel) ? "crew" : "customer";
      results.append(h("div", { class: "bx-result" },
        h("div", { class: "t" }, x.title, lockChip(sharing, x.lockLabel)),
        x.section ? h("div", { class: "sec" }, x.section) : null,
        h("p", {}, x.text.length > 320 ? x.text.slice(0, 320) + "…" : x.text)));
    }
  }

  async function openItem(it) {
    const body = h("div", { class: "stack bx-sheet" }, h("div", { class: "muted" }, "Loading…"));
    sheet(it.title, body, { testid: "item-sheet" });
    const r = await api(`api/x/sources/${encodeURIComponent(it.id)}/excerpt`);
    body.innerHTML = "";
    const [icon, words] = originOf(it);
    body.append(h("div", { class: "row-btns", style: "align-items:center" }, h("span", { class: "bx-ic", html: icon, style: "grid-row:auto" }), h("span", { class: "muted" }, words), lockChip(it.sharing, it.lockLabel)));
    if (r.ok) body.append(h("div", { class: "muted", style: "font-size:.85rem" }, r.data.updatedLabel || ""), h("pre", { class: "bx-excerpt", "data-testid": "excerpt" }, r.data.text || ""));
    else body.append(h("p", { class: "muted" }, r.data.error || "Couldn't load the text."));
    body.append(h("div", { class: "label" }, "Who can find this"));
    const row = h("div", { class: "bx-locks" }, LOCK_WORDS.map((l) => h("button", { type: "button", class: "bx-lock", "data-sharing": l.v, "aria-pressed": String(l.v === it.sharing),
      onclick: async (e) => {
        if (l.v === it.sharing) return;
        e.currentTarget.disabled = true;
        const res = await api(`api/brain/${encodeURIComponent(it.id)}/label`, { sharing: l.v });
        if (!res.ok) { e.currentTarget.disabled = false; toast(res.data.error || "Couldn't change the lock.", "err"); return; }
        closeSheet(); toast(`Locked: ${res.data.item?.lockLabel || l.label}`); load(it.id);
      } }, lockChip(l.v, l.label), h("span", { class: "bx-lock-sub" }, l.sub))));
    body.append(row);
  }

  // ---------- add flows ----------
  function finishWith(r, label) {
    if (!r.ok) { toast(r.data.reply || r.data.error || `Couldn't ${label}.`, "err"); return false; }
    closeSheet(); toast(`Added: ${r.data.item?.title || "new knowledge"}`); load(r.data.item?.id);
    return true;
  }

  function addSheet() {
    const opt = (id, icon, label, sub, fn) => h("button", { class: "bx-opt", type: "button", id, onclick: fn, html: icon }, h("span", {}, label), h("small", {}, sub));
    sheet("Add knowledge", h("div", { class: "stack" },
      h("div", { class: "bx-opts" },
        opt("add-photo", IC.cam, "Snap a photo", "Warranty card, label, note", () => { closeSheet(); photoInput.click(); }),
        opt("add-file", IC.file, "Upload a file", "PDF, Word, text, CSV", () => { closeSheet(); fileInput.click(); }),
        opt("add-text", IC.type, "Paste or type", "Notes, answers, rules", () => textSheet()),
        opt("add-voice", IC.mic, "Record a voice note", "Say it, we write it down", () => voiceSheet()))), { testid: "add-sheet" });
  }

  function textSheet(draft = {}, heading = "Paste or type") {
    const title = h("input", { type: "text", id: "ingest-title", placeholder: "Title (optional)", value: draft.title || "" });
    const text = h("textarea", { id: "ingest-text", placeholder: "Paste or type what your helpers should know" }); text.value = draft.text || "";
    const picker = plainLockPicker("internal");
    const save = h("button", { class: "btn yellow block", id: "ingest-save-btn", type: "button" }, "Add to brain");
    save.addEventListener("click", async () => {
      if (!text.value.trim()) { toast("Type or paste something first.", "err"); return; }
      save.disabled = true; save.textContent = "Saving…";
      const r = await api("api/x/ingest/text", { title: title.value.trim(), text: text.value, sharing: picker.value });
      if (!finishWith(r, "save")) { save.disabled = false; save.textContent = "Add to brain"; }
    });
    sheet(heading, h("div", { class: "stack bx-sheet" },
      h("div", { class: "field" }, h("label", { class: "label", for: "ingest-title" }, "Title"), title),
      h("div", { class: "field" }, h("label", { class: "label", for: "ingest-text" }, "What it says"), text),
      h("div", { class: "field" }, h("div", { class: "label" }, "Who can find this"), picker.el), save), { testid: "text-sheet" });
  }

  function fileLockSheet(file) {
    const title = h("input", { type: "text", id: "file-title", value: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") });
    const picker = plainLockPicker("internal");
    const save = h("button", { class: "btn yellow block", id: "file-save-btn", type: "button" }, "Add to brain");
    save.addEventListener("click", async () => {
      save.disabled = true; save.textContent = "Reading the file…";
      const fd = new FormData();
      fd.append("file", file); fd.append("title", title.value.trim()); fd.append("sharing", picker.value);
      let r;
      try { const res = await fetch("api/x/ingest/file", { method: "POST", credentials: "same-origin", body: fd }); r = { ok: res.ok, data: await res.json().catch(() => ({})) }; }
      catch { r = { ok: false, data: { error: "Network error — check your connection." } }; }
      if (!finishWith(r, "add that file")) { save.disabled = false; save.textContent = "Add to brain"; }
    });
    sheet("Upload a file", h("div", { class: "stack bx-sheet" },
      h("p", { class: "muted" }, `${file.name} · ${(file.size / 1024).toFixed(0)} KB`),
      h("div", { class: "field" }, h("label", { class: "label", for: "file-title" }, "Title"), title),
      h("div", { class: "field" }, h("div", { class: "label" }, "Who can find this"), picker.el), save), { testid: "file-sheet" });
  }

  function voiceSheet() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast("Recording isn't supported here — type it instead.", "err"); return textSheet(); }
    let rec, chunks = [], stream, t0, tick;
    const timer = h("div", { class: "bx-timer" }, "0:00");
    const btn = h("button", { class: "btn yellow", id: "voice-rec-btn", type: "button", html: IC.mic + "Start recording" });
    const stopAll = () => { clearInterval(tick); stream?.getTracks().forEach((t) => t.stop()); };
    btn.addEventListener("click", async () => {
      if (rec?.state === "recording") { rec.stop(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { toast("Microphone permission was denied.", "err"); return; }
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stopAll();
        btn.disabled = true; btn.textContent = "Writing it down…";
        const type = rec.mimeType || "audio/webm";
        const ext = /mp4|m4a/.test(type) ? "m4a" : /mpeg|mp3/.test(type) ? "mp3" : "webm";
        const fd = new FormData();
        fd.append("audio", new Blob(chunks, { type }), `note.${ext}`);
        let r;
        try { const res = await fetch("api/x/ingest/voice-note", { method: "POST", credentials: "same-origin", body: fd }); r = { ok: res.ok, data: await res.json().catch(() => ({})) }; }
        catch { r = { ok: false, data: {} }; }
        if (!r.ok) { toast(r.data.reply || r.data.error || "Couldn't transcribe that.", "err"); closeSheet(); return; }
        textSheet(r.data.draft || {}, "Check what I heard");
      };
      rec.start();
      t0 = Date.now();
      tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; if (s >= 300) rec.stop(); }, 250);
      btn.innerHTML = common.ICON.stop + "Stop";
    });
    const panel = sheet("Record a voice note", h("div", { class: "stack bx-sheet" },
      h("p", { class: "muted" }, "Say what your helpers should know. You'll check the words before anything is saved."),
      h("div", { class: "bx-rec" }, timer, btn)), { testid: "voice-sheet" });
    // stop the mic if the sheet is closed mid-recording
    new MutationObserver((_, obs) => { if (!panel.isConnected) { obs.disconnect(); if (rec?.state === "recording") { rec.onstop = null; rec.stop(); } stopAll(); } }).observe(document.body, { childList: true });
  }

  // Photo: capture → draft → approve, with the plain-words lock.
  async function photoFlow(file) {
    let dataUrl;
    try { dataUrl = await downscale(file); } catch { toast("Couldn't read that photo.", "err"); return; }
    sheet("Teach from a photo", h("div", { class: "stack" }, h("img", { class: "photo-big", src: dataUrl, alt: "Your photo" }),
      h("div", { class: "reading" }, h("div", { class: "spinner" }), "Reading your photo…")), { testid: "capture-sheet" });
    const r = await api("api/brain/capture", { imageDataUrl: dataUrl });
    if (!r.ok) { closeSheet(); toast(r.data.error || "Couldn't read that photo.", "err"); return; }
    const d = r.data.draft;
    const title = h("input", { id: "draft-title", type: "text", value: d.title || "" });
    const text = h("textarea", { id: "draft-text" }); text.value = d.text || "";
    const picker = plainLockPicker(d.suggestedSharing || "internal");
    const approve = h("button", { class: "btn yellow block", id: "draft-approve-btn", type: "button" }, "Approve into Brain");
    approve.addEventListener("click", async () => {
      approve.disabled = true; approve.textContent = "Saving…";
      const res = await api(`api/brain/drafts/${encodeURIComponent(d.id)}/approve`, { title: title.value.trim(), text: text.value, sharing: picker.value });
      if (!finishWith(res, "save")) { approve.disabled = false; approve.textContent = "Approve into Brain"; }
    });
    sheet("Check what I read", h("div", { class: "stack bx-sheet" },
      h("img", { class: "photo-big", src: dataUrl, alt: "Your photo", style: "max-height:160px" }),
      h("p", { class: "muted", style: "font-size:.9rem" }, "Nothing is usable until you approve it."),
      h("div", { class: "field" }, h("label", { class: "label", for: "draft-title" }, "Title"), title),
      h("div", { class: "field" }, h("label", { class: "label", for: "draft-text" }, "What it says"), text),
      h("div", { class: "field" }, h("div", { class: "label" }, "Who can find this"), picker.el), approve), { testid: "draft-sheet" });
  }

  addBtn.addEventListener("click", addSheet);
  snapBtn.addEventListener("click", () => photoInput.click());
  photoInput.addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) photoFlow(f); });
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast("That file is over 10 MB.", "err"); return; }
    fileLockSheet(f);
  });

  await load();
  return { reload: load };
}
