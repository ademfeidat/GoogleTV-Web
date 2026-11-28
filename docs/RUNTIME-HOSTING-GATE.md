# InstaBox runtime hosting decision

Last reviewed: 2026-11-28

## Provider decision

**Selected provider: InstaBox (instabox.sh).** This is the agreed hosting provider for GOOGLETV-WEB. Do not substitute GratisVPS, VPSFree, Oracle Cloud, or another provider unless the user explicitly changes this decision.

Official references:
- https://instabox.sh/
- https://instabox.sh/docs/use-cases/android
- https://instabox.sh/docs/access/ports
- https://instabox.sh/docs/pricing

## Free machine limits to design around

The currently documented Free plan provides one machine at 4 vCPU / 8 GiB RAM, a 20 GiB persistent `/data` disk, up to five snapshots, 30-minute idle pause, and a maximum run window of up to 480 minutes (8 hours). Verify the account's live limits before provisioning; do not assume a machine can run 24/7.

The Android template is available on the Free plan. It runs Android 14 as a container on the machine's own Linux kernel (not an emulator and not a nested VM), with ADB and a desktop. The official guide says Android uses about 1–2 GiB while running and is ready roughly 20 seconds after machine start.

Important Android-template limits:
- No Google Play or Google services.
- x86_64 only; ARM-only native APKs are not supported by built-in ARM translation.
- Software rendering; suitable for app testing and UI automation, not heavy 3D/gaming.
- The dashboard's Computer tab displays the Android window and accepts clicks and typing.

## Architecture direction

Prefer InstaBox's native `android` template as the first runtime target. Do not assume a separately privileged Redroid Docker host is available, and do not deploy the old Redroid Compose stack unchanged until its compatibility inside InstaBox has been demonstrated.

Proposed flow:

```
Browser (GOOGLETV-WEB UI on Vercel)
  | authenticated HTTPS / WSS
  v
InstaBox machine (Free plan)
  | Android 14 template + ADB
  | persistent Android app data
  | optional small project gateway / stream adapter
  v
Android apps and TV-style launcher
```

Use InstaBox's machine lifecycle/API to start, wake, pause, inspect and execute commands. Use the documented ADB path for APK install and input. Investigate the supported Computer/desktop access path for browser video and control before choosing an iframe or custom streaming adapter.

InstaBox published ports can provide HTTPS URLs for web services running inside the machine. Public ports are reachable by anyone with the URL; private ports require the generated token link. Keep control APIs private/authenticated and never expose ADB as a public port.

## Project acceptance gates

1. Create one Free-plan machine from the `android` template.
2. Confirm Android 14 boot completion using the documented `instabox exec` and `docker exec instabox-android getprop sys.boot_completed` check.
3. Confirm ADB sees Android and install a harmless test APK.
4. Verify clicks, keyboard and D-pad-equivalent input.
5. Prove that the Android display can be streamed or embedded in the GOOGLETV-WEB browser UI through a supported secure path.
6. Verify app data survives pause/resume and machine restart.
7. Verify idle pause and 8-hour run limits; implement wake/resume and user-visible runtime status.
8. Confirm the free plan is never billed and avoid paid resources or paid fallback.
9. Keep API keys and private port tokens out of the frontend bundle and public Git history.

## Relationship to the Redroid migration branch

The existing `redroid-migration` branch contains a generic Redroid Docker Compose/gateway/streaming proof of concept. It is not yet proven against InstaBox and must not be represented as a working deployment. First validate InstaBox's native Android template. Reuse only the gateway/API pieces that fit; adapt or replace host provisioning and streaming based on the actual InstaBox machine interfaces.

## Current status

**Provider selected; runtime provisioning and browser streaming are not yet proven.** Vercel remains the static frontend host only. A READY Vercel deployment does not mean Android is running.
