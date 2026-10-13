# CrewBrain demo video pipeline

Produces `video/out/crewbrain-demo-v3.mp4`: 1920x1080, 30 fps, H.264 + AAC, about 3:10, narration at −16 LUFS over a quiet synthesized music bed, subtitles burned in. A sidecar `out/crewbrain-demo-v3.srt` and a contact sheet are written too.

The story is built on three highlights: **say it, get a helper** (one spoken sentence in the voice overlay), **only what they should see** (a real HydraDB query as two audiences), and **access ends with the job** (Close Rex while Marco's chat is open).

## Run (from the repo root)

```sh
# a local app with the demo identities (reads keys from the Keychain)
PORT=8787 TEST_CLOCK=1 DEMO_LEGACY_TOKENS=1 ./scripts/start.sh &
node video/tts.mjs            # narration (only changed lines are regenerated) + Sam's spoken sentence
node video/hydra-proof.mjs    # the real HydraDB query for the proof scene
node video/tests-proof.mjs    # runs the test suite; the terminal scene shows its real output
node video/record.mjs         # drives the app, one webm + timing sidecar per shot
node video/compose.mjs        # builds out/crewbrain-demo-v3.mp4
node video/verify.mjs         # silence / narration gaps / freezes / loudness + contact sheet
```

Requirements: Node 22, `ffmpeg`/`ffprobe` (Homebrew), the `playwright` devDependency with chromium, the OpenAI and HydraDB keys in the Keychain (account `crewbrain`), the app at `BASE` (default `http://127.0.0.1:8787/`).

| Step | What it does | Output |
|---|---|---|
| `tts.mjs` | Narration per segment (`gpt-4o-mini-tts`, voice `cedar`); Sam's sentence (`ownerVoice`) as mp3 + a padded WAV for Chromium's fake mic | `out/audio/seg-<id>.mp3`, `owner-voice.{mp3,wav}`, `durations.json` |
| `record.mjs` | `--only=h1`: Sam taps the mic and speaks (fake mic) in the full-screen voice overlay, approves the card in the overlay sheet, texts the links, shows the QR. `--typed` falls back to the composer. `--only=main`: one sandbox, Juno + Rex set up off camera, then every other shot | `out/raw/<shot>.webm` + `<shot>.json` |
| `compose.mjs` | Scenes, caption cards, phone frames, split screen, highlight indicator, subtitles, crossfades, audio mix | `out/crewbrain-demo-v3.mp4` |
| `verify.mjs` | `silencedetect` (−38 dB, 1 s) on the mix and on the narration-only track, `freezedetect` (1.2 s), EBU R128 loudness, one frame per 10 s | report + `out/crewbrain-demo-v3-contact.png` |

## Pacing (data-driven, in `lib.mjs` + `compose.mjs`)

- A segment lasts `LEAD (0.15) + narration + TAIL (0.3) + hold + XFADE (0.3)`. The gap between two narration lines is about 0.45 s. Only the climax beats carry a `hold` (≤ 1.5 s of quiet in total). `minLen` keeps a scene up long enough to read.
- Narration is trimmed: leading and trailing silence are removed, and any pause inside a line is shortened to 0.55 s.
- App footage: `record.mjs` logs every wait (server reply, page load, polling) as a `cut` and every story beat as a `mark`. A segment takes `raw` from `from` to `to` (marks), removes the cuts, cuts frozen stretches over 1.2 s down to 0.9 s, then speeds the clip up (≤ 3x) or slows it down (≥ 0.5x) to the segment length. `out/fit-log.json` records what was cut, the speed and any held frames.
- A slow sub-pixel camera push (`perspective`, 2.4 % over a segment) runs under every shot, and the scenes' grid drifts, so no shot sits on a frozen frame.
- Audio: narration is normalized to −16 LUFS. The bed (a soft Am–F–C–G pad synthesized in `compose.mjs`, low-passed) sits at about −27 LUFS and is side-chain ducked under the voice, so there is never dead air.

## Editing

- **Words, order and footage** live in `script.json`. Each segment has an `id`, a `visual` (`scene`, `app` with `raw`/`from`/`to`, or `split` with `left`/`right`), the `narration`, optional `highlight` (1–3: the progress indicator), `hold`, `minLen`, and the caption-card text (`kicker`, `headline`, `caption`). `audio: "owner-voice"` plays Sam's own sentence instead of the narrator. After editing, run `tts.mjs` (only changed lines are regenerated) and `compose.mjs`.
- **Scenes** are `scenes/*.html` (1920x1080, tokens in `base.css`). Icons come from `public/icons.js` (`<i data-i="house"></i>`); there is no emoji anywhere. Animations must be finite CSS animations. The renderer pauses them and steps through them frame by frame.
- **Phone placement** is `PHONE` in `lib.mjs`; it must match `.shadow` in `scenes/card.html` and the hole in `scenes/phone-frame.html`. The split screen puts phones at x=420 and x=1036 (`scenes/split.html`).
- **HydraDB proof**: the index is shared with the public demo. `hydra-proof.mjs` leaves out items visitors saved there (random `src_<hex>` ids) and shows the company's own sources.

Note: this Homebrew ffmpeg has no libass or drawtext, so subtitles and captions are rendered as PNGs with Playwright and overlaid.
