// Domain records. Mirrors the "Minimal records" table in the MVP brief.

export type Role = "owner" | "customer";
// customer: may reach homeowners; crew: subs and crew only; internal: never leaves the owner.
export type Sharing = "customer" | "crew" | "internal";
/** A helper's avatar is an icon key, never an emoji (old stores may still hold the former emoji; the UI maps those). */
export type AvatarKey = "house" | "hardhat";
export type AgentState ="draft" | "awaiting_approval" | "active" | "expired" | "revoked";

export interface Tenant {
  id: string;
  name: string;
  timeZone: string;
  secretPhrase: string; // unique per tenant; tests assert it never crosses tenants
}

export interface Member {
  id: string;
  tenantId: string;
  name: string;
  role: Role;
  groups: string[];
  // Owner-only: which sources/tools this member may authorize for an agent.
  sourceScope: string[];
  toolScope: string[];
}

export interface Group {
  id: string;
  tenantId: string;
  name: string;
  memberIds: string[];
  jobId?: string; // the job this audience belongs to; tools bind to it server-side
  kind: "household" | "crew";
}

export interface Source {
  id: string;
  tenantId: string;
  title: string;
  category: string; // product_guide | faq | workshop_plan | setup | roadmap ...
  version: number;
  sharing: Sharing;
  origin: "photo" | "drive" | "gmail" | "answer" | "doc";
  jobId?: string;
  updatedAt?: string;
  sections: { heading: string; text: string }[];
}

export interface ToolDef {
  id: string;
  tenantId: string;
  name: string;
  operation: "read" | "write";
  description: string;
}

export interface Template {
  id: string;
  purpose: string;
  sourceCategories: string[];
  audienceKind: "household" | "crew";
  allowedSharing: Sharing[];
  tools: string[];
  defaults: { name: string; avatar: AvatarKey; tone: string; expiryHint: string };
}

export interface AgentConfig {
  job: string;
  summary?: string; // one sentence in the owner's language: what this helper is for (creator agent)
  audienceGroupId: string;
  name: string;
  avatar: string; // AvatarKey; string for sandboxes saved before the switch from emoji
  tone: string;
  sources: { id: string; version: number }[];
  tools: string[];
  escalationMemberId: string;
  expiresAt: string; // ISO UTC
  timeZone: string;
  jobId?: string;
}

export interface Revision {
  rev: number;
  config: AgentConfig;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface Agent {
  id: string;
  tenantId: string;
  ownerId: string;
  templateId: string;
  state: AgentState;
  revisions: Revision[];
  activeRev?: number; // approved + live revision
  pendingRev?: number; // proposal awaiting approval
  revokedAt?: string;
}

export interface Approval {
  agentId: string;
  rev: number;
  configHash: string;
  approverId: string;
  at: string;
}

export interface Session {
  token: string;
  memberId: string;
  tenantId: string;
}

export interface EventRec {
  at: string;
  tenantId: string;
  actorId?: string;
  agentId?: string;
  kind: string;
  detail?: Record<string, unknown>;
}

export interface Finding {
  id: string;
  tenantId: string;
  agentId: string;
  askedBy: string;
  question: string;
  proposedText?: string;
  evidence: string[];
  uncertainty: string;
  status: "open" | "accepted" | "rejected";
  reviewerId?: string;
  decidedAt?: string;
  createdAt: string;
}

// Creator conversation memory per owner: what is already known about the draft.
export interface CreatorDraft {
  agentId?: string; // when editing an existing agent
  templateId?: string;
  job?: string;
  audienceGroupId?: string;
  expiresAt?: string;
  timeZone?: string;
  name?: string;
  avatar?: string;
  tone?: string;
  extraTools?: string[];
  removeTools?: string[];
  removeSources?: string[];
  pendingQuestion?: string[];
}

export interface DB {
  tenants: Tenant[];
  members: Member[];
  groups: Group[];
  sources: Source[];
  tools: ToolDef[];
  templates: Template[];
  agents: Agent[];
  approvals: Approval[];
  sessions: Session[];
  events: EventRec[];
  findings: Finding[];
  inbox: InboxRec[];
  captures: { id: string; tenantId: string; title: string; text: string; suggestedSharing: Sharing; createdAt: string }[];
  chatLog: Record<string, { role: "user" | "helper"; text: string; at: string; citations?: Cite[]; action?: { kind: string; summary: string }; reaction?: "check"; via?: "voice"; sessionId?: string; startedAt?: string; endedAt?: string }[]>;
  drafts: Record<string, CreatorDraft>; // keyed by owner member id
  creatorLog: Record<string, { role: "owner" | "creator"; text: string; at: string; reaction?: "check" }[]>;
  clockOffsetMs: number;
  // invite token per member id (random per sandbox; see store.ts)
  inviteTokens?: Record<string, string>;
  // tool fixture data, keyed by tenant
  toolData: Record<string, Record<string, unknown>>;
}

export interface Cite { title: string; section: string; version: number }

export interface InboxRec {
  id: string;
  tenantId: string;
  kind: "question" | "issue" | "walkthrough" | "relay";
  agentId: string;
  fromId: string;
  text: string; // relay: the drafted homeowner message the owner approves
  original?: string; // relay: the crew member's own words
  targetGroupId?: string; // relay: the household that receives it once the owner approves
  imageDataUrl?: string;
  status: "open" | "answered" | "dismissed";
  answer?: string;
  createdAt: string;
  // HydraDB `meta.request_id` of the query the helper couldn't answer; the owner's answer
  // is reported back against it (POST /feedback with ground_truth).
  hydraRequestId?: string;
}
