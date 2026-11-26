# Changelog

## 0.4.0 — Optional hard disk attachment
- Added optional raw hard-disk image selection and attachment as v86 `hda`.
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
