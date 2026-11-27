import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForEmulatorReady } from '../src/vm-lifecycle.js';

function fakeEmulator({ readyDuringSubscribe = false } = {}) {
  const listeners = new Map();
  return {
    listeners,
    add_listener(name, callback) {
      const set = listeners.get(name) ?? new Set();
      set.add(callback);
      listeners.set(name, set);
      if (readyDuringSubscribe && name === 'emulator-ready') callback();
    },
    remove_listener(name, callback) {
      listeners.get(name)?.delete(callback);
    },
    emit(name, ...args) {
      for (const callback of [...(listeners.get(name) ?? [])]) callback(...args);
    },
    listenerCount(name) {
      return listeners.get(name)?.size ?? 0;
    },
  };
}

test('resolves when emulator-ready is emitted', async () => {
  const vm = fakeEmulator();
  const ready = waitForEmulatorReady(vm, { timeoutMs: 100 });
  assert.equal(vm.listenerCount('emulator-ready'), 1);
  vm.emit('emulator-ready');
  await ready;
  assert.equal(vm.listenerCount('emulator-ready'), 0);
});

test('resolves immediately when readiness was already observed', async () => {
  const vm = fakeEmulator();
  await waitForEmulatorReady(vm, { isReady: () => true, timeoutMs: 10 });
  assert.equal(vm.listenerCount('emulator-ready'), 0);
});

test('handles readiness firing during listener registration', async () => {
  const vm = fakeEmulator({ readyDuringSubscribe: true });
  await waitForEmulatorReady(vm, { timeoutMs: 100 });
  assert.equal(vm.listenerCount('emulator-ready'), 0);
});

test('rejects on timeout and removes its event listener', async () => {
  const vm = fakeEmulator();
  await assert.rejects(
    waitForEmulatorReady(vm, { timeoutMs: 5 }),
    /Emulator initialization timed out\./,
  );
  assert.equal(vm.listenerCount('emulator-ready'), 0);
});

test('does not settle twice when readiness arrives after timeout', async () => {
  const vm = fakeEmulator();
  await assert.rejects(
    waitForEmulatorReady(vm, { timeoutMs: 5 }),
    /Emulator initialization timed out\./,
  );
  vm.emit('emulator-ready');
  assert.equal(vm.listenerCount('emulator-ready'), 0);
});
