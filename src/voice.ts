import { Hono } from "hono";

// OpenAI Realtime (GA) — speech-to-speech over WebRTC from the browser.
// The server only mints an ephemeral client secret; OPENAI_API_KEY never leaves this process.
// Docs: https://developers.openai.com/api/docs/guides/realtime-webrtc
export const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
export const TRANSCRIBE_MODEL = "gpt-4o-transcribe";

export type VoiceMode = "creator" | "agent";
export type Persona = { name?: string; tone?: string };

export const RELAY_TOOL = {
  type: "function",
  name: "relay",
  description: "Send what the user said, verbatim, to the Crewbrain backend and get the reply.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "The user's exact words, in the language they spoke." },
    },
    required: ["text"],
    additionalProperties: false,
  },
} as const;

const BASE_INSTRUCTIONS = [
  "You are only a voice interface. You never answer on your own.",
  "For EVERY user utterance, call the `relay` tool with the user's exact words: a faithful transcription in the same language they spoke. Never paraphrase, summarize, translate, or answer it yourself.",
  "While waiting for the tool you may say one very short filler such as \"One sec.\" in the user's language.",
  "When the tool returns, speak its `reply` naturally and nearly verbatim, in the user's language (if the user spoke Spanish, speak Spanish and translate the reply faithfully).",
  "Never add facts. Never claim an action happened unless the reply says so. If the reply refuses or says the helper has ended, say so plainly.",
  "Be brief.",
].join("\n");

export function buildInstructions(persona?: Persona): string {
  const name = persona?.name?.trim();
  const tone = persona?.tone?.trim();
  if (!name && !tone) return BASE_INSTRUCTIONS;
  const parts: string[] = [];
  if (name) parts.push(`You speak as ${name}`);
  if (tone) parts.push(`tone: ${tone}`);
  return `${BASE_INSTRUCTIONS}\n${parts.join("; ")}.`;
}

export function relayPathFor(mode: VoiceMode, agentId?: string): string {
  return mode === "creator" ? "api/creator/message" : `api/agents/${encodeURIComponent(agentId ?? "")}/chat`;
}

export function buildSessionConfig(persona?: Persona) {
  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
  const voice = process.env.OPENAI_REALTIME_VOICE ?? "marin";
  return {
    session: {
      type: "realtime",
      model,
      instructions: buildInstructions(persona),
      audio: {
        input: {
          transcription: { model: TRANSCRIBE_MODEL },
          turn_detection: { type: "server_vad", silence_duration_ms: 600 },
        },
        output: { voice },
      },
      tools: [RELAY_TOOL],
      tool_choice: "auto",
    },
  };
}

export type MintResult =
  | { ok: true; clientSecret: string; expiresAt: number | null; model: string }
  | { ok: false; status: number; detail: string };

/** Mint an ephemeral Realtime client secret. Never returns or logs the API key. */
export async function mintClientSecret(apiKey: string, persona?: Persona): Promise<MintResult> {
  const config = buildSessionConfig(persona);
  let res: Response;
  try {
    res = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    return { ok: false, status: 0, detail: name === "TimeoutError" ? "timeout" : "network_error" };
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${res.status}`;
    return { ok: false, status: res.status, detail: scrub(msg, apiKey) };
  }
  // GA shape: { value, expires_at, session }. Tolerate legacy { client_secret: { value, expires_at } }.
  const value = body?.value ?? body?.client_secret?.value;
  const expiresAt = body?.expires_at ?? body?.client_secret?.expires_at ?? null;
  if (typeof value !== "string" || !value) return { ok: false, status: res.status, detail: "no_client_secret" };
  return { ok: true, clientSecret: value, expiresAt, model: body?.session?.model ?? config.session.model };
}

function scrub(s: string, key: string): string {
  let out = key ? s.split(key).join("[redacted]") : s;
  out = out.replace(/sk-[A-Za-z0-9_\-*]{6,}/g, "[redacted]");
  return out.slice(0, 300);
}

export const voiceRoutes = new Hono();

voiceRoutes.post("/session", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "voice_unavailable" }, 503);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const mode: VoiceMode = body?.mode === "agent" ? "agent" : body?.mode === "creator" ? "creator" : (null as any);
  if (!mode) return c.json({ error: "bad_request", detail: "mode must be creator or agent" }, 400);
  const agentId = typeof body?.agentId === "string" ? body.agentId : undefined;
  if (mode === "agent" && !agentId) return c.json({ error: "bad_request", detail: "agentId required" }, 400);
  const persona: Persona | undefined =
    body?.persona && typeof body.persona === "object"
      ? {
          name: typeof body.persona.name === "string" ? body.persona.name.slice(0, 80) : undefined,
          tone: typeof body.persona.tone === "string" ? body.persona.tone.slice(0, 200) : undefined,
        }
      : undefined;

  const r = await mintClientSecret(apiKey, persona);
  if (!r.ok) return c.json({ error: "voice_upstream", detail: r.detail }, 502);
  return c.json({
    clientSecret: r.clientSecret,
    expiresAt: r.expiresAt,
    model: r.model,
    relayPath: relayPathFor(mode, agentId),
  });
});
