// Inline chat cards for the owner's chat with Crewbrain, plus the composer's attach menu.
import { api, h, toast, ICON, icon, avatar, helperAvatar, downscale, lockChip, lockPicker, LOCKS, openSheet, shareSheet, showOnSite, scrollToEnd, sourcesToggle } from "./common.js";
import { ot, fmtWhen } from "./strings.js";

let ctx;
const $ = (s) => document.querySelector(s);
const add = (el) => { ctx.log.append(el); scrollToEnd(ctx.log); return el; };
const rel = (p) => String(p || "").replace(/^\/+/, "");
const lockLabel = (v) => (LOCKS.find((l) => l.v === v) || LOCKS[0]).label;
/** The end date in the owner's language and the company time zone; the server's English label otherwise. */
const endsOf = (a) => fmtWhen(a.expiresAt || a.endsAt, a.timeZone, a.endsLabel || "");
const lockFromLabel = (label) => {
  const t = String(label || "").toLowerCase();
  if (/home|customer/.test(t)) return "customer";
  if (/crew/.test(t)) return "crew";
  return "internal";
};
const card = (cls, ...kids) => h("div", { class: "cb-card " + cls }, ...kids);
const head = (ico, title, extra) => h("div", { class: "cb-head" }, ico ? icon(ico) : null, h("b", {}, title), extra || null);
const note = (text) => add(h("div", { class: "sys-note" }, text));

async function upload(path, form) {
  try {
    const res = await fetch(rel(path), { method: "POST", body: form, credentials: "same-origin" });
    let data = {}; try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch { return { ok: false, status: 0, data: { error: ot("cards.noReach") } }; }
}

/* ---------- card renderers ---------- */
function shareCard(c) {
  const a = c.agent || {}, links = c.links || [];
  const name = a.name || ot("cards.yourHelper");
  const openAll = () => shareSheet(links, { title: ot("cards.sendName", { n: name }), helperName: name, endsLabel: endsOf(a), job: a.job || "" });
  const SHOW = 2;
  const rows = links.slice(0, SHOW).map((l) => {
    const copy = h("button", { class: "btn small ghost", type: "button", onclick: async () => {
      let ok = false; try { await navigator.clipboard.writeText(l.url); ok = true; } catch {}
      copy.textContent = ok ? ot("cards.copied") : ot("cards.holdToCopy"); setTimeout(() => (copy.textContent = ot("cards.copy")), 1600);
    } }, ot("cards.copy"));
    return h("div", { class: "cb-row cb-line", "data-member": l.memberId },
      h("div", { class: "cb-who" }, h("b", {}, l.name), h("span", { class: "cb-url" }, l.url)),
      h("div", { class: "cb-acts" },
        h("a", { class: "btn small", href: "sms:?&body=" + encodeURIComponent(ot("cards.smsBody", { n: name, url: l.url })) }, ot("cards.text")), copy));
  });
  const rest = links.length - SHOW;
  return add(card("share-card",
    head("share", ot("cards.sendName", { n: name }), a.endsLabel || a.expiresAt || a.endsAt ? h("span", { class: "cb-sub" }, ot("cards.worksUntil", { e: endsOf(a) })) : null),
    links.length ? h("div", { class: "cb-rows" }, rows,
      rest > 0 ? h("button", { class: "cb-more", type: "button", onclick: openAll }, ot("cards.andMore", { n: rest })) : null)
      : h("p", { class: "cb-muted" }, ot("cards.noLinks")),
    links.length ? h("div", { class: "cb-btnrow" },
      h("button", { class: "btn yellow open-share-btn", type: "button", onclick: openAll }, h("span", { html: ICON.share, style: "display:inline-flex" }), ot("cards.sendEveryone")),
      h("button", { class: "btn ghost qr-card-btn", type: "button", "aria-label": ot("cards.showQr"), onclick: () => links.length === 1 ? showOnSite(links[0], name) : openAll() }, h("span", { html: ICON.qr, style: "display:inline-flex" }), "QR")) : null));
}

function helpersCard(c) {
  const list = c.helpers || [];
  const PILL = ctx.PILL || {};
  const rows = list.map((a) => {
    const [pc, pt] = PILL[a.state] || ["awaiting", a.state || ""];
    const ended = a.state === "expired" || a.state === "revoked";
    const live = a.state === "active";
    return h("div", { class: "cb-row cb-helper" + (ended ? " ended" : ""), "data-id": a.id },
      h("div", { class: "cb-hl" }, avatar(helperAvatar(a)),
        h("div", { class: "cb-who" }, h("b", {}, a.name),
          h("span", { class: "cb-muted" }, [a.audienceName ? ot("cards.forWho", { a: a.audienceName }) : null, a.endsLabel || a.expiresAt ? (ended ? ot("cards.endedOn", { e: endsOf(a) }) : ot("cards.endsOn", { e: endsOf(a) })) : null].filter(Boolean).join(" · "))),
        h("span", { class: "pill " + pc }, pt)),
      h("div", { class: "cb-acts" },
        live ? h("button", { class: "btn small ghost", type: "button", onclick: () => ctx.sendCreator(`Send ${a.name}'s links`) }, ot("cards.share")) : null,
        h("a", { class: "btn small ghost", href: `a.html?id=${encodeURIComponent(a.id)}` }, ot("cards.openChat")),
        !ended ? h("button", { class: "btn small ghost", type: "button", onclick: () => ctx.sendCreator(`Close ${a.name}`) }, ot("cards.close")) : null));
  });
  const MAX = 4;
  rows.slice(MAX).forEach((r) => (r.hidden = true));
  const all = rows.length > MAX ? h("button", { class: "cb-more", type: "button", "aria-expanded": "false", onclick: () => {
    rows.forEach((r) => (r.hidden = false)); all.remove();
  } }, ot("cards.showAll", { n: rows.length })) : null;
  return add(card("helpers-card", head("helpers", list.length ? ot("cards.yourHelpersN", { n: list.length }) : ot("cards.yourHelpers")),
    list.length ? h("div", { class: "cb-rows" }, rows, all) : h("p", { class: "cb-muted" }, ot("cards.noHelpers"))));
}

function confirmCard(c) {
  const go = h("button", { class: "btn " + (c.danger ? "danger" : "yellow"), type: "button" }, c.confirmLabel || ot("cards.yesDoIt"));
  const cancel = h("button", { class: "btn ghost", type: "button" }, ot("cards.cancel"));
  const foot = h("div", { class: "cb-foot cb-foot-row" }, go, cancel);
  const el = add(card("confirm-card" + (c.danger ? " danger" : ""), head(c.danger ? "power" : "check", c.title || ot("cards.sure")),
    c.body ? h("p", { class: "cb-line1", title: c.body }, c.body) : null, foot));
  cancel.onclick = () => { foot.replaceChildren(h("div", { class: "cb-muted" }, ot("cards.cancelled"))); el.classList.add("done"); };
  go.onclick = async () => {
    go.disabled = true; cancel.disabled = true; const label = go.textContent; go.textContent = ot("cards.working");
    const req = c.request || {};
    const r = await api(rel(req.path), req.body || {}, req.method || "POST");
    if (!r.ok) { go.disabled = false; cancel.disabled = false; go.textContent = label; toast(r.data.error || ot("cards.failed"), "err"); return; }
    if (r.data.agent) ctx.upsertHelper(r.data.agent);
    el.classList.add("done");
    foot.replaceChildren(h("div", { class: "published" }, icon("check"), ot("cards.done")));
    if (r.data.reply) ctx.log.append(h("div", { class: "msg in" }, r.data.reply));
    else note(ot("cards.allDone"));
    scrollToEnd(ctx.log);
  };
  return el;
}

/** Editable knowledge card, compact: title + 2-line preview; "Edit" opens the fields. save({title,text,sharing}) -> api result. */
function knowledgeCard({ heading = ot("cards.checkBefore"), title = "", text = "", sharing = "internal", imageUrl, save }) {
  const t = h("input", { type: "text", "aria-label": ot("cards.title"), class: "cb-input" }); t.value = title;
  const x = h("textarea", { "aria-label": ot("cards.whatItSays"), class: "cb-input", rows: 4 }); x.value = text;
  const picker = lockPicker(sharing);
  picker.el.classList.add("seg");
  const pvT = h("b", { class: "kc-title" }, title || ot("cards.untitled"));
  const pvX = h("p", { class: "kc-text" }, text);
  const fields = h("div", { class: "kc-fields", hidden: true },
    h("label", { class: "cb-label" }, ot("cards.title"), t),
    h("label", { class: "cb-label" }, ot("cards.whatItSays"), x));
  const edit = h("button", { class: "kc-edit", type: "button", "aria-expanded": "false" }, ot("cards.edit"));
  const preview = h("div", { class: "kc-preview" }, h("div", { class: "kc-top" }, pvT, edit), pvX);
  edit.onclick = () => { preview.hidden = true; fields.hidden = false; x.focus(); };
  const btn = h("button", { class: "btn yellow block save-knowledge-btn", type: "button" }, ot("cards.saveToBrain"));
  const foot = h("div", { class: "cb-foot" }, btn);
  const el = add(card("knowledge-card", head("brain", heading),
    imageUrl ? h("img", { class: "cb-photo", src: imageUrl, alt: ot("cards.yourPhoto") }) : null,
    preview, fields,
    h("div", { class: "cb-label" }, ot("cards.whoCanSee"), picker.el),
    foot));
  btn.onclick = async () => {
    const vals = { title: t.value.trim(), text: x.value, sharing: picker.value };
    if (!vals.text.trim()) { edit.click(); return; }
    btn.disabled = true; btn.textContent = ot("cards.saving");
    const r = await save(vals);
    if (!r.ok) { btn.disabled = false; btn.textContent = ot("cards.saveToBrain"); toast(r.data.error || ot("cards.saveFail"), "err"); return; }
    t.readOnly = x.readOnly = true; picker.el.classList.add("locked");
    pvT.textContent = vals.title || ot("cards.untitled"); pvX.textContent = vals.text; fields.hidden = true; preview.hidden = false; edit.remove();
    el.classList.add("done");
    const lbl = r.data.item?.lockLabel || lockLabel(vals.sharing);
    foot.replaceChildren(h("div", { class: "published" }, icon("check"), ot("cards.savedLock", { l: lbl })));
  };
  return el;
}

function knowledgeDraftCard(c) {
  const req = c.request || {};
  return knowledgeCard({ heading: ot("cards.saveThis"), title: c.title, text: c.text, sharing: c.sharing,
    save: (v) => api(rel(req.path), { ...(req.bodyBase || {}), ...v }) });
}

function answerCard(c) {
  const res = c.results || [];
  const related = (c.related || []).slice(0, 5);
  const open = c.open || [];
  if (!res.length && !related.length && !open.length) return null;
  // Sources and graph links fold into one quiet line; open questions stay in view.
  const n = res.length + related.length;
  const folded = [
    res.length ? h("span", { class: "cb-src-label" }, ot("cards.fromBrain")) : null,
    ...res.map((r) => h("button", { class: "src-chip", type: "button", onclick: () => openSheet(r.title || ot("cards.source"),
      h("div", { class: "stack" }, h("div", { class: "row-btns" }, lockChip(lockFromLabel(r.lockLabel), r.lockLabel)), r.section ? h("div", { class: "label" }, r.section) : null, h("div", { class: "quote excerpt" }, r.text || "")), { testid: "excerpt-sheet" }) },
      lockChip(lockFromLabel(r.lockLabel), r.lockLabel), h("span", { class: "src-t" }, r.title + (r.section ? " · " + r.section : "")))),
    related.length ? h("span", { class: "cb-src-label" }, ot("cards.relatedGraph")) : null,
    ...related.map((r) => h("span", { class: "src-chip related-chip", "data-testid": "related-chip", title: r.relation || "" },
      h("span", { class: "src-t" }, ot("cards.related", { t: r.title }) + (r.relation ? ` (${r.relation})` : "")))),
  ];
  return add(h("div", { class: "answer-sources" },
    n ? sourcesToggle(folded, n === 1 ? ot("cards.source1") : ot("cards.sourcesN", { n })) : null,
    open.length ? h("span", { class: "cb-src-label" }, ot("cards.waitingOnYou")) : null,
    open.map((i) => h("button", { class: "src-chip", type: "button", "data-testid": "open-item", onclick: () => ctx.sendCreator("What's new?") }, h("span", { class: "src-t" }, `${i.from || ot("cards.someone")}: ${i.text}`)))));
}

/** Approval card for a crew → household update (inbox item kind "relay"). Returns the element; caller places it. */
export function relayCard(it, { onDone } = {}) {
  const who = it.targetName || ot("cards.household");
  const ta = h("textarea", { class: "cb-input relay-text", rows: 4, "aria-label": ot("cards.messageTo", { w: who }) }); ta.value = it.text || "";
  const ok = h("button", { class: "btn yellow block relay-approve-btn", type: "button" }, ot("cards.approveSend"));
  const no = h("button", { class: "btn ghost block relay-decline-btn", type: "button" }, ot("cards.notNow"));
  const foot = h("div", { class: "cb-foot" }, ok, no);
  const warn = h("p", { class: "cb-warn" }, ot("cards.noLiveHelper", { w: who }));
  warn.hidden = it.deliverable !== false;
  const el = card("relay-card", head("share", ot("cards.sendToQ", { w: who })),
    h("p", { class: "cb-muted" }, (it.agentName ? ot("cards.fromVia", { f: it.from || ot("cards.theCrew"), a: it.agentName }) : ot("cards.from", { f: it.from || ot("cards.theCrew") })) + (it.original ? `: “${it.original}”` : "")),
    h("label", { class: "cb-label" }, ot("cards.messageTheyGet"), ta),
    h("p", { class: "cb-muted" }, ot("cards.nothingUntil")), warn, foot);
  el.dataset.inbox = it.id;
  const finish = (msg, sent) => {
    ta.readOnly = true; el.classList.add("done");
    foot.replaceChildren(h("div", { class: sent ? "published" : "cb-muted" }, sent ? icon("check") : null, msg));
    onDone && onDone();
  };
  if (it.status && it.status !== "open") { finish(it.status === "answered" ? ot("cards.sentToThe", { w: who }) : ot("cards.notSent"), it.status === "answered"); return el; }
  if (it.deliverable === false) ok.disabled = true;
  ok.onclick = async () => {
    const text = ta.value.trim(); if (!text) { ta.focus(); return; }
    ok.disabled = no.disabled = true; ok.textContent = ot("cards.sending");
    const r = await api(`api/inbox/${encodeURIComponent(it.id)}/answer`, { text });
    if (!r.ok) {
      ok.textContent = ot("cards.approveSend"); no.disabled = false; ok.disabled = r.status === 409;
      if (r.status === 409) { warn.textContent = r.data.reply || warn.textContent; warn.hidden = false; }
      else toast(r.data.reply || r.data.error || ot("cards.sendFail"), "err");
      return;
    }
    const names = r.data.delivered?.members?.map((n) => String(n).split(" ")[0]).join(ot("cards.and"));
    const sent = names ? ot("cards.sentTo", { w: names }) : ot("cards.sentToThe", { w: who });
    toast(sent);
    finish(sent, true);
  };
  no.onclick = async () => {
    ok.disabled = no.disabled = true;
    const r = await api(`api/inbox/${encodeURIComponent(it.id)}/dismiss`, {});
    if (!r.ok) { ok.disabled = it.deliverable === false; no.disabled = false; toast(r.data.error || ot("cards.doFail"), "err"); return; }
    finish(ot("cards.notSentNothing", { w: who }), false);
  };
  return el;
}

export function renderCard(c) {
  if (!c || typeof c !== "object") return;
  if (c.type === "relays") return (c.items || []).map((it) => add(relayCard(it, { onDone: () => ctx.refreshInbox && ctx.refreshInbox() })));
  if (c.type === "share") return shareCard(c);
  if (c.type === "helpers") return helpersCard(c);
  if (c.type === "confirm") return confirmCard(c);
  if (c.type === "knowledge_draft") return knowledgeDraftCard(c);
  if (c.type === "answer") return answerCard(c);
}

/** Render a card into `target` (e.g. a sheet inside the voice overlay) instead of the chat log. */
export function renderCardInto(c, target) {
  const prev = ctx.log;
  ctx.log = target;
  try { return renderCard(c); } finally { ctx.log = prev; }
}

/* ---------- attach menu ---------- */
function progress(text) {
  const el = add(h("div", { class: "cb-progress" }, h("div", { class: "spinner" }), h("span", {}, text)));
  return { set: (t) => (el.lastChild.textContent = t), done: () => el.remove() };
}

async function onPhoto(file) {
  let dataUrl;
  try { dataUrl = await downscale(file); } catch { toast(ot("cards.photoOpenFail"), "err"); return; }
  ctx.log.append(h("div", { class: "msg out" }, h("img", { class: "photo", src: dataUrl, alt: ot("cards.yourPhoto") }), ot("cards.photo")));
  const p = progress(ot("cards.readingPhoto"));
  const r = await api("api/brain/capture", { imageDataUrl: dataUrl });
  p.done();
  if (!r.ok || !r.data.draft) { note(r.data.error || ot("cards.photoReadFail")); return; }
  const d = r.data.draft;
  knowledgeCard({ heading: ot("cards.whatIRead"), title: d.title, text: d.text, sharing: d.suggestedSharing || "internal", imageUrl: dataUrl,
    save: (v) => api(`api/brain/drafts/${encodeURIComponent(d.id)}/approve`, v) });
}

function onFile(file) {
  const t = h("input", { type: "text", class: "cb-input", "aria-label": ot("cards.title") }); t.value = file.name.replace(/\.[^.]+$/, "");
  const picker = lockPicker("internal");
  picker.el.classList.add("seg");
  const btn = h("button", { class: "btn yellow block", type: "button" }, ot("cards.saveToBrain"));
  const foot = h("div", { class: "cb-foot" }, btn);
  const el = add(card("knowledge-card file-card", head("doc", file.name),
    h("p", { class: "cb-muted" }, ot("cards.whoFile")),
    h("label", { class: "cb-label" }, ot("cards.title"), t),
    h("div", { class: "cb-label" }, ot("cards.whoCanSee"), picker.el), foot));
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = ot("cards.uploading");
    const fd = new FormData(); fd.append("file", file); fd.append("title", t.value.trim() || file.name); fd.append("sharing", picker.value);
    setTimeout(() => { if (btn.disabled && btn.isConnected) btn.textContent = ot("cards.readingFile"); }, 1200);
    const r = await upload("api/x/ingest/file", fd);
    if (!r.ok) { btn.disabled = false; btn.textContent = ot("cards.saveToBrain"); toast(r.data.error || ot("cards.fileFail"), "err"); return; }
    el.classList.add("done"); t.readOnly = true;
    foot.replaceChildren(h("div", { class: "published" }, icon("check"), ot("cards.savedLock", { l: r.data.item?.lockLabel || lockLabel(picker.value) })));
  };
}

let rec = null;
async function onVoice() {
  if (rec) return rec.stop();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast(ot("cards.noVoiceNotes"), "err"); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { toast(ot("cards.needMic"), "err"); return; }
  const mr = new MediaRecorder(stream); const chunks = [];
  const time = h("span", { class: "mono" }, "0:00");
  const stopB = h("button", { class: "btn danger small", type: "button" }, ot("cards.stopSave"));
  const el = add(card("voicenote-card", head("question", ot("cards.recording")), h("div", { class: "cb-rec" }, h("span", { class: "rec-dot" }), time, h("span", { class: "cb-muted" }, ot("cards.upTo1Min"))), stopB));
  const t0 = Date.now();
  const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); time.textContent = `0:${String(Math.min(s, 60)).padStart(2, "0")}`; if (s >= 60) stop(); }, 250);
  const stop = () => { if (mr.state !== "inactive") mr.stop(); };
  stopB.onclick = stop;
  rec = { stop };
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.onstop = async () => {
    clearInterval(tick); rec = null; stream.getTracks().forEach((t) => t.stop());
    el.remove();
    const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
    ctx.log.append(h("div", { class: "msg out" }, ot("cards.voiceNote", { t: time.textContent })));
    const p = progress(ot("cards.listening"));
    const fd = new FormData(); fd.append("audio", blob, "note." + ((mr.mimeType || "").includes("mp4") ? "m4a" : "webm"));
    const r = await upload("api/x/ingest/voice-note", fd);
    p.done();
    if (!r.ok || !r.data.draft) { note(r.data.error || ot("cards.noteFail")); return; }
    knowledgeCard({ heading: ot("cards.whatIHeard"), title: r.data.draft.title, text: r.data.draft.text, sharing: r.data.draft.sharing || "internal",
      save: (v) => api("api/x/ingest/text", v) });
  };
  mr.start();
}

function wireAttach() {
  const btn = $("#attach-owner-btn"), menu = $("#attach-menu");
  if (!btn || !menu) return;
  const set = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(menu.hidden); });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) set(false); });
  menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-attach]"); if (!b) return;
    set(false);
    if (b.dataset.attach === "photo") $("#attach-photo-input").click();
    if (b.dataset.attach === "file") $("#attach-file-input").click();
    if (b.dataset.attach === "voice") onVoice();
  });
  $("#attach-photo-input").addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPhoto(f); });
  $("#attach-file-input").addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); });
}

export function install(c) {
  ctx = c;
  window.__cbRenderCard = renderCard;
  wireAttach();
}
