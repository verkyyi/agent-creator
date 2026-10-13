import { api, h, toast, ICON, icon, downscale, wireVoice, scrollToEnd, typingBubble, citeChip, store } from "./common.js";

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get("id");
const chat = $("#chat"), input = $("#composer-input"), sendBtn = $("#send-btn");
let info = null, ended = false, voice = null, attached = null, poll = null, isCrew = false, rendered = 0, sending = 0;

/* ---------- language ---------- */
const STR = {
  en: {
    ask: "Ask anything…", photoPh: "Say what's wrong…", send: "Send", talk: "Tap and talk", stopTalk: "Stop talking",
    attach: "Add a photo", report: "Report a problem", photoAttached: "Photo attached", removePhoto: "Remove photo",
    ends: "Works until", canDo: "Can also", endedTitle: "This helper has ended",
    expired: (e, c) => `This link stopped working${e ? " " + e : ""}. Thanks for working with ${c}.`,
    revoked: (o, c) => `${o} closed this job, so this link no longer works. Thanks for working with ${c}.`,
    lostTitle: "Open your personal link again", lost: "You were signed out on this phone. Tap the personal link you were sent to keep going.",
    notFound: "Helper not found", notFoundText: "Check the link you were sent, or ask the person who sent it.",
    missing: "This link is missing part of its address. Open the link you were sent.",
    hi: (n, h, c) => `Hi ${n}, I'm ${h} from ${c}.`, hiAnon: (h, c) => `Hi, I'm ${h} from ${c}.`,
    helpsWith: (j) => `I can help with ${j}.`, worksUntil: (e) => `I work until ${e}.`,
    typeInstead: "Type instead", notShare: "Not something I can share",
    source: "Source", loading: "Loading…", sendFail: "That didn't go through. Check your signal and send it again.",
    answered: (o) => `${o} answered:`, savedTo: (c) => `Saved to ${c}'s knowledge`,
    logged: (o) => `Sent to ${o}: `, walk: (o) => `Walkthrough requested from ${o}: `,
    photoFail: "Couldn't open that photo. Try taking it again.", herePhoto: "Here's a photo.",
    voiceErr: "Voice isn't available right now. Type your message instead.",
    vs: { connecting: "Getting ready…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" },
    crew: ["What's the gate code?", "Where do we park?", "What's today's schedule?"],
    home: ["Will my fridge stay on in a blackout?", "When is the inspection?", "Can we add a second battery later?"],
    lang: "Español", company: "your contractor",
  },
  es: {
    ask: "Pregunta lo que quieras…", photoPh: "Di qué está mal…", send: "Enviar", talk: "Toca y habla", stopTalk: "Dejar de hablar",
    attach: "Añadir foto", report: "Reportar un problema", photoAttached: "Foto añadida", removePhoto: "Quitar foto",
    ends: "Funciona hasta", canDo: "También puede", endedTitle: "Este asistente terminó",
    expired: (e, c) => `Este enlace dejó de funcionar${e ? " " + e : ""}. Gracias por trabajar con ${c}.`,
    revoked: (o, c) => `${o} cerró este trabajo, así que este enlace ya no funciona. Gracias por trabajar con ${c}.`,
    lostTitle: "Abre tu enlace otra vez", lost: "Se cerró tu sesión en este teléfono. Toca el enlace personal que te enviaron para seguir.",
    notFound: "No se encontró el asistente", notFoundText: "Revisa el enlace que te enviaron o pregunta a quien te lo mandó.",
    missing: "A este enlace le falta parte de la dirección. Abre el enlace que te enviaron.",
    hi: (n, h, c) => `Hola ${n}, soy ${h} de ${c}.`, hiAnon: (h, c) => `Hola, soy ${h} de ${c}.`,
    helpsWith: (j) => `Te ayudo con ${j}.`, worksUntil: (e) => `Funciono hasta ${e}.`,
    typeInstead: "Prefiero escribir", notShare: "No puedo compartir eso",
    source: "Fuente", loading: "Cargando…", sendFail: "No se pudo enviar. Revisa tu señal e inténtalo otra vez.",
    answered: (o) => `${o} respondió:`, savedTo: (c) => `Guardado en el conocimiento de ${c}`,
    logged: (o) => `Enviado a ${o}: `, walk: (o) => `Visita pedida a ${o}: `,
    photoFail: "No se pudo abrir la foto. Tómala otra vez.", herePhoto: "Aquí va una foto.",
    voiceErr: "La voz no está disponible ahora. Escribe tu mensaje.",
    vs: { connecting: "Preparando…", listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando…" },
    crew: ["¿Cuál es el código del portón?", "¿Dónde nos estacionamos?", "¿Cuál es el horario de hoy?"],
    home: ["¿Mi refrigerador seguirá funcionando en un apagón?", "¿Cuándo es la inspección?", "¿Podemos añadir otra batería después?"],
    lang: "English", company: "tu contratista",
  },
};
let lang = store.get("lang") === "es" ? "es" : "en";
const t = () => STR[lang];

$("#send-btn").innerHTML = ICON.send;
$("#mic-btn").innerHTML = ICON.mic;
$("#attach-btn").innerHTML = ICON.cam;
$("#attach-clear").innerHTML = ICON.x;
$("#ended-icon").innerHTML = ICON.power;

function applyLang() {
  document.documentElement.lang = lang;
  const s = t();
  $("#lang-btn").innerHTML = ICON.globe;
  $("#lang-btn").append(h("span", {}, s.lang));
  $("#lang-btn").setAttribute("aria-label", lang === "es" ? "Change to English" : "Cambiar a español");
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
$("#lang-btn").addEventListener("click", () => {
  lang = lang === "es" ? "en" : "es"; store.set("lang", lang); applyLang();
});

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
  const owner = info?.ownerName || (lang === "es" ? "El dueño" : "The owner");
  const company = info?.tenantName || t().company;
  const text = lang === "es" || !reply
    ? (st === "expired" ? t().expired(info?.endsLabel, company) : t().revoked(owner, company))
    : reply;
  showScreen(t().endedTitle, text);
  if (info) { $("#h-sub").textContent = `${info.tenantName || ""} · ${lang === "es" ? "terminado" : "ended"}`; }
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
    isCrew = info.avatar === "🦺" || /crew|roof|brief/i.test(`${info.name} ${info.job} ${info.tone || ""}`);
    document.body.classList.toggle("crew", isCrew);
    if (isCrew) $("#composer").insertBefore($("#attach-btn"), $("#voice-state"));
    applyLang();
  }
  if (ENDED_STATES.includes(info.state)) { endHelper(info.state); return false; }
  return true;
}

function renderHeader() {
  document.title = `${info.name} · ${info.tenantName || "Crewbrain"}`;
  $("#h-avatar").textContent = info.avatar || "🏡";
  $("#h-name").textContent = info.name;
  $("#h-sub").textContent = [info.tenantName, info.job].filter(Boolean).join(" · ");
  $("#h-ends-text").textContent = `${t().ends} ${info.endsLabel || ""}`;
  $("#h-cando").textContent = info.canDo?.length ? t().canDo + ": " + info.canDo.map((c) => c.name.toLowerCase()).join(", ") : "";
  $("#expiry-bar").hidden = false;
}

function userBubble(text, img) {
  const el = h("div", { class: "msg out" }, img ? h("img", { class: "photo", src: img, alt: "" }) : null, text || "");
  chat.append(el); scrollToEnd(chat); hideStarters(); return el;
}
function helperMessage(m) {
  const refused = !!m.refused;
  const el = h("div", { class: "msg in" + (refused ? " denied" : "") },
    refused ? h("div", { class: "who-line" }, icon("lock"), t().notShare) : null,
    m.reply ?? m.text ?? "");
  if (m.citations?.length) el.append(h("div", { class: "cites" }, m.citations.map((c) => citeChip(c, id, { prefix: t().source, loading: t().loading }))));
  if (m.notice) el.append(h("div", { class: "notice" }, lang === "es" ? "El asistente de IA no está disponible ahora; esta respuesta viene tal cual de las notas de la empresa." : m.notice));
  chat.append(el);
  if (m.action?.kind === "owner_answer") {
    const owner = firstName(info?.ownerName) || (lang === "es" ? "El dueño" : "The owner");
    chat.append(h("div", { class: "owner-answer", "data-kind": "owner_answer" },
      h("div", { class: "oa-head" }, icon("check"), t().answered(owner)),
      h("blockquote", {}, `“${m.action.summary || ""}”`),
      h("div", { class: "oa-saved" }, t().savedTo(info?.tenantName || t().company))));
  } else if (m.action) {
    const owner = info?.ownerName || "the owner";
    const label = m.action.kind === "walkthrough_requested" ? t().walk(owner) : t().logged(owner);
    chat.append(h("div", { class: "action-chip", "data-kind": m.action.kind }, icon("check"), h("span", {}, label + (m.action.summary || ""))));
  }
  scrollToEnd(chat);
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
  const langSw = h("div", { class: "lang-switch", role: "group", "aria-label": "Language / Idioma" },
    ["en", "es"].map((l) => h("button", { type: "button", "aria-pressed": String(l === lang), onclick: () => { if (l !== lang) { lang = l; store.set("lang", l); applyLang(); } } }, l === "en" ? "English" : "Español")));
  const w = h("div", { class: "welcome", role: "dialog", "aria-modal": "true", "aria-labelledby": "welcome-hi", "data-testid": "welcome" },
    h("div", { class: "welcome-card" },
      langSw,
      h("div", { class: "avatar xl" }, info.avatar || "🏡"),
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
    h("div", { class: "avatar lg" }, info.avatar || "🏡"),
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
  for (const m of msgs) {
    if (m.role === "user") userBubble(m.text, m.imageDataUrl);
    else helperMessage(m);
  }
  startersShown = !msgs.some((m) => m.role === "user");
  renderStarters();
  scrollToEnd(chat);
}

function handleReply(data) {
  if (data && data.error === "ended") { endHelper(data.state, data.reply); return; }
  helperMessage(data || {});
}

async function pollHistory() {
  if (ended || sending || document.hidden) return;
  const r = await api(`api/agents/${encodeURIComponent(id)}/history`);
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return; }
  if (!r.ok || sending) return;
  const msgs = r.data.messages || [];
  if (msgs.length <= rendered) { rendered = Math.min(rendered, msgs.length); return; }
  for (const m of msgs.slice(rendered)) {
    if (m.role === "user") userBubble(m.text, m.imageDataUrl); else helperMessage(m);
  }
  rendered = msgs.length;
}

async function send(text, img) {
  sending++;
  try { await sendInner(text, img); } finally { sending--; }
}
/* Pending bubble: typing dots + the server's status line, then "Found in" chips once retrieval is done. */
function pendingBubble() {
  const status = h("span", { class: "pending-status" });
  const found = h("div", { class: "cites found", hidden: true });
  const el = h("div", { class: "msg in pending", "aria-live": "polite", "data-testid": "pending" },
    h("div", { class: "typing", "aria-label": "Thinking" }, h("i"), h("i"), h("i")), status, found);
  return {
    el,
    status(s) { status.textContent = lang === "es" ? "Revisando las notas…" : s || ""; scrollToEnd(chat); },
    sources(cites) {
      if (!cites?.length) return;
      found.innerHTML = "";
      for (const c of cites.slice(0, 3)) found.append(citeChip(c, id, { prefix: lang === "es" ? "Encontrado en" : "Found in", loading: t().loading }));
      found.hidden = false; scrollToEnd(chat);
    },
  };
}

/* POST …/chat?stream=1 and read the SSE stream. Resolves to the same { ok, status, data } shape as api().
   A JSON response (pwa.js offline outbox 202, 401 from the auth middleware) is passed through as-is.
   Returns null when nothing came back at all, so the caller can use the plain route. */
async function streamChat(body, pending) {
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
    got = true;
    if (event === "status") pending.status(data.text);
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
  userBubble(text, img);
  const pending = pendingBubble(); chat.append(pending.el); scrollToEnd(chat);
  const body = { text: text || (img ? t().herePhoto : "") };
  if (img) body.imageDataUrl = img;
  const r = (await streamChat(body, pending)) || (await api(`api/agents/${encodeURIComponent(id)}/chat`, body));
  pending.el.remove();
  if (r.status === 410) { endHelper(r.data.state, r.data.reply); return; }
  if (r.status === 401) { authLost(); return; }
  if (!r.ok) { helperMessage({ reply: r.data.reply || r.data.error || t().sendFail, refused: !!r.data.reply }); return; }
  rendered += 2;
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
  applyLang();
  if (!id) { showScreen(t().notFound, t().missing, { power: false }); return; }
  const [ok, me] = await Promise.all([loadPublic(true), api("api/me")]);
  if (me.ok && me.data.member?.role !== "owner") meName = firstName(me.data.member?.name);
  if (!ok) return;
  await loadHistory();
  if (ended) return;
  voice = wireVoice({
    btn: $("#mic-btn"), stateEl: $("#voice-state"), mode: "agent", agentId: id,
    texts: t().vs, voiceErr: t().voiceErr,
    onTranscript: (text, who) => { if (who === "user") userBubble(text); },
    onReply: (j) => { rendered += 2; handleReply(j); },
  });
  if (!store.get(`cb.welcomed.${id}`)) showWelcome();
  poll = setInterval(() => { if (!ended) { loadPublic(false); pollHistory(); } }, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollHistory(); });
}
boot();
