#!/bin/bash
# Ship the current working tree to the mini only if it is usable: typecheck + all tests green.
# Stamps the service worker with a build id so installed phones pick up the new version.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=macmini.tail435588.ts.net
URL=https://macmini.tail435588.ts.net:10000/crewbrain
npx tsc --noEmit
for f in public/*.js; do node --input-type=module --check < "$f" || { echo "deploy: syntax error in $f, not shipping"; exit 1; }; done
NODE_ENV=test npx tsx --test test/*.test.ts > /tmp/crewbrain-test.log 2>&1 || { grep -E '^not ok|^# (pass|fail)' /tmp/crewbrain-test.log; echo "deploy: tests failed, not shipping"; exit 1; }
BUILD="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
rsync -az --delete --exclude node_modules --exclude data --exclude .git --exclude video --exclude '*.log' ./ "$HOST:apps/crewbrain/"
ssh "$HOST" "cd ~/apps/crewbrain && sed -i '' 's/^const VERSION = .*/const VERSION = \"$BUILD\";/' public/sw.js && echo '$BUILD' > public/build.txt && (cmp -s package-lock.json .deployed-lock || (PATH=/opt/homebrew/bin:\$PATH npm ci --omit=optional >/dev/null 2>&1 && cp package-lock.json .deployed-lock)) && launchctl kickstart -k gui/501/com.verkyyi.crewbrain"
for i in $(seq 1 20); do curl -fsS "$URL/api/health" >/dev/null 2>&1 && break; sleep 1; done
echo "deployed $BUILD → $URL/ ($(curl -fsS "$URL/build.txt"))"
