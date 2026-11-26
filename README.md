# GoogleTV-Web

Experimental x86 virtual machine launcher for running a compatible Android-x86 / Android TV ISO inside a browser tab.

## Compatibility reality
This is not a Google-certified Google TV implementation and does not stream Google's operating system. It embeds the open-source `v86` x86-to-WebAssembly emulator. v86 supports 32-bit x86 guests; upstream lists Android-x86 4.4-r2 as tested. Android TV 7.1 and later are unverified and may fail to boot or run slowly. Google Play certification, DRM/HDCP, Widevine, hardware video acceleration and ARM-only APKs are not provided.

## Current scope (0.2.0)
- Browser ISO selection.
- SeaBIOS and VGA BIOS file inputs.
- v86 WebAssembly runtime integration.
- Start, stop, restart and fullscreen controls.
- No per-user server VM required for local browser emulation.

Not implemented yet: persistent virtual disk, ADB bridge, APK installation, networking bridge, mobile-device support and deployment.

## Development
Run `npm install`, then `npm run dev`. Use `npm run build` for a production build.

The current bootstrap expects the v86 WASM asset at `/node_modules/v86/build/v86.wasm`; verify the installed package's asset path before deployment. Firmware binaries are not bundled. See `docs/BOOTSTRAP.md`.

Project source: MIT. Emulator dependency: BSD-2-Clause; see upstream license.