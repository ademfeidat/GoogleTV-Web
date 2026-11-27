import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1' },
});
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview server exited early:\n${serverOutput}`);
    try {
      const response = await fetch(origin);
      if (response.ok) { ready = true; break; }
    } catch { /* Server is still starting. */ }
    await delay(500);
  }
  assert.equal(ready, true, `Preview server did not become ready:\n${serverOutput}`);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  page.setDefaultTimeout(10000);
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
  assert.equal(response.status(), 200);
  await page.waitForSelector('#start', { timeout: 10000 });
  assert.equal(await page.title(), 'GoogleTV Web — Browser VM');
  assert.equal(await page.locator('h1').innerText(), 'GoogleTV Web');
  assert.equal(await page.locator('#start').isDisabled(), true, 'Start must remain disabled until an ISO is selected');
  assert.equal(await page.locator('#stop').isDisabled(), true);
  assert.equal(await page.locator('#diag-ram').innerText(), '512 MB');
  assert.equal(await page.locator('[data-remote-key="up"]').isDisabled(), true);

  await page.locator('#guest-ram').selectOption('402653184');
  assert.equal(await page.locator('#diag-ram').innerText(), '384 MB', 'RAM selector must update diagnostics');

  await page.locator('#iso').setInputFiles({ name: 'smoke.iso', mimeType: 'application/x-iso9660-image', buffer: Buffer.from('not-a-bootable-iso') });
  assert.equal(await page.locator('#start').isDisabled(), true, 'ISO alone must not enable Start without firmware');
  await page.locator('#bios').setInputFiles({ name: 'bios.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('bios-placeholder') });
  assert.equal(await page.locator('#start').isDisabled(), true, 'Both firmware files are required');
  await page.locator('#vga').setInputFiles({ name: 'vgabios.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('vga-placeholder') });
  assert.equal(await page.locator('#start').isEnabled(), true, 'Start enables only after ISO and both firmware files are selected');
  assert.equal(await page.locator('#guest-ram').isEnabled(), true);
  assert.deepEqual(pageErrors, [], `Browser runtime errors: ${pageErrors.join('; ')}`);

  console.log('Browser smoke passed: page bootstrapped, controls initialized, RAM selection updated diagnostics, and required-file selection enabled Start.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
