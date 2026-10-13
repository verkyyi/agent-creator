import { api, h, toast, ICON, icon, downscale, lockChip, lockPicker, openSheet, closeSheet, shareSheet, wireVoice, scrollToEnd, typingBubble, originBadge, fmtDate, store } from "./common.js";
import { install as installCards, renderCard } from "./owner-cards.js";

const $ = (s) => document.querySelector(s);
const state = { me: null, helpers: [], brain: [], inbox: [] };

/* ---------- boot ---------- */
document.querySelectorAll("[data-icon]").forEach((el) => (el.outerHTML = ICON[el.dataset.icon]));
$("#send-btn").innerHTML = ICON.send;
$("#snap-btn").innerHTML = ICON.cam + "Teach from a photo";
$("#menu-btn").innerHTML = ICON.menu + '<span class="more-label">More</span><span class="badge" id="more-badge" hidden>0</span>';
$("#attach-owner-btn").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.5l-8.2 8.2a5.2 5.2 0 0 1-7.4-7.4l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a1.8 1.8 0 0 1-2.5-2.5l7.9-7.9"/></svg>';
$("#attach-photo-btn").innerHTML = ICON.cam + "Photo";
$("#attach-file-btn").innerHTML = ICON.doc + "File";
$("#attach-voice-btn").innerHTML = ICON.mic + "Voice note";
$("#back-chat").innerHTML = ICON.chat + "<span>Chat</span>";

async function boot() {
  const r = await api("api/me");
  if (r.status === 401) { location.replace("demo.html"); return; }
  if (!r.ok) { toast(r.data.error || "Couldn't load your account. Pull down or reload to try again.", "err"); return; }
  const { member, helpers } = r.data;
  if (member.role === "customer") {
    location.replace(helpers?.[0] ? `a.html?id=${encodeURIComponent(helpers[0].id)}` : "demo.html");
    return;
  }
  state.me = member; state.helpers = helpers || [];
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

function bubble(role, text) {
  const out = role === "owner" || role === "user";
  const el = h("div", { class: "msg " + (out ? "out" : "in") }, text);
  log.append(el); scrollToEnd(log); return el;
}

const SUGGESTIONS = [
  "Make a helper for the Patels about their install, until 30 days after handover",
  "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm",
  "What's new from my helpers?",
  "Show my helpers",
  "Remember the side gate code is now 5520, crew only",
  "What do we tell customers about cleaning panels?",
];
function suggestionChips() {
  return h("div", { class: "suggest", "data-testid": "suggestions" },
    h("div", { class: "suggest-label" }, "Try saying"),
    SUGGESTIONS.map((t) => h("button", { class: "suggest-chip", type: "button", onclick: () => {
      input.value = t; sendBtn.disabled = false;
      $("#composer").requestSubmit ? $("#composer").requestSubmit() : $("#composer").dispatchEvent(new Event("submit", { cancelable: true }));
    } }, t)));
}

async function loadCreator() {
  const r = await api("api/creator/log");
  log.innerHTML = "";
  log.append(h("div", { class: "chat-intro" },
    h("b", {}, "What do you need?"),
    h("span", {}, "Tap the yellow mic and say it like you'd tell your office manager. Make a helper, teach Crewbrain something, or ask what's new. Or tap one of these:"),
    suggestionChips()));
  if (!r.ok) return;
  for (const m of r.data.messages || []) {
    if (m.text) bubble(m.role, m.text);
    if (m.proposal) renderProposal(m.proposal);
    if (m.card) { try { renderCard(m.card); } catch {} }
  }
  scrollToEnd(log);
}

function handleCreatorReply(data) {
  if (data.reply) bubble("creator", data.reply);
  if (data.replyDraft) renderReplyDraft(data.replyDraft);
  if (data.proposal) renderProposal(data.proposal);
  if (data.card) { try { renderCard(data.card); } catch (e) { console.warn("card failed", e); } }
  if (data.agent) upsertHelper(data.agent);
  scrollToEnd(log);
}

async function sendCreator(text) {
  bubble("owner", text);
  const typing = typingBubble(); log.append(typing); scrollToEnd(log);
  const r = await api("api/creator/message", { text });
  typing.remove();
  if (!r.ok) { bubble("creator", r.data.reply || r.data.error || "That didn't go through. Check your signal and send it again."); return; }
  handleCreatorReply(r.data);
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim(); if (!text) return;
  input.value = ""; sendBtn.disabled = true;
  sendCreator(text);
});

wireVoice({
  btn: $("#mic-btn"), stateEl: $("#voice-state"), mode: "creator",
  texts: { connecting: "Getting ready…" },
  onTranscript: (text, who) => { if (who === "user" || who === "owner") bubble("owner", text); },
  onReply: (json) => handleCreatorReply(json || {}),
});

function upsertHelper(a) {
  const i = state.helpers.findIndex((x) => x.id === a.id);
  if (i >= 0) state.helpers[i] = { ...state.helpers[i], ...a }; else state.helpers.push(a);
}

/* ---------- reply draft (creator drafts an answer to an inbox item) ---------- */
function renderReplyDraft(d) {
  document.querySelectorAll("#reply-draft-text, #reply-send-btn").forEach((x) => x.removeAttribute("id"));
  const ta = h("textarea", { id: "reply-draft-text", rows: 4, "aria-label": `Reply to ${d.to}` }); ta.value = d.text || "";
  const sendB = h("button", { class: "btn yellow", id: "reply-send-btn", type: "button" }, "Send");
  const editB = h("button", { class: "btn ghost", type: "button", onclick: () => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, "Edit");
  const foot = h("div", { class: "rd-foot" }, editB, sendB);
  const card = h("div", { class: "reply-draft", "data-inbox": d.inboxId },
    h("div", { class: "rd-head" }, icon("answer"), h("b", {}, `Reply to ${d.to}`), d.via ? h("span", { class: "muted" }, ` (via ${d.via})`) : null),
    ta, foot);
  sendB.addEventListener("click", async () => {
    const text = ta.value.trim(); if (!text) { ta.focus(); return; }
    sendB.disabled = true; sendB.textContent = "Sending…";
    const r = await api(`api/inbox/${encodeURIComponent(d.inboxId)}/answer`, { text });
    if (!r.ok) { sendB.disabled = false; sendB.textContent = "Send"; toast(r.data.error || "Couldn't send. Try again.", "err"); return; }
    toast(`Sent to ${d.to}`);
    ta.readOnly = true; ta.removeAttribute("id"); sendB.removeAttribute("id");
    card.classList.add("sent");
    foot.replaceChildren(h("div", { class: "published" }, icon("check"), `Sent to ${d.to}`),
      ...(r.data.brainImproved ? [h("div", { class: "muted brain-improved", "data-testid": "brain-improved" }, "Brain improved: future questions like this will find your answer.")] : []));
    refreshInbox();
  });
  log.append(card); scrollToEnd(log);
}

/* ---------- approval card ---------- */
function acRow(k, v, cls = "") { return h("div", { class: "ac-row " + cls }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)); }
const list = (arr, fn, none = "Nothing") => (arr && arr.length ? h("ul", {}, arr.map((x) => h("li", {}, fn(x)))) : h("span", { class: "muted" }, none));

function renderProposal(p) {
  const helper = state.helpers.find((x) => x.id === p.agentId);
  const published = helper && helper.activeRev != null && helper.activeRev >= p.rev;
  const card = h("div", { class: "approval-card" + (published ? " done" : ""), "data-agent": p.agentId, "data-rev": p.rev });
  card.append(
    h("div", { class: "ac-head" },
      h("div", { class: "ac-helper" }, h("span", { class: "avatar light" }, p.avatar || "🏡"), h("div", { style: "min-width:0" }, h("h3", {}, p.name), p.job ? h("div", { class: "ac-job" }, p.job) : null)),
      published ? h("span", { class: "pill active" }, "Live") : h("span", { class: "pill awaiting" }, "Waiting for your OK")),
    ...(p.changes?.length ? [acRow("What changed", list(p.changes, (c) => c), "ac-changes")] : []),
    acRow("Who can use it", h("span", {}, h("b", {}, p.audience?.name || "Nobody yet"), p.audience ? ` · ${p.audience.count} ${p.audience.count === 1 ? "person" : "people"}` : "")),
    acRow("What it knows", list(p.knows, (k) => k.title)),
    acRow("What it can check", list(p.canCheck, (t) => t.name)),
    acRow("What it can do", list(p.canDo, (t) => t.name, "Only answer questions")),
    acRow("What it can't see", list(p.cantSee, (t) => [h("span", { class: "no-ico" }, icon("lock")), t]), "ac-cant"),
    acRow("Ends", h("span", { class: "ac-ends" }, p.endsLabel || p.endsAt)),
    acRow("Questions go to", p.escalation || "You"),
  );
  const foot = h("div", { class: "ac-foot" });
  card.append(foot);
  const showPublished = () => {
    foot.innerHTML = "";
    card.classList.add("done");
    foot.append(h("div", { class: "published" }, icon("check"), "Live. Links are ready to send."),
      h("button", { class: "btn ghost", type: "button", onclick: () => openLinks(p.agentId, p.name) }, ICON_SHARE(), "Send the links again"));
  };
  if (published) showPublished();
  else {
    document.querySelectorAll("#approve-btn").forEach((b) => b.removeAttribute("id"));
    const btn = h("button", { class: "btn yellow", id: "approve-btn", type: "button" }, "Approve and send links");
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Turning it on…";
      const r = await api(`api/agents/${encodeURIComponent(p.agentId)}/approve`, { rev: p.rev });
      if (!r.ok) { btn.disabled = false; btn.textContent = "Approve and send links"; toast(r.data.error || "Couldn't turn it on. Try again in a moment.", "err"); return; }
      if (r.data.agent) upsertHelper({ ...r.data.agent, job: jobHint(p) });
      btn.removeAttribute("id");
      showPublished();
      log.append(h("div", { class: "sys-note" }, `${p.name} is live until ${r.data.agent?.endsLabel || p.endsLabel}`));
      scrollToEnd(log);
      if (r.data.links?.length) renderCard({ type: "share", agent: { ...(r.data.agent || {}), name: r.data.agent?.name || p.name, job: jobHint(p) }, links: r.data.links });
      shareSheet(r.data.links || [], { title: `Send ${p.name}`, helperName: r.data.agent?.name || p.name, endsLabel: r.data.agent?.endsLabel || p.endsLabel, job: jobHint(p) });
    });
    foot.append(h("p", { class: "ac-note" }, "Nothing goes live until you tap this."), btn);
  }
  log.append(card);
  scrollToEnd(log);
}
/** Job text for the share message; source titles often carry the site ("42 Oak St"). */
const jobHint = (p) => [p.job, ...(p.knows || []).map((k) => k.title)].filter(Boolean).join(" · ");
const ICON_SHARE = () => h("span", { html: ICON.share, style: "display:inline-flex" });

async function openLinks(id, name) {
  const r = await api(`api/agents/${encodeURIComponent(id)}/links`);
  if (!r.ok) { toast(r.data.error || "Couldn't load the links. Try again.", "err"); return; }
  const a = state.helpers.find((x) => x.id === id) || {};
  shareSheet(r.data.links || [], { title: `Send ${name}`, helperName: a.name || name, endsLabel: a.endsLabel || "", job: a.job || "" });
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
  if (!r.ok) { toast(r.data.error || "Couldn't load your Brain. Try again in a moment.", "err"); return; }
  state.brain = r.data.items || [];
  renderBrain(flashId);
}
function renderBrain(flashId) {
  const el = $("#brain-list"); el.innerHTML = "";
  if (!state.brain.length) { el.append(h("div", { class: "empty" }, "Nothing here yet. Snap a photo of a warranty card or site note to teach Crewbrain.")); return; }
  for (const it of state.brain) {
    const row = h("button", { class: "brain-item" + (it.id === flashId ? " flash" : ""), type: "button", "data-id": it.id, onclick: () => relabel(it) },
      h("span", { class: "t" }, it.title),
      h("span", { class: "chev", "aria-hidden": "true" }, "›"),
      h("span", { class: "meta" }, lockChip(it.sharing, it.lockLabel), originBadge(it.origin), it.updatedAt ? h("span", {}, "Updated " + fmtDate(it.updatedAt)) : null),
      it.note ? h("span", { class: "note" }, it.note) : null);
    el.append(row);
  }
}

function relabel(it) {
  const picker = lockPicker(it.sharing);
  const save = h("button", { class: "btn block", id: "relabel-save-btn", type: "button" }, "Save who can see this");
  save.addEventListener("click", async () => {
    save.disabled = true;
    const r = await api(`api/brain/${encodeURIComponent(it.id)}/label`, { sharing: picker.value });
    if (!r.ok) { save.disabled = false; toast(r.data.error || "Couldn't change who can see this. Try again.", "err"); return; }
    closeSheet(); toast(`Now visible to: ${r.data.item?.lockLabel || "updated"}`);
    loadBrain(it.id);
  });
  openSheet(it.title, h("div", { class: "stack" },
    h("div", { class: "row-btns", style: "align-items:center" }, originBadge(it.origin), h("span", { class: "muted" }, `Version ${it.version}` + (it.updatedAt ? ` · Updated ${fmtDate(it.updatedAt)}` : "")), lockChip(it.sharing, it.lockLabel)),
    it.note ? h("p", { class: "muted" }, it.note) : null,
    h("div", { class: "field" }, h("div", { class: "label" }, "Who can see this"), picker.el),
    save), { testid: "relabel-sheet" });
}

$("#snap-btn").addEventListener("click", () => $("#photo-input").click());
$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; e.target.value = "";
  if (!file) return;
  let dataUrl;
  try { dataUrl = await downscale(file); } catch { toast("Couldn't open that photo. Try taking it again.", "err"); return; }
  const body = h("div", { class: "stack" }, h("img", { class: "photo-big", src: dataUrl, alt: "Your photo" }),
    h("div", { class: "reading" }, h("div", { class: "spinner" }), "Reading your photo…"));
  openSheet("Teach from a photo", body, { testid: "capture-sheet" });
  const r = await api("api/brain/capture", { imageDataUrl: dataUrl });
  if (!r.ok) { closeSheet(); toast(r.data.error || "Couldn't read that photo. Try again with better light.", "err"); return; }
  showDraft(r.data.draft, dataUrl);
});

function showDraft(d, dataUrl) {
  const title = h("input", { id: "draft-title", type: "text", value: d.title || "" });
  const text = h("textarea", { id: "draft-text" }); text.value = d.text || "";
  const picker = lockPicker(d.suggestedSharing || "internal");
  const approve = h("button", { class: "btn yellow block", id: "draft-approve-btn", type: "button" }, "Save to my Brain");
  approve.addEventListener("click", async () => {
    approve.disabled = true; approve.textContent = "Saving…";
    const r = await api(`api/brain/drafts/${encodeURIComponent(d.id)}/approve`, { title: title.value.trim(), text: text.value, sharing: picker.value });
    if (!r.ok) { approve.disabled = false; approve.textContent = "Save to my Brain"; toast(r.data.error || "Couldn't save. Try again.", "err"); return; }
    closeSheet(); toast(`Added: ${r.data.item?.title || "new knowledge"}`);
    if (location.hash !== "#brain") location.hash = "brain";
    loadBrain(r.data.item?.id);
  });
  openSheet("Check what I read", h("div", { class: "stack" },
    h("img", { class: "photo-big", src: dataUrl, alt: "Your photo", style: "max-height:160px" }),
    h("p", { class: "muted" }, "Check it and fix anything I got wrong. Helpers can't use it until you save it."),
    h("div", { class: "field" }, h("label", { class: "label", for: "draft-title" }, "Title"), title),
    h("div", { class: "field" }, h("label", { class: "label", for: "draft-text" }, "What it says"), text),
    h("div", { class: "field" }, h("div", { class: "label" }, "Who can see this"), picker.el),
    approve), { testid: "draft-sheet" });
}

/* ---------- Helpers ---------- */
async function loadHelpers() {
  const r = await api("api/agents");
  if (r.ok) state.helpers = r.data.agents || [];
  renderHelpers();
}
const PILL = {
  active: ["active", "Live"], awaiting_approval: ["awaiting", "Waiting for your OK"], draft: ["awaiting", "Waiting for your OK"],
  expired: ["ended", "Ended"], revoked: ["ended", "Ended"],
};
function renderHelpers() {
  const el = $("#helper-list"); el.innerHTML = "";
  if (!state.helpers.length) {
    el.append(h("div", { class: "empty" }, icon("helpers", "empty-ico"), h("p", {}, "No helpers yet. Go back to ", h("a", { href: "#create" }, "the chat"), " and say who needs one.")));
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
    h("div", { class: "hc-top" }, h("span", { class: "avatar lg light" }, a.avatar || "🤖"),
      h("div", { style: "min-width:0" }, h("div", { class: "hc-name" }, a.name), h("div", { class: "hc-aud" }, `For ${a.audienceName || "nobody yet"} · ${a.audienceCount ?? 0} ${a.audienceCount === 1 ? "person" : "people"}`)),
      h("span", { class: "pill " + pc }, pt)),
    h("div", { class: "hc-ends" + (ended ? " ended" : "") }, icon("lock"), (ended ? "Ended " : "Shuts off ") + (a.endsLabel || "")),
    actions);
  actions.append(
    h("button", { class: "btn small ghost share-links-btn", type: "button", disabled: ended || a.state !== "active", onclick: () => openLinks(a.id, a.name) }, ICON_SHARE(), "Send links"),
    h("a", { class: "btn small ghost open-chat-btn", href: `a.html?id=${encodeURIComponent(a.id)}` }, h("span", { html: ICON.chat, style: "display:inline-flex" }), "Try it"));
  if (!ended) {
    const closeBtn = h("button", { class: "btn small ghost close-job-btn", type: "button" }, h("span", { html: ICON.power, style: "display:inline-flex" }), "Close this job");
    closeBtn.addEventListener("click", () => {
      closeBtn.hidden = true;
      const confirmBtn = h("button", { class: "btn small danger confirm-close-btn", type: "button" }, "Yes, close it");
      const cancel = h("button", { class: "btn small ghost", type: "button", onclick: () => { row.remove(); closeBtn.hidden = false; } }, "Cancel");
      const row = h("div", { class: "confirm-row" },
        h("p", {}, h("b", {}, `Close ${a.name}?`), " Every link stops working right now. Anything you shared just for this job goes back to Office only."),
        h("div", { class: "row-btns" }, cancel, confirmBtn));
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true; confirmBtn.textContent = "Closing…";
        const r = await api(`api/agents/${encodeURIComponent(a.id)}/close`, {});
        if (!r.ok) { confirmBtn.disabled = false; confirmBtn.textContent = "Yes, close it"; toast(r.data.error || "Couldn't close it. Try again.", "err"); return; }
        upsertHelper(r.data.agent);
        toast(`${a.name} is off. The links no longer work.`);
        card.replaceWith(helperCard({ ...a, ...r.data.agent }));
      });
      actions.append(row);
    });
    actions.append(closeBtn);
  }
  return card;
}

/* ---------- Inbox ---------- */
const KIND_ICON = { question: "question", issue: "issue", walkthrough: "video" };
const KIND_LABEL = { question: "Question", issue: "Problem reported", walkthrough: "Wants a walkthrough" };
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
    it.imageDataUrl ? h("img", { class: "thumb", src: it.imageDataUrl, alt: "Photo" }) : h("span"),
    h("span", { class: "via" }, `${KIND_LABEL[it.kind] || it.kind} · via ${it.agentName}${it.status !== "open" ? " · " + (it.status === "answered" ? "Answered" : "Dismissed") : ""}`),
    h("span", { class: "txt" }, it.text));
}
function renderInbox() {
  const el = $("#inbox-list"); el.innerHTML = "";
  const open = state.inbox.filter((i) => i.status === "open");
  const done = state.inbox.filter((i) => i.status !== "open");
  if (!open.length) el.append(h("div", { class: "empty" }, icon("check", "empty-ico"), h("p", {}, h("b", {}, "All caught up."), " Nothing is waiting on you.")));
  else el.append(h("div", { class: "shelf" }, open.map(inboxRow)));
  if (done.length) el.append(h("div", { class: "label section-label" }, "Done"), h("div", { class: "shelf" }, done.map(inboxRow)));
  refreshInbox();
}
function openInbox(it) {
  const parts = [
    h("div", { class: "label" }, `${KIND_LABEL[it.kind] || it.kind} · ${it.from} via ${it.agentName}`),
    h("div", { class: "quote" }, it.text),
    it.imageDataUrl ? h("img", { class: "photo-big", src: it.imageDataUrl, alt: "Photo from " + it.from }) : null,
  ];
  if (it.status === "open") {
    const ans = h("textarea", { id: "answer-input", placeholder: it.kind === "question" ? "Type your answer. The helper will know it next time too." : "Type a reply or a note…" });
    const helper = state.helpers.find((x) => x.id === it.agentId);
    const picker = lockPicker(helper?.templateId === "crew_briefing" ? "crew" : "customer");
    const answerBtn = h("button", { class: "btn yellow block", id: "answer-btn", type: "button" }, "Send answer");
    const dismissBtn = h("button", { class: "btn ghost block", id: "dismiss-btn", type: "button" }, "Dismiss, no answer needed");
    answerBtn.addEventListener("click", async () => {
      const text = ans.value.trim(); if (!text) { ans.focus(); return; }
      answerBtn.disabled = true; answerBtn.textContent = "Saving…";
      const r = await api(`api/inbox/${encodeURIComponent(it.id)}/answer`, { text, sharing: picker.value });
      if (!r.ok) { answerBtn.disabled = false; answerBtn.textContent = "Send answer"; toast(r.data.error || "Couldn't send your answer. Try again.", "err"); return; }
      closeSheet();
      toast(r.data.knowledge ? `Sent. Also saved to your Brain: ${r.data.knowledge.title}` : "Answer sent.");
      if (r.data.brainImproved) log.append(h("div", { class: "sys-note brain-improved", "data-testid": "brain-improved" }, "Brain improved: future questions like this will find your answer."));
      await refreshInbox(); renderInbox();
    });
    dismissBtn.addEventListener("click", async () => {
      dismissBtn.disabled = true;
      const r = await api(`api/inbox/${encodeURIComponent(it.id)}/dismiss`, {});
      if (!r.ok) { dismissBtn.disabled = false; toast(r.data.error || "Couldn't dismiss it. Try again.", "err"); return; }
      closeSheet(); await refreshInbox(); renderInbox();
    });
    parts.push(h("div", { class: "field" }, h("label", { class: "label", for: "answer-input" }, "Your answer"), ans),
      h("div", { class: "field" }, h("div", { class: "label" }, "Who can see this answer"), picker.el),
      answerBtn, dismissBtn);
  } else parts.push(h("p", { class: "muted" }, it.status === "answered" ? "You already answered this." : "You dismissed this."));
  openSheet(KIND_LABEL[it.kind] || "Inbox", h("div", { class: "stack" }, parts), { testid: "inbox-sheet" });
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
    if (!r.ok) { toast(r.data.error || "The demo clock is turned off on this server.", "err"); return; }
    $("#clock-now").textContent = "Now: " + new Date(r.data.now).toLocaleString();
    toast(body.reset ? "Clock reset." : "Skipped ahead 1 day.");
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
const SLIDES = [
  { art: "brain", title: "Your company brain", text: "Everything you know about your jobs, in one place. Every page has a lock, so you decide who can see it: just the office, your crew, or the homeowner." },
  { art: "talk", title: "Say who needs help", text: "Tap the mic and talk like you'd tell your office manager: who it's for, what job, and until when. Crewbrain asks if anything is missing." },
  { art: "approve", title: "You approve, they get a link", text: "Nothing goes live without your OK. Each person gets their own link, and it shuts off by itself when the job ends." },
];
function showOnboarding() {
  document.querySelector(".onboard")?.remove();
  let i = 0;
  const finish = () => { store.set("cb.onboarded.owner", "1"); ov.classList.add("out"); setTimeout(() => ov.remove(), 200); location.hash = "create"; log.scrollTo({ top: 0 }); };
  const art = h("div", { class: "ob-art", "aria-hidden": "true" });
  const title = h("h2", { id: "ob-title" });
  const text = h("p", { class: "ob-text" });
  const dots = h("div", { class: "ob-dots", "aria-hidden": "true" }, SLIDES.map(() => h("i")));
  const next = h("button", { class: "btn yellow ob-next", id: "ob-next", type: "button" });
  const skip = h("button", { class: "ob-skip", id: "ob-skip", type: "button", onclick: finish }, "Skip");
  const step = h("div", { class: "ob-step label" });
  const body = h("div", { class: "ob-body" }, art, step, title, text);
  const render = () => {
    const sl = SLIDES[i];
    art.innerHTML = ART[sl.art]; title.textContent = sl.title; text.textContent = sl.text;
    step.textContent = `${i + 1} of ${SLIDES.length}`;
    next.textContent = i === SLIDES.length - 1 ? "Start" : "Next";
    [...dots.children].forEach((d, j) => d.classList.toggle("on", j === i));
    body.classList.remove("in"); void body.offsetWidth; body.classList.add("in");
  };
  next.addEventListener("click", () => { if (i < SLIDES.length - 1) { i++; render(); } else finish(); });
  const ov = h("div", { class: "onboard", role: "dialog", "aria-modal": "true", "aria-labelledby": "ob-title", "data-testid": "onboarding" },
    h("div", { class: "ob-top" }, h("span", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), "Crewbrain"), skip),
    body, h("div", { class: "ob-foot" }, dots, next));
  document.body.append(ov);
  render();
  next.focus();
}

installCards({ sendCreator, log, state, upsertHelper, openLinks, PILL });

boot();
