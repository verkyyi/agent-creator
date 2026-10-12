import { api, h, toast, ICON, downscale, lockChip, lockPicker, openSheet, closeSheet, shareSheet, wireVoice, scrollToEnd, typingBubble } from "./common.js";

const $ = (s) => document.querySelector(s);
const state = { me: null, helpers: [], brain: [], inbox: [] };

/* ---------- boot ---------- */
document.querySelectorAll("[data-icon]").forEach((el) => (el.outerHTML = ICON[el.dataset.icon]));
$("#send-btn").innerHTML = ICON.send;
$("#snap-btn").innerHTML = ICON.cam + "Snap to teach";

async function boot() {
  const r = await api("api/me");
  if (r.status === 401) { location.replace("demo.html"); return; }
  if (!r.ok) { toast(r.data.error || "Couldn't load your account.", "err"); return; }
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
  refreshInbox();
  setInterval(refreshInbox, 8000);
}

/* ---------- routing ---------- */
const TABS = ["create", "brain", "helpers", "inbox"];
function route() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "create";
  for (const t of TABS) {
    $(`#view-${t}`).hidden = t !== tab;
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === tab));
  }
  closeSheet();
  if (tab === "brain") loadBrain();
  if (tab === "helpers") loadHelpers();
  if (tab === "inbox") renderInbox();
  if (tab === "create") scrollToEnd($("#creator-log"));
}
window.addEventListener("hashchange", route);
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab; }));

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

async function loadCreator() {
  const r = await api("api/creator/log");
  log.innerHTML = "";
  log.append(h("div", { class: "chat-intro" },
    h("span", { class: "tag" }, h("span", { class: "hole" }), "Creator"),
    h("b", {}, "Who needs a helper?"),
    h("span", {}, "Say it like you'd tell your office manager. “Make a helper for the Patels at 42 Oak St until Friday.”")));
  if (!r.ok) return;
  for (const m of r.data.messages || []) {
    if (m.text) bubble(m.role, m.text);
    if (m.proposal) renderProposal(m.proposal);
  }
  scrollToEnd(log);
}

function handleCreatorReply(data) {
  if (data.reply) bubble("creator", data.reply);
  if (data.proposal) renderProposal(data.proposal);
  if (data.agent) upsertHelper(data.agent);
  scrollToEnd(log);
}

async function sendCreator(text) {
  bubble("owner", text);
  const typing = typingBubble(); log.append(typing); scrollToEnd(log);
  const r = await api("api/creator/message", { text });
  typing.remove();
  if (!r.ok) { bubble("creator", r.data.reply || r.data.error || "Something went wrong. Try again."); return; }
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
  onTranscript: (text, who) => { if (who === "user" || who === "owner") bubble("owner", text); },
  onReply: (json) => handleCreatorReply(json || {}),
});

function upsertHelper(a) {
  const i = state.helpers.findIndex((x) => x.id === a.id);
  if (i >= 0) state.helpers[i] = { ...state.helpers[i], ...a }; else state.helpers.push(a);
}

/* ---------- approval card ---------- */
function acRow(k, v, cls = "") { return h("div", { class: "ac-row " + cls }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)); }
const list = (arr, fn) => (arr && arr.length ? h("ul", {}, arr.map((x) => h("li", {}, fn(x)))) : h("span", { class: "muted" }, "—"));

function renderProposal(p) {
  const helper = state.helpers.find((x) => x.id === p.agentId);
  const published = helper && helper.activeRev != null && helper.activeRev >= p.rev;
  const card = h("div", { class: "approval-card" + (published ? " done" : ""), "data-agent": p.agentId, "data-rev": p.rev });
  card.append(
    h("div", { class: "ac-head" }, h("h3", {}, p.changes?.length ? "Changes to approve" : "Ready to publish"),
      published ? h("span", { class: "lock home" }, "Live") : h("span", { class: "tag" }, h("span", { class: "hole" }), "Needs your OK")),
    acRow("Helper", h("div", { class: "ac-helper" }, h("span", { class: "avatar sm light" }, p.avatar || "🤖"), p.name)),
    acRow("Who", h("span", {}, h("b", {}, p.audience?.name || "—"), p.audience ? ` · ${p.audience.count} ${p.audience.count === 1 ? "person" : "people"}` : "")),
    acRow("Job", p.job || "—"),
    acRow("Knows", list(p.knows, (k) => [k.title, " ", h("span", { class: "ver" }, `v${k.version}`)])),
    acRow("Can check", list(p.canCheck, (t) => t.name)),
    acRow("Can do", list(p.canDo, (t) => t.name)),
    acRow("Can't see", list(p.cantSee, (t) => [h("span", { class: "chip-no" }, "NO"), t])),
    acRow("Ends", h("span", { class: "ac-ends" }, p.endsLabel || p.endsAt)),
    acRow("Questions go to", p.escalation || "—"),
  );
  if (p.changes?.length) card.append(acRow("Changed", list(p.changes, (c) => c), "ac-changes"));
  const foot = h("div", { class: "ac-foot" });
  card.append(foot);
  const showPublished = () => {
    foot.innerHTML = "";
    card.classList.add("done");
    foot.append(h("div", { class: "published" }, "✓ Published"),
      h("button", { class: "btn ghost", type: "button", onclick: () => openLinks(p.agentId, p.name) }, ICON_SHARE(), "Share links"));
  };
  if (published) showPublished();
  else {
    document.querySelectorAll("#approve-btn").forEach((b) => b.removeAttribute("id"));
    const btn = h("button", { class: "btn yellow", id: "approve-btn", type: "button" }, "Approve and publish");
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Publishing…";
      const r = await api(`api/agents/${encodeURIComponent(p.agentId)}/approve`, { rev: p.rev });
      if (!r.ok) { btn.disabled = false; btn.textContent = "Approve and publish"; toast(r.data.error || "Couldn't publish.", "err"); return; }
      upsertHelper(r.data.agent);
      btn.removeAttribute("id");
      showPublished();
      log.append(h("div", { class: "sys-note" }, `${p.name} is live · ends ${r.data.agent?.endsLabel || p.endsLabel}`));
      scrollToEnd(log);
      shareSheet(r.data.links || [], { title: `Send ${p.name}`, helperName: p.name });
    });
    foot.append(btn);
  }
  log.append(card);
  scrollToEnd(log);
}
const ICON_SHARE = () => h("span", { html: ICON.share, style: "display:inline-flex" });

async function openLinks(id, name) {
  const r = await api(`api/agents/${encodeURIComponent(id)}/links`);
  if (!r.ok) { toast(r.data.error || "Couldn't load links.", "err"); return; }
  shareSheet(r.data.links || [], { title: `Send ${name}`, helperName: name });
}

/* ---------- Brain ---------- */
const ORIGIN = { photo: "PHO", drive: "DRV", gmail: "GML", answer: "ANS", doc: "DOC" };

async function loadBrain(flashId) {
  const r = await api("api/brain");
  if (!r.ok) { toast(r.data.error || "Couldn't load the brain.", "err"); return; }
  state.brain = r.data.items || [];
  renderBrain(flashId);
}
function renderBrain(flashId) {
  const el = $("#brain-list"); el.innerHTML = "";
  if (!state.brain.length) { el.append(h("div", { class: "empty" }, "Nothing here yet. Snap a photo of a warranty card or site note to teach Crewbrain.")); return; }
  for (const it of state.brain) {
    const row = h("button", { class: "brain-item" + (it.id === flashId ? " flash" : ""), type: "button", "data-id": it.id, onclick: () => relabel(it) },
      h("span", { class: "src" }, ORIGIN[it.origin] || "DOC"),
      h("span", { class: "t" }, it.title),
      h("span", { class: "chev", "aria-hidden": "true" }, "›"),
      h("span", { class: "meta" }, lockChip(it.sharing, it.lockLabel), h("span", { class: "mono" }, `v${it.version}`), it.note ? h("span", {}, "· " + it.note) : null));
    el.append(row);
  }
}

function relabel(it) {
  const picker = lockPicker(it.sharing);
  const save = h("button", { class: "btn block", id: "relabel-save-btn", type: "button" }, "Save lock");
  save.addEventListener("click", async () => {
    save.disabled = true;
    const r = await api(`api/brain/${encodeURIComponent(it.id)}/label`, { sharing: picker.value });
    if (!r.ok) { save.disabled = false; toast(r.data.error || "Couldn't change the lock.", "err"); return; }
    closeSheet(); toast(`Locked: ${r.data.item?.lockLabel || "updated"}`);
    loadBrain(it.id);
  });
  openSheet(it.title, h("div", { class: "stack" },
    h("div", { class: "row-btns", style: "align-items:center" }, h("span", { class: "src", style: "grid-row:auto" }, ORIGIN[it.origin] || "DOC"), h("span", { class: "mono muted" }, `v${it.version}`), lockChip(it.sharing, it.lockLabel)),
    it.note ? h("p", { class: "muted" }, it.note) : null,
    h("div", { class: "field" }, h("div", { class: "label" }, "Who can see this"), picker.el),
    save), { testid: "relabel-sheet" });
}

$("#snap-btn").addEventListener("click", () => $("#photo-input").click());
$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; e.target.value = "";
  if (!file) return;
  let dataUrl;
  try { dataUrl = await downscale(file); } catch { toast("Couldn't read that photo.", "err"); return; }
  const body = h("div", { class: "stack" }, h("img", { class: "photo-big", src: dataUrl, alt: "Your photo" }),
    h("div", { class: "reading" }, h("div", { class: "spinner" }), "Reading your photo…"));
  openSheet("Teach from a photo", body, { testid: "capture-sheet" });
  const r = await api("api/brain/capture", { imageDataUrl: dataUrl });
  if (!r.ok) { closeSheet(); toast(r.data.error || "Couldn't read that photo.", "err"); return; }
  showDraft(r.data.draft, dataUrl);
});

function showDraft(d, dataUrl) {
  const title = h("input", { id: "draft-title", type: "text", value: d.title || "" });
  const text = h("textarea", { id: "draft-text" }); text.value = d.text || "";
  const picker = lockPicker(d.suggestedSharing || "internal");
  const approve = h("button", { class: "btn yellow block", id: "draft-approve-btn", type: "button" }, "Approve into Brain");
  approve.addEventListener("click", async () => {
    approve.disabled = true; approve.textContent = "Saving…";
    const r = await api(`api/brain/drafts/${encodeURIComponent(d.id)}/approve`, { title: title.value.trim(), text: text.value, sharing: picker.value });
    if (!r.ok) { approve.disabled = false; approve.textContent = "Approve into Brain"; toast(r.data.error || "Couldn't save.", "err"); return; }
    closeSheet(); toast(`Added: ${r.data.item?.title || "new knowledge"}`);
    if (location.hash !== "#brain") location.hash = "brain";
    loadBrain(r.data.item?.id);
  });
  openSheet("Check what I read", h("div", { class: "stack" },
    h("img", { class: "photo-big", src: dataUrl, alt: "Your photo", style: "max-height:160px" }),
    h("p", { class: "muted", style: "font-size:.9rem" }, "Nothing is usable until you approve it."),
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
  active: ["active", "Active"], awaiting_approval: ["awaiting", "Awaiting OK"], draft: ["awaiting", "Draft"],
  expired: ["ended", "Ended"], revoked: ["ended", "Closed"],
};
function renderHelpers() {
  const el = $("#helper-list"); el.innerHTML = "";
  if (!state.helpers.length) {
    el.append(h("div", { class: "empty" }, "No helpers yet. ", h("a", { href: "#create" }, "Tell the creator who needs one.")));
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
      h("div", { style: "min-width:0" }, h("div", { class: "hc-name" }, a.name), h("div", { class: "hc-aud" }, `${a.audienceName || "—"} · ${a.audienceCount ?? 0} ${a.audienceCount === 1 ? "person" : "people"}`)),
      h("span", { class: "pill " + pc }, pt)),
    h("div", {}, h("span", { class: "tag" }, h("span", { class: "hole" }), (ended ? "Ended " : "Ends ") + (a.endsLabel || ""))),
    actions);
  actions.append(
    h("button", { class: "btn small ghost share-links-btn", type: "button", disabled: ended || a.state !== "active", onclick: () => openLinks(a.id, a.name) }, ICON_SHARE(), "Share links"),
    h("a", { class: "btn small ghost open-chat-btn", href: `a.html?id=${encodeURIComponent(a.id)}` }, h("span", { html: ICON.chat, style: "display:inline-flex" }), "Open chat"));
  if (!ended) {
    const closeBtn = h("button", { class: "btn small ghost close-job-btn", type: "button" }, h("span", { html: ICON.power, style: "display:inline-flex" }), "Close job");
    closeBtn.addEventListener("click", () => {
      closeBtn.hidden = true;
      const confirmBtn = h("button", { class: "btn small danger confirm-close-btn", type: "button" }, "Close now");
      const cancel = h("button", { class: "btn small ghost", type: "button", onclick: () => { row.remove(); closeBtn.hidden = false; } }, "Cancel");
      const row = h("div", { class: "confirm-row" },
        h("p", {}, h("b", {}, `Close ${a.name}?`), " Every link stops working right now, and job-only knowledge locks back to Office only."),
        h("div", { class: "row-btns" }, cancel, confirmBtn));
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true; confirmBtn.textContent = "Closing…";
        const r = await api(`api/agents/${encodeURIComponent(a.id)}/close`, {});
        if (!r.ok) { confirmBtn.disabled = false; confirmBtn.textContent = "Close now"; toast(r.data.error || "Couldn't close.", "err"); return; }
        upsertHelper(r.data.agent);
        toast(`${a.name} is closed. Links are dead.`);
        card.replaceWith(helperCard({ ...a, ...r.data.agent }));
      });
      actions.append(row);
    });
    actions.append(closeBtn);
  }
  return card;
}

/* ---------- Inbox ---------- */
const KIND_ICON = { question: "❓", issue: "⚠️", walkthrough: "🎥" };
const KIND_LABEL = { question: "Question", issue: "Issue", walkthrough: "Walkthrough request" };
async function refreshInbox() {
  const r = await api("api/inbox");
  if (!r.ok) return;
  const before = JSON.stringify(state.inbox.map((i) => [i.id, i.status]));
  state.inbox = r.data.items || [];
  const open = state.inbox.filter((i) => i.status === "open").length;
  const badge = $("#inbox-badge"); badge.textContent = String(open); badge.hidden = !open;
  if (!$("#view-inbox").hidden && before !== JSON.stringify(state.inbox.map((i) => [i.id, i.status])) && !document.querySelector(".sheet")) renderInbox();
}
function inboxRow(it) {
  return h("button", { class: `inbox-item k-${it.kind}` + (it.status !== "open" ? " closed" : ""), type: "button", "data-id": it.id, "data-status": it.status, onclick: () => openInbox(it) },
    h("span", { class: "ico", "aria-hidden": "true" }, KIND_ICON[it.kind] || "•"),
    h("span", { class: "from" }, it.from),
    it.imageDataUrl ? h("img", { class: "thumb", src: it.imageDataUrl, alt: "Photo" }) : h("span"),
    h("span", { class: "via" }, `${KIND_LABEL[it.kind] || it.kind} · via ${it.agentName}${it.status !== "open" ? " · " + it.status : ""}`),
    h("span", { class: "txt" }, it.text));
}
function renderInbox() {
  const el = $("#inbox-list"); el.innerHTML = "";
  const open = state.inbox.filter((i) => i.status === "open");
  const done = state.inbox.filter((i) => i.status !== "open");
  if (!open.length) el.append(h("div", { class: "empty" }, "All clear. Nothing waiting on you."));
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
    const ans = h("textarea", { id: "answer-input", placeholder: it.kind === "question" ? "Your answer — it becomes knowledge the helper can use next time." : "Reply or note for the record…" });
    const helper = state.helpers.find((x) => x.id === it.agentId);
    const picker = lockPicker(helper?.templateId === "crew_briefing" ? "crew" : "customer");
    const answerBtn = h("button", { class: "btn yellow block", id: "answer-btn", type: "button" }, "Answer and teach");
    const dismissBtn = h("button", { class: "btn ghost block", id: "dismiss-btn", type: "button" }, "Dismiss");
    answerBtn.addEventListener("click", async () => {
      const text = ans.value.trim(); if (!text) { ans.focus(); return; }
      answerBtn.disabled = true; answerBtn.textContent = "Saving…";
      const r = await api(`api/inbox/${encodeURIComponent(it.id)}/answer`, { text, sharing: picker.value });
      if (!r.ok) { answerBtn.disabled = false; answerBtn.textContent = "Answer and teach"; toast(r.data.error || "Couldn't save the answer.", "err"); return; }
      closeSheet();
      toast(r.data.knowledge ? `Saved to Brain: ${r.data.knowledge.title} v${r.data.knowledge.version}` : "Answered.");
      await refreshInbox(); renderInbox();
    });
    dismissBtn.addEventListener("click", async () => {
      dismissBtn.disabled = true;
      const r = await api(`api/inbox/${encodeURIComponent(it.id)}/dismiss`, {});
      if (!r.ok) { dismissBtn.disabled = false; toast(r.data.error || "Couldn't dismiss.", "err"); return; }
      closeSheet(); await refreshInbox(); renderInbox();
    });
    parts.push(h("div", { class: "field" }, h("label", { class: "label", for: "answer-input" }, "Your answer"), ans),
      h("div", { class: "field" }, h("div", { class: "label" }, "Who can see this answer"), picker.el),
      answerBtn, dismissBtn);
  } else parts.push(h("p", { class: "muted" }, `This item was ${it.status}.`));
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
    if (!r.ok) { toast(r.data.error || "Demo clock is off.", "err"); return; }
    $("#clock-now").textContent = "Now: " + new Date(r.data.now).toLocaleString();
    toast(body.reset ? "Clock reset." : "Skipped ahead 1 day.");
    loadHelpers();
  };
  $("#clock-advance").addEventListener("click", () => clock({ advanceMinutes: 1440 }));
  $("#clock-reset").addEventListener("click", () => clock({ reset: true }));
})();

boot();
