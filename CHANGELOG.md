# Changelog

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
