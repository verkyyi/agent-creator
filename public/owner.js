import { api, h, toast, ICON, icon, avatar, helperAvatar, downscale, lockChip, lockPicker, openSheet, closeSheet, shareSheet, wireVoice, scrollToEnd, typingBubble, originBadge, fmtDate, store, splitReply, textInSequence, addReaction, markSeen } from "./common.js";
import { install as installCards, renderCard, renderCardInto, relayCard } from "./owner-cards.js";
import { pickedLang, applyDocLang, langPicker, loadTable, setOwnerStrings, ot, fmtWhen, baseLang } from "./strings.js";

const $ = (s) => document.querySelector(s);
const state = { me: null, helpers: [], brain: [], inbox: [] };

/* ---------- language: Auto follows the browser; a pick is sent with creator messages and voice ---------- */
let langPick = store.get("lang") || "auto";
function applyOwnerLang() {
  applyDocLang(pickedLang(langPick));
  if (langPick === "auto") delete document.documentElement.dataset.pick; else document.documentElement.dataset.pick = langPick;
}
applyOwnerLang();
{
  const row = document.createElement("label");
  row.className = "menu-lang"; row.innerHTML = ICON.globe;
  // A new pick reloads: every screen, card and date re-renders from the new table.
  row.id = "menu-lang";
  document.querySelector("#menu-pop .menu-sep")?.after(row);
}
/** The language sent with creator messages: an explicit pick, or Auto when it resolves to a non-English browser. */
const creatorLang = () => (langPick !== "auto" ? langPick : baseLang(pickedLang("auto")) !== "en" ? pickedLang("auto") : null);
function mountLangPicker(tbl) {
  const row = $("#menu-lang"); if (!row) return;
  row.querySelector("select")?.remove();
  row.append(langPicker(langPick, (v) => { langPick = v || "auto"; store.set("lang", langPick); applyOwnerLang();
    // Fetch (and cache) the new table first, so the reload comes up in the new language.
    row.querySelector("select").disabled = true; document.body.style.cursor = "progress";
    loadTable(pickedLang(langPick)).catch(() => null).finally(() => location.reload()); },
    { label: tbl.language, auto: tbl.auto, other: tbl.other, otherPrompt: tbl.otherPrompt }));
}
/** Static text in index.html carries data-i18n / data-i18n-ph / data-i18n-aria keys into the owner table. */
function applyStatic() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = ot(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => el.setAttribute("placeholder", ot(el.dataset.i18nPh)));
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", ot(el.dataset.i18nAria)));
  $("#snap-btn").innerHTML = ICON.cam + esc(ot("brainTab.snap"));
  $("#menu-btn").innerHTML = ICON.menu + `<span class="more-label">${esc(ot("menu.more"))}</span><span class="badge" id="more-badge" hidden>0</span>`;
  $("#attach-photo-btn").innerHTML = ICON.cam + esc(ot("create.photo"));
  $("#attach-file-btn").innerHTML = ICON.doc + esc(ot("create.file"));
  $("#attach-voice-btn").innerHTML = ICON.mic + esc(ot("create.voiceNote"));
  $("#back-chat").innerHTML = ICON.chat + `<span>${esc(ot("menu.backChat"))}</span>`;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- boot ---------- */
document.querySelectorAll("[data-icon]").forEach((el) => (el.outerHTML = ICON[el.dataset.icon]));
$("#send-btn").innerHTML = ICON.send;
$("#attach-owner-btn").innerHTML = ICON.attach;
applyStatic();

async function boot() {
  const lang = pickedLang(langPick);
  // A table not cached yet may take a while to translate: don't hold the screen for it (English meanwhile;
  // the fetch finishes in the background and is cached for the next load).
  const slow = new Promise((res) => setTimeout(() => res(null), 4000));
  const [tbl, r] = await Promise.all([Promise.race([loadTable(lang).catch(() => null), slow]), api("api/me")]);
  if (tbl) { setOwnerStrings(tbl, baseLang(lang) === "en" ? "en" : lang); applyStatic(); }
  mountLangPicker(tbl || {});
  if (r.status === 401) { location.replace("demo.html"); return; }
  if (!r.ok) { toast(r.data.error || ot("toast.loadAccount"), "err"); return; }
  const { member, helpers } = r.data;
  if (member.role === "customer") {
    location.replace(helpers?.[0] ? `a.html?id=${encodeURIComponent(helpers[0].id)}` : "demo.html");
    return;
  }
  state.me = member; state.tz = member.timeZone; state.helpers = helpers || [];
  $("#tenant-name").textContent = member.tenantName || "";
  $("#member-name").textContent = member.name || "";
  route();
  loadCreator();
  if (!store.get("cb.onboarded.owner")) showOnboarding();
  refreshInbox();
  setInterval(refreshInbox, 8000);
}

/* ---------- routing ---------- */
const TABS = ["create", "brain", "helpers", "inbox"];
function route() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "create";
  for (const t of TABS) {
    $(`#view-${t}`).hidden = t !== tab;
    $(`#tab-${t}`).setAttribute("aria-current", t === tab ? "page" : "false");
  }
  document.body.classList.toggle("on-chat", tab === "create");
  $("#back-chat").hidden = tab === "create";
  const mp = $("#menu-pop"); if (mp && !mp.hidden) { mp.hidden = true; $("#menu-btn").setAttribute("aria-expanded", "false"); }
  closeSheet();
  if (tab === "brain") showBrainTab();
  if (tab === "helpers") loadHelpers();
  if (tab === "inbox") renderInbox();
  if (tab === "create") scrollToEnd($("#creator-log"));
}
window.addEventListener("hashchange", route);
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab; if (b.dataset.tab === location.hash.slice(1)) route(); }));
$("#back-chat").addEventListener("click", () => { location.hash = "create"; });

/* ---------- Create: chat with the creator ---------- */
const log = $("#creator-log");
const input = $("#composer-input");
const sendBtn = $("#send-btn");
input.addEventListener("input", () => (sendBtn.disabled = !input.value.trim()));
/* Cards cap themselves at 2/3 of the chat scroller (see --card-max in app.css). */
const setChatH = () => { if (log.clientHeight) document.documentElement.style.setProperty("--chat-h", log.clientHeight + "px"); };
if (window.ResizeObserver) new ResizeObserver(setChatH).observe(log);
setChatH();

function bubble(role, text, reaction) {
  const out = role === "owner" || role === "user";
  const el = h("div", { class: "msg " + (out ? "out" : "in") }, text);
  if (out && reaction === "check") addReaction(el, ot("common.reactDone"));
  log.append(el); scrollToEnd(log); return el;
}
/** CrewBrain's reply as 2-3 short consecutive bubbles, like a text thread; typing pauses between when animated. */
async function creatorBubbles(text, animate = false) {
  const parts = splitReply(text);
  const make = (part, i) => { const el = bubble("creator", part); if (i > 0) el.classList.add("cont"); return el; };
  // No await on the history path keeps message and card order intact.
  if (animate && parts.length > 1) await textInSequence(log, parts, make);
  else parts.forEach(make);
}
/** The owner's latest bubble before `node` (or the latest overall): it gets the check when an action completes. */
function ownerBubbleBefore(node) {
  const outs = [...log.querySelectorAll(":scope > .msg.out")];
  const prior = node?.isConnected ? outs.filter((el) => el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) : outs;
  return prior[prior.length - 1];
}
const reactOwner = (node) => addReaction(ownerBubbleBefore(node), ot("common.reactDone"));

const SUGGESTIONS = () => ot("create.suggestions");
function suggestionChips() {
  return h("div", { class: "suggest", "data-testid": "suggestions" },
    h("div", { class: "suggest-label" }, ot("create.trySaying")),
    SUGGESTIONS().map((t) => h("button", { class: "suggest-chip", type: "button", onclick: () => {
      input.value = t; sendBtn.disabled = false;
      $("#composer").requestSubmit ? $("#composer").requestSubmit() : $("#composer").dispatchEvent(new Event("submit", { cancelable: true }));
    } }, t)));
}

async function loadCreator() {
  const r = await api("api/creator/log");
  log.innerHTML = "";
  log.append(h("div", { class: "chat-intro" },
    h("b", {}, ot("create.title")),
    h("span", {}, ot("create.intro")),
    suggestionChips()));
  if (!r.ok) return;
  for (const m of r.data.messages || []) {
    if (m.text) { if (m.role === "owner") bubble(m.role, m.text, m.reaction); else creatorBubbles(m.text); }
    if (m.proposal) renderProposal(m.proposal);
    if (m.card) { try { renderCard(m.card); } catch {} }
  }
  scrollToEnd(log);
}

async function handleCreatorReply(data, { animate = false } = {}) {
  if (data.reply) { if (animate) await creatorBubbles(data.reply, true); else creatorBubbles(data.reply); }
  if (data.replyDraft) renderReplyDraft(data.replyDraft);
  if (data.proposal) renderProposal(data.proposal);
  if (data.card) { try { renderCard(data.card); } catch (e) { console.warn("card failed", e); } }
  if (data.agent) upsertHelper(data.agent);
  scrollToEnd(log);
}

const ACK_AFTER_MS = 800;
async function sendCreator(text) {
  const mine = bubble("owner", text);
  const typing = typingBubble(); log.append(typing); scrollToEnd(log);
  // Slow work gets a quick "On it." first; answers under ~800 ms never show it.
  let ack = null;
  const ackTimer = setTimeout(() => {
    ack = h("div", { class: "msg in ack", "data-testid": "ack" }, ot("common.onIt"));
    typing.before(ack); scrollToEnd(log);
  }, ACK_AFTER_MS);
  const r = await api("api/creator/message", creatorLang() ? { text, lang: creatorLang() } : { text });
  clearTimeout(ackTimer); ack?.remove();
  typing.remove();
  if (!r.ok) { bubble("creator", r.data.reply || r.data.error || ot("toast.sendFail")); return; }
  markSeen(mine, ot("common.seen"));
  await handleCreatorReply(r.data, { animate: true });
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim(); if (!text) return;
  input.value = ""; sendBtn.disabled = true;
  if (input.dataset.ph != null) { input.setAttribute("placeholder", input.dataset.ph); delete input.dataset.ph; }
  sendCreator(text);
});

/* Voice: a full-screen overlay; no bubbles while it's live. Cards that need a tap open as a sheet
   inside the overlay, and the same card node moves into the chat (after the voice card) at the end. */
const TAP_CARDS = ["confirm", "relays", "knowledge_draft"];
const voiceTapNodes = new Map();
function voiceTapCard(j) {
  if (!j.proposal && !j.replyDraft && !TAP_CARDS.includes(j.card?.type)) return null;
  const box = h("div", { class: "vo-cards" });
  try {
    if (j.replyDraft) renderReplyDraft(j.replyDraft, box);
    if (j.proposal) renderProposal(j.proposal, box);
    if (TAP_CARDS.includes(j.card?.type)) renderCardInto(j.card, box);
  } catch (e) { console.warn("voice card failed", e); }
  if (!box.childElementCount) return null;
  voiceTapNodes.set(j, box);
  return box;
}
function voiceResults(j) {
  const actions = [];
  if (j.proposal) actions.push(ot("voice.helperReady", { n: j.proposal.name }));
  if (j.replyDraft) actions.push(ot("voice.replyDrafted", { to: j.replyDraft.to }));
  if (j.card?.type === "share") actions.push(ot("voice.linksReady", { n: j.card.agent?.name || ot("voice.yourHelper") }));
  if (j.card?.type === "relays") actions.push(ot("voice.updatesWaiting", { n: (j.card.items || []).length }));
  if (j.card?.type === "knowledge_draft") actions.push(ot("voice.knowledgeDrafted"));
  if (j.card?.type === "confirm") actions.push(j.card.title || ot("voice.needsConfirm"));
  return { actions };
}
wireVoice({
  btn: $("#mic-btn"), stateEl: $("#voice-state"), mode: "creator", log,
  get texts() { return { connecting: ot("voice.connecting"), helper: "CrewBrain" }; },
  onReply: (json) => { if (json?.agent) upsertHelper(json.agent); },
  summarize: voiceResults,
  tapCard: voiceTapCard,
  onEnd: (summary) => {
    for (const j of summary.replies || []) {
      const node = voiceTapNodes.get(j);
      if (node) { voiceTapNodes.delete(j); log.append(...node.childNodes); if (j.card && !TAP_CARDS.includes(j.card.type)) { try { renderCard(j.card); } catch {} } continue; }
      if (j.replyDraft) renderReplyDraft(j.replyDraft);
      if (j.proposal) renderProposal(j.proposal);
      if (j.card) { try { renderCard(j.card); } catch (e) { console.warn("card failed", e); } }
    }
    scrollToEnd(log);
  },
});

function upsertHelper(a) {
  const i = state.helpers.findIndex((x) => x.id === a.id);
  if (i >= 0) state.helpers[i] = { ...state.helpers[i], ...a }; else state.helpers.push(a);
}

/* ---------- reply draft (creator drafts an answer to an inbox item) ---------- */
function renderReplyDraft(d, target = log) {
  document.querySelectorAll("#reply-draft-text, #reply-send-btn").forEach((x) => x.removeAttribute("id"));
  const ta = h("textarea", { id: "reply-draft-text", rows: 4, "aria-label": ot("reply.to", { to: d.to }) }); ta.value = d.text || "";
  const sendB = h("button", { class: "btn yellow", id: "reply-send-btn", type: "button" }, ot("reply.send"));
  const editB = h("button", { class: "btn ghost", type: "button", onclick: () => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, ot("reply.edit"));
  const foot = h("div", { class: "rd-foot" }, editB, sendB);
  const card = h("div", { class: "reply-draft", "data-inbox": d.inboxId },
    h("div", { class: "rd-head" }, icon("answer"), h("b", {}, ot("reply.to", { to: d.to })), d.via ? h("span", { class: "muted" }, " " + ot("reply.via", { via: d.via })) : null),
    ta, foot);
  sendB.addEventListener("click", async () => {
    const text = ta.value.trim(); if (!text) { ta.focus(); return; }
    sendB.disabled = true; sendB.textContent = ot("reply.sending");
    const r = await api(`api/inbox/${encodeURIComponent(d.inboxId)}/answer`, { text });
    if (!r.ok) { sendB.disabled = false; sendB.textContent = ot("reply.send"); toast(r.data.error || ot("toast.sendRetry"), "err"); return; }
    toast(ot("reply.sentTo", { to: d.to }));
    ta.readOnly = true; ta.removeAttribute("id"); sendB.removeAttribute("id");
    card.classList.add("sent");
    reactOwner(card);
    foot.replaceChildren(h("div", { class: "published" }, icon("check"), ot("reply.sentTo", { to: d.to })),
      ...(r.data.brainImproved ? [h("div", { class: "muted brain-improved", "data-testid": "brain-improved" }, ot("reply.brainImproved"))] : []));
    refreshInbox();
  });
  target.append(card); scrollToEnd(log);
}

/* ---------- approval card ----------
   Compact by default: header, one-line summary, three pills that expand one list inline, ends line, buttons.
   An edit (p.changes) shows only what changed. */
const HELPER_KIND = { crew_briefing: "crewBriefing", homeowner_helper: "homeownerHelper" };
const kindLabel = (p) => ot("ac." + (HELPER_KIND[p.templateId] || (helperAvatar(p) === "hardhat" ? "crewBriefing" : "homeownerHelper")));
const people = (n) => ot(n === 1 ? "ac.person1" : "ac.peopleN", { n });
let acSeq = 0;
const CHANGE_HINT = () => ot("ac.changeHint");

function acPills(p) {
  const id = `ac-${++acSeq}`;
  const ul = (items) => h("ul", { class: "ac-list" }, items.map((x) => h("li", {}, x)));
  const tools = [...(p.canCheck || []), ...(p.canDo || [])].map((t) => t.name);
  const lists = [
    { key: "knows", ico: "brain", label: ot("ac.knows"), n: (p.knows || []).length,
      body: () => (p.knows || []).length ? ul(p.knows.map((k) => k.title)) : h("p", { class: "muted" }, ot("ac.nothingYet")) },
    { key: "can", ico: "check", label: ot("ac.canDo"), n: tools.length,
      body: () => [tools.length ? ul(tools) : h("p", { class: "muted" }, ot("ac.onlyAnswer")),
        h("p", { class: "ac-esc" }, icon("question"), h("span", {}, ot("ac.questionsTo", { o: p.escalation || ot("ac.you") })))] },
    { key: "cant", ico: "lock", label: ot("ac.cantSee"), n: (p.cantSee || []).length,
      body: () => (p.cantSee || []).length ? h("ul", { class: "ac-list ac-cant" }, p.cantSee.map((t) => h("li", {}, icon("lock"), h("span", {}, t)))) : h("p", { class: "muted" }, ot("ac.nothingHeld")) },
  ];
  const panel = h("div", { class: "ac-panel", id: id + "-panel", role: "region", hidden: true });
  const btns = lists.map((l) => h("button", { class: "ac-pill", type: "button", "data-list": l.key, "aria-expanded": "false", "aria-controls": id + "-panel" },
    icon(l.ico), h("span", {}, `${l.label} ${l.n}`)));
  btns.forEach((b, i) => b.addEventListener("click", () => {
    const open = b.getAttribute("aria-expanded") !== "true";
    btns.forEach((x) => x.setAttribute("aria-expanded", "false"));
    panel.replaceChildren();
    panel.hidden = !open;
    if (open) { b.setAttribute("aria-expanded", "true"); panel.setAttribute("aria-label", lists[i].label); panel.append(...[lists[i].body()].flat()); }
  }));
  return [h("div", { class: "ac-pills", role: "group", "aria-label": ot("ac.details") }, btns), panel];
}

function askForChange() {
  const ph = input.getAttribute("placeholder");
  if (!input.dataset.ph) input.dataset.ph = ph || "";
  input.setAttribute("placeholder", CHANGE_HINT());
  const restore = () => { input.removeEventListener("blur", onBlur); if (input.dataset.ph == null) return; input.setAttribute("placeholder", input.dataset.ph); delete input.dataset.ph; };
  const onBlur = () => { if (!input.value.trim()) restore(); };
  input.addEventListener("blur", onBlur);
  input.focus();
}

function renderProposal(p, target = log) {
  const helper = state.helpers.find((x) => x.id === p.agentId);
  const published = helper && helper.activeRev != null && helper.activeRev >= p.rev;
  const card = h("div", { class: "approval-card" + (published ? " done" : "") + (p.changes?.length ? " is-edit" : ""), "data-agent": p.agentId, "data-rev": p.rev });
  const aud = p.audience;
  const summary = (p.summary || p.job || "").trim();
  const head = h("div", { class: "ac-head" },
    avatar(helperAvatar(p)),
    h("div", { class: "ac-title" },
      h("h3", {}, h("span", { class: "ac-name" }, p.name), h("span", { class: "ac-kind" }, ` · ${kindLabel(p)}`)),
      h("div", { class: "ac-aud" }, aud ? `${aud.name} · ${people(aud.count)}` : ot("ac.nobodyYet"))),
    published ? h("span", { class: "pill active" }, ot("ac.live")) : null);
  const body = h("div", { class: "ac-body" });
  if (p.changes?.length) {
    body.append(h("div", { class: "ac-k" }, ot("ac.whatChanged")), h("ul", { class: "ac-list ac-changes" }, p.changes.map((c) => h("li", {}, c))));
  } else {
    if (summary) body.append(h("p", { class: "ac-summary" }, summary));
    body.append(...acPills(p),
      h("p", { class: "ac-ends" }, icon("clock"), h("span", {}, ot("ac.ends", { e: fmtWhen(p.endsAt, p.timeZone || state.tz, p.endsLabel) || p.endsLabel || "" }))));
  }
  const foot = h("div", { class: "ac-foot" });
  card.append(head, body, foot);
  const showPublished = () => {
    foot.innerHTML = "";
    card.classList.add("done");
    foot.append(h("div", { class: "published" }, icon("check"), ot("ac.liveReady")),
      h("button", { class: "btn ghost small", type: "button", onclick: () => openLinks(p.agentId, p.name) }, ICON_SHARE(), ot("ac.sendAgain")));
  };
  if (published) showPublished();
  else {
    document.querySelectorAll("#approve-btn").forEach((b) => b.removeAttribute("id"));
    const btn = h("button", { class: "btn yellow", id: "approve-btn", type: "button" }, ot("ac.approve"));
    const change = h("button", { class: "ac-change", type: "button", onclick: askForChange }, ot("ac.change"));
    btn.addEventListener("click", async () => {
      btn.disabled = true; change.disabled = true; btn.textContent = ot("ac.turningOn");
      const r = await api(`api/agents/${encodeURIComponent(p.agentId)}/approve`, { rev: p.rev });
      if (!r.ok) { btn.disabled = false; change.disabled = false; btn.textContent = ot("ac.approve"); toast(r.data.error || ot("toast.turnOnFail"), "err"); return; }
      if (r.data.agent) upsertHelper({ ...r.data.agent, job: jobHint(p) });
      btn.removeAttribute("id");
      showPublished();
      reactOwner(card);
      log.append(h("div", { class: "sys-note" }, ot("ac.liveUntil", { n: p.name, e: fmtWhen(r.data.agent?.expiresAt || p.endsAt, r.data.agent?.timeZone || p.timeZone || state.tz, r.data.agent?.endsLabel || p.endsLabel) })));
      scrollToEnd(log);
      if (r.data.links?.length) renderCard({ type: "share", agent: { ...(r.data.agent || {}), name: r.data.agent?.name || p.name, job: jobHint(p) }, links: r.data.links });
      shareSheet(r.data.links || [], { title: ot("ac.sendName", { n: p.name }), helperName: r.data.agent?.name || p.name, endsLabel: r.data.agent?.endsLabel || p.endsLabel, job: jobHint(p) });
    });
    foot.append(btn, change);
  }
  target.append(card);
  scrollToEnd(log);
}
/** Job text for the share message; source titles often carry the site ("42 Oak St"). */
const jobHint = (p) => [p.job, ...(p.knows || []).map((k) => k.title)].filter(Boolean).join(" · ");
const ICON_SHARE = () => h("span", { html: ICON.share, style: "display:inline-flex" });

async function openLinks(id, name) {
  const r = await api(`api/agents/${encodeURIComponent(id)}/links`);
  if (!r.ok) { toast(r.data.error || ot("toast.linksFail"), "err"); return; }
  const a = state.helpers.find((x) => x.id === id) || {};
  shareSheet(r.data.links || [], { title: ot("ac.sendName", { n: name }), helperName: a.name || name, endsLabel: a.endsLabel || "", job: a.job || "" });
}

/* ---------- Brain ---------- */
async function showBrainTab() {
  const container = $("#view-brain");
  const m = await import("./brain.js").catch(() => null);
  if (m?.renderBrain) {
    try { return await m.renderBrain(container, { api, toast, sheet: openSheet, openSheet, closeSheet, h, icon, ICON, lockChip, lockPicker, originBadge, fmtDate, downscale }); }
    catch (e) { console.warn("brain.js failed, using built-in Brain", e); }
  }
  return loadBrain();
}

async function loadBrain(flashId) {
  const r = await api("api/brain");
  if (!r.ok) { toast(r.data.error || ot("toast.brainFail"), "err"); return; }
  state.brain = r.data.items || [];
  renderBrain(flashId);
}
function renderBrain(flashId) {
  const el = $("#brain-list"); el.innerHTML = "";
  if (!state.brain.length) { el.append(h("div", { class: "empty" }, ot("brainTab.empty"))); return; }
  for (const it of state.brain) {
    const row = h("button", { class: "brain-item" + (it.id === flashId ? " flash" : ""), type: "button", "data-id": it.id, onclick: () => relabel(it) },
      h("span", { class: "t" }, it.title),
      h("span", { class: "chev", "aria-hidden": "true", html: ICON.chevron }),
      h("span", { class: "meta" }, lockChip(it.sharing, it.lockLabel), originBadge(it.origin), it.updatedAt ? h("span", {}, ot("brainTab.updated", { d: fmtDate(it.updatedAt) })) : null),
      it.note ? h("span", { class: "note" }, it.note) : null);
    el.append(row);
  }
}

function relabel(it) {
  const picker = lockPicker(it.sharing);
  const save = h("button", { class: "btn block", id: "relabel-save-btn", type: "button" }, ot("brainTab.saveWho"));
  save.addEventListener("click", async () => {
    save.disabled = true;
    const r = await api(`api/brain/${encodeURIComponent(it.id)}/label`, { sharing: picker.value });
    if (!r.ok) { save.disabled = false; toast(r.data.error || ot("toast.relabelFail"), "err"); return; }
    closeSheet(); toast(ot("brainTab.nowVisible", { l: r.data.item?.lockLabel || ot("brainTab.updatedWord") }));
    loadBrain(it.id);
  });
  openSheet(it.title, h("div", { class: "stack" },
    h("div", { class: "row-btns", style: "align-items:center" }, originBadge(it.origin), h("span", { class: "muted" }, ot("brainTab.version", { v: it.version }) + (it.updatedAt ? " · " + ot("brainTab.updated", { d: fmtDate(it.updatedAt) }) : "")), lockChip(it.sharing, it.lockLabel)),
    it.note ? h("p", { class: "muted" }, it.note) : null,
    h("div", { class: "field" }, h("div", { class: "label" }, ot("brainTab.whoSee")), picker.el),
    save), { testid: "relabel-sheet" });
}

$("#snap-btn").addEventListener("click", () => $("#photo-input").click());
$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; e.target.value = "";
  if (!file) return;
  let dataUrl;
  try { dataUrl = await downscale(file); } catch { toast(ot("toast.photoOpen"), "err"); return; }
  const body = h("div", { class: "stack" }, h("img", { class: "photo-big", src: dataUrl, alt: ot("brainTab.yourPhoto") }),
    h("div", { class: "reading" }, h("div", { class: "spinner" }), ot("brainTab.reading")));
  openSheet(ot("brainTab.snap"), body, { testid: "capture-sheet" });
  const r = await api("api/brain/capture", { imageDataUrl: dataUrl });
  if (!r.ok) { closeSheet(); toast(r.data.error || ot("toast.photoRead"), "err"); return; }
  showDraft(r.data.draft, dataUrl);
});

function showDraft(d, dataUrl) {
  const title = h("input", { id: "draft-title", type: "text", value: d.title || "" });
  const text = h("textarea", { id: "draft-text" }); text.value = d.text || "";
  const picker = lockPicker(d.suggestedSharing || "internal");
  const approve = h("button", { class: "btn yellow block", id: "draft-approve-btn", type: "button" }, ot("brainTab.saveBrain"));
  approve.addEventListener("click", async () => {
    approve.disabled = true; approve.textContent = ot("brainTab.saving");
    const r = await api(`api/brain/drafts/${encodeURIComponent(d.id)}/approve`, { title: title.value.trim(), text: text.value, sharing: picker.value });
    if (!r.ok) { approve.disabled = false; approve.textContent = ot("brainTab.saveBrain"); toast(r.data.error || ot("toast.saveFail"), "err"); return; }
    closeSheet(); toast(ot("brainTab.added", { t: r.data.item?.title || ot("brainTab.newKnowledge") }));
    if (location.hash !== "#brain") location.hash = "brain";
    loadBrain(r.data.item?.id);
  });
  openSheet(ot("brainTab.checkTitle"), h("div", { class: "stack" },
    h("img", { class: "photo-big", src: dataUrl, alt: ot("brainTab.yourPhoto"), style: "max-height:160px" }),
    h("p", { class: "muted" }, ot("brainTab.checkText")),
    h("div", { class: "field" }, h("label", { class: "label", for: "draft-title" }, ot("brainTab.title")), title),
    h("div", { class: "field" }, h("label", { class: "label", for: "draft-text" }, ot("brainTab.whatItSays")), text),
    h("div", { class: "field" }, h("div", { class: "label" }, ot("brainTab.whoSee")), picker.el),
    approve), { testid: "draft-sheet" });
}

/* ---------- Helpers ---------- */
async function loadHelpers() {
  const r = await api("api/agents");
  if (r.ok) state.helpers = r.data.agents || [];
  renderHelpers();
}
const PILL_KEY = { active: ["active", "live"], awaiting_approval: ["awaiting", "waiting"], draft: ["awaiting", "waiting"], expired: ["ended", "ended"], revoked: ["ended", "ended"] };
/** Pill class + label per state; labels read the owner table at use time. */
const PILL = new Proxy({}, { get: (_, k) => (PILL_KEY[k] ? [PILL_KEY[k][0], ot("pill." + PILL_KEY[k][1])] : undefined) });
function renderHelpers() {
  const el = $("#helper-list"); el.innerHTML = "";
  if (!state.helpers.length) {
    el.append(h("div", { class: "empty" }, icon("helpers", "empty-ico"), h("p", {}, ot("hc.emptyA"), h("a", { href: "#create" }, ot("hc.emptyLink")), ot("hc.emptyB"))));
    return;
  }
  for (const a of state.helpers) el.append(helperCard(a));
}
function helperCard(a) {
  const [pc, pt] = PILL[a.state] || ["awaiting", a.state];
  const ended = a.state === "expired" || a.state === "revoked";
  const card = h("article", { class: "helper-card" + (ended ? " ended" : ""), "data-id": a.id, "data-state": a.state });
  const actions = h("div", { class: "hc-actions" });
  card.append(
    h("div", { class: "hc-top" }, avatar(helperAvatar(a), "lg"),
      h("div", { style: "min-width:0" }, h("div", { class: "hc-name" }, a.name), h("div", { class: "hc-aud" }, ot("hc.for", { a: a.audienceName || ot("hc.nobodyYet") }) + " · " + people(a.audienceCount ?? 0))),
      h("span", { class: "pill " + pc }, pt)),
    h("div", { class: "hc-ends" + (ended ? " ended" : "") }, icon("lock"), ot(ended ? "hc.ended" : "hc.shutsOff", { e: fmtWhen(a.expiresAt, a.timeZone || state.tz, a.endsLabel) || "" })),
    actions);
  actions.append(
    h("button", { class: "btn small ghost share-links-btn", type: "button", disabled: ended || a.state !== "active", onclick: () => openLinks(a.id, a.name) }, ICON_SHARE(), ot("hc.sendLinks")),
    h("a", { class: "btn small ghost open-chat-btn", href: `a.html?id=${encodeURIComponent(a.id)}` }, h("span", { html: ICON.chat, style: "display:inline-flex" }), ot("hc.tryIt")));
  if (!ended) {
    const closeBtn = h("button", { class: "btn small ghost close-job-btn", type: "button" }, h("span", { html: ICON.power, style: "display:inline-flex" }), ot("hc.close"));
    closeBtn.addEventListener("click", () => {
      closeBtn.hidden = true;
      const confirmBtn = h("button", { class: "btn small danger confirm-close-btn", type: "button" }, ot("hc.yesClose"));
      const cancel = h("button", { class: "btn small ghost", type: "button", onclick: () => { row.remove(); closeBtn.hidden = false; } }, ot("hc.cancel"));
      const row = h("div", { class: "confirm-row" },
        h("p", {}, h("b", {}, ot("hc.closeQ", { n: a.name })), " " + ot("hc.closeText")),
        h("div", { class: "row-btns" }, cancel, confirmBtn));
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true; confirmBtn.textContent = ot("hc.closing");
        const r = await api(`api/agents/${encodeURIComponent(a.id)}/close`, {});
        if (!r.ok) { confirmBtn.disabled = false; confirmBtn.textContent = ot("hc.yesClose"); toast(r.data.error || ot("toast.closeFail"), "err"); return; }
        upsertHelper(r.data.agent);
        toast(ot("hc.isOff", { n: a.name }));
        card.replaceWith(helperCard({ ...a, ...r.data.agent }));
      });
      actions.append(row);
    });
    actions.append(closeBtn);
  }
  return card;
}

/* ---------- Inbox ---------- */
const KIND_ICON = { question: "question", issue: "issue", walkthrough: "video", relay: "share" };
const KIND_LABEL = new Proxy({}, { get: (_, k) => (["question", "issue", "walkthrough", "relay"].includes(k) ? ot("inbox.kind." + k) : undefined) });
async function refreshInbox() {
  const r = await api("api/inbox");
  if (!r.ok) return;
  const before = JSON.stringify(state.inbox.map((i) => [i.id, i.status]));
  state.inbox = r.data.items || [];
  const open = state.inbox.filter((i) => i.status === "open").length;
  const badge = $("#inbox-badge"); badge.textContent = String(open); badge.hidden = !open;
  const mb = $("#more-badge"); if (mb) { mb.textContent = String(open); mb.hidden = !open; }
  if (!$("#view-inbox").hidden && before !== JSON.stringify(state.inbox.map((i) => [i.id, i.status])) && !document.querySelector(".sheet")) renderInbox();
}
function inboxRow(it) {
  return h("button", { class: `inbox-item k-${it.kind}` + (it.status !== "open" ? " closed" : ""), type: "button", "data-id": it.id, "data-status": it.status, onclick: () => openInbox(it) },
    h("span", { class: "ico", "aria-hidden": "true", html: ICON[KIND_ICON[it.kind] || "question"] }),
    h("span", { class: "from" }, it.from),
    it.imageDataUrl ? h("img", { class: "thumb", src: it.imageDataUrl, alt: ot("inbox.photo") }) : h("span"),
    h("span", { class: "via" }, `${KIND_LABEL[it.kind] || it.kind} · ${ot("inbox.via", { a: it.agentName })}${it.status !== "open" ? " · " + ot(it.status === "answered" ? "inbox.answered" : "inbox.dismissed") : ""}`),
    h("span", { class: "txt" }, it.text));
}
function renderInbox() {
  const el = $("#inbox-list"); el.innerHTML = "";
  const open = state.inbox.filter((i) => i.status === "open");
  const done = state.inbox.filter((i) => i.status !== "open");
  if (!open.length) el.append(h("div", { class: "empty" }, icon("check", "empty-ico"), h("p", {}, h("b", {}, ot("inbox.caughtUp")), " " + ot("inbox.nothingWaiting"))));
  else el.append(h("div", { class: "shelf" }, open.map(inboxRow)));
  if (done.length) el.append(h("div", { class: "label section-label" }, ot("inbox.done")), h("div", { class: "shelf" }, done.map(inboxRow)));
  refreshInbox();
}
function openInbox(it) {
  if (it.kind === "relay") {
    const done = async () => { await refreshInbox(); renderInbox(); };
    openSheet(KIND_LABEL.relay, h("div", { class: "stack" }, relayCard(it, { onDone: done })), { testid: "inbox-sheet" });
    return;
  }
  const parts = [
    h("div", { class: "label" }, `${KIND_LABEL[it.kind] || it.kind} · ${ot("inbox.fromVia", { f: it.from, a: it.agentName })}`),
    h("div", { class: "quote" }, it.text),
    it.imageDataUrl ? h("img", { class: "photo-big", src: it.imageDataUrl, alt: ot("inbox.photoFrom", { f: it.from }) }) : null,
  ];
  if (it.status === "open") {
    const ans = h("textarea", { id: "answer-input", placeholder: ot(it.kind === "question" ? "inbox.answerPh" : "inbox.replyPh") });
    const helper = state.helpers.find((x) => x.id === it.agentId);
    const picker = lockPicker(helper?.templateId === "crew_briefing" ? "crew" : "customer");
    const answerBtn = h("button", { class: "btn yellow block", id: "answer-btn", type: "button" }, ot("inbox.sendAnswer"));
    const dismissBtn = h("button", { class: "btn ghost block", id: "dismiss-btn", type: "button" }, ot("inbox.dismiss"));
    answerBtn.addEventListener("click", async () => {
      const text = ans.value.trim(); if (!text) { ans.focus(); return; }
      answerBtn.disabled = true; answerBtn.textContent = ot("brainTab.saving");
      const r = await api(`api/inbox/${encodeURIComponent(it.id)}/answer`, { text, sharing: picker.value });
      if (!r.ok) { answerBtn.disabled = false; answerBtn.textContent = ot("inbox.sendAnswer"); toast(r.data.error || ot("toast.answerFail"), "err"); return; }
      closeSheet();
      toast(r.data.knowledge ? ot("inbox.sentSaved", { t: r.data.knowledge.title }) : ot("inbox.answerSent"));
      if (r.data.brainImproved) log.append(h("div", { class: "sys-note brain-improved", "data-testid": "brain-improved" }, ot("reply.brainImproved")));
      await refreshInbox(); renderInbox();
    });
    dismissBtn.addEventListener("click", async () => {
      dismissBtn.disabled = true;
      const r = await api(`api/inbox/${encodeURIComponent(it.id)}/dismiss`, {});
      if (!r.ok) { dismissBtn.disabled = false; toast(r.data.error || ot("toast.dismissFail"), "err"); return; }
      closeSheet(); await refreshInbox(); renderInbox();
    });
    parts.push(h("div", { class: "field" }, h("label", { class: "label", for: "answer-input" }, ot("inbox.yourAnswer")), ans),
      h("div", { class: "field" }, h("div", { class: "label" }, ot("inbox.whoSeeAnswer")), picker.el),
      answerBtn, dismissBtn);
  } else parts.push(h("p", { class: "muted" }, ot(it.status === "answered" ? "inbox.alreadyAnswered" : "inbox.youDismissed")));
  openSheet(KIND_LABEL[it.kind] || ot("menu.inbox"), h("div", { class: "stack" }, parts), { testid: "inbox-sheet" });
}

/* ---------- demo clock: long-press the brand ---------- */
(() => {
  const brand = $("#brand"), pop = $("#clock-pop");
  let t;
  const start = () => { clearTimeout(t); t = setTimeout(() => { pop.hidden = !pop.hidden; }, 650); };
  const cancel = () => clearTimeout(t);
  brand.addEventListener("pointerdown", start);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => brand.addEventListener(ev, cancel));
  brand.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== brand && !brand.contains(e.target)) pop.hidden = true; });
  const clock = async (body) => {
    const r = await api("api/clock", body);
    if (!r.ok) { toast(r.data.error || ot("clock.off"), "err"); return; }
    $("#clock-now").textContent = ot("clock.now", { t: fmtWhen(r.data.now, state.tz, new Date(r.data.now).toLocaleString()) });
    toast(ot(body.reset ? "clock.wasReset" : "clock.skipped"));
    loadHelpers();
  };
  $("#clock-advance").addEventListener("click", () => clock({ advanceMinutes: 1440 }));
  $("#clock-reset").addEventListener("click", () => clock({ reset: true }));
})();

/* ---------- header menu ---------- */
(() => {
  const btn = $("#menu-btn"), pop = $("#menu-pop");
  const set = (open) => { pop.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(pop.hidden); });
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) set(false); });
  $("#how-btn").addEventListener("click", () => { set(false); showOnboarding(); });
})();

/* ---------- onboarding: 3 full-screen cards ---------- */
const ART = {
  brain: `<svg viewBox="0 0 160 140" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <rect x="22" y="18" width="78" height="100" rx="6" fill="var(--sheet)" stroke="var(--ink)" stroke-width="4"/>
    <rect x="40" y="10" width="78" height="100" rx="6" fill="var(--sheet)" stroke="var(--ink)" stroke-width="4"/>
    <path d="M54 34h50M54 48h50M54 62h34" stroke="var(--muted)" stroke-width="4"/>
    <rect x="92" y="74" width="46" height="40" rx="6" fill="var(--tag)" stroke="var(--ink)" stroke-width="4"/>
    <path d="M102 74v-10a13 13 0 0 1 26 0v10" stroke="var(--ink)" stroke-width="4"/>
    <circle cx="115" cy="92" r="5" fill="var(--ink)"/><path d="M115 96v8" stroke="var(--ink)" stroke-width="4"/></svg>`,
  talk: `<svg viewBox="0 0 160 140" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="62" cy="76" r="44" fill="var(--tag)" stroke="var(--ink)" stroke-width="4"/>
    <rect x="50" y="46" width="24" height="40" rx="12" fill="var(--sheet)" stroke="var(--ink)" stroke-width="4"/>
    <path d="M40 76a22 22 0 0 0 44 0M62 98v10" stroke="var(--ink)" stroke-width="4"/>
    <path d="M100 20h48v30h-26l-12 10V50h-10z" fill="var(--sheet)" stroke="var(--ink)" stroke-width="4"/>
    <path d="M112 32h24M112 40h14" stroke="var(--chalk)" stroke-width="4"/></svg>`,
  approve: `<svg viewBox="0 0 160 140" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="16" y="14" width="80" height="110" rx="8" fill="var(--sheet)" stroke="var(--ink)" stroke-width="4"/>
    <path d="M30 36h52M30 52h52M30 68h36" stroke="var(--muted)" stroke-width="4"/>
    <rect x="28" y="88" width="56" height="22" rx="5" fill="var(--tag)" stroke="var(--ink)" stroke-width="4"/>
    <path d="M47 99l6 6 11-12" stroke="var(--ink)" stroke-width="4"/>
    <path d="M104 64h22a12 12 0 0 1 0 24h-8M124 88h-22a12 12 0 0 1 0-24h8" stroke="var(--chalk)" stroke-width="5"/>
    <circle cx="132" cy="112" r="16" fill="var(--sheet)" stroke="var(--deny)" stroke-width="4"/>
    <path d="M132 103v9M126 106a9 9 0 1 0 12 0" stroke="var(--deny)" stroke-width="3.5"/></svg>`,
};
const SLIDES = [{ art: "brain", k: "s1" }, { art: "talk", k: "s2" }, { art: "approve", k: "s3" }];
function showOnboarding() {
  document.querySelector(".onboard")?.remove();
  let i = 0;
  const finish = () => { store.set("cb.onboarded.owner", "1"); ov.classList.add("out"); setTimeout(() => ov.remove(), 200); location.hash = "create"; log.scrollTo({ top: 0 }); };
  const art = h("div", { class: "ob-art", "aria-hidden": "true" });
  const title = h("h2", { id: "ob-title" });
  const text = h("p", { class: "ob-text" });
  const dots = h("div", { class: "ob-dots", "aria-hidden": "true" }, SLIDES.map(() => h("i")));
  const next = h("button", { class: "btn yellow ob-next", id: "ob-next", type: "button" });
  const skip = h("button", { class: "ob-skip", id: "ob-skip", type: "button", onclick: finish }, ot("ob.skip"));
  const step = h("div", { class: "ob-step label" });
  const body = h("div", { class: "ob-body" }, art, step, title, text);
  const render = () => {
    const sl = SLIDES[i];
    art.innerHTML = ART[sl.art]; title.textContent = ot(`ob.${sl.k}Title`); text.textContent = ot(`ob.${sl.k}Text`);
    step.textContent = ot("ob.step", { i: i + 1, n: SLIDES.length });
    next.textContent = ot(i === SLIDES.length - 1 ? "ob.start" : "ob.next");
    [...dots.children].forEach((d, j) => d.classList.toggle("on", j === i));
    body.classList.remove("in"); void body.offsetWidth; body.classList.add("in");
  };
  next.addEventListener("click", () => { if (i < SLIDES.length - 1) { i++; render(); } else finish(); });
  const ov = h("div", { class: "onboard", role: "dialog", "aria-modal": "true", "aria-labelledby": "ob-title", "data-testid": "onboarding" },
    h("div", { class: "ob-top" }, h("span", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), "CrewBrain"), skip),
    body, h("div", { class: "ob-foot" }, dots, next));
  document.body.append(ov);
  render();
  next.focus();
}

installCards({ sendCreator, log, state, upsertHelper, openLinks, PILL, refreshInbox });

boot();
