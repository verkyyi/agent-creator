// Claude via the Agent SDK (no tools, one turn). Falls back to null so callers can use
// a deterministic path; the app must work offline and in tests.
// Auth is the ambient login: CLAUDE_CODE_OAUTH_TOKEN (read from the Keychain by
// scripts/start.sh) or ANTHROPIC_API_KEY. Neither ever reaches a log or a response.

// Public demo: only the cheaper models, whatever CLAUDE_MODEL or a caller asks for.
export const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const pickModel = (m?: string) => (MODELS as readonly string[]).includes(m ?? "") ? m! : DEFAULT_MODEL;

// Credential shapes that must never be echoed: an Anthropic key or OAuth token, a bearer value.
const SECRET_RE = /\b(?:sk-ant-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._~+/=-]{12,})/g;
export function redact(s: unknown): string {
  let out = String(s ?? "").replace(SECRET_RE, "[redacted]");
  for (const x of [process.env.CLAUDE_CODE_OAUTH_TOKEN, process.env.ANTHROPIC_API_KEY]) if (x && x.length >= 8) out = out.split(x).join("[redacted]");
  return out;
}

// For /api/health and the gate below: is there a key at all?
export const llmConfigured = () => !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);

// Whether the last call reached Claude; the UI says so in plain words when it didn't.
export const llmStatus = { ok: true, at: "" };
const mark = (ok: boolean) => { llmStatus.ok = ok; llmStatus.at = new Date().toISOString(); };

type Query = (args: { prompt: any; options: any }) => AsyncIterable<any>;
let queryImpl: Query | null = null;
// Tests swap the SDK for a stand-in.
export function setQuery(q: Query | null) { queryImpl = q; }
const enabled = () => llmConfigured() && (process.env.NODE_ENV !== "test" || !!queryImpl);

export async function claude(system: string, prompt: string, opts: { model?: string; timeoutMs?: number; images?: string[] } = {}): Promise<string | null> {
  if (!enabled()) { if (process.env.NODE_ENV !== "test") mark(false); return null; }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 20000);
  try {
    let content: any = prompt;
    if (opts.images?.length) {
      content = [
        ...opts.images.map((d) => {
          const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(d);
          return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : null;
        }).filter(Boolean),
        { type: "text", text: prompt },
      ];
    }
    const input = typeof content === "string" ? content : (async function* () {
      yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: "" } as any;
    })();
    const q: Query = queryImpl ?? ((await import("@anthropic-ai/claude-agent-sdk")).query as unknown as Query);
    let out: string | null = null;
    for await (const m of q({
      prompt: input,
      options: { model: pickModel(opts.model ?? process.env.CLAUDE_MODEL), maxTurns: 1, allowedTools: [], systemPrompt: system, settingSources: [], abortController: ac },
    })) {
      if (m?.type !== "result") continue;
      // "Not logged in", a proxy 403, a budget refusal: an error result is never a reply.
      if (m.is_error || m.subtype !== "success") { console.warn("[claude] failed:", redact(m.result ?? m.subtype)); out = null; }
      else out = m.result ?? null;
    }
    mark(!!out);
    return out?.trim() || null;
  } catch (e) {
    console.warn("[claude] failed:", redact((e as Error).message));
    mark(false);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
