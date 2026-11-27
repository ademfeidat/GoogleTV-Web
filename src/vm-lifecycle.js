export function waitForEmulatorReady(instance, {
  isReady = () => false,
  timeoutMs = 90000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (isReady()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;

    const cleanup = () => {
      if (timeout !== undefined) clearTimer(timeout);
      instance.remove_listener?.('emulator-ready', onReady);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();

    // Start the timeout before subscribing because a test double or adapter
    // may synchronously emit the event from add_listener().
    timeout = setTimer(() => {
      finish(new Error('Emulator initialization timed out.'));
    }, timeoutMs);
    instance.add_listener('emulator-ready', onReady);

    // Close the race where readiness changes while the listener is attached.
    if (isReady()) finish();
  });
}
