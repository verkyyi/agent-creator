# Crewbrain API contract (MVP)

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

- `POST api/creator/message` `{ text }` → `{ reply: string, proposal?: Proposal, agent?: AgentSummary }`
  The creator asks only for missing info. When complete it returns a `proposal` (state `awaiting_approval`).
  Edits ("make Rex less formal", "extend Juno to Friday", "close the Oak St job") also come back as a proposal or a done reply.
- `GET api/creator/log` → `{ messages: { role: "owner"|"creator", text, at, proposal?: Proposal }[] }`
- `POST api/agents/:id/approve` `{ rev }` → `{ agent: AgentSummary, links: { memberId, name, url }[] }`
  `url` is an absolute personal link for that audience member.
- `POST api/agents/:id/close` → `{ agent: AgentSummary }` (revokes; job-only knowledge relocks to Office only)
- `GET api/agents` → `{ agents: AgentSummary[] }`
- `GET api/agents/:id/links` → `{ links: { memberId, name, url }[] }`
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
