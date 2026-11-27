# Redroid deployment scaffold

This directory contains the first server-side runtime profile for GoogleTV-Web.

## Host requirements

- Linux host on `x86_64` or `aarch64`.
- Docker Engine and Docker Compose v2.
- Binder kernel support and the binder devices required by the selected Redroid image.
- Optional GPU render node at `/dev/dri/renderD*` plus compatible host drivers for GPU acceleration.
- Enough RAM, CPU and persistent disk for an Android container and video streaming. A small free-tier VPS may not meet these requirements.

Run the read-only host check:

```bash
bash scripts/redroid-host-preflight.sh
```

The script does not load kernel modules or change host configuration.

## Start the Android container

1. Copy `.env.example` to `.env` and review the image/display settings.
2. Review the host security implications of Redroid's privileged container.
3. Start the service with `docker compose up -d`.
4. Inspect logs with `docker compose logs -f redroid`.
5. Check local ADB connectivity with `adb connect 127.0.0.1:5555` and `adb devices`.

The Compose file binds ADB only to host loopback and also exposes port 5555 only inside its private Docker network. Do not change the host binding to `0.0.0.0` and do not publish ADB to the public internet.

The Android data partition is stored in the named Docker volume `redroid-data`. Removing that volume destroys the Android data.

## Current limitation

This is a runtime deployment scaffold, not yet the complete web product. The authenticated browser gateway, screen streaming integration, remote input and APK upload workflow are being built separately. Do not expose the container directly to the internet.
