# Redroid migration plan

## Decision

Replace the browser-hosted v86 x86 emulator with a server-hosted Android runtime based on Redroid. The browser remains the presentation and control client; Android runs as a Linux container on a compatible Linux host.

```
Browser (Google TV UI)
  | HTTPS + authenticated API / future WSS stream
  v
GoogleTV gateway (token auth, status, input, APK install)
  | private Docker network
  +--> Redroid container (Android userspace + host Linux kernel)
  +--> ADB bridge (private)
  +--> ws-scrcpy-web candidate (video/audio/input/file transport)
  |
  +--> persistent /data volume
```

The browser must never connect directly to an unauthenticated ADB port.

## Technical facts and constraints

- Redroid is Android-in-Cloud, not an in-browser emulator. It runs in Docker/Podman/Kubernetes on a Linux host and supports amd64 and arm64.
- The host kernel must provide the Android binder driver (binderfs or binder_linux with binder, hwbinder and vndbinder devices). Depending on the kernel/image combination, ashmem compatibility or memfd support may also matter.
- The documented quick start uses a privileged container. Treat this as a significant host-security boundary; isolate the host and container, avoid mounting unrelated host paths, and do not expose ADB publicly.
- Redroid images are not Google-certified Android TV images. Android userspace, TV launcher, TV input behavior, Google Mobile Services, Play certification, Widevine/DRM and app compatibility must each be tested separately.
- ARM app compatibility depends on the selected image and native-bridge libraries. It is not a guarantee that every ARM-only APK works.
- GPU acceleration depends on the host GPU, driver, device nodes and Redroid configuration. CPU/container execution alone does not guarantee native GPU performance.
- A public static host such as Vercel cannot run this privileged Android container. The web UI can be hosted separately, but the runtime needs a compatible Linux server or a home-hosted machine with secure connectivity.
- Free cloud compute is not guaranteed. The project must support self-hosting first and document any free-tier limitations honestly.

## Components

### 1. Android runtime
- Use official `redroid/redroid` images.
- Begin with Android 14 for the first integration test; evaluate newer supported images after lifecycle and streaming work.
- Persist `/data` in a dedicated Docker volume or host directory.
- Configure display size and DPI for a landscape TV experience.
- Keep ADB private. For local maintenance only, bind it to 127.0.0.1.

### 2. Gateway and Android control
- The first gateway implementation is in `server/gateway`.
- It uses ADB over the private Docker network and exposes only status, an allowlisted remote-input API and APK installation.
- APK uploads are streamed to a temporary directory, capped at 512 MiB, installed with `adb install -r`, then removed.
- No arbitrary shell endpoint is exposed.
- The initial bearer token is a single-user proof-of-concept credential, not a production multi-user identity system.

### 3. Screen streaming
- Preferred integration candidate: [ws-scrcpy-web](https://github.com/bilbospocketses/ws-scrcpy-web), currently reviewed at v0.5.13.
- It provides browser WebSocket streaming, WebCodecs decoding, audio, D-pad/Touch input, file management and APK installation. See `docs/STREAMING-INTEGRATION.md`.
- Its Docker image is currently Linux amd64 only. It is open by default; enable its built-in login before remote access.
- The browser needs a secure context for WebCodecs. For reverse proxying, preserve Host, forward HTTPS metadata and WebSocket upgrade headers.
- The current gateway is a temporary proof of concept. Consolidate duplicate ADB, input and APK operations after the stream integration is proven.

### 4. Browser interface
- Keep the Google TV visual identity and responsive layout.
- Replace ISO/BIOS/RAM selection with runtime status, Start/Stop/Restart, stream viewport, TV remote, APK upload, storage status and connection diagnostics.
- Use a remote-friendly D-pad (Up/Down/Left/Right/OK/Back/Home) and touch/mouse input.
- The browser is a thin client; Android state lives on the server.

### 5. Persistence
- Store Android `/data` on a persistent volume.
- Provide controlled stop/start and backup/restore operations.
- Backups must be consistent: stop or quiesce the container before archiving the data directory.
- Never store credentials, ADB keys or session secrets in the frontend bundle or public repository.

### 6. Network and security
- Android obtains network connectivity through the host/container network.
- Expose only HTTPS and WSS through a reverse proxy.
- Require authentication and per-session authorization.
- Keep ADB (5555) and internal scrcpy ports private.
- Add request size limits, upload validation, rate limiting, origin checks, secure cookies/tokens and audit logs.
- Do not use a public unauthenticated relay.

## Migration sequence

1. Preserve the v0.9.5 v86 implementation on `main`; perform replacement work on `redroid-migration`.
2. Add a reproducible Redroid deployment profile and host preflight documentation.
3. Prove that a compatible Linux host can start Redroid and ADB can see Android.
4. Add the authenticated gateway for status, remote input and APK installation.
5. Prove screen capture and remote input from the server using scrcpy.
6. Add authenticated browser WebSocket streaming.
7. Add persistent `/data` backup/restore and lifecycle controls.
8. Rebuild the Google TV browser UI around the new runtime.
9. Add automated API, auth, upload and browser tests plus a manual Android boot/stream test.
10. Remove v86, ISO/BIOS selection, IndexedDB VM snapshots and 9p code only after Redroid acceptance tests pass.
11. Publish deployment instructions and a stable release.

## Acceptance criteria

- A clean supported Linux host passes a documented kernel preflight.
- Redroid reaches Android boot-complete and ADB reports device state `device`.
- Browser receives a live screen stream over WSS.
- D-pad, Back, Home, touch and keyboard events reach Android.
- An uploaded APK installs and launches.
- Android app/data state survives container restart.
- A backup can be restored to a fresh deployment.
- ADB is not reachable from the public internet.
- Unauthenticated users cannot view or control a session.
- CI validates frontend, gateway and deployment configuration; real Android runtime tests are reported separately from mock tests.

## Current status

- Added Redroid Docker Compose profile with persistent `/data` and loopback-only ADB.
- Added a read-only host preflight script and a live ADB/boot-complete acceptance script.
- Added an authenticated gateway with status, allowlisted input and APK install endpoints.
- Documented ws-scrcpy-web as the preferred streaming integration candidate and added its optional Compose sidecar. The new Redroid dashboard can embed its documented stream endpoint.
- CI validates gateway syntax, contract tests, browser smoke tests and Compose configuration.
- Added a dedicated `/redroid.html` browser dashboard alongside the preserved v86 page. It can check gateway status, send allowlisted remote actions, upload/install APKs, and embed ws-scrcpy-web's documented stream URL.
- Extended the production build and Chromium smoke test to cover both HTML entry points; the current CI run passes.
- Not yet verified: actual Redroid host boot, live scrcpy video/audio, WSS browser stream, end-to-end APK install on a real guest, production multi-user authentication and automated persistence/restore tests.
