# GoogleTV Redroid Gateway

A minimal authenticated HTTP gateway between the GoogleTV-Web browser client and a Redroid container. It intentionally exposes a small allowlist of operations; it does not provide arbitrary shell access.

## Environment

- `GATEWAY_TOKEN`: required, unique random secret of at least 32 characters.
- `ANDROID_ADB_HOST`: Redroid service name (default: `redroid`).
- `ANDROID_ADB_PORT`: ADB TCP port (default: `5555`).
- `ALLOWED_ORIGIN`: optional exact browser origin, for example `https://tv.example.com`.
- `PORT`: HTTP listen port (default: `8080`).

Generate a token with `openssl rand -hex 32`. Never commit the resulting secret.

## API

All `/api/*` endpoints require `Authorization: Bearer <GATEWAY_TOKEN>`.

- `GET /healthz`: minimal process health only; does not expose Android details.
- `GET /api/status`: ADB connection, Android boot-complete state, release and model.
- `POST /api/input`: JSON allowlist for DPAD, OK, Back, Home, Menu, media and volume keys; also supports bounded tap coordinates.
- `POST /api/apk`: raw APK body with content type `application/vnd.android.package-archive` or `application/octet-stream`; 512 MiB maximum; installs with `adb install -r`.

Example input body: `{"action":"DPAD_UP"}`.

## Security

- Keep the gateway on the private Docker network or bind its host port to loopback only.
- Put a TLS reverse proxy and user authentication in front of it before remote access.
- Set `ALLOWED_ORIGIN` to the exact trusted web origin.
- Keep ADB private; never publish port 5555 to the public internet.
- The bearer token is a single shared secret for the initial single-user proof of concept, not a multi-user identity system.
- The APK upload is streamed to a private temporary directory, size-limited, and removed after installation.
- No arbitrary shell, file browsing or WebSocket screen streaming is exposed yet.

This gateway is an integration scaffold. A successful API response does not prove a Redroid Android guest has booted; verify `bootCompleted: true` on a compatible Linux host.
