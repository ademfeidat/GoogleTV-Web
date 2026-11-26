# Browser emulator bootstrap

This project uses v86, an x86-to-WebAssembly emulator. Upstream documents Android-x86 4.4-r2 as tested; Android TV 7.1 and later are not verified. 64-bit guest kernels are unsupported.

## Test order
1. Boot a small 32-bit x86 Linux ISO.
2. Test Android-x86 4.4-r2.
3. Test the target Android TV 7.1 32-bit ISO only after the first two steps.
4. Record boot, RAM, display, keyboard, audio and network results separately.

## Optional hard disk

A user may attach an existing raw disk image (`.img`, `.raw` or `.bin`) as v86 `hda` while booting the selected ISO as the CD-ROM. The disk image is loaded into memory before emulator construction. Current persistence for its guest-side changes is through the full VM snapshot only. There is not yet a standalone disk write-back/export path; do not treat the original uploaded file as updated after the guest writes to it.

## Session snapshots
The app exposes v86 `save_state()` and `restore_state()` through user-triggered controls. The state buffer is stored in IndexedDB. Restoring requires the same v86 version, RAM size, ISO and firmware configuration. Current matching uses file name, byte size and last-modified timestamp; it is not a cryptographic identity check. Snapshot sizes can be large because VM memory is included. Storage quotas and browser data-clearing policies apply. Snapshots are not a portable disk backup and have not yet been validated against a real Android TV guest.

## Next engineering gates
- Verify snapshot/restore against a known-good 32-bit Linux guest, then Android-x86.
- Implement a standalone writable disk backend/export path only after validating v86 disk write-back semantics and IndexedDB/OPFS performance.
- Test the intended Android TV 7.1 32-bit ISO and record boot/display/input results.
- Investigate guest networking and ADB/APK transfer only after a guest boots reliably.

Firmware binaries are not bundled. Verify their source and redistribution rights before deployment.