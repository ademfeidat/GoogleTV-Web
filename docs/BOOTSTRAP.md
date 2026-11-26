# Browser emulator bootstrap

This project uses v86, an x86-to-WebAssembly emulator. Upstream documents Android-x86 4.4-r2 as tested; Android TV 7.1 and later are not verified. 64-bit guest kernels are unsupported.

## Test order
1. Boot a small 32-bit x86 Linux ISO.
2. Test Android-x86 4.4-r2.
3. Test the target Android TV 7.1 32-bit ISO only after the first two steps.
4. Record boot, RAM, display, keyboard, audio and network results separately.

## Optional hard disk

A user may attach an existing raw disk image (`.img`, `.raw` or `.bin`) as v86 `hda` while booting the selected ISO as the CD-ROM. The disk image is loaded into memory before emulator construction. The selected image is loaded into an `ArrayBuffer`, which v86 uses as the writable disk backing. After stopping the VM, use **Export modified disk image** to download the changed bytes. Re-select that exported image on the next visit. This is manual persistence: a tab crash, refresh or close before export can lose unexported writes. The original uploaded `File` object is not modified on disk.

## Session snapshots
The app exposes v86 `save_state()` and `restore_state()` through user-triggered controls. The state buffer is stored in IndexedDB. Restoring requires the same v86 version, RAM size, ISO and firmware configuration. Current matching uses file name, byte size and last-modified timestamp; it is not a cryptographic identity check. Snapshot sizes can be large because VM memory is included. Storage quotas and browser data-clearing policies apply. Snapshots are not a portable disk backup and have not yet been validated against a real Android TV guest. Disk export is separate and must be performed after stopping the VM.

## Next engineering gates
- Verify snapshot/restore against a known-good 32-bit Linux guest, then Android-x86.
- Implement a standalone writable disk backend/export path only after validating v86 disk write-back semantics and IndexedDB/OPFS performance.
- Test the intended Android TV 7.1 32-bit ISO and record boot/display/input results.
- Investigate guest networking and ADB/APK transfer only after a guest boots reliably.

Firmware binaries are not bundled. Verify their source and redistribution rights before deployment.

## Network and APK transfer (experimental)
The application can attach a v86 network device only when a backend URL is explicitly supplied. Use a compatible inbrowser, WebSocket (ws:// / wss://) or WISP (wisp:// / wisps://) backend. The inbrowser backend is limited to v86 instances in the same browser and does not provide internet access. A WebSocket/WISP relay is an external service and is not included or operated by this project. Prefer TLS-secured relay URLs on public networks.

The application also initializes an empty v86 9p filesystem and exposes upload/download controls through vm.create_file() and vm.read_file(). Duplicate names within one selected batch are given numeric suffixes to avoid one upload silently replacing another. Transferred files are written at the root of the shared filesystem. The Android guest must include a compatible VirtIO 9p driver and mount the host9p tag (typically with a 9p mount command) before it can see those files. Android-x86 / Android TV kernel support has not been verified here. A successful browser-side create_file call only confirms that v86 accepted the host-side write; it does not prove that the guest kernel can mount or read the shared filesystem. The browser can also request a known file path through vm.read_file() and download the returned bytes. This is not a directory browser: the operator must know the exact path. File transfer is not APK installation; install the APK from inside the guest using its own package installer after confirming that the file is visible. Do not assume ARM-only APKs will run in an x86 guest.


## Runtime diagnostics (0.9.0)
The browser UI includes live event counters for detected display dimensions, IDE disk reads/writes, virtual NIC receive/transmit traffic and 9p filesystem attach/read/write events. The RAM figure is the configured guest memory allocation (512 MiB), not measured guest usage. Counters are reset for each new VM instance and are not persisted in snapshots. Network traffic counters only indicate activity observed at the emulated NIC; they do not confirm DNS resolution, relay health or public internet access. A missing display mode or 9p attachment means the corresponding guest event has not been observed yet; it is not a standalone boot-failure diagnosis.


## Boot validation protocol
See [BOOT-TESTING.md](./BOOT-TESTING.md) for automated preflight coverage, the manual guest boot matrix and the evidence required before marking Android boot as successful.
