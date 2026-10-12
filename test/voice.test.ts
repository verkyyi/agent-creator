import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { voiceRoutes } from "../src/voice.ts";

const FAKE_KEY = "sk-test-SECRETKEY1234567890";
const realFetch = globalThis.fetch;
let calls: { url: string; init: any }[] = [];

function stubFetch(status = 200, body: any = { value: "ek_test123", expires_at: 1900000000, session: { model: "gpt-realtime" } }) {
  calls = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

function post(body: any) {
  return voiceRoutes.request("/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.OPENAI_REALTIME_MODEL;
  delete process.env.OPENAI_REALTIME_VOICE;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.OPENAI_API_KEY;
});

test("503 voice_unavailable without OPENAI_API_KEY", async () => {
  delete process.env.OPENAI_API_KEY;
  stubFetch();
  const res = await post({ mode: "creator" });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "voice_unavailable" });
  assert.equal(calls.length, 0);
});

test("creator: mints at client_secrets with gpt-realtime and exactly one relay tool", async () => {
  process.env.OPENAI_API_KEY = FAKE_KEY;
  stubFetch();
  const res = await post({ mode: "creator", persona: { name: "Rex", tone: "friendly" } });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes(FAKE_KEY), "key must not leak");
  const json = JSON.parse(text);
  assert.equal(json.clientSecret, "ek_test123");
  assert.equal(json.expiresAt, 1900000000);
  assert.equal(json.model, "gpt-realtime");
  assert.equal(json.relayPath, "api/creator/message");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/realtime/client_secrets");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${FAKE_KEY}`);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.session.type, "realtime");
  assert.equal(sent.session.model, "gpt-realtime");
  assert.equal(sent.session.audio.output.voice, "marin");
  assert.equal(sent.session.audio.input.turn_detection.type, "server_vad");
  assert.ok(sent.session.audio.input.transcription.model);
  assert.equal(sent.session.tools.length, 1);
  assert.equal(sent.session.tools[0].name, "relay");
  assert.equal(sent.session.tools[0].type, "function");
  assert.match(sent.session.instructions, /You speak as Rex; tone: friendly/);
});

test("agent: relayPath is relative agent chat path", async () => {
  process.env.OPENAI_API_KEY = FAKE_KEY;
  stubFetch();
  const res = await post({ mode: "agent", agentId: "ag_42" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.relayPath, "api/agents/ag_42/chat");
  assert.ok(!json.relayPath.startsWith("/"));
});

test("upstream failure: 502 voice_upstream without leaking the key", async () => {
  process.env.OPENAI_API_KEY = FAKE_KEY;
  stubFetch(401, { error: { message: `Incorrect API key provided: ${FAKE_KEY}` } });
  const res = await post({ mode: "creator" });
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.ok(!text.includes(FAKE_KEY));
  assert.equal(JSON.parse(text).error, "voice_upstream");
});
