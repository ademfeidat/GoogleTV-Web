#!/usr/bin/env bash
set -Eeuo pipefail

target="${REDROID_ADB_TARGET:-127.0.0.1:5555}"
timeout_seconds="${REDROID_BOOT_TIMEOUT_SECONDS:-180}"
interval_seconds="${REDROID_POLL_INTERVAL_SECONDS:-3}"
info() { printf '[INFO] %s\\n' "$*"; }
fail() { printf '[FAIL] %s\\n' "$*" >&2; exit 1; }

command -v adb >/dev/null 2>&1 || fail "adb is not installed or not in PATH."
[[ "$timeout_seconds" =~ ^[0-9]+$ ]] && (( timeout_seconds >= 1 && timeout_seconds <= 1800 )) || fail "REDROID_BOOT_TIMEOUT_SECONDS must be an integer from 1 to 1800."
[[ "$interval_seconds" =~ ^[0-9]+$ ]] && (( interval_seconds >= 1 && interval_seconds <= 30 )) || fail "REDROID_POLL_INTERVAL_SECONDS must be an integer from 1 to 30."

info "Waiting up to ${timeout_seconds}s for Redroid at $target"
deadline=$((SECONDS + timeout_seconds))
state=""
boot=""

while (( SECONDS < deadline )); do
  adb connect "$target" >/dev/null 2>&1 || true
  state="$(adb -s "$target" get-state 2>/dev/null || true)"
  if [[ "$state" == "device" ]]; then
    boot="$(adb -s "$target" shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r' || true)"
    if [[ "$boot" == "1" ]]; then
      break
    fi
  fi
  sleep "$interval_seconds"
done

[[ "$state" == "device" ]] || fail "ADB did not reach device state before timeout (last state: ${state:-unavailable})."
[[ "$boot" == "1" ]] || fail "Android did not complete boot before timeout (sys.boot_completed='${boot:-empty}')."

release="$(adb -s "$target" shell getprop ro.build.version.release 2>/dev/null | tr -d '\\r')"
model="$(adb -s "$target" shell getprop ro.product.model 2>/dev/null | tr -d '\\r')"
info "Android boot completed."
info "Android release: ${release:-unknown}"
info "Device model: ${model:-unknown}"
info "Runtime acceptance check passed. Streaming and APK installation still require separate tests."
