# Crewbrain demo video pipeline

Produces `video/out/crewbrain-demo.mp4`: 1920x1080, 30 fps, H.264 + AAC, ≤ 5:00, loudness-normalized to −16 LUFS, subtitles burned in. A sidecar `out/crewbrain-demo.srt` is written too.

## Run (from the repo root)

```sh
node video/tts.mjs && node video/record.mjs && node video/compose.mjs
```

Requirements: Node 22, `ffmpeg`/`ffprobe` (Homebrew), the `playwright` devDependency with chromium installed (`npx playwright install chromium`), the OpenAI key in the keychain (`security find-generic-password -a crewbrain -s OPENAI_API_KEY`) or in `OPENAI_API_KEY`, and the app running at `BASE` (default `http://127.0.0.1:8787/`).

| Step | What it does | Output |
|---|---|---|
| `tts.mjs` | Narration per segment (`gpt-4o-mini-tts`, voice `cedar`), durations, Spanish fake-mic question | `out/audio/seg-N.mp3`, `durations.json`, `es-question.wav` |
| `record.mjs` | Drives the real app in a 390x844 phone viewport, one recorded context per segment/persona | `out/raw/seg-3.webm`, `seg-4.webm`, `seg-5-a-juno.webm`, … |
| `compose.mjs` | Renders scenes, caption cards, phone frame and subtitles, fits footage, crossfades, mixes audio | `out/crewbrain-demo.mp4` |

Useful flags:

- `node video/tts.mjs --test`: one short TTS call. `--force` regenerates everything. `--only=3,4` regenerates only those segments. `TTS_VOICE=marin` changes the voice.
- `BASE=http://127.0.0.1:8787/ node video/record.mjs --only=5,6` re-records only those segments. `state.json` in `out/raw/` remembers the Juno/Rex links from segment 4.
- `node video/record.mjs --placeholder` records the public landing page as stand-in footage (`raw/placeholder.webm`). `compose.mjs` uses it for any segment that has no real footage.
- `node video/compose.mjs --force-scenes` re-renders the animated scenes. Without the flag, scenes are cached until their HTML changes. `--only-segments` builds the per-segment clips without the final assembly.

## Editing

- **Words and timing** live in `script.json`. Each segment has a `duration` (its slot), `narration`, and the caption card text (`kicker`, `headline`, `caption`). A segment is stretched to fit its narration plus 1.5 s of lead and tail. Slack is then squeezed out so the total stays ≤ 300 s (see `lib.mjs`). After changing narration, run `tts.mjs --only=N --force`.
- **Scenes** are in `scenes/*.html` (1920x1080, landing-page tokens in `base.css`). Animations must be finite CSS animations. The renderer pauses them and steps through them frame by frame, so the timing is deterministic.
- **App footage** is fitted to the segment. Footage that runs short holds its last frame. Footage that runs long is sped up to at most 4x; beyond that only the tail is kept. Multiple raw files for one segment are concatenated in name order.
- **Phone placement** is set by `PHONE` in `lib.mjs`, which must match `.shadow` in `scenes/card.html` and the hole in `scenes/phone-frame.html`.

Note: this Homebrew ffmpeg has no libass or drawtext, so subtitles and captions are rendered as PNGs with Playwright and overlaid.
