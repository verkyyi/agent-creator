# Devpost submission: copy/paste

## Project overview
**Project name:** CrewBrain

**Elevator pitch:** A voice-first company brain for small contractors: talk to it to spin up helpers for homeowners and crews that see only what you allow, take real actions, and switch off when the job ends.

**Thumbnail:** `video/out/thumbnail.png` (3:2)

## Project details
**About the project** (Markdown):

## Inspiration
Small trade contractors (solar, electrical, roofing, HVAC, plumbing) answer the same questions all day: homeowners ask about the install and the warranty, subcontractor crews ask for the gate code, where to park and what's in scope. The "company brain" of a 6-person solar installer lives in the owner's head, camera roll and Google Drive. Enterprise knowledge tools assume an IT department. Generic chatbots have no idea who should see what, and a gate code should not outlive the job.

## What it does
- **A governed company brain.** Everything the company knows (Drive docs, Gmail threads, photos of warranty cards, approved answers) sits in one place, and **every item carries a lock**: Homeowners, Crew for a specific job, or Office only.
- **A creator agent you talk to.** "Make a helper for the Patels about their install, keep it until 30 days after handover." It asks only for what's missing, then shows an approval card: who can use it, exactly what it knows, what it can't see, what it can do, and when it ends. Nothing is live until the owner taps Approve; the approval is bound to that exact revision.
- **Scoped helpers.** *Juno* answers the Patel household with sources. *Rex* briefs the Bay Roofing crew, by voice and in Spanish if they prefer, from English documents.
- **Agents that take actions.** Rex logs a job-site issue with a photo to the owner's inbox. Juno requests a walkthrough. Questions a helper can't answer go to the owner; an answer the owner approves becomes a new knowledge version (nothing is learned automatically).
- **Access that ends.** "Close the job" kills Rex mid-conversation, and the site brief with the gate code locks back to Office only. Every request checks expiry against server time.

## How we built it
- **HydraDB** is the brain: one database per company (hard isolation), an `acl` on every source derived from its lock, and **every helper searches as its audience** (`group:crewbrain:crew:<job>` etc.), so a locked document never comes back from the search. Relocking a source is a single `PATCH /context/{id}/metadata` that applies on the next query, with no re-index. The app then intersects results with the helper's approved source list and the current lock (defense in depth).
- **Claude** composes grounded answers only from retrieved excerpts, cites them, refuses with `NO_ANSWER` when they don't cover the question, and treats document text as data, not instructions. It also reads photos of documents into knowledge drafts.
- **OpenAI gpt-realtime** is the voice: speech-to-speech over WebRTC with an ephemeral key. Voice has one tool, `relay`, which sends the user's words to the same policy-checked endpoint the text chat uses, so voice can never bypass access control.
- Node/TypeScript (Hono) server, mobile-first PWA, deployed on a Mac mini behind Tailscale Funnel.
- An access-control test suite: tenant isolation, audience restriction, unauthorized documents, close/revocation, real expiry with a test clock, approval integrity, edits needing approval, escalation and learning, prompt injection, gated write actions.

## Challenges
- Making "the model can't see it" true by construction: filtering inside retrieval (search as the audience) instead of retrieving everything and asking the model to hide it.
- HydraDB ACLs combine as a union, so a helper must search as its audience only, after the app verifies the person belongs to that audience.
- Keeping voice inside the same guardrails: the realtime model is only ears and a mouth.
- Making approval meaningful: approvals bind to an exact config revision; edits create a new proposal while the approved one stays live.

## What we learned
Small businesses don't need another chatbot. They need control: who sees what, for how long, and a human in the loop before anything becomes "company truth."

## What's next
A supervised pilot with trade contractors; real phone sign-in for homeowners and crews; live Google Drive and Gmail connectors with HydraDB permission capture; SMS escalation to the owner; usage caps and billing.

**Built with:** hydradb, claude, anthropic, claude-agent-sdk, openai, gpt-realtime, webrtc, typescript, node.js, hono, pwa, tailscale, playwright, ffmpeg

**Try it out links:**
- https://macmini.tail435588.ts.net:10000/crewbrain/demo.html
- https://github.com/verkyyi/agent-creator
- https://verkyyi.github.io/agent-creator/ (landing page)

**Video demo link:** (YouTube URL after upload)

**Image gallery:** `video/out/gallery/*.png`

## Additional info
- **Team name:** CrewBrain
- **Team members:** Lianghui Yi, Charlotte He
- **Team leader email:** verky.yi@gmail.com
- **Description:** CrewBrain is a voice-first company brain for small contractors. Owners keep their knowledge in HydraDB with a lock on every item, then talk to a creator agent that builds scoped helpers, Juno for homeowners and Rex for crews, that answer only from what they're allowed to see, take actions (log issues with photos, request walkthroughs), escalate what they can't answer, and shut off when the job ends. Claude reasons and cites; gpt-realtime handles voice through the same policy-checked endpoints.
- **Did you use HydraDB?** Yes: per-company databases, ACL per source, search-as-audience, ACL updates on close.
- **Did you use App-Starter?** No
- **GitHub repo:** https://github.com/verkyyi/agent-creator
- **Screenshot (1):** `video/out/gallery/01-approval.png`
- **Screenshot (2):** `video/out/gallery/02-brain.png`
