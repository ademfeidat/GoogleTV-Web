# Redroid migration plan

## Decision

Replace the browser-hosted v86 x86 emulator with a server-hosted Android runtime based on redroid. The browser remains the presentation and control client; Android runs as a Linux container on a compatible Linux host.

Target architecture:

```
Browser (Google TV UI)
  | HTTPS + authenticated WebSocket
  v
GoogleTV gateway (session/auth/API)
  | private Docker network
  +--> redroid container (Android userspace + host Linux kernel)
  +--> scrcpy/ADB bridge (video, input, APK install, file operations)
  |
  +--> persistent /data volume
```

The browser must never connect directly to an unauthenticated ADB port. ADB and scrcpy control endpoints stay on loopback or a private container network.

## Technical facts and constraints

- redroid is Android-in-Cloud, not an in-browser emulator. It runs in Docker/Podman/Kubernetes on a Linux host and supports amd64 and arm64 images.
- The host kernel must provide the Android binder driver (binderfs or binder_linux with binder, hwbinder and vndbinder devices). Depending on the kernel/image combination, ashmem compatibility or memfd support may also matter. Do not assume that `modprobe ashmem_linux` is available on every modern distribution.
- The documented quick start uses a privileged container. Treat this as a significant host-security boundary; isolate the host and container, avoid mounting unrelated host paths, and do not expose ADB publicly.
- redroid images are not Google-certified Android TV images. They provide Android userspace in a container; TV launcher, TV input behavior, Google Mobile Services, Play certification, Widevine/DRM and app compatibility must each be tested separately.
- ARM app compatibility depends on the selected image and native-bridge libraries. It is not a guarantee that every ARM-only APK works.
- GPU acceleration depends on the host GPU, driver, device nodes and redroid configuration. CPU/container execution alone does not guarantee native GPU performance.
- A public static host such as Vercel cannot run this privileged Android container. The web UI can be hosted separately, but the runtime needs a compatible Linux server or a home-hosted machine with secure connectivity.
- Free cloud compute is not guaranteed. The project must support self-hosting first and document any free-tier limitations honestly.

## Components

### 1. Android runtime
- Use the official `redroid/redroid` images.
- Begin with an Android 14 baseline for the first integration test; evaluate Android 16 after the basic lifecycle and streaming path works.
- Persist `/data` in a dedicated Docker volume or host directory.
- Configure display size and DPI for a landscape TV experience.
- Keep the ADB port private. For local maintenance only, bind it to 127.0.0.1.

### 2. Screen streaming and input
- Evaluate NetrisTV/ws-scrcpy as a browser client and protocol reference.
- The browser needs WebSocket transport and a supported H.264 decoding path; WebCodecs availability differs by browser.
- The upstream ws-scrcpy documentation describes file push, remote shell and input, but also warns that its default deployment lacks authentication and transport encryption. It must sit behind an authenticated HTTPS/WSS gateway and must not be exposed directly.
- If the upstream fork or protocol is unsuitable, use vanilla scrcpy with an ADB tunnel and implement a narrow authenticated WebSocket gateway. Do not fork or vendor the entire stack before the proof of concept.

### 3. APK installation and file management
- Upload APK through the authenticated gateway.
- Store it in a temporary server-side upload directory with size limits and safe filenames.
- Install using an internal ADB command (for example, `adb install`) after validating the active session.
- Return install output and progress to the browser.
- Do not expose a general-purpose shell to unauthenticated users.

### 4. Browser interface
- Keep the Google TV visual identity and responsive layout.
- Replace ISO/BIOS/RAM selection with runtime status, Start/Stop/Restart, stream viewport, TV remote, APK upload, storage status and connection diagnostics.
- Use a remote-friendly D-pad (Up/Down/Left/Right/OK/Back/Home) and touch/mouse input.
- Use the browser only as a thin client; Android state lives on the server.

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

1. Preserve the current v0.9.5 implementation on `main`; perform the replacement on the `redroid-migration` branch.
2. Add a reproducible Redroid deployment profile and host preflight documentation.
3. Prove that a compatible Linux host can start the Redroid container and that ADB can see Android.
4. Prove screen capture and remote input from the server using scrcpy.
5. Add the authenticated gateway and browser WebSocket streaming.
6. Add APK upload and installation via ADB.
7. Add persistent /data storage and backup/restore.
8. Rebuild the Google TV browser UI around the new runtime.
9. Add automated API, auth, upload, and browser tests; add a manual Android boot/stream test.
10. Remove v86, ISO/BIOS selection, IndexedDB VM snapshots and 9p code only after the Redroid path passes its acceptance tests.
11. Publish deployment instructions and a stable release.

## Acceptance criteria

- A clean supported Linux host passes a documented kernel preflight.
- Redroid container reaches Android boot-complete and ADB reports device state `device`.
- Browser receives a live screen stream over WSS.
- D-pad, Back, Home, touch and keyboard events reach Android.
- An uploaded APK installs through ADB and launches.
- Android app/data state survives container restart.
- A backup can be restored to a fresh deployment.
- ADB is not reachable from the public internet.
- Unauthenticated users cannot view or control a session.
- CI validates the frontend, gateway and deployment configuration; real Android runtime tests are reported separately from mock tests.

## Current status

This branch starts the migration design and deployment scaffold. It does not yet include a running Redroid host, a working browser stream, a gateway, or a verified Android boot. Those require a compatible Linux host for integration testing.
