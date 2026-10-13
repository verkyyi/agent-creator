#!/usr/bin/env node
// Generate narration per segment with OpenAI TTS, plus the Spanish fake-mic question.
// Usage: node video/tts.mjs [--only=hook,split] [--force] [--test]   (only changed lines are regenerated)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, "out", "audio");
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const force = args.includes("--force");
const test = args.includes("--test");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
import { createHash } from "node:crypto";
const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    return execFileSync("security", ["find-generic-password", "-a", "crewbrain", "-s", "OPENAI_API_KEY", "-w"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("No OPENAI_API_KEY in env or keychain (account crewbrain, service OPENAI_API_KEY)");
  }
}
const KEY = apiKey();
const MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";

async function tts({ text, voice, instructions, format, file }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, voice, input: text, instructions, response_format: format }),
    });
    if (res.ok) {
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    }
    const body = await res.text();
    console.error(`TTS ${res.status} (attempt ${attempt}): ${body.slice(0, 300)}`);
    if (res.status < 500 && res.status !== 429) throw new Error(`TTS failed: ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error("TTS failed after retries");
}

export function probeDuration(file) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
}

const script = JSON.parse(readFileSync(join(DIR, "script.json"), "utf8"));
const voice = process.env.TTS_VOICE || script.voice || "cedar";

if (test) {
  const f = join(OUT, "test.mp3");
  await tts({ text: "Crewbrain test. One, two, three.", voice, instructions: script.ttsInstructions, format: "mp3", file: f });
  console.log(`test ok: ${f} ${probeDuration(f).toFixed(2)}s`);
  process.exit(0);
}

// durations.json: { "<id>": seconds, ..., "_hash": { "<id>": sha1(voice+instructions+text) } } — a changed line is regenerated.
const durations = {};
const durFile = join(OUT, "durations.json");
if (existsSync(durFile)) Object.assign(durations, JSON.parse(readFileSync(durFile, "utf8")));
const hashes = (durations._hash ??= {});

// Sam's own spoken sentence (Highlight 1): an mp3 for the soundtrack + a padded 48k WAV for Chromium's fake mic.
const ov = script.ownerVoice;
if (ov) {
  const mp3 = join(OUT, "owner-voice.mp3"), wav = join(OUT, "owner-voice.wav");
  const h = hash(ov.voice + ov.instructions + ov.text);
  if (force || !existsSync(mp3) || hashes["owner-voice"] !== h) {
    await tts({ text: ov.text, voice: ov.voice, instructions: ov.instructions, format: "mp3", file: mp3 });
    hashes["owner-voice"] = h;
  }
  // 5 s of silence first: the realtime session needs a moment to connect before Sam "speaks"; 4 s after for the VAD.
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", mp3, "-af", "adelay=5000,apad=pad_dur=4", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
  durations["owner-voice"] = probeDuration(mp3);
  console.log(`owner-voice ${durations["owner-voice"].toFixed(2)}s`);
}

await Promise.all(
  script.segments
    .filter((s) => !only.length || only.includes(String(s.id)))
    .map(async (s) => {
      if (s.audio) { // a segment voiced by a recorded line instead of the narrator
        durations[s.id] = durations[s.audio] ?? probeDuration(join(OUT, `${s.audio}.mp3`));
        console.log(`seg-${s.id} (uses ${s.audio}) ${durations[s.id].toFixed(2)}s`);
        return;
      }
      const f = join(OUT, `seg-${s.id}.mp3`);
      const h = hash(voice + script.ttsInstructions + s.narration);
      if (force || !existsSync(f) || hashes[s.id] !== h) {
        await tts({ text: s.narration, voice, instructions: script.ttsInstructions, format: "mp3", file: f });
        hashes[s.id] = h;
      }
      durations[s.id] = probeDuration(f);
      console.log(`seg-${String(s.id).padEnd(10)} narration ${durations[s.id].toFixed(2)}s`);
    })
);
writeFileSync(durFile, JSON.stringify(durations, null, 2));

// Spanish crew question -> 48k mono 16-bit PCM WAV for Chromium's fake mic.
const esMp3 = join(OUT, "es-question.mp3");
const esWav = join(OUT, "es-question.wav");
if (force || !existsSync(esWav)) {
  await tts({
    text: "¿Cuál es el código de la puerta para el trabajo de Oak Street?",
    voice: process.env.TTS_ES_VOICE || "ash",
    instructions: "Native Mexican Spanish speaker, a roofer on a job site asking a quick, casual question.",
    format: "mp3",
    file: esMp3,
  });
  // pad 1s silence before and 3s after so the realtime VAD catches a clean turn
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", esMp3, "-af", "adelay=1000,apad=pad_dur=3", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", esWav]);
}
console.log(`es-question.wav ${probeDuration(esWav).toFixed(2)}s`);
const total = script.segments.reduce((a, s) => a + (durations[s.id] || 0), 0);
console.log(`total narration ${total.toFixed(1)}s`);
