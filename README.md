# GoogleTV-Web

Experimental x86 virtual machine launcher for running a compatible Android-x86 / Android TV ISO inside a browser tab.

## Compatibility reality
This is not a Google-certified Google TV implementation and does not stream Google's operating system. It embeds the open-source `v86` x86-to-WebAssembly emulator. v86 supports 32-bit x86 guests; upstream lists Android-x86 4.4-r2 as tested. Android TV 7.1 and later are unverified and may fail to boot or run slowly. Google Play certification, DRM/HDCP, Widevine, hardware video acceleration and ARM-only APKs are not provided.

## Current scope (0.3.0)
- Browser ISO and firmware selection.
- v86 WebAssembly runtime integration.
- Start, stop, restart and fullscreen controls.
- User-triggered full VM state snapshots stored in browser IndexedDB.
- Restore checks emulator version and selected ISO/firmware file metadata.
- Browser storage estimate and saved-session deletion controls.

Not implemented yet: standalone persistent virtual disk, ADB bridge, APK installation, network relay configuration, mobile-device validation and public deployment. A VM snapshot is not a separate disk image and can be very large because it contains machine memory/state.

## Development
Run `npm install`, then `npm run dev`. Use `npm run build` for a production build. The postinstall script copies the v86 WASM artifact to `public/v86/` for Vite deployments.

## Session snapshots
Snapshots remain in the current browser profile using IndexedDB. Restoring requires the same ISO and firmware files and the same emulator build/options. Browser quota, private browsing policies, clearing site data or changing browsers can remove or prevent snapshots. Do not treat this as a backup. The file checks compare name, size and last-modified time, not a cryptographic hash.

Firmware binaries are not bundled. Verify their source and redistribution rights before deployment. See `docs/BOOTSTRAP.md`.

Project source: MIT. Emulator dependency: BSD-2-Clause; see upstream license.