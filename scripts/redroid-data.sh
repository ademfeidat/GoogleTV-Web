#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/redroid/docker-compose.yml"
PROJECT_DIR="$ROOT_DIR"
SERVICE="redroid"
VOLUME_DEST="/data"
HELPER_IMAGE="${REDROID_BACKUP_HELPER_IMAGE:-alpine:3.20}"

usage() {
  cat <<'USAGE'
Redroid /data volume backup and restore

  bash scripts/redroid-data.sh backup [backup-directory]
  bash scripts/redroid-data.sh restore <archive.tar.gz> --yes

Backup requires the Redroid container to be stopped. Restore stops it and
restarts it only if it was running before the operation. Restore replaces
the complete /data volume contents and is destructive.
USAGE
}

fail() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
info() { printf '[INFO] %s\n' "$*"; }

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."

compose() {
  docker compose --project-directory "$PROJECT_DIR" -f "$COMPOSE_FILE" "$@"
}

container_id="$(compose ps -a -q "$SERVICE" | head -n 1)"
[[ -n "$container_id" ]] || fail "Redroid container not found. Start the stack once so Compose creates the data volume."

volume_name="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container_id")"
[[ -n "$volume_name" ]] || fail "Could not identify the named Docker volume mounted at /data."

running="$(docker inspect --format '{{.State.Running}}' "$container_id")"
restart_after=0
if [[ "$running" == "true" ]]; then restart_after=1; fi

restart_if_needed() {
  if [[ "$restart_after" -eq 1 ]]; then
    info "Restarting Redroid because it was running before the operation."
    compose start "$SERVICE" >/dev/null
  fi
}
trap restart_if_needed EXIT

case "${1:-}" in
  backup)
    backup_dir="${2:-$ROOT_DIR/backups/redroid}"
    mkdir -p "$backup_dir"
    backup_dir="$(cd "$backup_dir" && pwd)"
    [[ "$running" == "false" ]] || fail "Stop Redroid first: docker compose -f deploy/redroid/docker-compose.yml stop redroid"
    archive="$backup_dir/redroid-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
    info "Backing up Docker volume $volume_name to $archive"
    docker run --rm --network none \
      --mount "type=volume,src=$volume_name,dst=/data,readonly" \
      --mount "type=bind,src=$backup_dir,dst=/backup" \
      "$HELPER_IMAGE" sh -ec 'tar -czf "/backup/'"$(basename "$archive")"'" -C /data .'
    info "Backup created. Store a copy outside this host."
    printf '%s\n' "$archive"
    ;;
  restore)
    archive_arg="${2:-}"
    confirmation="${3:-}"
    [[ -n "$archive_arg" ]] || { usage; fail "Restore archive path is required."; }
    [[ "$confirmation" == "--yes" ]] || fail "Restore is destructive; repeat the command with --yes after verifying the archive."
    [[ -f "$archive_arg" ]] || fail "Backup archive does not exist: $archive_arg"
    command -v realpath >/dev/null 2>&1 || fail "realpath is required."
    archive="$(realpath "$archive_arg")"
    archive_dir="$(dirname "$archive")"
    archive_name="$(basename "$archive")"

    # Reject absolute paths and parent traversal before extracting an archive.
    docker run --rm --network none \
      --mount "type=bind,src=$archive_dir,dst=/backup,readonly" \
      "$HELPER_IMAGE" sh -ec '
        archive="/backup/'"$archive_name"'"
        tar -tzf "$archive" >/dev/null
        tar -tzf "$archive" | awk '\''BEGIN { bad=0 } /^\// { bad=1 } { n=split($0,a,"/"); for (i=1;i<=n;i++) if (a[i]=="..") bad=1 } END { exit bad }'\'' ||
          { echo "Unsafe archive path detected" >&2; exit 1; }
      '

    if [[ "$running" == "true" ]]; then
      info "Stopping Redroid before restore."
      compose stop "$SERVICE" >/dev/null
    fi

    info "Replacing all contents of volume $volume_name from $archive"
    docker run --rm --network none \
      --mount "type=volume,src=$volume_name,dst=/data" \
      --mount "type=bind,src=$archive_dir,dst=/backup,readonly" \
      "$HELPER_IMAGE" sh -ec '
        find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +
        tar -xzf "/backup/'"$archive_name"'" -C /data
      '
    info "Restore completed. Redroid will be restarted if it was running before."
    ;;
  -h|--help|"")
    usage
    ;;
  *)
    usage
    fail "Unknown command: $1"
    ;;
esac
