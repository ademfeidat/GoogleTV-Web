# Redroid migration foundation

## Decision

The target runtime is Redroid (Android-in-Container), not v86 and not a browser-side x86 emulator. The browser remains the user interface; Android runs in a Linux container host. This removes the requirement for QEMU/KVM as a host virtual-machine hypervisor, but it does **not** remove the Linux kernel requirements or the need for a machine/server that can run Docker.

The existing v86 launcher is retained on the current `main` branch while this migration foundation is developed separately. Do not describe the current v86 application as already running Redroid.

## Target architecture

1. **Web client** — Google TV-oriented launcher, remote-control input, APK manager, session controls and diagnostics.
2. **Authenticated control API** — creates/stops sessions, reports readiness, validates APK uploads and issues short-lived session credentials. It must not expose the Docker socket or raw ADB port to browsers.
3. **Android runtime host** — Docker/Compose runs one Redroid container per isolated session, with a persistent `/data` volume.
4. **Device bridge** — ADB is private to the host/control plane. APK installation uses `adb install` after validating the target session.
5. **Screen/input transport** — a separate streaming gateway is required to deliver video and input to a normal browser. ADB connectivity alone is not browser video streaming. WebRTC is the target transport, but this repository does not yet contain a working Redroid-to-browser WebRTC implementation.

## Android versions

The upstream Redroid image catalogue documents Android 8.1, 9, 10, 11, 12, 13, 14, 15 and 16, including architecture-specific and 64-bit-only variants for several releases. The deployment tag is configurable through `REDROID_TAG`; pin a tested tag for reproducible deployments rather than assuming every tag works on every host.

The first smoke-test target is Android 16 on AMD64. Android 12 and 8.1 are compatibility test targets after the first image boots. A successful container start is not proof that the Google TV launcher, Google Play services or a particular APK works.

## Host requirements and security

Redroid requires a Linux host with kernel facilities including BinderFS, ashmem/memfd support, IPv6, DMA-BUF/ION facilities as applicable, and 4 KB memory pages. Kernel support varies by distribution and kernel build. Run `bash scripts/redroid-host-preflight.sh` before deployment.

The container needs elevated privileges for the Android kernel interfaces. Treat the runtime host as a trusted, isolated machine. Do not expose the Docker socket, privileged container management API, or ADB port to the public internet. The provided Compose file binds ADB to `127.0.0.1` and persists Android data in a named Docker volume. Production access must go through an authenticated gateway with per-session authorization and rate limits.

GPU passthrough is optional and is not enabled in the initial Compose profile. Start with software rendering / host defaults, establish a clean boot, then add a host-specific render node only after validating the GPU driver and device permissions.

## ARM APK compatibility

Redroid images are available for AMD64 and ARM64. CPU architecture alone does not guarantee that every APK runs. ARM applications on an AMD64 guest may require a compatible native bridge (for example, libndk_translation or Houdini), which is a separate integration and licensing task. The initial milestone must report APK ABI compatibility rather than silently promising universal APK support.

## Google TV scope

Redroid is an Android runtime, not a Google-certified Google TV image. The Google TV launcher, Google Mobile Services, Play Store, DRM/Widevine and Play Integrity are separate compatibility and licensing concerns. Do not bundle proprietary Google components without a lawful distribution path. The project can first validate an Android TV-compatible launcher and sideloaded APKs.

## Current implementation in this branch

- Docker Compose deployment skeleton for one Redroid instance.
- Persistent `/data` volume.
- ADB bound to loopback only.
- Configurable Android image tag and 1080p landscape display profile.
- Host preflight script for key kernel/runtime prerequisites.
- Automated static checks for the deployment safety contract.

## Not implemented / not validated yet

- Authenticated multi-session control API.
- Browser-compatible WebRTC video and input gateway.
- Automated APK upload/install API.
- Multi-user isolation and quotas.
- GPU passthrough.
- ARM native bridge.
- Google TV launcher / GMS packaging.
- Actual Android 8.1–16 boot matrix on supported Linux hosts.

## First manual validation

On a Linux host that passes preflight:

1. Copy `deployment/redroid/.env.example` to `deployment/redroid/.env` and select a pinned image tag.
2. Start with `docker compose --env-file deployment/redroid/.env -f deployment/redroid/compose.yaml up -d`.
3. Check `docker compose -f deployment/redroid/compose.yaml ps` and `docker logs googletv-redroid`.
4. Connect locally with `adb connect 127.0.0.1:5555`, then verify `adb -s 127.0.0.1:5555 shell getprop ro.build.version.release`.
5. Stop the service and restart it; verify that installed test APKs and app data remain in the named `redroid-data` volume.
6. Record host kernel, CPU architecture, image tag, Android release, boot time, display dimensions, ADB status, GPU mode and APK ABI results.

This sequence validates the Android container only. Browser video streaming remains a separate milestone.
