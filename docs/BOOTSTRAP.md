# Browser emulator bootstrap

This project uses v86, an x86-to-WebAssembly emulator. Upstream documents Android-x86 4.4-r2 as tested; Android TV 7.1 and later are not verified. 64-bit guest kernels are unsupported.

## Test order
1. Boot a small 32-bit x86 Linux ISO.
2. Test Android-x86 4.4-r2.
3. Test the target Android TV 7.1 32-bit ISO only after the first two steps.
4. Record boot, RAM, display, keyboard, audio and network results separately.

Firmware binaries are not bundled. Verify their source and redistribution rights before deployment. Persistent disk, ADB/APK installation and network bridging are not implemented yet.