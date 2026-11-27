#!/usr/bin/env bash
set -u

failures=0
warnings=0

ok()   { printf '[OK]   %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; warnings=$((warnings + 1)); }
fail() { printf '[FAIL] %s\n' "$1"; failures=$((failures + 1)); }

printf 'GoogleTV-Web Redroid host preflight\n'
printf 'Kernel: %s\n' "$(uname -r 2>/dev/null || echo unknown)"
printf 'Arch:   %s\n' "$(uname -m 2>/dev/null || echo unknown)"
printf 'Pages:  %s bytes\n' "$(getconf PAGE_SIZE 2>/dev/null || echo unknown)"

if [ "$(uname -s 2>/dev/null)" != "Linux" ]; then
  fail "Redroid requires a Linux host kernel; this script is running elsewhere."
fi

case "$(uname -m 2>/dev/null)" in
  x86_64|aarch64|arm64) ok "Supported host CPU architecture family." ;;
  *) fail "Unsupported or unverified CPU architecture." ;;
esac

if command -v docker >/dev/null 2>&1; then
  ok "Docker CLI found."
  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose plugin found."
  else
    fail "Docker Compose plugin is missing."
  fi
  if docker info >/dev/null 2>&1; then
    ok "Docker daemon is reachable for the current user."
  else
    warn "Docker daemon is not reachable; check service status and user permissions."
  fi
else
  fail "Docker CLI is missing."
fi

page_size="$(getconf PAGE_SIZE 2>/dev/null || true)"
if [ "$page_size" = "4096" ]; then
  ok "Host uses 4 KB memory pages."
elif [ -n "$page_size" ]; then
  fail "Redroid deployment requires 4 KB pages; detected $page_size."
else
  warn "Could not determine host page size."
fi

if grep -qs 'binder' /proc/filesystems 2>/dev/null; then
  ok "Kernel exposes a binder filesystem type."
else
  fail "Binder filesystem support is not exposed by the running kernel."
fi

binder_mount=0
if command -v mountpoint >/dev/null 2>&1; then
  mountpoint -q /dev/binderfs 2>/dev/null && binder_mount=1
  mountpoint -q /sys/fs/binderfs 2>/dev/null && binder_mount=1
fi
if [ -e /dev/binder ] || [ -e /dev/binderfs/binder-control ] || [ -e /sys/fs/binderfs/binder-control ] || [ "$binder_mount" -eq 1 ]; then
  ok "Binder device or binderfs mount is present."
else
  fail "No Binder device or mounted binderfs instance detected."
fi

if grep -qs '^CONFIG_ANDROID_BINDER_IPC=y' "/boot/config-$(uname -r)" 2>/dev/null; then
  ok "Kernel config enables Android Binder IPC."
elif [ -r /proc/config.gz ] && command -v zcat >/dev/null 2>&1 && zcat /proc/config.gz 2>/dev/null | grep -q '^CONFIG_ANDROID_BINDER_IPC=y'; then
  ok "Running kernel config enables Android Binder IPC."
else
  warn "Could not confirm CONFIG_ANDROID_BINDER_IPC from an exposed kernel config."
fi

if grep -qs '^CONFIG_ASHMEM=y' "/boot/config-$(uname -r)" 2>/dev/null || grep -qs '^ashmem_linux ' /proc/modules 2>/dev/null; then
  ok "Legacy ashmem support appears available."
else
  warn "Legacy ashmem was not detected; verify the selected Redroid release's ashmem/memfd requirements."
fi

if [ -d /dev/dma_heap ] || [ -e /dev/ion ]; then
  ok "DMA-BUF heap or ION device node is present."
else
  warn "No /dev/dma_heap or /dev/ion node detected; graphics acceleration may be unavailable."
fi

if [ -r /proc/net/if_inet6 ]; then
  ok "IPv6 kernel interface is available."
else
  fail "IPv6 is not available in /proc/net/if_inet6."
fi

if [ "$failures" -gt 0 ]; then
  printf '\nPreflight failed: %s blocking check(s), %s warning(s).\n' "$failures" "$warnings"
  exit 1
fi

printf '\nPreflight passed with %s warning(s). Review warnings before enabling GPU or production access.\n' "$warnings"
printf 'This checks host prerequisites only; it does not boot Android or validate browser streaming.\n'
