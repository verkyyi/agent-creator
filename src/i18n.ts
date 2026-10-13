// Fixed server sentences in any language. English is the source; other languages are
// translated with the fast model (Claude as fallback), cached in memory per (lang, sentence),
// and fall back to English on any failure. Spanish ships seeded so tests stay offline.
// The UI string table (public/strings.js) is translated the same way and cached on disk
// under data/i18n/<lang>.json: it is product text, not visitor data, so it lives outside sandboxes.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openaiAnswer } from "./fastllm.ts";
import { claude } from "./llm.ts";

const BUDGET_MS = 2500;
const offline = () => process.env.NODE_ENV === "test";

/** Seeded translations, keyed by lang then English template. Placeholders: {owner}. */
const SEED: Record<string, Record<string, string>> = {
  es: {
    "What should I tell the homeowner?": "¿Qué quieres que le diga a la familia?",
    "There's no household on this job for me to update. Ask {owner}.": "No veo una familia en este trabajo. Pregúntale a {owner}.",
    "I've sent your update to {owner} to approve.": "Le mandé tu aviso a {owner} para que lo apruebe.",
    "Logged for {owner}. They'll get it in their inbox and follow up if the plan changes.": "Listo. Lo registré para {owner}. Te avisará si cambia el plan.",
    "Logged for {owner} with your photo. They'll get it in their inbox and follow up if the plan changes.": "Listo. Lo registré para {owner} con la foto. Te avisará si cambia el plan.",
    "That's not something I can see. I've passed your question to {owner}.": "Eso no lo puedo ver. Le pasé tu pregunta a {owner}.",
    "I've asked {owner} to set up a walkthrough. They'll confirm a time with you; nothing is booked until they do.": "Le pedí a {owner} que organice una visita. Te confirmará la hora; no hay nada reservado hasta que lo haga.",
    "This helper has ended.": "Este asistente ya terminó.",
    "This helper isn't shared with you.": "Este asistente no está compartido contigo.",
    "This helper doesn't exist.": "Este asistente no existe.",
    "Something went wrong. Try again.": "Algo salió mal. Inténtalo otra vez.",
    "The AI assistant is unavailable right now, so this answer is quoted straight from the company's notes.": "El asistente de IA no está disponible ahora; esta respuesta viene tal cual de las notas de la empresa.",
  },
};
const cache = new Map<string, string>(); // `${lang}\u0000${english}` -> translation

export const baseLang = (l?: string) => String(l || "").toLowerCase().split(/[-_]/)[0];
const validLang = (l?: string) => !!l && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l) && l !== "auto";

// Cheap language guess: script first, then common-word lists for Latin-script languages.
const WORDS: Record<string, RegExp> = {
  es: /\b(que|qu[ée]|el|la|los|las|una?|hay|est[aá]|cu[aá]l|d[oó]nde|c[oó]mo|por|para|con|mañana|hoy|av[ií]sa\w*|d[ií]le|necesito|puedo|tengo|gracias|hola)\b/gi,
  pt: /\b(n[aã]o|voc[eê]|est[aá]|obrigad[oa]|onde|quando|qual|amanh[aã]|hoje|preciso|posso|tenho|ol[aá]|uma?|com|para|isso)\b/gi,
  fr: /\b(le|les|des|est|une?|je|vous|nous|pas|o[uù]|quand|quel(le)?|demain|aujourd'hui|merci|bonjour|avec|pour|c'est)\b/gi,
  de: /\b(der|die|das|ist|nicht|und|ich|wir|sie|wo|wann|morgen|heute|danke|hallo|mit|f[uü]r|ein(e)?)\b/gi,
  it: /\b(il|lo|gli|non|sono|dove|quando|quale|domani|oggi|grazie|ciao|con|per|che|una?)\b/gi,
  tl: /\b(ang|ng|mga|sa|ako|ikaw|kami|saan|kailan|bukas|ngayon|salamat|po|ba|ito)\b/gi,
  pl: /\b(nie|jest|gdzie|kiedy|jutro|dzisiaj|dzi[eę]kuj[eę]|cze[sś][cć]|czy|jak|si[eę])\b/gi,
};
const EN_WORDS = /\b(the|is|are|what|where|when|how|can|do|does|i|you|we|my|our|today|tomorrow|please|thanks|and|of|to|it|there|tell|on)\b/gi;

export function detectLang(text?: string): string {
  const t = String(text || "");
  if (!t.trim()) return "en";
  if (/[぀-ヿ]/.test(t)) return "ja";
  if (/[가-힯ᄀ-ᇿ]/.test(t)) return "ko";
  if (/[一-鿿]/.test(t)) return "zh";
  if (/[Ѐ-ӿ]/.test(t)) return /[іїєґ]/i.test(t) ? "uk" : "ru";
  if (/[؀-ۿ]/.test(t)) return "ar";
  if (/[֐-׿]/.test(t)) return "he";
  if (/[ऀ-ॿ]/.test(t)) return "hi";
  if (/[฀-๿]/.test(t)) return "th";
  if (/[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t)) return "vi";
  if (/[¿¡ñ]/i.test(t)) return "es";
  if (/[ãõ]/i.test(t)) return "pt";
  if (/[ąęłńśźż]/i.test(t)) return "pl";
  if (/[ß]/.test(t)) return "de";
  const en = (t.match(EN_WORDS) ?? []).length;
  let best = "en", score = 0;
  for (const [l, re] of Object.entries(WORDS)) {
    const n = (t.match(re) ?? []).length;
    if (n > score) { best = l; score = n; }
  }
  return score > en ? best : "en";
}

/** Which language a reply should be in: the client's explicit pick, else the user's words. */
export function targetLang(opts: { userText?: string; lang?: string } = {}): string {
  if (validLang(opts.lang)) return opts.lang!;
  return detectLang(opts.userText);
}

const fill = (s: string, vars: Record<string, string> = {}) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

const TRANSLATE_SYS = (lang: string) =>
  `Translate the user's text from English into the language with BCP-47 code "${lang}". Translate exactly; keep names, numbers, codes and {placeholders} unchanged. Output only the translation, nothing else.`;

async function translateOne(lang: string, english: string): Promise<string | null> {
  if (offline()) return null;
  const sys = TRANSLATE_SYS(lang);
  const t0 = Date.now();
  let out = await openaiAnswer(sys, english, BUDGET_MS).catch(() => null);
  const left = BUDGET_MS - (Date.now() - t0);
  if (!out && left > 300) out = await claude(sys, english, { timeoutMs: left, model: "claude-haiku-5-5" }).catch(() => null);
  out = out?.trim().replace(/^["“](.*)["”]$/s, "$1") ?? null;
  // A translation that lost a placeholder is worse than English.
  const ph = english.match(/\{\w+\}/g) ?? [];
  if (!out || ph.some((p) => !out!.includes(p))) return null;
  return out;
}

/**
 * Say a fixed English sentence in the user's language. `english` may carry {placeholders}
 * filled from `vars` after translation, so the cache stays per template.
 */
export async function localize(english: string, opts: { userText?: string; lang?: string; vars?: Record<string, string> } = {}): Promise<string> {
  const lang = targetLang(opts);
  const b = baseLang(lang);
  if (b === "en") return fill(english, opts.vars);
  const seeded = SEED[lang]?.[english] ?? SEED[b]?.[english];
  if (seeded) return fill(seeded, opts.vars);
  const key = `${b}\u0000${english}`;
  if (cache.has(key)) return fill(cache.get(key)!, opts.vars);
  const got = await translateOne(lang, english);
  if (got) cache.set(key, got);
  return fill(got ?? english, opts.vars);
}

// ---------- UI string table ----------
const I18N_DIR = () => process.env.I18N_DIR ?? "data/i18n";
let enTable: Record<string, unknown> | null = null;
let esTable: Record<string, unknown> | null = null;
async function tables() {
  if (!enTable) {
    const mod = (await import(pathToFileURL(resolve("public/strings.js")).href)) as { EN: Record<string, unknown>; ES: Record<string, unknown> };
    enTable = mod.EN; esTable = mod.ES;
  }
  return { en: enTable!, es: esTable! };
}

/** Same keys, same shape, strings only (arrays keep their length), placeholders intact. */
export function sameShape(src: unknown, got: unknown): boolean {
  if (typeof src === "string") return typeof got === "string" && !!got.trim() && (src.match(/\{\w+\}/g) ?? []).every((p) => got.includes(p));
  if (Array.isArray(src)) return Array.isArray(got) && got.length === src.length && src.every((s, i) => sameShape(s, got[i]));
  if (src && typeof src === "object") {
    if (!got || typeof got !== "object" || Array.isArray(got)) return false;
    const a = Object.keys(src), b = Object.keys(got);
    return a.length === b.length && a.every((k) => sameShape((src as any)[k], (got as any)[k]));
  }
  return false;
}

/** Bump when the table gains sections (v2: the owner UI). Old cache files are ignored. Keep in step with public/strings.js. */
export const I18N_VERSION = 2;

const inflight = new Map<string, Promise<Record<string, unknown> | null>>();
/** The helper section and the owner section translate in parallel; both must validate. */
async function translateTable(lang: string, en: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { owner, ...helper } = en as { owner?: Record<string, unknown> } & Record<string, unknown>;
  const [h, o] = await Promise.all([translatePart(lang, helper), translatePart(lang, owner ?? {})]);
  if (!h || !o) return null;
  const out = { ...h, owner: o };
  return sameShape(en, out) ? out : null;
}
async function translatePart(lang: string, en: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (offline() || !process.env.OPENAI_API_KEY) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_FAST_MODEL ?? "gpt-4.1-mini", temperature: 0, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You translate an app's UI strings from English into the language with BCP-47 code "${lang}". Return a JSON object with exactly the same keys and nesting; every value a string (arrays keep the same length). Translate exactly and naturally for a mobile app; keep {placeholders}, numbers and the "…" character unchanged. Do not translate proper names: the product name "CrewBrain", people's, helpers' and company names, codes. Output only the JSON.` },
          { role: "user", content: JSON.stringify(en) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) { console.warn("[i18n] table failed", r.status); return null; }
    const j = (await r.json()) as any;
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "null");
    return sameShape(en, parsed) ? parsed : null;
  } catch (e) { console.warn("[i18n] table failed", (e as Error).name); return null; }
}

/** The UI table for `lang`: EN/ES static, others translated once and cached on disk. English on failure. */
export async function uiTable(raw: string): Promise<{ lang: string; version: number; strings: Record<string, unknown> }> {
  const { en, es } = await tables();
  const lang = validLang(raw) ? raw : "en";
  const b = baseLang(lang);
  const version = I18N_VERSION;
  if (b === "en") return { lang: "en", version, strings: en };
  if (b === "es") return { lang: "es", version, strings: es };
  // Versioned file name: a v1 cache (no owner section) is never read, so it gets regenerated.
  const file = join(I18N_DIR(), `${lang.toLowerCase()}.v${I18N_VERSION}.json`);
  try {
    if (existsSync(file)) {
      const got = JSON.parse(readFileSync(file, "utf8"));
      if (sameShape(en, got)) return { lang, version, strings: got };
    }
  } catch { /* re-translate */ }
  let p = inflight.get(lang);
  if (!p) { p = translateTable(lang, en); inflight.set(lang, p); p.finally(() => inflight.delete(lang)); }
  const got = await p;
  if (!got) return { lang: "en", version, strings: en };
  try { mkdirSync(I18N_DIR(), { recursive: true }); writeFileSync(file, JSON.stringify(got, null, 1)); } catch (e) { console.warn("[i18n] cache write", (e as Error).message); }
  return { lang, version, strings: got };
}
