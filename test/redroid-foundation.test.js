import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const compose = await readFile(new URL('../deployment/redroid/compose.yaml', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../deployment/redroid/.env.example', import.meta.url), 'utf8');
const preflight = await readFile(new URL('../scripts/redroid-host-preflight.sh', import.meta.url), 'utf8');
const migrationDoc = await readFile(new URL('../docs/REDROID-MIGRATION.md', import.meta.url), 'utf8');

test('Redroid deployment uses a persistent Android data volume', () => {
  assert.match(compose, /redroid-data:\/data/);
  assert.match(compose, /name: googletv-redroid-data/);
});

test('ADB is loopback-only and is not exposed on all interfaces', () => {
  assert.match(compose, /127\.0\.0\.1:\$\{REDROID_ADB_PORT/);
  assert.doesNotMatch(compose, /0\.0\.0\.0:/);
});

test('Android image and display settings are configurable', () => {
  assert.match(compose, /redroid:\$\{REDROID_TAG/);
  assert.match(envExample, /REDROID_TAG=16\.0\.0-latest/);
  assert.match(envExample, /REDROID_WIDTH=1920/);
  assert.match(envExample, /REDROID_HEIGHT=1080/);
});

test('host preflight covers required platform signals', () => {
  for (const token of ['binderfs', 'PAGE_SIZE', 'CONFIG_ANDROID_BINDER_IPC', '/proc/net/if_inet6', '/dev/dma_heap']) {
    assert.ok(preflight.includes(token), `missing preflight check: ${token}`);
  }
});

test('migration docs distinguish Android runtime from browser streaming', () => {
  assert.match(migrationDoc, /ADB connectivity alone is not browser video streaming/);
  assert.match(migrationDoc, /not a Google-certified Google TV image/);
  assert.match(migrationDoc, /Not implemented \/ not validated yet/);
});
