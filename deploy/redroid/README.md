# Redroid deployment scaffold

This directory contains the server-side Android runtime, private gateway and optional browser-streaming sidecar for GoogleTV-Web.

## Host requirements

- Linux host on `x86_64` or `aarch64` for Redroid itself.
- Docker Engine and Docker Compose v2.
- Binder kernel support and the binder devices required by the selected Redroid image. A privileged container cannot supply a missing host binder driver.
- Optional GPU render node at `/dev/dri/renderD*` plus compatible host drivers for GPU acceleration.
- Enough RAM, CPU and persistent disk for Android and video streaming. A small free-tier VPS may not meet these requirements.
- The current ws-scrcpy-web Docker image is Linux amd64 only, so the complete streaming profile currently targets x86_64 hosts.

Redroid runs Android userspace against the Linux host kernel. The official setup requires binder support and recommends keeping the ADB port private; Android 17 no longer needs ashmem, while older image/kernel combinations may differ. See the [official Redroid documentation](https://github.com/remote-android/redroid-doc).

Run the read-only host check from the repository root:

The Python diagnostic is the consolidated report for Linux/Docker/Binder/GPU
prerequisites and (optionally) Android boot state. It uses only Python's
standard library and does not change host settings:

```bash
# Host prerequisites plus a one-shot ADB check (JSON output is also supported).
python3 scripts/redroid_doctor.py

# Wait up to three minutes for Android to finish booting.
python3 scripts/redroid_doctor.py --wait --timeout 180

# Host-only diagnostics, without requiring ADB.
python3 scripts/redroid_doctor.py --skip-adb
```

A warning means a capability was not detected; a failure means a required
check failed or an explicitly requested Android boot check did not pass.

```bash
bash scripts/redroid-host-preflight.sh
```

After starting Redroid, wait for Android to become ready and verify boot completion from the host:

```bash
REDROID_BOOT_TIMEOUT_SECONDS=180 REDROID_ADB_TARGET=127.0.0.1:5555 bash scripts/redroid-runtime-check.sh
```

The first script checks host prerequisites; the second retries ADB discovery and waits for `sys.boot_completed=1`. Neither changes host configuration. A successful preflight does not prove Android can boot.

## Configure and start Redroid

1. Copy `.env.example` to `.env`.
2. Generate a private gateway token with `openssl rand -hex 32` and place it in `GATEWAY_TOKEN`.
3. Set `ALLOWED_ORIGIN` to the exact HTTPS origin of the browser UI when hosted separately.
4. Review the host security implications of Redroid's privileged container.
5. Start the base stack with `docker compose up -d --build`.
6. Inspect logs with `docker compose logs -f redroid gateway`.

The Redroid ADB port is bound to host loopback and is also available only on the private Docker network. The gateway HTTP API is bound to host loopback at `127.0.0.1:8080`. Do not change either host binding to `0.0.0.0` and do not publish ADB to the public internet.

## Open the Redroid browser dashboard

Deploy the static frontend and open `/redroid.html`. Enter the gateway base URL and token. Configure the exact frontend origin in `ALLOWED_ORIGIN` (scheme and host, without a path or trailing slash). The streaming URL should point to the ws-scrcpy-web service through HTTPS; the ADB device ID is normally `redroid:5555`. The browser token remains in memory and is not persisted by the frontend.

## Google TV / Google services compatibility

The selected Redroid image is an Android runtime, not a pre-certified Google TV appliance image. A TV launcher APK can provide a television-style home screen, but it does not add Google Mobile Services, Play Store licensing, Play Protect certification or Widevine capabilities. Redroid documents separate GMS integration paths such as Open GApps, MicroG or MindTheGapps; compatibility and certification must be validated independently for the chosen Android release. Do not assume that installing a launcher APK alone produces a fully certified Google TV environment. See the [Redroid GMS notes](https://github.com/remote-android/redroid-doc#gms-support).

## Optional ws-scrcpy-web streaming sidecar

The `streaming` profile adds the ws-scrcpy-web browser streamer on `127.0.0.1:8000`:

```bash
docker compose --profile streaming up -d stream
```

Open the sidecar locally and add the Android device using the private Docker address `redroid:5555`. It uses wireless ADB and shares the private `android-private` Docker network. The sidecar provides video/audio streaming, D-pad and touch input, file management and APK installation.

**Security setup is mandatory before remote access.** ws-scrcpy-web is open by default. To bootstrap its first administrator in a container, temporarily set `WS_SCRCPY_ALLOW_REMOTE_ADMIN=1` in the server-side `.env`, keep the service bound to loopback, recreate the stream service, create an administrator with a strong password and enable the built-in login. Then set `WS_SCRCPY_ALLOW_REMOTE_ADMIN=0` (or remove it) and recreate the service. Never expose the bootstrap configuration to a public or untrusted network.

For access from another device, use HTTPS through a reverse proxy that preserves the original Host header and forwards WebSocket upgrades. WebCodecs streaming requires a secure browser context. Cross-origin embedding also requires explicitly allowing the GoogleTV-Web origin in ws-scrcpy-web's `frameAncestors` configuration. See [the streaming integration notes](../../docs/STREAMING-INTEGRATION.md).

## Gateway API

All gateway API routes require `Authorization: Bearer <GATEWAY_TOKEN>`.

- `GET http://127.0.0.1:8080/healthz` — process health only.
- `GET http://127.0.0.1:8080/api/status` — Android ADB state, boot-complete flag, release and model.
- `GET http://127.0.0.1:8080/api/apps` — apps with a standard `LAUNCHER` or TV `LEANBACK_LAUNCHER` activity, including system apps. Results are package IDs only; localized labels and icons are not yet extracted.
- `POST http://127.0.0.1:8080/api/launch` — launch a validated package using the standard category, then fall back to the TV Leanback category.
- `POST http://127.0.0.1:8080/api/input` — allowlisted TV remote key or bounded tap.
- `POST http://127.0.0.1:8080/api/apk` — raw APK upload and `adb install -r`; maximum 512 MiB.

Example:

```bash
curl -H "Authorization: Bearer $GATEWAY_TOKEN" http://127.0.0.1:8080/api/status
curl -X POST -H "Authorization: Bearer $GATEWAY_TOKEN" -H "Content-Type: application/json" \
  --data '{"action":"DPAD_UP"}' http://127.0.0.1:8080/api/input
```

The gateway currently uses a single shared bearer token for a single-user proof of concept. Put a TLS reverse proxy and real user authentication in front of it before remote access. The ws-scrcpy-web sidecar has its own login system; enable it before remote access.

## Persistence: backup and restore

Android's `/data` partition is stored in the named Docker volume `redroid-data`. The stream sidecar state is stored separately in `ws-scrcpy-data`. Removing either volume destroys the corresponding data.

The repository includes a helper that discovers the actual Compose volume mounted at `/data`, rather than assuming the generated volume name. It uses a short-lived Alpine helper container with no network access:

```bash
# Stop Redroid first; backup is intentionally refused while it is running.
docker compose -f deploy/redroid/docker-compose.yml stop redroid
bash scripts/redroid-data.sh backup ./backups/redroid

# Restore is destructive: it replaces every file in /data.
bash scripts/redroid-data.sh restore ./backups/redroid/redroid-data-YYYYMMDDTHHMMSSZ.tar.gz --yes
```

The backup command requires the Redroid container to be stopped so Android's database and app files are quiescent. The restore command validates the gzip tar archive and rejects absolute paths and parent-directory traversal, stops Redroid if it was running, replaces the volume contents, and restarts Redroid only if it was running before restore. Use only archives you trust; path checks do not make an untrusted archive safe. Copy backups off the host and protect them because they contain app data, accounts and potentially sensitive session information. This helper backs up Android `/data` only; it does not back up the separate ws-scrcpy volume, Docker images, host configuration or secrets.

## Current limitation

The gateway provides authenticated status, allowlisted input and APK installation endpoints. The `/redroid.html` dashboard connects to that gateway and embeds the ws-scrcpy-web `/embed.html?device=` route. The optional streaming sidecar is wired into Compose, but no real Redroid instance has been booted or streamed in this project environment. CI validates code and Compose syntax; it does not prove Android boot, backup integrity against a live guest, or live streaming.
