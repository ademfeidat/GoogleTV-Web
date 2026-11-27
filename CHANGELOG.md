# Changelog

## 0.9.5 — Chromium browser smoke test
- Added a headless Chromium smoke test against the built production app.
- Verified page initialization, initial control states, RAM selector-to-diagnostics wiring and required-file selection enabling the Start control.
- Added Chromium installation and browser smoke execution to GitHub Actions CI.
- Fixed initial control-state setup so remote buttons start disabled until the VM is ready.
- Fixed the Start control so it remains disabled until an ISO, SeaBIOS and VGA BIOS are selected; added browser and static regression coverage.
- The smoke test deliberately does not start v86 with placeholder firmware or claim an Android guest boot.

## 0.9.4 — Emulator lifecycle test coverage
- Extracted the emulator-ready wait logic into a small lifecycle utility with injectable timeout functions.
- Added mock-v86 tests for normal readiness, already-ready state, the listener-registration race, timeout rejection and listener cleanup.
- Kept the production boot flow on the same readiness contract; these tests validate lifecycle handling without claiming that an Android guest booted.

## 0.9.3 — Configurable low-memory profiles
- Added selectable 256 MB, 384 MB and 512 MB guest RAM allocations for constrained host devices.
- Kept 512 MB as the default and marked lower-memory profiles experimental because Android guest requirements vary.
- Disabled RAM changes while a VM is active and included the selected allocation in session snapshot compatibility.
- Added CI coverage for the RAM selector and boot configuration.

## 0.9.2 — Boot preflight and artifact verification
- Added static contract tests for the v86 boot configuration, startup readiness timeout and partial-start cleanup.
- Added a production-build check that fails if the HTML entry point or v86 WebAssembly runtime is missing or empty.
- Added a staged manual boot protocol that distinguishes emulator initialization from a confirmed Android guest boot.

## 0.9.1 — Automated safety tests
- Extracted pure file-transfer helpers for isolated testing.
- Added Node.js tests for byte formatting, APK filename sanitization, duplicate naming and 9p path traversal rejection.
- Added the test suite to GitHub Actions CI.

## 0.9.0 — Live emulator diagnostics
- Added an in-session diagnostics panel for configured RAM, detected display mode, IDE disk read/write traffic, virtual NIC RX/TX traffic and 9p attach/read/write events.
- Wired counters to v86's documented event interface; counters reset when a new VM instance is created.
- Clarified that network counters do not establish public internet connectivity and RAM is configured allocation, not measured usage.

## 0.8.1 — Bidirectional 9p file exchange
- Added an optional guest-to-browser file download control using v86's read_file API.
- Added strict relative-path validation to reject empty, dot and parent-directory path segments.
- Updated the file-transfer panel to explain that the guest must mount host9p and that transfer does not install APKs.

## 0.8.0 — Touch remote
- Added an on-screen directional pad with OK, Back and Home controls for touch devices.
- Mapped remote buttons to v86 PC keyboard scan codes and gated them on emulator readiness.

## 0.7.1
- Fixed an emulator-ready event race that could leave startup or restore waiting for a readiness event that had already fired.
- Reset readiness state whenever a new emulator instance is created.
- Prevented duplicate APK filenames in one transfer batch from targeting the same 9p path; collisions receive numeric suffixes.
- Added an explicit runtime check for availability of the v86 9p file API.

## 0.7.0 — Network configuration and experimental APK transfer
- Added optional network device configuration using v86 net_device with an explicit relay URL.
- Added an empty 9p filesystem and APK file transfer through the documented create_file API.
- Added guest compatibility caveats: 9p mounting is guest-kernel dependent and file transfer does not install APKs.
- Kept networking disabled unless the user supplies a compatible relay; no public relay or internet service is bundled.

## 0.6.0 — Local virtual disk backups
- Added explicit save and restore controls for complete raw disk images using a dedicated IndexedDB object store.
- Restricted disk backup and restore actions to a stopped VM to avoid copying a disk while the guest may still be writing.
- Matched local backups to the selected source disk metadata and validated restored ArrayBuffer length.
- Added quota-aware error messaging and documented that backups are manual, browser-local copies rather than crash-safe autosave.

## 0.5.0 — Modified disk image export
- Added an export action for the writable v86 hard-disk ArrayBuffer after VM shutdown.
- Kept disk bytes in memory between stop and restart within the current page session.
- Documented the manual export workflow and data-loss risk if the tab closes before export.

## 0.4.0 — Optional hard disk attachment
- Added optional raw hard-disk image selection and attachment as v86 hda.
- Included disk file metadata in snapshot compatibility checks.
- Clarified that guest disk changes are retained through full VM snapshots only; standalone disk write-back/export is not implemented.

## 0.3.0 — Session snapshot milestone
- Added user-triggered full VM save and restore using the documented v86 state API.
- Stored snapshots in browser IndexedDB with storage estimate and delete control.
- Added restore checks for emulator version and selected ISO/firmware metadata.
- Documented that snapshots are large, browser-local and not portable disk backups.
- Verified dependency install, JavaScript syntax check and production build in GitHub Actions.

## 0.2.1 — Browser emulator foundation
- Added v86 WebAssembly runtime integration and initial VM launcher UI.
- Added ISO and firmware selection with start, stop, restart and fullscreen controls.
- Documented emulator compatibility limits and staged testing requirements.

## Unreleased — Redroid migration branch

- Added a private Docker Compose profile for Redroid with persistent Android `/data` and loopback-only ADB access.
- Added a read-only Linux host preflight check for architecture, Docker, Binder, ashmem/memfd compatibility and optional GPU render nodes.
- Added a token-authenticated Node.js ADB gateway with Android status, allowlisted TV remote input and bounded APK installation.
- Added gateway contract tests and CI syntax validation.
- Documented the secure streaming integration evaluation for ws-scrcpy-web.
- This is migration scaffolding only: real Redroid boot, browser video streaming, production login and full UI migration remain unverified.
