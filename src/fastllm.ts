// A fast second opinion for live helper answers: same grounded prompt, OpenAI's small
// model. Used only when Claude hasn't answered within a short budget, so a visitor never
// waits on a cold or busy Claude process. Never logs the key.
export async function openaiAnswer(system: string, prompt: string, timeoutMs = 8000): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || process.env.NODE_ENV === "test") return null;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_FAST_MODEL ?? "gpt-4.1-mini", temperature: 0.2, max_tokens: 220, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) { console.warn("[openai] answer failed", r.status); return null; }
    const j = (await r.json()) as any;
    return j?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) { console.warn("[openai] answer failed", (e as Error).name); return null; }
}

// Claude first; if it hasn't answered after `budgetMs`, race OpenAI with the same prompt.
export async function raceAnswer(claudeCall: () => Promise<string | null>, system: string, prompt: string, budgetMs = 2500): Promise<string | null> {
  const c = claudeCall();
  let started = false;
  const fallback = new Promise<string | null>((resolve) => setTimeout(() => { started = true; openaiAnswer(system, prompt).then(resolve); }, budgetMs));
  return Promise.race([c.then((x) => (x ?? fallback)), fallback.then((x) => (x ?? c))]).then((x) => { void started; return x; });
}
