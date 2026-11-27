#!/usr/bin/env bash
set -Eeuo pipefail

target="${REDROID_ADB_TARGET:-127.0.0.1:5555}"
info() { printf '[INFO] %s\n' "$*"; }
fail() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

command -v adb >/dev/null 2>&1 || fail "adb is not installed or not in PATH."
info "Connecting to Redroid at $target"
adb connect "$target" >/dev/null || fail "Could not connect to $target."

state="$(adb -s "$target" get-state 2>/dev/null || true)"
[[ "$state" == "device" ]] || fail "ADB state is '$state', expected 'device'."

boot="$(adb -s "$target" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
[[ "$boot" == "1" ]] || fail "Android is reachable but boot is not complete (sys.boot_completed='$boot')."

release="$(adb -s "$target" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')"
model="$(adb -s "$target" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
info "Android boot completed."
info "Android release: ${release:-unknown}"
info "Device model: ${model:-unknown}"
info "Runtime acceptance preflight passed. Streaming and APK install still require separate tests."
