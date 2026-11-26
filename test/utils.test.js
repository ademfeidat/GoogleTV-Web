import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, planApkPaths, safeApkName, safeGuestFilePath } from '../src/utils.js';

test('formats byte counters at byte, KB and MB boundaries', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
});

test('sanitizes APK filenames and adds an extension', () => {
  assert.equal(safeApkName('My App'), 'My_App.apk');
  assert.equal(safeApkName('../bad name.apk'), '_bad_name.apk');
  assert.equal(safeApkName('client.APK'), 'client.APK');
  assert.equal(safeApkName('...'), 'application.apk');
});

test('disambiguates duplicate APK names case-insensitively', () => {
  const files = [{ name: 'App.apk' }, { name: 'app.APK' }, { name: 'App.apk' }];
  assert.deepEqual(planApkPaths(files).map(item => item.path), ['/App.apk', '/app-2.apk', '/App-3.apk']);
});

test('normalizes safe guest paths to the 9p root', () => {
  assert.equal(safeGuestFilePath('example.apk'), '/example.apk');
  assert.equal(safeGuestFilePath(' /folder\\\u005csub\\\u005cfile.apk '), '/folder/sub/file.apk');
});

test('rejects unsafe guest paths', () => {
  for (const path of ['', '   ', '../secret', 'folder/../secret', 'folder//file', './file', 'file name.apk', 'C:\\secret']) {
    assert.throws(() => safeGuestFilePath(path));
  }
});
