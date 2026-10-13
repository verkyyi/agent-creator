#!/bin/bash
# Reads secrets from the macOS Keychain at start (never written to disk), then runs the server.
set -euo pipefail
cd "$(dirname "$0")/.."
k() { security find-generic-password -a crewbrain -s "$1" -w 2>/dev/null || true; }
export HYDRA_DB_API_KEY="$(k HYDRA_DB_API_KEY)"
export OPENAI_API_KEY="$(k OPENAI_API_KEY)"
export CLAUDE_CODE_OAUTH_TOKEN="$(k CLAUDE_CODE_OAUTH_TOKEN)"
# SMS (optional; see docs/SMS.md). Empty = texting off, the simulator still works with TEST_CLOCK=1.
for n in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM_NUMBER SMS_PROVIDER; do
  v="$(k "$n")"; if [ -n "$v" ]; then export "$n=$v"; fi
done
export TEST_CLOCK="${TEST_CLOCK:-1}"
export PORT="${PORT:-8787}"
exec npx tsx src/server.ts
