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

  const redroidPage = await browser.newPage();
  const redroidErrors = [];
  redroidPage.on('pageerror', error => redroidErrors.push(error.message));
  const redroidResponse = await redroidPage.goto(origin + '/redroid.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  assert.equal(redroidResponse.status(), 200);
  await redroidPage.waitForSelector('#connect', { timeout: 10000 });
  assert.equal(await redroidPage.title(), 'GoogleTV Web — Redroid Runtime');
  assert.equal(await redroidPage.locator('h1').innerText(), 'GoogleTV Web');
  assert.equal(await redroidPage.locator('#open-stream').isDisabled(), true);
  assert.equal(await redroidPage.locator('#install-apk').isDisabled(), true);
  assert.equal(await redroidPage.locator('#launch-app').isDisabled(), true);
  assert.equal(await redroidPage.locator('#app-filter').isDisabled(), true);
  assert.equal(await redroidPage.locator('[data-key="DPAD_UP"]').isDisabled(), true);
  assert.equal(await redroidPage.locator('#device-id').inputValue(), 'redroid:5555');
  await redroidPage.route(`${origin}/api/status`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ connected: true, bootCompleted: true, androidRelease: '14', model: 'Redroid test device' })
  }));
  await redroidPage.locator('#gateway-url').fill(`${origin}`);
  await redroidPage.locator('#gateway-token').fill('a'.repeat(64));
  await redroidPage.locator('#stream-url').fill('https://stream.example');
  await redroidPage.locator('#connect').click();
  await redroidPage.waitForFunction(() => document.querySelector('#device-state')?.textContent === 'ADB connected');
  assert.equal(await redroidPage.locator('#android-release').innerText(), '14');
  assert.equal(await redroidPage.locator('#open-stream').isEnabled(), true);
  assert.equal(await redroidPage.locator('[data-key="DPAD_UP"]').isEnabled(), true);
  assert.equal(await redroidPage.locator('#refresh-apps').isEnabled(), true);
  await redroidPage.route(`${origin}/api/apps`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ count: 2, apps: [{ packageName: 'com.example.tv' }, { packageName: 'org.sample.player' }] })
  }));
  await redroidPage.locator('#refresh-apps').click();
  await redroidPage.waitForFunction(() => document.querySelector('#apps-status')?.textContent.includes('2 installed user app'));
  assert.equal(await redroidPage.locator('#installed-apps .rt-app-item').count(), 2);
  assert.equal(await redroidPage.locator('#home-apps .rt-home-launch').count(), 2, 'TV home should render every installed app');
  assert.equal(await redroidPage.locator('#home-app-count').innerText(), '2 installed');
  assert.match(await redroidPage.locator('#home-apps').innerText(), /com.example.tv/);
  assert.equal(await redroidPage.locator('#app-filter').isEnabled(), true);
  assert.equal(await redroidPage.locator('#installed-apps .rt-app-group').count(), 2, 'Apps should be grouped alphabetically');
  await redroidPage.locator('#app-filter').fill('sample');
  assert.equal(await redroidPage.locator('#installed-apps .rt-app-item').count(), 1, 'Search should filter the app library');
  await redroidPage.locator('#app-filter').fill('not-installed');
  assert.equal(await redroidPage.locator('#installed-apps .rt-app-item').count(), 0);
  assert.match(await redroidPage.locator('#installed-apps').innerText(), /No installed apps match this filter/);
  await redroidPage.locator('#app-filter').fill('');
  assert.equal(await redroidPage.locator('#favorites-toggle').isEnabled(), true);
  await redroidPage.locator('.rt-app-row').filter({ hasText: 'com.example.tv' }).locator('.rt-app-favorite').click();
  assert.equal(await redroidPage.locator('.rt-app-row').filter({ hasText: 'com.example.tv' }).locator('.rt-app-favorite').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await redroidPage.evaluate(() => JSON.parse(localStorage.getItem('googletv.redroid.favorite-packages'))), ['com.example.tv']);
  assert.equal(await redroidPage.locator('#home-favorites .rt-home-launch').count(), 1, 'Favorite app should be pinned on TV home');
  await redroidPage.locator('#favorites-toggle').click();
  assert.equal(await redroidPage.locator('#installed-apps .rt-app-item').count(), 1, 'Favorites view should show only favorited packages');
  assert.match(await redroidPage.locator('#installed-apps').innerText(), /com.example.tv/);
  await redroidPage.locator('#favorites-toggle').click();
  assert.equal(await redroidPage.locator('#installed-apps .rt-app-item').count(), 2);
  await redroidPage.locator('#installed-apps .rt-app-item').filter({ hasText: 'com.example.tv' }).click();
  assert.equal(await redroidPage.locator('#package-name').inputValue(), 'com.example.tv');
  await redroidPage.locator('#package-name').fill('com.example.tv');
  assert.equal(await redroidPage.locator('#launch-app').isEnabled(), true);
  let homeLaunchPayload;
  await redroidPage.route(origin + '/api/launch', async route => {
    homeLaunchPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, packageName: 'com.example.tv', output: 'Events injected: 1' }) });
  });
  await redroidPage.locator('#home-apps .rt-home-launch').filter({ hasText: 'com.example.tv' }).click();
  await redroidPage.waitForFunction(() => document.querySelector('#home-status')?.textContent.includes('Launch request sent'));
  assert.deepEqual(homeLaunchPayload, { packageName: 'com.example.tv' }, 'TV home tile must call the validated package launch API');
  assert.equal(await redroidPage.locator('#home-recent .rt-home-launch').count(), 1, 'Successfully launched apps should appear in Recently opened');
  assert.equal(await redroidPage.locator('#home-recent .rt-home-launch').getAttribute('data-package-name'), 'com.example.tv');
  assert.deepEqual(await redroidPage.evaluate(() => JSON.parse(localStorage.getItem('googletv.redroid.recent-packages'))), ['com.example.tv'], 'Recent history should persist package IDs only');
  await redroidPage.locator('#home-recent .rt-home-launch').focus();
  await redroidPage.keyboard.press('ArrowDown');
  assert.equal(await redroidPage.evaluate(() => document.activeElement?.closest('#home-favorites') !== null), true, 'D-pad Down should move focus from Recently opened to Favorites across shelves');
  await redroidPage.keyboard.press('ArrowUp');
  assert.equal(await redroidPage.evaluate(() => document.activeElement?.closest('#home-recent') !== null), true, 'D-pad Up should return focus to Recently opened');
  let launchPayload;
  await redroidPage.route(`${origin}/api/launch`, async route => {
    launchPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, packageName: 'com.example.tv', output: 'Events injected: 1' })
    });
  });
  await redroidPage.locator('#launch-app').click();
  await redroidPage.waitForFunction(() => document.querySelector('#launch-status')?.textContent.includes('Launch command sent'));
  assert.deepEqual(launchPayload, { packageName: 'com.example.tv' }, 'Launch control must send only the selected package name');
  await redroidPage.locator('#disconnect').click();
  assert.equal(await redroidPage.locator('#app-filter').isDisabled(), true, 'Disconnect must disable and clear app search');
  assert.equal(await redroidPage.locator('#installed-apps .rt-app-item').count(), 0, 'Disconnect must clear the installed-app list');
  assert.equal(await redroidPage.evaluate(() => localStorage.getItem('googletv.redroid.favorite-packages')), '["com.example.tv"]', 'Only non-secret favorite package IDs may be persisted');
  assert.equal(await redroidPage.evaluate(() => Object.keys(localStorage).some(key => /token|gateway/i.test(key))), false, 'Gateway credentials must never be persisted in localStorage');
  assert.deepEqual(redroidErrors, [], `Redroid dashboard runtime errors: ${redroidErrors.join('; ')}`);
  await redroidPage.close();

  console.log('Browser smoke passed: legacy page and Redroid dashboard both bootstrapped; initial controls are safely disabled.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
