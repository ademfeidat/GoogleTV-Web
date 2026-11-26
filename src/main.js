import { V86 } from 'v86';
import { formatBytes, planApkPaths, safeApkName, safeGuestFilePath } from './utils.js';
import './style.css';

const root = document.querySelector('#root');
root.innerHTML = `
<main class="shell">
<header class="top"><div class="brand"><div class="logo">▶</div><div><h1>GoogleTV Web</h1><p>Browser-based Android TV experiment</p></div></div><span class="pill">Experimental · x86 / WebAssembly</span></header>
<section class="layout">
<aside class="panel"><h2>Virtual machine setup</h2>
<div class="field"><label for="iso">Android-x86 / Android TV ISO</label><input class="file" id="iso" type="file" accept=".iso"><p class="hint" id="iso-name">No ISO selected</p></div>
<div class="field"><label for="disk">Virtual hard disk (optional · raw .img/.bin)</label><input class="file" id="disk" type="file" accept=".img,.bin,.raw"><p class="hint" id="disk-name">No hard disk selected — live ISO mode only</p><button id="export-disk" disabled>Export modified disk image</button><div class="actions disk-actions"><button id="save-disk" disabled>Save disk to browser</button><button id="restore-disk" disabled>Restore local disk</button></div><p class="hint" id="disk-storage-info">Local disk backup not checked yet.</p></div>
<div class="field"><label for="bios">SeaBIOS firmware (.bin)</label><input class="file" id="bios" type="file" accept=".bin"></div>
<div class="field"><label for="vga">VGA BIOS (.bin)</label><input class="file" id="vga" type="file" accept=".bin"></div>
<div class="storage"><h3>Optional network</h3><p class="hint">Configure a v86-compatible network relay. Leave blank to disable networking. inbrowser connects browser VMs only; it does not provide internet access.</p><div class="field"><label for="network-type">Virtual network card</label><select class="file" id="network-type"><option value="virtio">VirtIO (recommended for modern guests)</option><option value="ne2k">NE2000 (fallback)</option></select></div><div class="field"><label for="network-relay">Network backend URL</label><input class="file" id="network-relay" type="text" placeholder="inbrowser or wss://your-relay.example/"></div><p class="hint">Public relays are not bundled. A secure WSS/WISP relay must be supplied by the operator.</p></div>
<div class="storage"><h3>9p file exchange (experimental)</h3><p class="hint">Send APK files to the emulator's shared 9p filesystem. The guest must support VirtIO 9p and mount host9p before files become visible. Transfer does not install APKs automatically.</p><input class="file" id="apk-files" type="file" accept=".apk,application/vnd.android.package-archive" multiple><div class="actions"><button id="send-apks" disabled>Send APKs to VM</button></div><p class="hint" id="apk-status">Start the VM before sending files.</p><div class="field"><label for="guest-file-path">File path inside shared 9p folder</label><input class="file" id="guest-file-path" type="text" placeholder="example.apk" value="example.apk"></div><div class="actions"><button id="fetch-guest-file" disabled>Download file from VM</button></div><p class="hint" id="guest-file-status">Enter a path to a file that already exists in the guest's shared folder.</p></div>
<div class="actions"><button class="primary" id="start" disabled>Start VM</button><button id="stop" disabled>Stop VM</button></div>
<div class="storage"><h3>Session storage</h3><p class="hint">Save or restore the complete emulator state in this browser. Use the same ISO, optional disk image and firmware files when restoring.</p><div class="actions"><button id="save" disabled>Save session</button><button id="restore" disabled>Restore session</button></div><button class="danger" id="delete-save">Delete saved session</button><p class="hint" id="storage-info">Checking browser storage…</p></div>
<p class="notice"><b>Compatibility warning</b><br>v86 is a 32-bit x86 emulator. Upstream lists Android-x86 4.4-r2 as tested; Android TV 7.1 and newer are unverified.</p></aside>
<section class="panel screen-panel"><div class="screen-head"><h2>Virtual display</h2><div><button id="restart">Restart</button> <button id="full">Fullscreen</button></div></div>
<div class="screen" id="screen"><div style="white-space:pre;font:14px monospace;line-height:14px"></div><canvas style="display:none"></canvas></div><div class="status" id="status">Select an ISO and firmware files to begin.</div>
<div class="diagnostics" aria-live="polite">
  <div class="diagnostics-head"><h3>Live diagnostics</h3><span id="diag-state">VM stopped</span></div>
  <div class="diagnostics-grid">
    <div><small>Configured RAM</small><b id="diag-ram">512 MB</b></div>
    <div><small>Display</small><b id="diag-display">Not detected</b></div>
    <div><small>Disk read / write</small><b id="diag-disk">0 / 0 MB</b></div>
    <div><small>Network RX / TX</small><b id="diag-network">0 / 0 KB</b></div>
    <div><small>9p read / write</small><b id="diag-9p">0 / 0 KB</b></div>
    <div><small>9p filesystem</small><b id="diag-9p-state">Not attached</b></div>
  </div>
  <p class="hint">Event counters reset for each new VM. Network traffic does not prove public internet connectivity; RAM is configured allocation, not measured usage.</p>
</div>
<div class="remote" aria-label="Touch remote control">
  <div class="remote-heading"><b>Touch remote</b><span class="hint">For phones and touch screens</span></div>
  <div class="remote-pad">
    <span></span><button type="button" data-remote-key="up" aria-label="Up">▲</button><span></span>
    <button type="button" data-remote-key="left" aria-label="Left">◀</button><button type="button" data-remote-key="select" class="remote-select">OK</button><button type="button" data-remote-key="right" aria-label="Right">▶</button>
    <span></span><button type="button" data-remote-key="down" aria-label="Down">▼</button><span></span>
  </div>
  <div class="remote-actions"><button type="button" data-remote-key="back">Back</button><button type="button" data-remote-key="home">Home</button></div>
  <p class="hint">Controls send standard PC keyboard scan codes. Guest key mapping depends on the Android build.</p>
</div>
</section>
</section><footer>GoogleTV-Web · Local browser emulation · Session data stays in this browser profile.</footer></main>`;

const $ = id => document.getElementById(id);
const DB_NAME = 'googletv-web-storage';
const DB_VERSION = 2;
const STATE_KEY = 'latest';
const EMULATOR_VERSION = 'v86-0.5.476';
const MEMORY_SIZE = 512 * 1024 * 1024;
let vm = null;
let iso = null;
let disk = null;
let diskBuffer = null;
let diskBufferSource = null;
let bootFiles = null;
let starting = false;
let emulatorReady = false;

const diagnostics = { diskRead: 0, diskWrite: 0, netRx: 0, netTx: 0, p9Read: 0, p9Write: 0, p9Attached: false, width: 0, height: 0, bpp: 0 };
function renderDiagnostics(state = vm ? (emulatorReady ? 'Ready / running' : 'Initializing') : 'VM stopped') {
  $('diag-state').textContent = state;
  $('diag-ram').textContent = (MEMORY_SIZE / 1048576) + ' MB';
  $('diag-display').textContent = diagnostics.width ? diagnostics.width + ' × ' + diagnostics.height + ' · ' + diagnostics.bpp + ' bpp' : 'Not detected';
  $('diag-disk').textContent = formatBytes(diagnostics.diskRead) + ' / ' + formatBytes(diagnostics.diskWrite);
  $('diag-network').textContent = formatBytes(diagnostics.netRx) + ' / ' + formatBytes(diagnostics.netTx);
  $('diag-9p').textContent = formatBytes(diagnostics.p9Read) + ' / ' + formatBytes(diagnostics.p9Write);
  $('diag-9p-state').textContent = diagnostics.p9Attached ? 'Attached' : 'Not attached';
}
function resetDiagnostics() {
  Object.assign(diagnostics, { diskRead: 0, diskWrite: 0, netRx: 0, netTx: 0, p9Read: 0, p9Write: 0, p9Attached: false, width: 0, height: 0, bpp: 0 });
  renderDiagnostics('Initializing');
}


function setStatus(message, kind = 'info') {
  $('status').textContent = message;
  $('status').dataset.state = kind;
}
function fileSignature(file) {
  return { name: file.name, size: file.size, lastModified: file.lastModified };
}
function currentSignature() {
  return {
    iso: fileSignature(iso),
    disk: disk ? fileSignature(disk) : null,
    bios: fileSignature($('bios').files[0]),
    vga: fileSignature($('vga').files[0]),
    emulator: EMULATOR_VERSION,
    memorySize: MEMORY_SIZE,
  };
}
function sameSignature(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('sessions')) {
        request.result.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains('disks')) {
        request.result.createObjectStore('disks', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function dbRequest(mode, action, storeName = 'sessions') {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store);
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}
async function readSavedSession() {
  return dbRequest('readonly', store => store.get(STATE_KEY));
}
async function refreshStorageControls() {
  try {
    const saved = await readSavedSession();
    $('restore').disabled = !saved || !iso || !$('bios').files[0] || !$('vga').files[0] || !!vm || starting;
    $('delete-save').disabled = !saved;
    $('storage-info').textContent = saved
      ? 'Saved session: ' + new Date(saved.savedAt).toLocaleString() + ' · ' + (saved.byteLength / 1048576).toFixed(1) + ' MB'
      : 'No saved session in this browser.';
  } catch (error) {
    $('storage-info').textContent = 'Browser storage unavailable: ' + error.message;
  }
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      $('storage-info').textContent += quota
        ? ' · Storage used ' + (used / 1048576).toFixed(0) + ' / ' + (quota / 1048576).toFixed(0) + ' MB'
        : '';
    } catch { /* Storage estimate is optional. */ }
  }
}
function setButtons() {
  $('export-disk').disabled = !diskBuffer || !!vm || starting;
  $('save-disk').disabled = !diskBuffer || !!vm || starting;
  $('restore-disk').disabled = !disk || !!vm || starting;
  $('start').disabled = !iso || starting || !!vm;
  $('stop').disabled = !vm;
  $('save').disabled = !vm || starting;
  $('send-apks').disabled = !vm || !emulatorReady || starting || !$('apk-files').files.length;
  $('fetch-guest-file').disabled = !vm || !emulatorReady || starting;
  document.querySelectorAll('[data-remote-key]').forEach(button => {
    button.disabled = !vm || !emulatorReady || starting;
  });
  refreshStorageControls();
  refreshDiskControls();
}

function diskBackupId() {
  if (!disk) return null;
  return 'disk:' + JSON.stringify(fileSignature(disk));
}
async function readSavedDisk() {
  const id = diskBackupId();
  return id ? dbRequest('readonly', store => store.get(id), 'disks') : null;
}
async function refreshDiskControls() {
  try {
    const saved = await readSavedDisk();
    $('restore-disk').disabled = !disk || !saved || !!vm || starting;
    $('disk-storage-info').textContent = saved
      ? 'Local backup found · ' + (saved.byteLength / 1048576).toFixed(1) + ' MB · ' + new Date(saved.savedAt).toLocaleString()
      : disk ? 'No local backup for this exact disk file.' : 'Select a disk image to check for a local backup.';
  } catch (error) {
    $('disk-storage-info').textContent = 'Local disk storage unavailable: ' + error.message;
  }
}
async function saveDiskLocally() {
  if (!diskBuffer || !disk || vm || starting) return;
  starting = true;
  setButtons();
  setStatus('Saving the complete virtual disk to this browser…', 'busy');
  try {
    const copy = diskBuffer.slice(0);
    const record = { id: diskBackupId(), signature: fileSignature(disk), buffer: copy, byteLength: copy.byteLength, savedAt: Date.now() };
    await dbRequest('readwrite', store => store.put(record), 'disks');
    setStatus('Disk backup saved locally. It can be restored after selecting the same original disk image.', 'ok');
  } catch (error) {
    setStatus('Local disk save failed: ' + (error?.name === 'QuotaExceededError' ? 'Browser storage quota exceeded. Export the disk image instead or free browser storage.' : error.message), 'error');
  } finally {
    starting = false;
    setButtons();
  }
}
async function restoreDiskLocally() {
  if (!disk || vm || starting) return;
  starting = true;
  setButtons();
  setStatus('Checking local disk backup…', 'busy');
  try {
    const record = await readSavedDisk();
    if (!record || JSON.stringify(record.signature) !== JSON.stringify(fileSignature(disk))) {
      throw new Error('No matching local backup exists for this exact disk file.');
    }
    if (!(record.buffer instanceof ArrayBuffer) || record.buffer.byteLength !== record.byteLength) {
      throw new Error('The saved disk backup is incomplete or invalid.');
    }
    diskBuffer = record.buffer.slice(0);
    diskBufferSource = disk;
    setStatus('Local disk backup restored into memory. Start the VM to use this saved disk state.', 'ok');
  } catch (error) {
    setStatus('Local disk restore failed: ' + error.message, 'error');
  } finally {
    starting = false;
    setButtons();
  }
}

$('disk').addEventListener('change', event => {
  disk = event.target.files?.[0] ?? null;
  diskBuffer = null;
  diskBufferSource = null;
  $('export-disk').disabled = true;
  $('save-disk').disabled = true;
  $('restore-disk').disabled = true;
  $('disk-name').textContent = disk ? disk.name + ' · ' + (disk.size / 1048576).toFixed(1) + ' MB' : 'No hard disk selected — live ISO mode only';
  setButtons();
});

$('iso').addEventListener('change', event => {
  iso = event.target.files?.[0] ?? null;
  $('iso-name').textContent = iso ? iso.name + ' · ' + (iso.size / 1048576).toFixed(1) + ' MB' : 'No ISO selected';
  setButtons();
});

async function createEmulator({ autostart = true } = {}) {
  emulatorReady = false;
  resetDiagnostics();
  const bios = $('bios').files[0];
  const vga = $('vga').files[0];
  if (!iso || !bios || !vga) throw new Error('Select the ISO, SeaBIOS and VGA BIOS files first.');
  const urls = [iso, bios, vga].map(file => URL.createObjectURL(file));
  if (disk && (!diskBuffer || diskBufferSource !== disk)) {
    diskBuffer = await disk.arrayBuffer();
    diskBufferSource = disk;
  }
  if (!disk) diskBuffer = null;
  bootFiles = urls;
  const relay = $('network-relay').value.trim();
  const netType = $('network-type').value;
  if (relay && relay !== 'inbrowser' && !/^(wss?|wisps?):\/\//i.test(relay)) {
    throw new Error('Network backend must be inbrowser or a ws://, wss://, wisp:// or wisps:// URL.');
  }
  const instance = new V86({
    wasm_path: '/v86/v86.wasm',
    memory_size: MEMORY_SIZE,
    vga_memory_size: 8 * 1024 * 1024,
    screen_container: $('screen'),
    bios: { url: urls[1] },
    vga_bios: { url: urls[2] },
    cdrom: { url: urls[0] },
    ...(diskBuffer ? { hda: { buffer: diskBuffer } } : {}),
    filesystem: {},
    ...(relay ? { net_device: { type: netType, relay_url: relay } } : {}),
    autostart,
  });

  instance.add_listener('ide-read-end', event => { diagnostics.diskRead += Number(event?.[1]) || 0; renderDiagnostics(); });
  instance.add_listener('ide-write-end', event => { diagnostics.diskWrite += Number(event?.[1]) || 0; renderDiagnostics(); });
  instance.add_listener('eth-receive-end', event => { diagnostics.netRx += Number(event?.[0]) || 0; renderDiagnostics(); });
  instance.add_listener('eth-transmit-end', event => { diagnostics.netTx += Number(event?.[0]) || 0; renderDiagnostics(); });
  instance.add_listener('9p-attach', () => { diagnostics.p9Attached = true; renderDiagnostics(); });
  instance.add_listener('9p-read-end', event => { diagnostics.p9Read += Number(event?.[1]) || 0; renderDiagnostics(); });
  instance.add_listener('9p-write-end', event => { diagnostics.p9Write += Number(event?.[1]) || 0; renderDiagnostics(); });
  instance.add_listener('screen-set-size', event => {
    diagnostics.width = Number(event?.[0]) || 0;
    diagnostics.height = Number(event?.[1]) || 0;
    diagnostics.bpp = Number(event?.[2]) || 0;
    renderDiagnostics();
  });

  instance.add_listener('emulator-ready', () => {
    emulatorReady = true;
    renderDiagnostics('Ready / running');
    setStatus('Emulator ready. The 9p file-transfer interface is available if the guest supports it.', 'ok');
    setButtons();
  });
  instance.add_listener('emulator-started', () => {
    setStatus('Virtual machine running.', 'ok');
    setButtons();
  });
  return instance;
}
function waitForReady(instance) {
  if (emulatorReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      instance.remove_listener?.('emulator-ready', onReady);
      resolve();
    };
    const onReady = () => finish();
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      instance.remove_listener?.('emulator-ready', onReady);
      reject(new Error('Emulator initialization timed out.'));
    }, 90000);
    instance.add_listener('emulator-ready', onReady);
    // The event may have fired between construction and listener registration.
    if (emulatorReady) finish();
  });
}
async function startVM() {
  if (vm || starting) return;
  emulatorReady = false;
  starting = true;
  setButtons();
  setStatus('Starting x86 emulator…', 'busy');
  try {
    vm = await createEmulator({ autostart: true });
    await waitForReady(vm);
    setStatus(disk ? 'Emulator ready — ISO and selected hard disk attached. Disk writes remain in memory until you save or export the disk.' : 'Emulator ready — guest boot is in progress. No writable hard disk is attached.', 'ok');
  } catch (error) {
    if (vm) await vm.destroy().catch(() => {});
    vm = null;
    bootFiles?.forEach(URL.revokeObjectURL);
    bootFiles = null;
    setStatus('Unable to start: ' + error.message, 'error');
  } finally {
    starting = false;
    setButtons();
  }
}
function exportDiskImage() {
  if (!diskBuffer || vm || starting) return;
  const blob = new Blob([diskBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const baseName = (disk?.name || 'googletv-disk.img').replace(/\.(img|raw|bin)$/i, '');
  anchor.href = url;
  anchor.download = baseName + '-modified.img';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus('Modified disk image exported. Keep this downloaded file and select it next time to continue from the updated disk.', 'ok');
}
async function stopVM() {
  if (!vm || starting) return;
  starting = true;
  setButtons();
  try {
    await vm.destroy();
    vm = null;
    emulatorReady = false;
    renderDiagnostics('VM stopped');
    bootFiles?.forEach(URL.revokeObjectURL);
    bootFiles = null;
    $('screen').innerHTML = '<div style="white-space:pre;font:14px monospace;line-height:14px"></div><canvas style="display:none"></canvas>';
    setStatus(diskBuffer ? 'VM stopped. You can export the modified hard disk image now.' : 'VM stopped. Save the session before stopping if you need to resume it later.', 'warn');
    $('export-disk').disabled = !diskBuffer;
  } catch (error) {
    setStatus('Stop failed: ' + error.message, 'error');
  } finally {
    starting = false;
    setButtons();
  }
}
async function sendApkFiles() {
  if (!vm || !emulatorReady || starting) return;
  const files = Array.from($('apk-files').files || []);
  if (!files.length) return;
  const maxFileSize = 512 * 1024 * 1024;
  const tooLarge = files.find(file => file.size > maxFileSize);
  if (tooLarge) {
    $('apk-status').textContent = tooLarge.name + ' exceeds the 512 MB per-file transfer limit.';
    return;
  }
  starting = true;
  setButtons();
  const sent = [];
  try {
    if (typeof vm.create_file !== 'function') {
      throw new Error('This v86 build does not expose the 9p create_file API.');
    }
    const plan = planApkPaths(files);
    for (const item of plan) {
      $('apk-status').textContent = 'Transferring ' + item.file.name + '…';
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      await vm.create_file(item.path, bytes);
      sent.push(item.path);
    }
    $('apk-status').textContent = 'Transferred ' + sent.length + ' APK file(s) to the guest 9p filesystem root: ' + sent.join(', ');
    setStatus('APK transfer completed. Mount host9p inside the guest to access the files; installation is a separate guest-side action.', 'ok');
  } catch (error) {
    $('apk-status').textContent = 'Transfer failed: ' + error.message + '. Check that this v86 build initialized its 9p filesystem and that the guest is ready.';
  } finally {
    starting = false;
    setButtons();
  }
}
async function fetchGuestFile() {
  if (!vm || !emulatorReady || starting) return;
  starting = true;
  setButtons();
  try {
    if (typeof vm.read_file !== 'function') {
      throw new Error('This v86 build does not expose the 9p read_file API.');
    }
    const path = safeGuestFilePath($('guest-file-path').value);
    $('guest-file-status').textContent = 'Reading ' + path + ' from the guest 9p filesystem…';
    const bytes = await vm.read_file(path);
    if (!(bytes instanceof Uint8Array)) throw new Error('The guest file API returned an unexpected data type.');
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = path.split('/').pop();
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    $('guest-file-status').textContent = 'Downloaded ' + path.split('/').pop() + ' · ' + (bytes.byteLength / 1024).toFixed(1) + ' KB';
  } catch (error) {
    $('guest-file-status').textContent = 'Could not download guest file: ' + error.message + '. Confirm the file exists in the mounted host9p share.';
  } finally {
    starting = false;
    setButtons();
  }
}
async function saveSession() {
  if (!vm || starting) return;
  starting = true;
  setButtons();
  let wasRunning = vm.is_running();
  setStatus('Pausing VM and saving its full state… large states may take time.', 'busy');
  try {
    if (wasRunning) await vm.stop();
    const state = await vm.save_state();
    const record = {
      id: STATE_KEY,
      state,
      signature: currentSignature(),
      savedAt: Date.now(),
      byteLength: state.byteLength,
      emulator: EMULATOR_VERSION,
    };
    await dbRequest('readwrite', store => store.put(record));
    setStatus('Session saved in this browser, including attached disk state. Restore with the same ISO, disk and firmware files.', 'ok');
  } catch (error) {
    setStatus('Save failed: ' + (error?.name === 'QuotaExceededError' ? 'Browser storage quota exceeded. Free space or use a smaller guest memory setting.' : error.message), 'error');
  } finally {
    if (vm && wasRunning) await vm.run().catch(() => {});
    starting = false;
    setButtons();
  }
}
async function restoreSession() {
  if (vm || starting) return;
  starting = true;
  setButtons();
  setStatus('Checking saved session…', 'busy');
  try {
    const record = await readSavedSession();
    if (!record) throw new Error('No saved session exists in this browser.');
    if (!sameSignature(record.signature, currentSignature())) {
      throw new Error('Selected ISO or firmware does not match the saved session. Select the exact same ISO, disk (or no disk), and firmware files.');
    }
    if (record.emulator !== EMULATOR_VERSION) throw new Error('Saved state was created by a different emulator version.');
    vm = await createEmulator({ autostart: false });
    await waitForReady(vm);
    setStatus('Restoring saved virtual machine state…', 'busy');
    await vm.restore_state(record.state);
    emulatorReady = true;
    await vm.run();
    renderDiagnostics('Restored session / running');
    setStatus('Saved session restored.', 'ok');
  } catch (error) {
    if (vm) await vm.destroy().catch(() => {});
    vm = null;
    emulatorReady = false;
    bootFiles?.forEach(URL.revokeObjectURL);
    bootFiles = null;
    setStatus('Restore failed: ' + error.message, 'error');
  } finally {
    starting = false;
    setButtons();
  }
}
async function deleteSavedSession() {
  try {
    await dbRequest('readwrite', store => store.delete(STATE_KEY));
    setStatus('Saved session deleted from this browser.', 'ok');
  } catch (error) {
    setStatus('Could not delete saved session: ' + error.message, 'error');
  }
  refreshStorageControls();
}

$('start').addEventListener('click', startVM);
$('export-disk').addEventListener('click', exportDiskImage);
$('save-disk').addEventListener('click', saveDiskLocally);
$('restore-disk').addEventListener('click', restoreDiskLocally);
$('stop').addEventListener('click', stopVM);
$('save').addEventListener('click', saveSession);
$('send-apks').addEventListener('click', sendApkFiles);
$('fetch-guest-file').addEventListener('click', fetchGuestFile);
$('apk-files').addEventListener('change', setButtons);
const remoteScancodes = {
  up: [0xE0, 0x48], down: [0xE0, 0x50],
  left: [0xE0, 0x4B], right: [0xE0, 0x4D],
  select: [0x1C], back: [0x01], home: [0xE0, 0x47],
};
function sendRemoteKey(name) {
  if (!vm || !emulatorReady || starting || !remoteScancodes[name]) return;
  const make = remoteScancodes[name];
  const release = make.map(code => code === 0xE0 ? code : code | 0x80);
  vm.keyboard_send_scancodes(make);
  setTimeout(() => {
    if (vm && emulatorReady) vm.keyboard_send_scancodes(release);
  }, 90);
}
document.querySelectorAll('[data-remote-key]').forEach(button => {
  button.addEventListener('click', () => sendRemoteKey(button.dataset.remoteKey));
});
$('restore').addEventListener('click', restoreSession);
$('delete-save').addEventListener('click', deleteSavedSession);
$('restart').addEventListener('click', () => vm?.restart());
$('full').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : $('screen').requestFullscreen?.());
$('bios').addEventListener('change', refreshStorageControls);
$('vga').addEventListener('change', refreshStorageControls);
$('disk').addEventListener('change', refreshStorageControls);
$('disk').addEventListener('change', refreshDiskControls);
refreshStorageControls();

renderDiagnostics('VM stopped');
