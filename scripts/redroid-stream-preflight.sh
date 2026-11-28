#!/usr/bin/env bash
set -Eeuo pipefail

compose_file="${REDROID_COMPOSE_FILE:-deploy/redroid/docker-compose.yml}"
env_file="${REDROID_ENV_FILE:-deploy/redroid/.env}"
target="${REDROID_STREAM_ADB_TARGET:-redroid:5555}"
timeout_seconds="${REDROID_STREAM_BOOT_TIMEOUT_SECONDS:-180}"
interval_seconds="${REDROID_STREAM_POLL_INTERVAL_SECONDS:-3}"

info() { printf '[INFO] %s\n' "$*"; }
fail() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required."
[[ -f "$compose_file" ]] || fail "Compose file not found: $compose_file"
[[ -f "$env_file" ]] || fail "Environment file not found: $env_file"
[[ "$timeout_seconds" =~ ^[0-9]+$ ]] && (( timeout_seconds >= 1 && timeout_seconds <= 1800 )) || fail "REDROID_STREAM_BOOT_TIMEOUT_SECONDS must be 1..1800."
[[ "$interval_seconds" =~ ^[0-9]+$ ]] && (( interval_seconds >= 1 && interval_seconds <= 30 )) || fail "REDROID_STREAM_POLL_INTERVAL_SECONDS must be 1..30."

compose=(docker compose --profile streaming --env-file "$env_file" -f "$compose_file")
"${compose[@]}" ps --status running stream >/dev/null 2>&1 || fail "Streaming sidecar is not running. Start it with the streaming profile first."

info "Checking ADB from inside the streaming sidecar to $target"
"${compose[@]}" exec -T stream sh -lc 'command -v adb >/dev/null 2>&1' || fail "The streaming sidecar does not expose the adb CLI expected by this preflight."
"${compose[@]}" exec -T stream adb connect "$target" >/dev/null 2>&1 || true

deadline=$((SECONDS + timeout_seconds))
state=""
boot=""
while (( SECONDS < deadline )); do
  state="$("${compose[@]}" exec -T stream adb -s "$target" get-state 2>/dev/null | tr -d '\r' || true)"
  if [[ "$state" == "device" ]]; then
    boot="$("${compose[@]}" exec -T stream adb -s "$target" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    [[ "$boot" == "1" ]] && break
  fi
  sleep "$interval_seconds"
done

[[ "$state" == "device" ]] || fail "Streaming sidecar cannot reach Redroid through private ADB (last state: ${state:-unavailable})."
[[ "$boot" == "1" ]] || fail "ADB reached Redroid, but Android boot did not complete before timeout."

release="$("${compose[@]}" exec -T stream adb -s "$target" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r' || true)"
info "Streaming sidecar can reach Redroid over the private network."
info "Android boot completed; release: ${release:-unknown}."
info "This preflight does not prove WebSocket login, video frames, audio, or browser playback."
