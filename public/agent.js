import { api, h, toast, ICON, downscale, wireVoice, scrollToEnd, typingBubble } from "./common.js";

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get("id");
const chat = $("#chat"), input = $("#composer-input"), sendBtn = $("#send-btn");
let info = null, ended = false, voice = null, attached = null, poll = null;

$("#send-btn").innerHTML = ICON.send;
$("#mic-btn").innerHTML = ICON.mic;
$("#attach-btn").innerHTML = ICON.cam;
$("#ended-icon").innerHTML = ICON.power;

function showScreen(title, text, { power = true } = {}) {
  ended = true;
  try { voice?.stop(); } catch {}
  clearInterval(poll);
  $("#chat-main").hidden = true;
  $("#expiry-bar").hidden = true;
  $("#ended-title").textContent = title;
  $("#ended-text").textContent = text || "";
  $("#ended-icon").hidden = !power;
  $("#ended-screen").hidden = false;
}

function endHelper(st, reply) {
  if (ended) return;
  const owner = info?.ownerName || "The owner";
  const company = info?.tenantName || "us";
  const text = reply || (st === "expired"
    ? `This link expired${info?.endsLabel ? " " + info.endsLabel : ""}. Thanks for working with ${company}.`
    : `${owner} closed this job. The link no longer works. Thanks for working with ${company}.`);
  showScreen("This helper has ended", text);
  if (info) { $("#h-sub").textContent = `${info.tenantName || ""} · ended`; }
}

function authLost() { showScreen("Open your personal link again", "Your session ended on this device. Tap the personal link you were sent to continue.", { power: false }); }

const ENDED_STATES = ["expired", "revoked"];
async function loadPublic(first) {
  const r = await api(`api/agents/${encodeURIComponent(id)}/public`);
  if (r.status === 401) { authLost(); return false; }
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return false; }
  if (!r.ok) { if (first) showScreen("Helper not found", r.data.error || "Check the link you were sent.", { power: false }); return false; }
  info = r.data;
  if (first) renderHeader();
  if (ENDED_STATES.includes(info.state)) { endHelper(info.state); return false; }
  return true;
}

function renderHeader() {
  document.title = `${info.name} · ${info.tenantName || "Crewbrain"}`;
  $("#h-avatar").textContent = info.avatar || "🤖";
  $("#h-name").textContent = info.name;
  $("#h-sub").textContent = [info.tenantName, info.job].filter(Boolean).join(" · ");
  $("#h-ends-text").textContent = `Ends ${info.endsLabel || ""}`;
  $("#h-cando").textContent = info.canDo?.length ? "Can " + info.canDo.map((c) => c.name.toLowerCase()).join(" · ") : "";
  $("#expiry-bar").hidden = false;
}

function userBubble(text, img) {
  const el = h("div", { class: "msg out" }, img ? h("img", { class: "photo", src: img, alt: "Your photo" }) : null, text || "");
  chat.append(el); scrollToEnd(chat); return el;
}
function helperMessage(m) {
  const refused = !!m.refused;
  const el = h("div", { class: "msg in" + (refused ? " denied" : "") },
    refused ? h("div", { class: "who-line" }, "Not something I can share") : null,
    m.reply ?? m.text ?? "");
  if (m.citations?.length) el.append(h("div", { class: "cites" }, m.citations.map((c) => h("span", { class: "cite" }, `↳ ${c.title} v${c.version}${c.section ? " · " + c.section : ""}`))));
  chat.append(el);
  if (m.action) {
    const owner = info?.ownerName || "the owner";
    const label = m.action.kind === "walkthrough_requested" ? `Walkthrough requested from ${owner}: ` : `Logged for ${owner}: `;
    chat.append(h("div", { class: "action-chip", "data-kind": m.action.kind }, label + (m.action.summary || "")));
  }
  scrollToEnd(chat);
}

function intro() {
  chat.append(h("div", { class: "chat-intro" },
    h("div", { class: "avatar lg" }, info.avatar || "🤖"),
    h("b", {}, `Hi, I'm ${info.name.split(/[ ·]/)[0]}`),
    h("span", {}, `${info.tenantName || "Your contractor"}'s helper${info.job ? " for " + info.job : ""}. Ask me anything — tap the mic to talk.`)));
}

async function loadHistory() {
  const r = await api(`api/agents/${encodeURIComponent(id)}/history`);
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return; }
  if (r.status === 401) { authLost(); return; }
  intro();
  for (const m of (r.ok && r.data.messages) || []) {
    if (m.role === "user") userBubble(m.text, m.imageDataUrl);
    else helperMessage(m);
  }
  scrollToEnd(chat);
}

function handleReply(data) {
  if (data && data.error === "ended") { endHelper(data.state, data.reply); return; }
  helperMessage(data || {});
}

async function send(text, img) {
  userBubble(text, img);
  const typing = typingBubble(); chat.append(typing); scrollToEnd(chat);
  const body = { text: text || (img ? "Here's a photo." : "") };
  if (img) body.imageDataUrl = img;
  const r = await api(`api/agents/${encodeURIComponent(id)}/chat`, body);
  typing.remove();
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return; }
  if (r.status === 401) { authLost(); return; }
  if (!r.ok) { helperMessage({ reply: r.data.reply || r.data.error || "Something went wrong. Try again.", refused: !!r.data.reply }); return; }
  handleReply(r.data);
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

function clearAttach() { attached = null; $("#attach-preview").hidden = true; syncSend(); }
$("#attach-clear").addEventListener("click", clearAttach);
$("#attach-btn").addEventListener("click", () => $("#attach-input").click());
$("#attach-input").addEventListener("change", async (e) => {
  const f = e.target.files?.[0]; e.target.value = "";
  if (!f) return;
  try { attached = await downscale(f); } catch { toast("Couldn't read that photo.", "err"); return; }
  $("#attach-img").src = attached; $("#attach-preview").hidden = false;
  if (!input.value) input.placeholder = "Say what's wrong…";
  syncSend(); input.focus();
});

async function boot() {
  if (!id) { showScreen("Helper not found", "This link is missing its helper. Open the link you were sent.", { power: false }); return; }
  const ok = await loadPublic(true);
  if (!ok) return;
  await loadHistory();
  if (ended) return;
  voice = wireVoice({
    btn: $("#mic-btn"), stateEl: $("#voice-state"), mode: "agent", agentId: id,
    onTranscript: (text, who) => { if (who === "user") userBubble(text); },
    onReply: handleReply,
  });
  poll = setInterval(() => { if (!ended) loadPublic(false); }, 5000);
}
boot();
