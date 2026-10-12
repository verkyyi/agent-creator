#!/bin/bash
# Reads secrets from the macOS Keychain at start (never written to disk), then runs the server.
set -euo pipefail
cd "$(dirname "$0")/.."
k() { security find-generic-password -a crewbrain -s "$1" -w 2>/dev/null || true; }
export HYDRA_DB_API_KEY="$(k HYDRA_DB_API_KEY)"
export OPENAI_API_KEY="$(k OPENAI_API_KEY)"
export CLAUDE_CODE_OAUTH_TOKEN="$(k CLAUDE_CODE_OAUTH_TOKEN)"
export TEST_CLOCK="${TEST_CLOCK:-1}"
export PORT="${PORT:-8787}"
exec npx tsx src/server.ts
