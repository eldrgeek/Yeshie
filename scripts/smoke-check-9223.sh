#!/usr/bin/env bash
# Smoke-check: verify that Chrome 9223 (ChromeTest profile) has the Yeshie extension
# connected to the relay. Runs a minimal public read-only recipe to confirm E2E.
#
# Usage: bash scripts/smoke-check-9223.sh
# Exit 0 = pass, non-zero = fail

set -uo pipefail

RELAY="http://localhost:3333"
CHROME_PORT=9223
LAUNCHER="$HOME/Projects/SOMA/tools/chrome-test-launcher.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "OK:   $*"; }

# 1. Relay must be up
STATUS=$(curl -s --max-time 3 "$RELAY/status" 2>/dev/null) || fail "Relay not running at $RELAY"
ok "Relay up"

# 2. Chrome 9223 must be up (launch if needed)
if ! curl -s --max-time 2 "http://localhost:${CHROME_PORT}/json/version" >/dev/null 2>&1; then
  echo "Chrome $CHROME_PORT not running — launching via $LAUNCHER"
  bash "$LAUNCHER" || fail "chrome-test-launcher.sh failed"
  sleep 4
fi
curl -s --max-time 2 "http://localhost:${CHROME_PORT}/json/version" >/dev/null 2>&1 || fail "Chrome $CHROME_PORT still not up after launcher"
ok "Chrome $CHROME_PORT up"

# 3. Extension must be connected (wait up to 10s for SW to register)
for i in $(seq 1 10); do
  CONNECTED=$(curl -s --max-time 2 "$RELAY/status" | python3 -c "import sys,json; print(json.load(sys.stdin)['extensionConnected'])" 2>/dev/null)
  [[ "$CONNECTED" == "True" ]] && break
  sleep 1
done
[[ "$CONNECTED" == "True" ]] || fail "Extension NOT connected after 10s. Check: manifest has no invalid Ctrl+Alt default keybinding; built extension is at packages/extension/.output/chrome-mv3"
ok "Extension connected to relay"

# 4. Run a minimal public recipe (navigate + read on github.com)
RESULT=$(node -e "
const payload = {
  chain: [
    { stepId: 's1', action: 'navigate', url: 'https://github.com/search?q=yeshie&type=repositories' },
    { stepId: 's2', action: 'delay', ms: 1500 },
    { stepId: 's3', action: 'read', store_as: 'r' }
  ]
};
fetch('$RELAY/run', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ payload, params: {} })
}).then(r => r.json()).then(d => {
  process.stdout.write(d.success ? 'ok' : ('FAIL:' + (d.error || 'unknown')));
}).catch(e => process.stdout.write('FETCH_ERROR:' + e.message));
" 2>/dev/null)

[[ "$RESULT" == "ok" ]] || fail "E2E recipe run failed: $RESULT"
ok "E2E recipe (github search) executed successfully"

echo ""
echo "ALL CHECKS PASSED — 9223 test surface is operational"
