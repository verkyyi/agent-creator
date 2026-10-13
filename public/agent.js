import { api, h, toast, ICON, icon, avatar, avatarKey, svgIcon, downscale, wireVoice, voiceCard, scrollToEnd, typingBubble, citeChip, sourcesToggle, store, splitReply, textInSequence, addReaction, markSeen } from "./common.js";
import { EN, fmt, pickedLang, baseLang, loadTable, applyDocLang, langPicker } from "./strings.js";

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get("id");
const chat = $("#chat"), input = $("#composer-input"), sendBtn = $("#send-btn");
let info = null, ended = false, voice = null, attached = null, poll = null, isCrew = false, rendered = 0, sending = 0;

/* ---------- language ---------- */
// "auto" follows the browser; anything else is the visitor's pick, sent with chat and voice.
let pick = store.get("lang") || "auto";
let lang = pickedLang(pick);
let T = build(EN);
function build(S) {
  const f = (k, names) => (...a) => fmt(S[k], Object.fromEntries(names.map((n, i) => [n, a[i]])));
  return {
    ...S,
    expired: f("expired", ["e", "c"]), revoked: f("revoked", ["o", "c"]), hi: f("hi", ["n", "h", "c"]), hiAnon: f("hiAnon", ["h", "c"]),
    helpsWith: f("helpsWith", ["j"]), worksUntil: f("worksUntil", ["e"]), answered: f("answered", ["o"]), savedTo: f("savedTo", ["c"]),
    logged: f("logged", ["o"]), walk: f("walk", ["o"]), relayAsk: f("relayAsk", ["o"]), updateFrom: f("updateFrom", ["c"]),
    sources: (n) => (n === 1 ? S.source1 : fmt(S.sourcesN, { n })),
    vo: { ...S.vo, turns: (n) => (n === 1 ? S.vo.turn1 : fmt(S.vo.turnsN, { n })) },
  };
}
const t = () => T;
const isEn = () => baseLang(lang) === "en";
async function setPick(v) {
  pick = v || "auto"; store.set("lang", pick); lang = pickedLang(pick);
  await applyLang();
}

$("#send-btn").innerHTML = ICON.send;
$("#mic-btn").innerHTML = ICON.mic;
$("#attach-btn").innerHTML = ICON.cam;
$("#attach-clear").innerHTML = ICON.x;
$("#ended-icon").innerHTML = ICON.power;

const picker = () => langPicker(pick, setPick, { label: t().language, auto: t().auto, other: t().other, otherPrompt: t().otherPrompt });
async function applyLang() {
  const want = lang;
  const table = await loadTable(want);
  if (want !== lang) return; // a newer pick won
  T = build(table);
  applyDocLang(lang);
  if (pick === "auto") delete document.documentElement.dataset.pick; else document.documentElement.dataset.pick = pick;
  const s = t();
  const slot = $("#lang-btn");
  slot.innerHTML = ICON.globe;
  slot.append(picker());
  input.placeholder = attached ? s.photoPh : s.ask;
  input.setAttribute("aria-label", s.ask);
  sendBtn.setAttribute("aria-label", s.send);
  const mic = $("#mic-btn"); if (!mic.classList.contains("live")) mic.setAttribute("aria-label", s.talk);
  $("#attach-preview span").textContent = s.photoAttached;
  $("#attach-clear").setAttribute("aria-label", s.removePhoto);
  const ab = $("#attach-btn");
  ab.setAttribute("aria-label", isCrew ? s.report : s.attach);
  if (isCrew) { ab.innerHTML = ICON.cam; ab.append(h("span", {}, s.report)); }
  $("#ended-title").textContent = s.endedTitle;
  if (info) renderHeader();
  renderStarters();
  const w = document.querySelector(".welcome"); if (w) { w.remove(); showWelcome(); }
}

function showScreen(title, text, { power = true } = {}) {
  ended = true;
  try { voice?.stop(); } catch {}
  clearInterval(poll);
  document.querySelector(".welcome")?.remove();
  $("#chat-main").hidden = true;
  $("#expiry-bar").hidden = true;
  $("#ended-title").textContent = title;
  $("#ended-text").textContent = text || "";
  $("#ended-icon").hidden = !power;
  $("#ended-screen").hidden = false;
}

function endHelper(st, reply) {
  if (ended) return;
  const owner = info?.ownerName || t().theOwner;
  const company = info?.tenantName || t().company;
  const text = !isEn() || !reply
    ? (st === "expired" ? t().expired(info?.endsLabel, company) : t().revoked(owner, company))
    : reply;
  showScreen(t().endedTitle, text);
  if (info) { $("#h-sub").textContent = `${info.tenantName || ""} · ${t().ended}`; }
}

function authLost() { showScreen(t().lostTitle, t().lost, { power: false }); }

const ENDED_STATES = ["expired", "revoked"];
async function loadPublic(first) {
  const r = await api(`api/agents/${encodeURIComponent(id)}/public`);
  if (r.status === 401) { authLost(); return false; }
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return false; }
  if (!r.ok) { if (first) showScreen(t().notFound, r.data.error || t().notFoundText, { power: false }); return false; }
  info = r.data;
  if (first) {
    isCrew = avatarKey(info.avatar) === "hardhat" || /crew|roof|brief/i.test(`${info.name} ${info.job} ${info.tone || ""}`);
    document.body.classList.toggle("crew", isCrew);
    if (isCrew) $("#composer").insertBefore($("#attach-btn"), $("#voice-state"));
    applyLang();
  }
  if (ENDED_STATES.includes(info.state)) { endHelper(info.state); return false; }
  return true;
}

/** The helper's avatar key; old sandboxes may hold an emoji or nothing, so fall back by audience. */
const avKey = () => avatarKey(info?.avatar) || (isCrew ? "hardhat" : "house");

function renderHeader() {
  document.title = `${info.name} · ${info.tenantName || "CrewBrain"}`;
  const hk = avKey();
  const hav = $("#h-avatar");
  hav.className = `avatar lg av-${hk}`; hav.dataset.avatar = hk; hav.innerHTML = svgIcon(hk);
  $("#h-name").textContent = info.name;
  $("#h-sub").textContent = [info.tenantName, info.job].filter(Boolean).join(" · ");
  $("#h-ends-text").textContent = `${t().ends} ${info.endsLabel || ""}`;
  $("#h-cando").textContent = info.canDo?.length ? t().canDo + ": " + info.canDo.map((c) => c.name.replace(/^[A-Z](?=[a-z])/, (x) => x.toLowerCase())).join(", ") : "";
  $("#expiry-bar").hidden = false;
}

/** User bubbles by their index in the server's history, so a reaction that lands later can find its bubble. */
const userEls = new Map();
function userBubble(text, img, reaction) {
  const el = h("div", { class: "msg out" }, img ? h("img", { class: "photo", src: img, alt: "" }) : null, text || "");
  if (reaction === "check") addReaction(el, t().reactDone);
  chat.append(el); scrollToEnd(chat); hideStarters(); return el;
}
/** Write actions that put a check reaction on the user's message (mirrors WRITE_ACTIONS in src/core.ts). */
const WRITE_ACTIONS = ["issue_logged", "walkthrough_requested", "relay_requested", "relay_sent", "owner_answer"];
async function helperMessage(m, { animate = false } = {}) {
  if (m.action?.kind === "owner_update") {
    // An owner-approved update from the company: a blue card instead of a plain bubble.
    chat.append(h("div", { class: "owner-update", "data-kind": "owner_update" },
      h("div", { class: "ou-head" }, icon("inbox"), t().updateFrom(info?.tenantName || t().company)),
      h("blockquote", {}, m.action.summary || m.text || "")));
    scrollToEnd(chat);
    return;
  }
  const refused = !!m.refused;
  // Like texting a person: a reply with several sentences arrives as 2-3 short bubbles.
  const parts = refused ? [m.reply ?? m.text ?? ""] : splitReply(m.reply ?? m.text ?? "");
  const make = (part, i) => {
    const b = h("div", { class: "msg in" + (refused ? " denied" : "") + (i > 0 ? " cont" : "") },
      refused && i === 0 ? h("div", { class: "who-line" }, icon("lock"), t().notShare) : null, part);
    chat.append(b); return b;
  };
  // History renders synchronously (no await on this path keeps message order intact).
  const els = animate && parts.length > 1 ? await textInSequence(chat, parts, make) : parts.map(make);
  const el = els[els.length - 1];
  // References fold into one quiet line under the LAST bubble; refused answers carry none.
  if (m.citations?.length && !refused) el.append(sourcesToggle(m.citations.map((c) => citeChip(c, id, { prefix: t().source, loading: t().loading })), t().sources(m.citations.length)));
  if (m.notice) el.append(h("div", { class: "notice" }, isEn() ? m.notice : t().aiDown));
  if (m.action?.kind === "owner_answer") {
    const owner = firstName(info?.ownerName) || t().theOwner;
    chat.append(h("div", { class: "owner-answer", "data-kind": "owner_answer" },
      h("div", { class: "oa-head" }, icon("check"), t().answered(owner)),
      h("blockquote", {}, `“${m.action.summary || ""}”`),
      h("div", { class: "oa-saved" }, t().savedTo(info?.tenantName || t().company))));
  } else if (m.action) {
    chat.append(h("div", { class: "action-chip", "data-kind": m.action.kind }, icon("check"), h("span", {}, actionText(m.action))));
  }
  scrollToEnd(chat);
}
function actionText(a) {
  const owner = info?.ownerName || "the owner";
  const k = a.kind;
  if (k === "owner_answer") return t().answered(firstName(owner) || owner) + " " + (a.summary || "");
  const label = k === "walkthrough_requested" ? t().walk(owner) : k === "relay_requested" ? t().relayAsk(firstName(owner) || owner) : k === "relay_sent" ? t().relaySent : t().logged(owner);
  return label + (a.summary || "");
}

/* ---------- voice: one card per session, never loose bubbles ---------- */
const voiceTexts = () => ({ ...t().vs, ...t().vo, helper: firstName(info?.name) || t().vo.title, source: t().source, loading: t().loading });
const cardOpts = () => ({ texts: voiceTexts, agentId: id, actionLabel: actionText });
/** Render chat messages, collapsing each run of via:"voice" turns (same session) into one voice card. */
function renderMessages(msgs, offset = 0) {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.via !== "voice") {
      if (m.role === "user") userEls.set(offset + i, userBubble(m.text, m.imageDataUrl, m.reaction));
      else helperMessage(m);
      continue;
    }
    const group = [m];
    while (i + 1 < msgs.length && msgs[i + 1].via === "voice" && (msgs[i + 1].sessionId || "") === (m.sessionId || "")) group.push(msgs[++i]);
    chat.append(voiceCard(voiceSummary(group), cardOpts()));
  }
  scrollToEnd(chat);
}
function voiceSummary(group) {
  const seen = new Set(), citations = [], actions = [];
  for (const g of group) {
    for (const c of g.citations || []) { const k = `${c.title}|${c.section || ""}`; if (!seen.has(k)) { seen.add(k); citations.push(c); } }
    if (g.action) actions.push(g.action);
  }
  const ts = (x) => (x ? Date.parse(x) || 0 : 0);
  const last = group[group.length - 1];
  return {
    sessionId: group[0].sessionId, citations, actions,
    startedAt: ts(group[0].startedAt) || ts(group[0].at),
    endedAt: ts(last.endedAt) || ts(last.at),
    turns: group.map((g) => ({ who: g.role === "user" ? "user" : "assistant", text: g.text })),
  };
}

/* ---------- welcome + starters ---------- */
const firstName = (n) => (n || "").split(/[ (·]/)[0];
let meName = "";
function showWelcome() {
  const s = t();
  const helper = firstName(info.name) || info.name;
  const company = info.tenantName || s.company;
  const close = () => { store.set(`cb.welcomed.${id}`, "1"); w.remove(); };
  const talkBtn = h("button", { class: "btn yellow big-btn", id: "welcome-talk", type: "button", onclick: () => { close(); voice?.start(); } }, icon("mic"), s.talk);
  const typeBtn = h("button", { class: "btn ghost-dark big-btn", id: "welcome-type", type: "button", onclick: () => { close(); input.focus(); } }, s.typeInstead);
  const langSw = h("label", { class: "lang-switch" }, icon("globe"), picker());
  const w = h("div", { class: "welcome", role: "dialog", "aria-modal": "true", "aria-labelledby": "welcome-hi", "data-testid": "welcome" },
    h("div", { class: "welcome-card" },
      langSw,
      avatar(avKey(), "xl"),
      h("h1", { id: "welcome-hi" }, meName ? s.hi(meName, helper, company) : s.hiAnon(helper, company)),
      info.job ? h("p", {}, s.helpsWith(info.job.replace(/[.\s]+$/, "").replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()))) : null,
      info.endsLabel ? h("p", { class: "welcome-ends" }, icon("lock"), s.worksUntil(info.endsLabel)) : null,
      h("div", { class: "welcome-btns" }, talkBtn, typeBtn)));
  document.body.append(w);
  talkBtn.focus();
}
let startersShown = false;
function renderStarters() {
  const el = $("#starters");
  if (!info || ended) { el.hidden = true; return; }
  el.innerHTML = "";
  for (const q of (isCrew ? t().crew : t().home)) {
    el.append(h("button", { class: "suggest-chip", type: "button", onclick: () => { if (!ended) send(q); } }, q));
  }
  el.hidden = !startersShown;
}
function hideStarters() { startersShown = false; $("#starters").hidden = true; }

function intro() {
  chat.append(h("div", { class: "chat-intro" },
    avatar(avKey(), "lg"),
    h("b", {}, info.name),
    h("span", {}, `${info.tenantName || ""}${info.job ? " · " + info.job : ""}`)));
}

async function loadHistory() {
  const r = await api(`api/agents/${encodeURIComponent(id)}/history`);
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return; }
  if (r.status === 401) { authLost(); return; }
  intro();
  const msgs = (r.ok && r.data.messages) || [];
  rendered = msgs.length;
  renderMessages(msgs);
  startersShown = !msgs.some((m) => m.role === "user");
  renderStarters();
  scrollToEnd(chat);
}

async function handleReply(data, opts) {
  if (data && data.error === "ended") { endHelper(data.state, data.reply); return; }
  await helperMessage(data || {}, opts);
}

async function pollHistory() {
  if (ended || sending || document.hidden) return;
  const r = await api(`api/agents/${encodeURIComponent(id)}/history`);
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return; }
  if (!r.ok || sending) return;
  const msgs = r.data.messages || [];
  // A reaction can land later (the owner answered the question): put it on the bubble already shown.
  for (const [i, el] of userEls) if (msgs[i]?.reaction === "check") addReaction(el, t().reactDone);
  if (msgs.length <= rendered) { rendered = Math.min(rendered, msgs.length); return; }
  // Voice turns from this device are summed up by the live voice card when the session ends.
  for (let i = rendered; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.via === "voice") continue;
    if (m.role === "user") userEls.set(i, userBubble(m.text, m.imageDataUrl, m.reaction));
    else helperMessage(m);
  }
  rendered = msgs.length;
}

async function send(text, img) {
  sending++;
  try { await sendInner(text, img); } finally { sending--; }
}
/* Pending bubble: typing dots, then (only if the answer takes over ~800 ms) a quick acknowledgement
   ("On it." or the server's status line), then "Found in" chips once retrieval is done. */
const ACK_AFTER_MS = 800;
function pendingBubble() {
  const status = h("span", { class: "pending-status", "data-testid": "ack" });
  const found = h("div", { class: "cites found", hidden: true });
  const el = h("div", { class: "msg in pending", "aria-live": "polite", "data-testid": "pending" },
    h("div", { class: "typing", "aria-label": "Thinking" }, h("i"), h("i"), h("i")), status, found);
  let last = "", acked = false;
  const show = () => { status.textContent = last || t().onIt; scrollToEnd(chat); };
  const timer = setTimeout(() => { acked = true; show(); }, ACK_AFTER_MS);
  return {
    el,
    status(s) { last = s ? (isEn() ? s : t().checking) : ""; if (acked) show(); },
    action() { last = t().onIt; if (acked) show(); },
    done() { clearTimeout(timer); },
    sources(cites) {
      if (!cites?.length) return;
      found.innerHTML = "";
      for (const c of cites.slice(0, 3)) found.append(citeChip(c, id, { prefix: t().foundIn, loading: t().loading }));
      found.hidden = false; scrollToEnd(chat);
    },
  };
}

/* POST …/chat?stream=1 and read the SSE stream. Resolves to the same { ok, status, data } shape as api().
   A JSON response (pwa.js offline outbox 202, 401 from the auth middleware) is passed through as-is.
   Returns null when nothing came back at all, so the caller can use the plain route. */
async function streamChat(body, pending, onFirst) {
  let res;
  try {
    res = await fetch(`api/agents/${encodeURIComponent(id)}/chat?stream=1`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body),
    });
  } catch { return null; }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream") || !res.body) {
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    return { ok: res.ok, status: res.status, data };
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", got = false, final = null;
  const handle = (block) => {
    let event = "message"; const lines = [];
    for (const l of block.split(/\r?\n/)) {
      if (l.startsWith("event:")) event = l.slice(6).trim();
      else if (l.startsWith("data:")) lines.push(l.slice(5).replace(/^ /, ""));
    }
    let data = {};
    try { data = lines.length ? JSON.parse(lines.join("\n")) : {}; } catch { return; }
    if (!got) onFirst?.();
    got = true;
    if (event === "status") pending.status(data.text);
    else if (event === "action") pending.action();
    else if (event === "sources") pending.sources(data.citations);
    else if (event === "reply") final = { ok: true, status: 200, data };
    else if (event === "error") final = { ok: false, status: data.error === "ended" ? 410 : data.error === "forbidden" ? 403 : data.error === "not_found" ? 404 : 500, data };
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i).replace(/^\r?\n\r?\n/, ""); }
    }
    if (buf.trim()) handle(buf);
  } catch { /* connection dropped mid-stream */ }
  if (final) return final;
  // The server saw the message (events arrived) but the reply never did: don't resend it.
  return got ? { ok: false, status: 0, data: { error: t().sendFail } } : null;
}

async function sendInner(text, img) {
  const u = userBubble(text, img);
  const pending = pendingBubble(); chat.append(pending.el); scrollToEnd(chat);
  const body = { text: text || (img ? t().herePhoto : "") };
  if (pick !== "auto") body.lang = pick;
  if (img) body.imageDataUrl = img;
  const seen = () => markSeen(u, t().seen);
  const r = (await streamChat(body, pending, seen)) || (await api(`api/agents/${encodeURIComponent(id)}/chat`, body));
  pending.done(); pending.el.remove();
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return; }
  if (r.status === 401) { authLost(); return; }
  if (!r.ok) { helperMessage({ reply: r.data.reply || r.data.error || t().sendFail, refused: !!r.data.reply }); return; }
  seen();
  userEls.set(rendered, u);
  rendered += 2;
  // A write action completed: a check reaction on the message that asked for it.
  if (r.data?.action && WRITE_ACTIONS.includes(r.data.action.kind)) addReaction(u, t().reactDone);
  await handleReply(r.data, { animate: true });
}

const syncSend = () => (sendBtn.disabled = !input.value.trim() && !attached);
input.addEventListener("input", syncSend);
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (ended) return;
  const text = input.value.trim();
  if (!text && !attached) return;
  const img = attached;
  input.value = ""; clearAttach();
  send(text, img);
});

function clearAttach() { attached = null; $("#attach-preview").hidden = true; input.placeholder = t().ask; syncSend(); }
$("#attach-clear").addEventListener("click", clearAttach);
$("#attach-btn").addEventListener("click", () => $("#attach-input").click());
$("#attach-input").addEventListener("change", async (e) => {
  const f = e.target.files?.[0]; e.target.value = "";
  if (!f) return;
  try { attached = await downscale(f); } catch { toast(t().photoFail, "err"); return; }
  $("#attach-img").src = attached; $("#attach-preview").hidden = false;
  if (!input.value) input.placeholder = t().photoPh;
  syncSend(); input.focus();
});

async function boot() {
  await applyLang();
  if (!id) { showScreen(t().notFound, t().missing, { power: false }); return; }
  const [ok, me] = await Promise.all([loadPublic(true), api("api/me")]);
  if (me.ok && me.data.member?.role !== "owner") meName = firstName(me.data.member?.name);
  if (!ok) return;
  await loadHistory();
  if (ended) return;
  voice = wireVoice({
    btn: $("#mic-btn"), stateEl: $("#voice-state"), mode: "agent", agentId: id, log: chat,
    texts: voiceTexts, voiceErr: t().voiceErr, actionLabel: actionText,
    // During voice nothing but an "ended" reply touches the chat; the rest lands in the voice card.
    onReply: (j) => { if (j && (j.error === "ended" || j.ended)) handleReply(j); },
    onEnd: () => hideStarters(),
  });
  if (!store.get(`cb.welcomed.${id}`)) showWelcome();
  poll = setInterval(() => { if (!ended) { loadPublic(false); pollHistory(); } }, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollHistory(); });
}
boot();
