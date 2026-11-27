# Browser streaming integration decision

## Preferred component

Evaluate **ws-scrcpy-web** (the maintained descendant of NetrisTV/ws-scrcpy) as the streaming and device-control sidecar:

- Project: https://github.com/bilbospocketses/ws-scrcpy-web
- Candidate version: `v0.5.13` (reviewed 2026-11-27).
- Published Docker image: `bilbospocketses/ws-scrcpy-web:0.5.13`.
- Current Docker image support is Linux amd64 only; an arm64 deployment needs a different build path.
- It uses ADB plus the upstream scrcpy-server and multiplexes video/audio/control over WebSocket.
- It supports WebCodecs video decoding, audio, D-pad/Touch input modes, file management, and APK installation.
- It exposes a programmatic `WsScrcpy.startStream()` API and an `embed.html` option for embedding.

This is a preferred integration candidate, not yet a dependency of the GoogleTV-Web deployment. First validate it against a Redroid container on the same private Docker network.

## Proposed connection

```
GoogleTV-Web browser UI
  | HTTPS, authenticated page
  | iframe or WsScrcpy.startStream()
  v
ws-scrcpy-web sidecar
  | ADB over private Docker network
  v
redroid:5555
  |
  +--> Android display, audio and input
```

The stream sidecar should connect to the Redroid service name and port (`redroid:5555`) over the private Docker network. Do not publish ADB to the internet.

## Authentication and browser requirements

- ws-scrcpy-web is open by default. Anyone who can reach it can control connected devices unless its login subsystem is enabled.
- Enable a named admin account and password, then enable login. Do not leave remote-admin-without-sign-in enabled.
- In a container, the app documents a bootstrap path for creating the first admin. If the remote-admin opt-out is used temporarily, keep the service bound to loopback, create the admin, enable login, then recreate the container without the opt-out.
- Use HTTPS for access from another device. WebCodecs is available only in secure contexts such as HTTPS or localhost.
- For a reverse proxy, preserve the original Host header, forward `X-Forwarded-Proto: https`, and support WebSocket `Upgrade` / `Connection` headers.
- If embedding cross-origin, explicitly allow the GoogleTV-Web origin in `frameAncestors`; use HTTPS so the partitioned secure cookies work.
- Keep the sidecar on loopback/private networking until authentication and proxy behavior have been tested.

## Consolidation plan

The current `server/gateway` is a narrow proof-of-concept API for status, remote input and APK installation. ws-scrcpy-web already provides overlapping ADB, input, file and APK features. After a real integration test, consolidate these responsibilities instead of maintaining two competing ADB control paths. Keep only the GoogleTV-specific session/lifecycle API that remains necessary.

## Required proof before adoption

1. Start Redroid and verify `adb connect redroid:5555` from the stream container.
2. Confirm device state `device` and Android boot completion.
3. Open the stream from a secure browser context and verify live video and audio.
4. Verify D-pad, touch, keyboard, Back and Home input.
5. Upload and install an APK; launch it inside Android.
6. Enable login and confirm unauthenticated clients cannot view or control the device.
7. Embed the stream in GoogleTV-Web and verify the cross-origin HTTPS configuration.
8. Re-test after a Redroid container restart and confirm Android data persists.

A successful web build or Docker Compose syntax check does not count as this integration proof.
