# GoogleTV-Web

Experimental x86 virtual machine launcher for running a compatible Android-x86 / Android TV ISO inside a browser tab.

## Compatibility reality
This is not a Google-certified Google TV implementation and does not stream Google's operating system. It embeds the open-source `v86` x86-to-WebAssembly emulator. v86 supports 32-bit x86 guests; upstream lists Android-x86 4.4-r2 as tested. Android TV 7.1 and later are unverified and may fail to boot or run slowly. Google Play certification, DRM/HDCP, Widevine, hardware video acceleration and ARM-only APKs are not provided.

## Current scope (0.9.5)
- Browser ISO and firmware selection.
- Selectable 256 MB, 384 MB or 512 MB guest RAM profiles. Lower-memory modes are experimental and may not boot Android; the chosen RAM size is included in snapshot compatibility checks.
- Optional raw hard-disk image attachment as v86 `hda` (select an existing `.img`, `.raw` or `.bin` image).
- Export the modified in-memory disk image after stopping the VM.
- Save a complete copy of the raw virtual disk in browser IndexedDB after stopping the VM, then restore it later by selecting the same original disk file (name, size and last-modified metadata must match).
- v86 WebAssembly runtime integration.
- Start, stop, restart and fullscreen controls.
- On-screen touch remote with directional navigation, OK, Back and Home key events.
- User-triggered full VM state snapshots stored in browser IndexedDB.
- Restore checks emulator version and selected ISO/firmware file metadata.
- Browser storage estimate and saved-session deletion controls.
- Optional v86 network-device configuration using a user-supplied relay URL.
- Live diagnostics for configured RAM, display dimensions, IDE disk I/O, virtual NIC RX/TX traffic and 9p filesystem events. Counters are event-based, not a performance profiler or proof of internet reachability.
- Experimental bidirectional file exchange through v86's 9p filesystem API (`create_file` and `read_file`) when the guest supports VirtIO 9p. Duplicate APK filenames in one batch are automatically disambiguated; selected guest files can be downloaded back to the browser.

Not implemented yet: automatic crash-safe disk persistence, background write-back, ADB bridge, automatic APK installation, bundled/public network relay, mobile-device validation and public deployment. APK transfer only writes files into the emulator's 9p filesystem; the Android guest must have a compatible 9p driver and mount host9p to access them. This is not an installer and does not guarantee Android TV kernel support for 9p. Internet access requires a separately operated compatible relay; inbrowser only connects v86 instances within the browser and does not reach the public internet. Disk backups are manual, not automatic: save them only after stopping the VM. If the tab closes before saving or exporting, unsaved in-memory disk changes can be lost. A local backup duplicates the full disk image and can consume substantial browser quota; browser storage is not a substitute for an external backup. A VM snapshot can be very large because it contains machine memory/state. Exporting the disk image is a separate operation and does not export VM RAM or a resumable session.

## Tests and boot validation
Run `npm test` for file-transfer unit tests, emulator-readiness lifecycle tests with a mock v86 event source, and static v86 boot-contract checks. `npm run build` also verifies that the production output contains the HTML entry point and a non-empty v86 WebAssembly runtime. The Chromium smoke test opens the production build, checks initial controls, verifies the RAM selector updates diagnostics, and checks required-file selection enabling the Start control. It does not launch a VM or boot an Android guest. Follow `docs/BOOT-TESTING.md` for the staged manual guest-boot matrix.

## Development
Run `npm install`, then `npm run dev`. Use `npm run build` for a production build. The postinstall script copies the v86 WASM artifact to `public/v86/` for Vite deployments.

## Session snapshots
Snapshots remain in the current browser profile using IndexedDB. Restoring requires the same ISO and firmware files and the same emulator build/options. Browser quota, private browsing policies, clearing site data or changing browsers can remove or prevent snapshots. Do not treat this as a backup. The file checks compare name, size and last-modified time, not a cryptographic hash. Local disk backups are keyed to those same metadata fields; changing the source file metadata means the old backup will not be offered automatically.

Firmware binaries are not bundled. Verify their source and redistribution rights before deployment. See `docs/BOOTSTRAP.md`.

Project source: MIT. Emulator dependency: BSD-2-Clause; see upstream license.