# Redroid deployment scaffold

This directory contains the server-side Android runtime and private gateway profile for GoogleTV-Web.

## Host requirements

- Linux host on `x86_64` or `aarch64`.
- Docker Engine and Docker Compose v2.
- Binder kernel support and the binder devices required by the selected Redroid image.
- Optional GPU render node at `/dev/dri/renderD*` plus compatible host drivers for GPU acceleration.
- Enough RAM, CPU and persistent disk for an Android container and video streaming. A small free-tier VPS may not meet these requirements.

Run the read-only host check from the repository root:

```bash
bash scripts/redroid-host-preflight.sh
```

The script does not load kernel modules or change host configuration.

## Configure and start

1. Copy `.env.example` to `.env`.
2. Generate a private gateway token with `openssl rand -hex 32` and place it in `GATEWAY_TOKEN`.
3. Set `ALLOWED_ORIGIN` to the exact HTTPS origin of the browser UI when hosted separately.
4. Review the host security implications of Redroid's privileged container.
5. Start the stack with `docker compose up -d --build`.
6. Inspect logs with `docker compose logs -f redroid gateway`.

The Redroid ADB port is bound to host loopback and is also available only on the private Docker network. The gateway HTTP API is bound to host loopback at `127.0.0.1:8080` for local integration. Do not change either host binding to `0.0.0.0` and do not publish ADB to the public internet.

## Gateway API

All API routes require `Authorization: Bearer <GATEWAY_TOKEN>`.

- `GET http://127.0.0.1:8080/healthz` — process health only.
- `GET http://127.0.0.1:8080/api/status` — Android ADB state, boot-complete flag, release and model.
- `POST http://127.0.0.1:8080/api/input` — allowlisted TV remote key or bounded tap.
- `POST http://127.0.0.1:8080/api/apk` — raw APK upload and `adb install -r`; maximum 512 MiB.

Example:

```bash
curl -H "Authorization: Bearer $GATEWAY_TOKEN" http://127.0.0.1:8080/api/status
curl -X POST -H "Authorization: Bearer $GATEWAY_TOKEN" -H "Content-Type: application/json" \
  --data '{"action":"DPAD_UP"}' http://127.0.0.1:8080/api/input
```

The API currently uses a single shared bearer token for a single-user proof of concept. Put a TLS reverse proxy and real user authentication in front of it before remote access. Set `ALLOWED_ORIGIN` to the exact trusted web origin. Do not expose the gateway or ADB directly to the public internet.

## Persistence

Android's data partition is stored in the named Docker volume `redroid-data`. Removing that volume destroys the Android data. Back up only after stopping or quiescing the Android container so that the archive is consistent.

## Current limitation

The gateway now provides authenticated status, allowlisted input and APK installation endpoints. Browser screen streaming, WSS transport, multi-user sessions and a production authentication layer are not implemented yet. A successful CI run validates code and Compose syntax; it does not prove that Android has booted on a real host.
