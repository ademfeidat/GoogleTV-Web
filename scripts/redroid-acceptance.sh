#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADB_TARGET="${REDROID_ADB_TARGET:-127.0.0.1:5555}"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:8080}"
GATEWAY_TOKEN="${GATEWAY_TOKEN:-}"
STREAM_URL="${WS_SCRCPY_URL:-}"
APK_FILE="${REDROID_APK:-}"
EXPECTED_PACKAGE="${REDROID_EXPECTED_PACKAGE:-}"
LAUNCH_PACKAGE="${REDROID_LAUNCH_PACKAGE:-}"

info() { printf '[INFO] %s\n' "$*"; }
pass() { printf '[PASS] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
fail() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v python3 >/dev/null 2>&1 || fail "python3 is required."
command -v adb >/dev/null 2>&1 || fail "adb is required."
[[ "$GATEWAY_TOKEN" =~ ^.{32,}$ ]] || fail "Set GATEWAY_TOKEN to the configured gateway secret (at least 32 characters)."

info "Checking Android boot state at $ADB_TARGET"
REDROID_ADB_TARGET="$ADB_TARGET" bash "$ROOT_DIR/scripts/redroid-runtime-check.sh"
pass "ADB reports Android boot complete."

gateway_base="${GATEWAY_URL%/}"
health_code="$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' "$gateway_base/healthz")"
[[ "$health_code" == "200" ]] || fail "Gateway health endpoint returned HTTP $health_code."
pass "Gateway process health endpoint is reachable."

status_json="$(curl --max-time 30 -fsS -H "Authorization: Bearer $GATEWAY_TOKEN" "$gateway_base/api/status")"
printf '%s' "$status_json" | python3 -c '
import json, sys
data = json.load(sys.stdin)
if data.get("connected") is not True or data.get("bootCompleted") is not True:
    raise SystemExit("Gateway does not report a connected, boot-complete Android device: " + json.dumps(data))
'
pass "Authenticated gateway reports Android connected and boot-complete."

if [[ -n "$APK_FILE" ]]; then
  [[ -f "$APK_FILE" ]] || fail "REDROID_APK does not point to a file: $APK_FILE"
  apk_size="$(wc -c < "$APK_FILE" | tr -d ' ')"
  (( apk_size > 0 && apk_size <= 536870912 )) || fail "APK must be non-empty and no larger than 512 MiB."
  info "Uploading and installing APK: $(basename "$APK_FILE")"
  apk_result="$(curl --max-time 240 -fsS \
    -H "Authorization: Bearer $GATEWAY_TOKEN" \
    -H "Content-Type: application/vnd.android.package-archive" \
    --data-binary "@$APK_FILE" "$gateway_base/api/apk")"
  printf '%s' "$apk_result" | python3 -c '
import json, sys
data = json.load(sys.stdin)
if data.get("ok") is not True:
    raise SystemExit("Gateway did not confirm APK installation: " + json.dumps(data))
'
  pass "Gateway confirmed APK installation."

  if [[ -n "$EXPECTED_PACKAGE" ]]; then
    [[ "$EXPECTED_PACKAGE" =~ ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$ ]] || fail "REDROID_EXPECTED_PACKAGE is not a valid Android package name."
    package_path="$(adb -s "$ADB_TARGET" shell pm path "$EXPECTED_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
    [[ "$package_path" == package:* ]] || fail "Installed package was not found by PackageManager: $EXPECTED_PACKAGE"
    pass "PackageManager confirms $EXPECTED_PACKAGE is installed."
  fi
fi

if [[ -n "$LAUNCH_PACKAGE" ]]; then
  [[ "$LAUNCH_PACKAGE" =~ ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$ ]] || fail "REDROID_LAUNCH_PACKAGE is not a valid Android package name."
  launch_payload="$(python3 -c 'import json,sys; print(json.dumps({"packageName":sys.argv[1]}))' "$LAUNCH_PACKAGE")"
  launch_result="$(curl --max-time 40 -fsS \
    -H "Authorization: Bearer $GATEWAY_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary "$launch_payload" "$gateway_base/api/launch")"
  printf '%s' "$launch_result" | python3 -c '
import json, sys
data = json.load(sys.stdin)
if data.get("ok") is not True:
    raise SystemExit("Gateway did not confirm app launch: " + json.dumps(data))
'
  pass "Gateway accepted launch request for $LAUNCH_PACKAGE."
fi

if [[ -n "$STREAM_URL" ]]; then
  stream_base="${STREAM_URL%/}"
  stream_code="$(curl --max-time 12 -sS -o /dev/null -w '%{http_code}' "$stream_base/" || true)"
  case "$stream_code" in
    200) warn "Streaming sidecar HTTP endpoint is reachable, but HTTP 200 does not prove authenticated video/audio streaming." ;;
    301|302|303|307|308|401|403)
      warn "Streaming sidecar is reachable but returned HTTP $stream_code; complete its login in a browser before claiming stream acceptance."
      ;;
    *) fail "Streaming sidecar did not return a reachable HTTP response (status: ${stream_code:-none})." ;;
  esac
else
  info "WS_SCRCPY_URL not set; streaming endpoint was not checked."
fi

printf '\nAcceptance checks completed. A reachable streaming HTTP endpoint is not stream acceptance. This script does not verify sidecar login, live video/audio frames, input round-trips, video quality, audio sync, DRM, GPU acceleration or long-term persistence.\n'
