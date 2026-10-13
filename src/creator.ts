// The creator's engine: a tool-using model that decides what to ask and do for the owner.
// core.ts builds the tools (thin wrappers over its own functions, which keep every
// guarantee: validation, scoping, approval) and the system prompt; this file only runs a
// model over them. Two engines with the same tools: the Claude Agent SDK (in-process MCP
// server) and OpenAI chat-completions function calling. CREATOR_ENGINE=claude|openai|auto
// (auto: Claude, falling back to OpenAI on error or when Claude takes longer than 10 s).
import { z } from "zod";
import { llmConfigured, redact } from "./llm.ts";

export type ToolSpec = {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  run: (args: any) => Promise<unknown>;
};
export type Turn = { role: "user" | "assistant"; content: string };
export type EngineInput = {
  system: string;
  history: Turn[];
  message: string;
  tools: ToolSpec[];
  /** true once a tool with a visible effect (a proposal, a card) ran: never re-run the turn then. */
  touched: () => boolean;
};
/** Returns the model's final reply, or null when it couldn't produce one. */
export type CreatorEngine = (input: EngineInput) => Promise<string | null>;

let stub: CreatorEngine | null = null;
/** Tests swap the engine for a scripted stand-in (like llm.setQuery for plain calls). */
export function setCreatorEngine(e: CreatorEngine | null) { stub = e; }

const MAX_TURNS = 6;
const CLAUDE_MODEL = "claude-sonnet-5-5";
const SERVER = "crewbrain";

// Tool errors go back to the model as data so it can ask the owner; never thrown.
async function runTool(t: ToolSpec, args: unknown): Promise<{ text: string; error: boolean }> {
  try {
    const parsed = z.object(t.schema).safeParse(args ?? {});
    if (!parsed.success) return { text: JSON.stringify({ error: "invalid_arguments", detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }), error: true };
    const out = await t.run(parsed.data);
    const error = !!(out && typeof out === "object" && "error" in (out as any));
    return { text: JSON.stringify(out ?? { ok: true }), error };
  } catch (e) {
    return { text: JSON.stringify({ error: redact((e as Error).message) }), error: true };
  }
}

const transcript = (history: Turn[], message: string) =>
  (history.length ? `<conversation_so_far>\n${history.map((h) => `${h.role === "user" ? "Owner" : "You"}: ${h.content}`).join("\n")}\n</conversation_so_far>\n\n` : "") +
  `Owner: ${message}`;

export async function claudeEngine(input: EngineInput, timeoutMs = 45_000): Promise<string | null> {
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  const server = sdk.createSdkMcpServer({
    name: SERVER, version: "1.0.0", alwaysLoad: true,
    tools: input.tools.map((t) => sdk.tool(t.name, t.description, t.schema as any, async (args: any) => {
      const r = await runTool(t, args);
      return { content: [{ type: "text" as const, text: r.text }], ...(r.error ? { isError: true } : {}) };
    })),
  });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let out: string | null = null;
    for await (const m of sdk.query({
      prompt: transcript(input.history, input.message),
      options: {
        model: CLAUDE_MODEL, systemPrompt: input.system, maxTurns: MAX_TURNS, settingSources: [], strictMcpConfig: true,
        tools: [], mcpServers: { [SERVER]: server }, allowedTools: input.tools.map((t) => `mcp__${SERVER}__${t.name}`),
        abortController: ac,
      } as any,
    }) as AsyncIterable<any>) {
      if (m?.type !== "result") continue;
      if (m.is_error || m.subtype !== "success") { console.warn("[creator] claude failed:", redact(m.result ?? m.subtype)); out = null; }
      else out = m.result ?? null;
    }
    return out?.trim() || null;
  } catch (e) {
    console.warn("[creator] claude failed:", redact((e as Error).message));
    return null;
  } finally { clearTimeout(timer); }
}

export async function openaiEngine(input: EngineInput, timeoutMs = 30_000): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const tools = input.tools.map((t) => {
    const { $schema, ...parameters } = z.toJSONSchema(z.object(t.schema)) as any;
    return { type: "function", function: { name: t.name, description: t.description, parameters } };
  });
  const messages: any[] = [{ role: "system", content: input.system }, ...input.history, { role: "user", content: input.message }];
  const deadline = Date.now() + timeoutMs;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.OPENAI_FAST_MODEL ?? "gpt-4.1-mini", temperature: 0.3, messages, tools }),
        signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
      });
      if (!r.ok) { console.warn("[creator] openai failed", r.status); return null; }
      const msg = ((await r.json()) as any)?.choices?.[0]?.message;
      if (!msg) return null;
      messages.push(msg);
      if (!msg.tool_calls?.length) return msg.content?.trim() || null;
      for (const call of msg.tool_calls) {
        const t = input.tools.find((x) => x.name === call.function?.name);
        let args: unknown = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* invalid JSON: schema error below */ }
        const res = t ? await runTool(t, args) : { text: JSON.stringify({ error: "unknown_tool" }), error: true };
        messages.push({ role: "tool", tool_call_id: call.id, content: res.text });
      }
    }
    return null;
  } catch (e) {
    console.warn("[creator] openai failed", (e as Error).name);
    return null;
  }
}

// Claude first; on error, or no answer within 10 s, OpenAI takes the turn — unless Claude
// already did something visible (a proposal, a card), which must not happen twice.
export async function autoEngine(input: EngineInput): Promise<string | null> {
  const budget = Number(process.env.CREATOR_CLAUDE_BUDGET_MS ?? 10_000);
  const c = claudeEngine(input, budget);
  const out = await c;
  if (out || input.touched()) return out;
  return openaiEngine(input);
}

/** The engine for this request, or null: offline (tests, no keys) the deterministic fallback runs. */
export function creatorEngine(): CreatorEngine | null {
  if (stub) return stub;
  if (process.env.NODE_ENV === "test") return null;
  const claude = llmConfigured(), openai = !!process.env.OPENAI_API_KEY;
  switch (process.env.CREATOR_ENGINE ?? "auto") {
    case "claude": return claude ? (i) => claudeEngine(i) : null;
    case "openai": return openai ? (i) => openaiEngine(i) : null;
    default: return claude ? (openai ? autoEngine : (i) => claudeEngine(i)) : openai ? (i) => openaiEngine(i) : null;
  }
}
