import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { seed } from "./seed.ts";
import type { DB, EventRec } from "./types.ts";

// A single JSON document is enough for fixtures. Writes are synchronous so a
// revocation is durable before the response that confirms it.
const FILE = process.env.DATA_FILE ?? "data/db.json";
const PERSIST = process.env.NODE_ENV !== "test";

export let db: DB = load();

function load(): DB {
  if (PERSIST && existsSync(FILE)) return JSON.parse(readFileSync(FILE, "utf8")) as DB;
  return seed();
}

export function save() {
  if (!PERSIST) return;
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 1));
}

export function reset() {
  db = seed();
  save();
}

// Trusted server time. The offset exists only for the demo/test clock and is
// changed through an owner-only endpoint that is disabled unless TEST_CLOCK=1.
export function now(): Date {
  return new Date(Date.now() + db.clockOffsetMs);
}

export function record(e: Omit<EventRec, "at">) {
  db.events.push({ at: now().toISOString(), ...e });
  save();
}

export function id(prefix: string) {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

export function hashConfig(config: unknown) {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
}
