#!/usr/bin/env bash
set -Eeuo pipefail

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
fail() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Linux" ]] || fail "Redroid requires a Linux host kernel."
arch="$(uname -m)"
case "$arch" in
  x86_64|aarch64|arm64) info "Host architecture: $arch" ;;
  *) fail "Unsupported host architecture for the documented deployment: $arch" ;;
esac

command -v docker >/dev/null 2>&1 || fail "Docker CLI is missing."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable or current user lacks permission."
docker compose version >/dev/null 2>&1 || warn "Docker Compose plugin is missing; install the Compose v2 plugin."

binder_found=0
for device in /dev/binder /dev/hwbinder /dev/vndbinder; do
  if [[ -e "$device" ]]; then
    info "Found binder device: $device"
    binder_found=1
  fi
done

if [[ "$binder_found" -eq 0 ]]; then
  if [[ -d /dev/binderfs ]]; then
    warn "Binder devices are not present, but /dev/binderfs exists. Check binderfs mount and device creation."
  else
    warn "Binder devices not found. The host needs binder_linux devices or a correctly mounted binderfs."
    warn "Typical module setup (only if supported by this host kernel): modprobe binder_linux devices="binder,hwbinder,vndbinder""
  fi
fi

if [[ -e /dev/ashmem || -d /sys/module/ashmem_linux ]]; then
  info "ashmem compatibility appears available."
else
  warn "No ashmem device/module detected. Some image/kernel combinations use memfd instead; verify the selected Redroid image requirements."
fi

if compgen -G '/dev/dri/renderD*' >/dev/null; then
  info "GPU render node detected. GPU acceleration still requires compatible drivers and container device access."
else
  warn "No /dev/dri render node detected. Redroid may need software rendering; GPU acceleration is not available from this host as currently exposed."
fi

info "Host preflight completed. Warnings require operator review; this script does not prove Android can boot."
