# Boot validation protocol

This checklist separates browser-runtime readiness from a successful guest operating-system boot.

## Automated CI preflight

Every CI build now verifies:
- the production HTML entry point exists;
- a non-empty v86 WebAssembly binary is present under `dist/v86/`;
- the VM constructor retains the configured WASM path, memory allocation, BIOS, VGA BIOS, ISO/CD-ROM and display target;
- guest filesystem and optional network configuration remain explicit;
- startup waits for `emulator-ready` and has a finite timeout;
- startup failures destroy a partially initialized VM.

These checks protect the launcher integration. They do not execute WebAssembly in a browser and do not boot an ISO.

## Manual browser boot matrix

Use a desktop Chromium or Firefox browser first. Keep the same firmware files and record their source and hashes alongside each test result.

| Stage | Guest image | Expected evidence | Result |
|---|---|---|---|
| 1 | Small 32-bit x86 Linux ISO | BIOS output, kernel messages, detected display | Not run |
| 2 | Android-x86 4.4-r2 (32-bit) | Android boot animation or launcher | Not run |
| 3 | Target Android TV 7.1 (32-bit) | Android TV launcher and remote navigation | Not run |
| 4 | Same guest with writable raw disk | Partition/write survives export and re-import | Not run |
| 5 | Guest with 9p support | Mount host9p and read a transferred test file | Not run |
| 6 | Guest with supported network driver and external relay | DHCP, DNS, HTTPS request from guest | Not run |

## Required recording fields

For each attempt record: browser/version, device/CPU/RAM, ISO filename and SHA-256, firmware filenames and SHA-256, configured VM RAM, last visible boot message, whether `emulator-ready` fired, display dimensions, keyboard/remote response, disk test, 9p mount/read test, and network/DNS/HTTPS test.

Do not label a run "booted" merely because the v86 runtime initialized. The `emulator-ready` event indicates emulator initialization, not Android startup completion. A guest boot is confirmed only by visible guest boot evidence and successful interaction with its launcher.

## Current validation status

No Android ISO or firmware binaries are stored in this repository or supplied to CI. Therefore the automated checks cannot establish Android boot compatibility. Keep each manual stage marked "Not run" until it has been observed on a real browser session.
