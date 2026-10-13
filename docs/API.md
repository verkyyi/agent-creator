# CrewBrain API contract (MVP)

The server is Hono on Node 22 (`src/server.ts`). It serves `public/` statically and the JSON API under `api/`.
The app is mounted at BOTH `/` and `/crewbrain/` (Tailscale Funnel publishes it at
`https://macmini.tail435588.ts.net:10000/crewbrain/`). **Frontend code must use relative URLs only**
(`fetch("api/me")`, `href="a.html?id=..."`), never a leading slash.

Auth is a cookie session (`cb_session`, httpOnly). A person signs in by opening their personal link
`i/<token>` which sets the cookie and redirects to `./` (owner) or `a.html?id=<agentId>` (homeowner/crew).
`demo.html` lists the demo identities with their links (for judges).

Errors: `{ error: string, reply?: string }` with 401 (no session), 403 (not allowed), 404, 410 (helper ended).
When a chat is refused, `reply` holds the sentence to show/speak.

## Shared

- `GET api/me` → `{ member: { id, name, role: "owner"|"customer", tenantId, tenantName }, helpers: AgentSummary[] }`
  (`helpers` = helpers this person may open; for owners all helpers of the company)

## Owner

- `POST api/creator/message` `{ text }` → `{ reply: string, proposal?: Proposal, agent?: AgentSummary, replyDraft?: { inboxId, to, via, text }, card?: Card, cards?: Card[] }`
  The creator is a tool-using model (`src/creator.ts`; `CREATOR_ENGINE=claude|openai|auto`, auto = Claude Sonnet via the
  Agent SDK, OpenAI `OPENAI_FAST_MODEL ?? gpt-4.1-mini` on error or after 10 s). Each message it gets a short system prompt,
  the company context, the last 12 creator-log turns and tools: `get_context`, `propose_helper`, `propose_edit`,
  `close_helper`, `change_lock`, `share_links`, `show_helpers`, `whats_new`, `draft_reply`, `remember_note`, `ask_brain`,
  `job_status`, `set_phone`. It replies in the owner's language. Tools only PROPOSE: a proposal is `awaiting_approval` until
  `POST api/agents/:id/approve`; close and lock changes come back as `confirm` cards; replies as `replyDraft`.
  The server picks sources (template × owner scope × allowed locks × job) and validates audience and end time (future).
  `card` is the first card; `cards` is present when there are several. Offline (tests, no keys) a deterministic keyword
  fallback answers.
- `GET api/creator/log` → `{ messages: { role: "owner"|"creator", text, at, proposal?: Proposal }[] }`
- `POST api/agents/:id/approve` `{ rev }` → `{ agent: AgentSummary, links: { memberId, name, url }[] }`
  `url` is an absolute personal link for that audience member.
- `POST api/agents/:id/close` → `{ agent: AgentSummary }` (revokes; job-only knowledge relocks to Office only)
- `GET api/agents` → `{ agents: AgentSummary[] }`
- `GET api/agents/:id/links` → `{ links: { memberId, name, url, smsReady?: true }[] }` (`smsReady`: the person has a phone and SMS is on or simulated)
- `POST api/members/:id/phone` `{ phone }` → `{ member: { id, name, phone }, reply }` owner-only, same tenant. The tap on the
  creator's `set_phone` confirm card. Any common format is normalized to E.164 (`"415-867-5309"` → `+14158675309`); `""`
  clears it. 400 `bad_phone`, 409 `phone_taken`. A real (non 555-01xx) number is written to the phone index (`data/sms-index.json`).
- `POST api/agents/:id/sms-invite` `{ memberId? }` → `{ sent: string[], skipped: string[], reply }` the share card's
  "Text from CrewBrain number": texts the invitation (personal link + "text your questions to this number") to everyone in
  the audience with a phone (or one person). 409 `not_live` / `sms_off`. Fictional 555-01xx numbers are logged as simulated, never sent.
- `GET api/sms` → `{ available, configured, simulator }`
- `GET api/brain` → `{ items: BrainItem[] }`
- `POST api/brain/:id/label` `{ sharing: "internal"|"crew"|"customer" }` → `{ item: BrainItem }`
- `POST api/brain/capture` `{ imageDataUrl: string, hint?: string }` → `{ draft: { id, title, text, suggestedSharing } }`
  (Claude reads the photo; nothing is usable until approved)
- `POST api/brain/drafts/:id/approve` `{ title?, text?, sharing }` → `{ item: BrainItem }`
- `GET api/inbox` → `{ items: InboxItem[] }`
- `POST api/inbox/:id/answer` `{ text, sharing? }` → `{ item: InboxItem, knowledge?: BrainItem }` (answer becomes a new knowledge version)
  For `kind: "relay"` this is the owner's approval: `text` (possibly edited) is delivered to every member of every ACTIVE
  homeowner helper whose audience shares the relay's job, as a history message with `action.kind: "owner_update"`;
  → `{ item, delivered: { group, members } }`. 409 `no_household_helper` (item stays open) when none is live.
- `POST api/inbox/:id/dismiss` → `{ item: InboxItem }` (for a relay: "Not now", nothing is delivered)
- `POST api/clock` `{ advanceMinutes?: number, reset?: true }` → `{ now }` (demo/test clock; only when TEST_CLOCK=1)

Outbound texts (fire-and-forget, `sms.outbound` event, logged in the sandbox's SMS thread) go to a person with a phone when SMS
is configured: the owner's inbox answer (`POST api/inbox/:id/answer`, non-relay) to the asker; an approved relay to every
household member it reached; `sms-invite`. Opted-out (STOP) people and 555-01xx numbers are never texted.

## SMS (outside `api/`, see docs/SMS.md)

- `POST sms/twilio` (Twilio webhook, form-encoded; no cookie) → `text/xml` TwiML `<Response><Message>…</Message>…</Response>`.
  403 unless `X-Twilio-Signature` matches (HMAC-SHA1 over `SMS_WEBHOOK_URL` or the request's public URL + sorted params,
  keyed by `TWILIO_AUTH_TOKEN`). `From` → member via the phone index → their sandbox; the member's picked or most recent
  live helper answers through the same `core.chat` as the web. Up to 3 parts of ≤ 160 chars, the last may be `Source: …`.
  Keywords: `STOP`/`START`, `HELP`, `SWITCH [n|name]`. MMS `MediaUrl0` (image) becomes the chat's `imageDataUrl`.
  404 when SMS isn't configured.
- `GET sms/simulate` → `{ configured, members: { id, name, phone, optedOut }[] }` · `GET sms/simulate/thread?member=` →
  `{ messages: { at, dir: "in"|"out", memberId, body, status, kind? }[] }` · `POST sms/simulate` `{ member, text, imageDataUrl? }`
  → `{ parts, twiml }`. Owner session + TEST_CLOCK=1 only (else 403); same handler as the webhook, no signature, the owner's
  sandbox. `sms.html` (the simulator page) is 404 otherwise.

## Homeowner / crew (and owner previewing)

- `GET api/agents/:id/public` → `{ id, name, avatar, tone, job, state, expiresAt, endsLabel, tenantName, ownerName, canDo: { tool, name }[] }`
- `POST api/agents/:id/chat` `{ text, imageDataUrl?: string }` →
  `{ reply, citations: { title, section, version }[], action?: { kind: "issue_logged"|"walkthrough_requested"|"relay_requested", summary }, refused?: true }`
  410 `{ error: "ended", state: "expired"|"revoked", reply }` once the helper ended.
- `POST api/agents/:id/chat?stream=1` (same body) → `text/event-stream`, events in order:
  `status` `{ text }` at once · `sources` `{ citations }` right after retrieval (before Claude) ·
  `action` `{ kind, summary }` when a write action happens · `reply` (the non-stream body plus `ms`, server time) · `done` `{}`.
  A 403/404/410 is a single `error` event whose data is the non-stream JSON body. A 401 (no session) stays a plain JSON 401.
  Helper answers use `claude-haiku-5-5` when the retrieved excerpts total < 1500 chars, else `claude-sonnet-5-5`.
- `GET api/agents/:id/history` → `{ messages: { role: "user"|"helper", text, at, citations?, action? }[] }`
- `POST api/voice/session` `{ mode: "creator"|"agent", agentId? }` → `{ clientSecret, expiresAt, model, relayPath }` (503 when voice is unavailable)

## Types

```ts
type AgentSummary = {
  id: string; name: string; avatar: string; templateId: "homeowner_helper" | "crew_briefing";
  state: "draft" | "awaiting_approval" | "active" | "expired" | "revoked";
  audienceName: string; audienceCount: number; expiresAt: string; endsLabel: string; activeRev?: number; pendingRev?: number;
};
type Proposal = {
  agentId: string; rev: number; name: string; avatar: string; tone: string; job: string;
  summary?: string;                              // one sentence in the owner's language (model-written)
  audience: { groupId: string; name: string; count: number };
  knows: { id: string; title: string; version: number }[];
  canCheck: { tool: string; name: string }[];   // read tools
  canDo: { tool: string; name: string }[];      // write actions (log issue, request walkthrough)
  cantSee: string[];                             // titles of excluded items, readable
  endsAt: string; endsLabel: string;            // e.g. "Fri Oct 16, 6:00 PM PT"
  escalation: string;                            // owner name
  changes?: string[];                            // for edits: what changed vs active revision
};
type BrainItem = {
  id: string; title: string; version: number; origin: "photo" | "drive" | "gmail" | "answer" | "doc";
  sharing: "internal" | "crew" | "customer"; lockLabel: string; // "Office only" | "Crew · 42 Oak St" | "Homeowners"
  jobId?: string; updatedAt: string; note?: string;
};
type InboxItem = {
  id: string; kind: "question" | "issue" | "walkthrough" | "relay"; agentId: string; agentName: string;
  // relay only: crew → household update drafted by Rex (action.notify_homeowner); text = the draft
  original?: string; targetGroupId?: string; targetName?: string; targetLabel?: string; deliverable?: boolean; viaHelpers?: string[];
  from: string; text: string; imageDataUrl?: string; status: "open" | "answered" | "dismissed"; createdAt: string;
};
```
