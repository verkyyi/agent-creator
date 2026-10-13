// postinstall: the Agent SDK runs a native Claude binary shipped as an optional,
// per-platform package. If it was skipped (--omit=optional), every chat silently
// falls back to offline answers, so fail the install loudly instead.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const base = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
const names = process.platform === "linux" ? [base, `${base}-musl`] : [base];
const found = names.find((n) => { try { require.resolve(`${n}/package.json`); return true; } catch { return false; } });
if (!found) {
  console.error(`check-sdk: ${names.join(" or ")} is not installed — run \`npm ci --include=optional\`.`);
  process.exit(1);
}
