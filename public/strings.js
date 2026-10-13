/* UI string tables. EN is the source of truth: the server translates it for any other
   language (GET api/i18n/:lang). Placeholders in {braces} are filled by fmt(); keep them as-is. */
export const EN = {
  ask: "Ask anything…", photoPh: "Say what's wrong…", send: "Send", talk: "Tap and talk", stopTalk: "Stop talking",
  attach: "Add a photo", report: "Report a problem", photoAttached: "Photo attached", removePhoto: "Remove photo",
  ends: "Works until", canDo: "Can also", endedTitle: "This helper has ended", ended: "ended", theOwner: "The owner",
  expired: "This link stopped working {e}. Thanks for working with {c}.",
  revoked: "{o} closed this job, so this link no longer works. Thanks for working with {c}.",
  lostTitle: "Open your personal link again", lost: "You were signed out on this phone. Tap the personal link you were sent to keep going.",
  notFound: "Helper not found", notFoundText: "Check the link you were sent, or ask the person who sent it.",
  missing: "This link is missing part of its address. Open the link you were sent.",
  hi: "Hi {n}, I'm {h} from {c}.", hiAnon: "Hi, I'm {h} from {c}.",
  helpsWith: "I can help with {j}.", worksUntil: "I work until {e}.",
  typeInstead: "Type instead", notShare: "Not something I can share",
  source: "Source", foundIn: "Found in", checking: "Checking your notes…", source1: "1 source", sourcesN: "{n} sources",
  loading: "Loading…", sendFail: "That didn't go through. Check your signal and send it again.",
  aiDown: "The AI assistant is unavailable right now, so this answer is quoted straight from the company's notes.",
  answered: "{o} answered:", savedTo: "Saved to {c}'s knowledge",
  logged: "Sent to {o}: ", walk: "Walkthrough requested from {o}: ",
  relayAsk: "Waiting for {o} to approve: ", relaySent: "Sent to the homeowners: ", updateFrom: "Update from {c}",
  photoFail: "Couldn't open that photo. Try taking it again.", herePhoto: "Here's a photo.",
  voiceErr: "Voice isn't available right now. Type your message instead.",
  language: "Language", auto: "Auto", other: "Other…", otherPrompt: "Language code (for example nl, sw, pt-BR)",
  vs: { connecting: "Getting ready…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" },
  vo: {
    title: "Voice", end: "End", mute: "Mute", unmute: "Unmute", captions: "Captions", ended: "Voice ended",
    conversation: "Voice conversation", turn1: "1 turn", turnsN: "{n} turns", results: "Results",
    showTranscript: "Show transcript", hideTranscript: "Hide transcript",
    autoNote: "Automatic transcript; may differ slightly from what was said.", you: "You", needsTap: "Needs your tap", ttfa: "Time to first audio",
  },
  crew: ["What's the gate code?", "Where do we park?", "What's today's schedule?"],
  home: ["Will my fridge stay on in a blackout?", "When is the inspection?", "Can we add a second battery later?"],
  company: "your contractor",
};

export const ES = {
  ask: "Pregunta lo que quieras…", photoPh: "Di qué está mal…", send: "Enviar", talk: "Toca y habla", stopTalk: "Dejar de hablar",
  attach: "Añadir foto", report: "Reportar un problema", photoAttached: "Foto añadida", removePhoto: "Quitar foto",
  ends: "Funciona hasta", canDo: "También puede", endedTitle: "Este asistente terminó", ended: "terminado", theOwner: "El dueño",
  expired: "Este enlace dejó de funcionar {e}. Gracias por trabajar con {c}.",
  revoked: "{o} cerró este trabajo, así que este enlace ya no funciona. Gracias por trabajar con {c}.",
  lostTitle: "Abre tu enlace otra vez", lost: "Se cerró tu sesión en este teléfono. Toca el enlace personal que te enviaron para seguir.",
  notFound: "No se encontró el asistente", notFoundText: "Revisa el enlace que te enviaron o pregunta a quien te lo mandó.",
  missing: "A este enlace le falta parte de la dirección. Abre el enlace que te enviaron.",
  hi: "Hola {n}, soy {h} de {c}.", hiAnon: "Hola, soy {h} de {c}.",
  helpsWith: "Te ayudo con {j}.", worksUntil: "Funciono hasta {e}.",
  typeInstead: "Prefiero escribir", notShare: "No puedo compartir eso",
  source: "Fuente", foundIn: "Encontrado en", checking: "Revisando las notas…", source1: "1 fuente", sourcesN: "{n} fuentes",
  loading: "Cargando…", sendFail: "No se pudo enviar. Revisa tu señal e inténtalo otra vez.",
  aiDown: "El asistente de IA no está disponible ahora; esta respuesta viene tal cual de las notas de la empresa.",
  answered: "{o} respondió:", savedTo: "Guardado en el conocimiento de {c}",
  logged: "Enviado a {o}: ", walk: "Visita pedida a {o}: ",
  relayAsk: "Esperando la aprobación de {o}: ", relaySent: "Enviado a la familia: ", updateFrom: "Aviso de {c}",
  photoFail: "No se pudo abrir la foto. Tómala otra vez.", herePhoto: "Aquí va una foto.",
  voiceErr: "La voz no está disponible ahora. Escribe tu mensaje.",
  language: "Idioma", auto: "Automático", other: "Otro…", otherPrompt: "Código de idioma (por ejemplo nl, sw, pt-BR)",
  vs: { connecting: "Preparando…", listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando…" },
  vo: {
    title: "Voz", end: "Terminar", mute: "Silenciar", unmute: "Activar micrófono", captions: "Subtítulos", ended: "Llamada de voz terminada",
    conversation: "Conversación de voz", turn1: "1 turno", turnsN: "{n} turnos", results: "Resultados",
    showTranscript: "Ver transcripción", hideTranscript: "Ocultar transcripción",
    autoNote: "Transcripción automática; puede diferir un poco de lo que se dijo.", you: "Tú", needsTap: "Necesita tu toque", ttfa: "Tiempo hasta el primer audio",
  },
  crew: ["¿Cuál es el código del portón?", "¿Dónde nos estacionamos?", "¿Cuál es el horario de hoy?"],
  home: ["¿Mi refrigerador seguirá funcionando en un apagón?", "¿Cuándo es la inspección?", "¿Podemos añadir otra batería después?"],
  company: "tu contratista",
};

/** The language picker, by BCP-47 code, each in its own name. */
export const LANGS = [
  ["en", "English"], ["es", "Español"], ["zh", "中文"], ["vi", "Tiếng Việt"], ["pt", "Português"], ["fr", "Français"],
  ["ko", "한국어"], ["tl", "Tagalog"], ["ru", "Русский"], ["ar", "العربية"], ["hi", "हिन्दी"], ["de", "Deutsch"],
  ["ja", "日本語"], ["pl", "Polski"], ["it", "Italiano"], ["uk", "Українська"],
];
export const RTL = ["ar", "he", "fa", "ur"];

export const fmt = (s, vars = {}) => String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")).replace(/\s+([.,])/g, "$1").replace(/ {2,}/g, " ");

/** The picked language: "auto" (or nothing) follows the browser. */
export function pickedLang(raw) {
  const v = (raw || "auto").trim();
  return v === "auto" ? (navigator.languages?.[0] || navigator.language || "en") : v;
}
/** Base code ("pt-BR" → "pt"), lower-case. */
export const baseLang = (l) => String(l || "en").toLowerCase().split(/[-_]/)[0];

/** Load the UI table for a language: EN/ES ship statically; others come from the server, cached per browser. */
export async function loadTable(lang) {
  const b = baseLang(lang);
  if (b === "en") return EN;
  if (b === "es") return ES;
  const key = `cb.i18n.${lang}`;
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && c.ask) return merge(EN, c); } catch { /* storage off */ }
  try {
    const r = await fetch(`api/i18n/${encodeURIComponent(lang)}`, { credentials: "same-origin" });
    if (r.ok) {
      const j = await r.json();
      if (j?.strings?.ask) {
        if (j.lang && baseLang(j.lang) !== "en") try { localStorage.setItem(key, JSON.stringify(j.strings)); } catch { /* storage off */ }
        return merge(EN, j.strings);
      }
    }
  } catch { /* offline */ }
  return EN;
}
function merge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k], o = over?.[k];
    if (Array.isArray(b)) out[k] = Array.isArray(o) && o.length === b.length && o.every((x) => typeof x === "string") ? o : b;
    else if (b && typeof b === "object") out[k] = merge(b, o);
    else out[k] = typeof o === "string" && o ? o : b;
  }
  return out;
}

/** Apply <html lang> and direction. */
export function applyDocLang(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.includes(baseLang(lang)) ? "rtl" : "ltr";
}

/** A <select> language picker: Auto + LANGS + Other…; calls onPick(rawValue) where rawValue is "auto" or a code. */
export function langPicker(current, onPick, { label = "Language", auto = "Auto", other = "Other…", otherPrompt = "Language code" } = {}) {
  const sel = document.createElement("select");
  sel.className = "lang-select"; sel.setAttribute("aria-label", label);
  const opt = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; return o; };
  sel.append(opt("auto", auto));
  for (const [v, t] of LANGS) sel.append(opt(v, t));
  const cur = current || "auto";
  if (cur !== "auto" && !LANGS.some(([v]) => v === cur)) sel.append(opt(cur, cur));
  sel.append(opt("__other", other));
  sel.value = cur;
  sel.addEventListener("change", () => {
    let v = sel.value;
    if (v === "__other") {
      const got = (prompt(otherPrompt) || "").trim();
      if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(got)) { sel.value = cur; return; }
      v = got;
    }
    onPick(v);
  });
  return sel;
}
