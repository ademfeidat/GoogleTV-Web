import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../src/vm-lifecycle.js', import.meta.url), 'utf8');

test('v86 boot configuration includes firmware, ISO, memory and display', () => {
  assert.match(source, /new V86\s*\(\s*\{/);
  assert.match(source, /wasm_path:\s*['"]\/v86\/v86\.wasm['"]/);
  assert.match(source, /memory_size:\s*selectedMemorySize\(\)/);
  assert.match(source, /bios:\s*\{\s*url:\s*urls\[1\]\s*\}/);
  assert.match(source, /vga_bios:\s*\{\s*url:\s*urls\[2\]\s*\}/);
  assert.match(source, /cdrom:\s*\{\s*url:\s*urls\[0\]\s*\}/);
  assert.match(source, /screen_container:\s*\$\('screen'\)/);
});

test('guest filesystem and optional networking are explicit', () => {
  assert.match(source, /filesystem:\s*\{\s*\}/);
  assert.match(source, /net_device:\s*\{\s*type:\s*netType,\s*relay_url:\s*relay\s*\}/);
});

test('startup waits for emulator-ready and has a finite timeout', () => {
  assert.match(source, /add_listener\('emulator-ready'/);
  assert.match(source, /function waitForReady\(instance\)/);
  assert.match(lifecycle, /setTimer\(\(\) => \{/);
  assert.match(lifecycle, /Emulator initialization timed out\./);
  assert.match(source, /await waitForReady\(vm\)/);
});

test('startup failure destroys a partially created VM', () => {
  assert.match(source, /if \(vm\) await vm\.destroy\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(source, /vm = null/);
});

test('guest RAM presets are selectable and snapshot compatibility includes the selection', () => {
  assert.match(source, /id="guest-ram"/);
  assert.match(source, /value="268435456"/);
  assert.match(source, /value="402653184"/);
  assert.match(source, /value="536870912" selected/);
  assert.match(source, /memorySize:\s*selectedMemorySize\(\)/);
  assert.match(source, /\$\('guest-ram'\)\.disabled = !!vm \|\| starting/);
});

test('Start control requires the ISO and both firmware files', () => {
  assert.match(source, /\$\('start'\)\.disabled = !iso \|\| !\$\('bios'\)\.files\[0\] \|\| !\$\('vga'\)\.files\[0\]/);
  assert.match(source, /\$\('bios'\)\.addEventListener\('change', setButtons\)/);
  assert.match(source, /\$\('vga'\)\.addEventListener\('change', setButtons\)/);
});
