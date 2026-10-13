import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Claude via the Agent SDK (no tools, one turn). Falls back to null so callers can use
// a deterministic path; the app must work offline and in tests.
//
// Auth goes through the fleet's credential pool, the way claude-fleet's extras/web-chat
// does it: every call mints a SESSION credential with `fleet-session-cred.sh mint`, hands
// it plus the loopback proxy address to the SDK's child process, and revokes it when the
// call ends. The credential never reaches a log, a response or a file. Without the fleet
// proxy the ambient env (CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY) is used as before.

// Public demo: only the cheaper models, whatever CLAUDE_MODEL or a caller asks for.
export const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const pickModel = (m?: string) => (MODELS as readonly string[]).includes(m ?? "") ? m! : DEFAULT_MODEL;

export type Mint = { route: string; port: number; cred: string };
type Cred = { sid: string; mint: Mint | null };

// `fleet-session-cred.sh mint` prints `<route> TAB <port> TAB <credential>`.
export function parseMint(stdout: string): Mint | null {
  const [route, port, cred] = String(stdout || "").trim().split("\t");
  if (!route || !/^\d+$/.test(port || "") || !cred) return null;
  return { route, port: Number(port), cred };
}

// The env the SDK's `claude` child runs with: through the proxy when we have a minted
// credential, else the ambient login. Never the server's other secrets.
const DROP = ["ANTHROPIC_AUTH_TOKEN", "CLAUDE_SECURESTORAGE_CONFIG_DIR", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY", "FLEET_WORKER_CRED", "FLEET_WORKER_ASSERT", "TMUX", "TMUX_PANE", "HYDRA_DB_API_KEY", "OPENAI_API_KEY"];
export function agentEnv(base: NodeJS.ProcessEnv, mint: Mint | null): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !DROP.includes(k)) env[k] = v;
  if (mint) {
    delete env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${mint.port}`;
    env.CLAUDE_CODE_OAUTH_TOKEN = mint.cred;
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  }
  return env;
}

// Credential shapes that must never be echoed: a proxy session credential, an Anthropic key, a bearer value.
const SECRET_RE = /\b(?:fcp(?:1|n1|-h[12])\.[A-Za-z0-9._~+/=-]+|sk-ant-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._~+/=-]{12,})/g;
const liveCreds = new Set<string>();
export function redact(s: unknown): string {
  let out = String(s ?? "").replace(SECRET_RE, "[redacted]");
  for (const x of liveCreds) if (x.length >= 8) out = out.split(x).join("[redacted]");
  return out;
}

const credScript = () => process.env.FLEET_SESSION_CRED || join(homedir(), ".claude/fleet/bin/fleet-session-cred.sh");
function run(args: string[]): Promise<{ rc: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile("bash", [credScript(), ...args], { env: { ...process.env, FLEET_SESSION_WRAP: String(process.pid) }, timeout: 30000 },
      (err, stdout) => resolve({ rc: err ? (typeof (err as any).code === "number" ? (err as any).code : 1) : 0, stdout: String(stdout) }));
  });
}

let seq = 0;
// null = no usable credential at all (the caller degrades); { mint: null } = ambient login.
async function mintCred(): Promise<Cred | null> {
  const sid = `crewbrain-${process.pid}-${++seq}`;
  const ambient = !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
  if (!existsSync(credScript()) || (await run(["on"])).rc !== 0) return ambient ? { sid, mint: null } : null;
  const m = await run(["mint", "--provider", "claude", "--sid", sid]);
  if (m.rc === 3 || m.rc === 4) return ambient ? { sid, mint: null } : null;
  const mint = m.rc === 0 ? parseMint(m.stdout) : null;
  if (!mint) { console.warn(`[claude] no session credential from the fleet proxy (rc ${m.rc})`); return null; }
  liveCreds.add(mint.cred);
  return { sid, mint };
}
async function revokeCred(c: Cred) {
  if (!c.mint) return;
  await run(["revoke", "--sid", c.sid]);
  liveCreds.delete(c.mint.cred);
}

// For /api/health: is there any road to Claude (fleet proxy script or an ambient key)?
export const llmConfigured = () => existsSync(credScript()) || !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);

// Whether the last call reached Claude; the UI says so in plain words when it didn't.
export const llmStatus = { ok: true, at: "" };
const mark = (ok: boolean) => { llmStatus.ok = ok; llmStatus.at = new Date().toISOString(); };

type Query = (args: { prompt: any; options: any }) => AsyncIterable<any>;
let queryImpl: Query | null = null;
// Tests swap the SDK for a stand-in that records the env it was given.
export function setQuery(q: Query | null) { queryImpl = q; }
const enabled = () => process.env.NODE_ENV !== "test" || !!queryImpl;

export async function claude(system: string, prompt: string, opts: { model?: string; timeoutMs?: number; images?: string[] } = {}): Promise<string | null> {
  if (!enabled()) return null;
  let cred: Cred | null;
  try { cred = await mintCred(); } catch (e) { console.warn("[claude] mint:", redact((e as Error).message)); cred = null; }
  if (!cred) { mark(false); return null; }
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
      options: { model: pickModel(opts.model ?? process.env.CLAUDE_MODEL), maxTurns: 1, allowedTools: [], systemPrompt: system, settingSources: [], abortController: ac, env: agentEnv(process.env, cred.mint) },
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
    await revokeCred(cred).catch(() => {});
  }
}
