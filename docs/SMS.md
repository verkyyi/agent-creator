# SMS: text your helper

Homeowners and crew can text their helper instead of opening a link. A text from a known number
runs the same `core.chat` as the web app, so the same rules apply: tenant, audience, lifecycle
(an ended helper answers with its ended sentence), and gated actions ("Found rot, logging it"
files an issue in the owner's inbox). Replies come back as plain text: up to 3 SMS-sized parts,
with a short `Source: …` line when knowledge was used.

The channel works with any provider. Twilio is the first adapter (`src/sms.ts`); the inbound
webhook and the simulator are in `src/smsroutes.ts`. **SMS is off until the Twilio credentials are
present.** Until then everything can be tried in the simulator.

## Simulator first (no Twilio needed)

With `TEST_CLOCK=1` (the default in `scripts/start.sh`), sign in as the owner and open
`sms.html` (for example `https://macmini.tail435588.ts.net:10000/crewbrain/sms.html`). Pick a person
(Marco, Tess, Anita or Raj have fictional demo numbers), then text. The page posts to `sms/simulate`,
which uses the same handler as the real webhook, minus the signature check. The thread also shows
texts CrewBrain sends to that person (owner answers, approved relays, invitations), marked
`simulated`.

Try: as Marco, "Found rot, logging it" (an issue appears in Sam's inbox) or "switch"; as Anita, a
question the helper can't answer, then answer it from Sam's inbox and watch the text arrive.

## What to provide to turn on real SMS

1. **Twilio Account SID** (starts with `AC`, Twilio Console → Account info).
2. **Twilio Auth Token** (same page). It authenticates outbound sends and checks inbound signatures.
3. **One SMS-capable Twilio phone number** in E.164, for example `+14155550100`. For US numbers,
   complete A2P 10DLC registration (or use a verified toll-free number), or carriers will block texts.
4. **The webhook URL** on that number: Twilio Console → Phone Numbers → your number → Messaging →
   "A message comes in" → Webhook, **HTTP POST**:
   `https://macmini.tail435588.ts.net:10000/crewbrain/sms/twilio`

Store them in the Keychain (read by `scripts/start.sh` at start, never written to disk):

```sh
security add-generic-password -a crewbrain -s TWILIO_ACCOUNT_SID -w 'AC…'
security add-generic-password -a crewbrain -s TWILIO_AUTH_TOKEN -w '…'
security add-generic-password -a crewbrain -s TWILIO_FROM_NUMBER -w '+1…'
security add-generic-password -a crewbrain -s SMS_PROVIDER -w twilio   # optional; "off" disables SMS
```

Then restart the server. `GET api/health` shows `"sms": "twilio"`.

Optional environment variables:

- `SMS_WEBHOOK_URL`: the exact URL Twilio signs. Set this if the proxy changes the host or path, or
  the signature check fails (403 in Twilio's debugger). Default: the request's public URL.
- `SMS_INDEX_FILE` (default `data/sms-index.json`) and `SMS_SANDBOX_DAILY_MAX` (default 30 real
  texts per sandbox per day, a guard against abuse of the public demo).

## How a number finds its sandbox

Every visitor has their own sandbox, so an inbound text has to be mapped to one. When the owner
saves a real number (the creator's `set_phone` card) or sends an SMS invitation, the server
writes `phone → { sandboxId, memberId }` to `data/sms-index.json`. Inbound texts look up the
index, check that the member in that sandbox still has the number, and run there. A number that
isn't indexed gets "This number isn't connected to a CrewBrain helper."

The demo's fictional numbers (555-0100 to 555-0199) are never indexed and never texted.
Outbound texts to them are only logged, as `simulated`.

## Keywords

- `STOP` (also STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT): no more outbound texts to this person;
  `START` turns them back on. Twilio also enforces opt-out on its side.
- `HELP`: what this number is.
- `SWITCH`: lists the person's live helpers; `SWITCH 2` or `SWITCH Rex` picks one. Without a pick,
  the most recently published live helper answers.

## Outbound

When the person has a phone and SMS is on, these are also texted (fire-and-forget, recorded as
`sms.outbound` events):

- the owner's answer to their question (inbox → Send),
- an approved crew update (relay), to each household member it reached,
- the helper invitation, from the share card's "Text from CrewBrain number" (the existing "Text"
  button still opens the owner's own Messages app).

MMS photos are fetched from `MediaUrl0` with the account's basic auth and passed to the helper
as the photo, the same as in the web app.
