import { query } from "@anthropic-ai/claude-agent-sdk";

// Claude via the Agent SDK (no tools, one turn). Falls back to null so callers can use
// a deterministic path; the app must work offline and in tests.
const ENABLED = () => !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) && process.env.NODE_ENV !== "test";

export async function claude(system: string, prompt: string, opts: { model?: string; timeoutMs?: number; images?: string[] } = {}): Promise<string | null> {
  if (!ENABLED()) return null;
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
    let out: string | null = null;
    for await (const m of query({
      prompt: input as any,
      options: { model: opts.model ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5", maxTurns: 1, allowedTools: [], systemPrompt: system, settingSources: [], abortController: ac } as any,
    })) {
      if ((m as any).type === "result") out = (m as any).result ?? null;
    }
    return out?.trim() || null;
  } catch (e) {
    console.warn("[claude] failed:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
