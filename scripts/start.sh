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
# Google Drive connector (optional; real workspaces only, see docs/DRIVE.md). Client id/secret come
# from the Keychain if stored there, else from the SSM parameter holding the OAuth client JSON.
export GOOGLE_OAUTH_CLIENT_ID="$(k GOOGLE_OAUTH_CLIENT_ID)"
export GOOGLE_OAUTH_CLIENT_SECRET="$(k GOOGLE_OAUTH_CLIENT_SECRET)"
if [ -z "$GOOGLE_OAUTH_CLIENT_ID" ] && command -v aws >/dev/null 2>&1; then
  GJ="$(aws ssm get-parameter --profile "${GOOGLE_OAUTH_SSM_PROFILE:-default}" --region "${GOOGLE_OAUTH_SSM_REGION:-us-east-1}" \
    --name "${GOOGLE_OAUTH_SSM_PARAM:-/always-on-claude/gmail-mcp/google-oauth-client-json}" --with-decryption \
    --query Parameter.Value --output text 2>/dev/null || true)"
  if [ -n "$GJ" ]; then
    GOOGLE_OAUTH_CLIENT_ID="$(printf '%s' "$GJ" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.installed||j.web||{}).client_id||"")}catch{}})')"
    GOOGLE_OAUTH_CLIENT_SECRET="$(printf '%s' "$GJ" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.installed||j.web||{}).client_secret||"")}catch{}})')"
    export GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET
  fi
  unset GJ
fi
export GOOGLE_DRIVE_REFRESH_TOKEN="$(k GOOGLE_DRIVE_REFRESH_TOKEN)"
export TEST_CLOCK="${TEST_CLOCK:-1}"
export PORT="${PORT:-8787}"
exec npx tsx src/server.ts
