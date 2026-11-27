import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGatewayServer, isAuthorized, mapInputAction, validatePackageName, validateTapCoordinates } from "../server/gateway/src/server.js";

test("gateway maps the TV remote allowlist to Android keycodes", () => {
  assert.equal(mapInputAction("DPAD_UP"), "19");
  assert.equal(mapInputAction("DPAD_DOWN"), "20");
  assert.equal(mapInputAction("DPAD_LEFT"), "21");
  assert.equal(mapInputAction("DPAD_RIGHT"), "22");
  assert.equal(mapInputAction("DPAD_CENTER"), "23");
  assert.equal(mapInputAction("BACK"), "4");
  assert.equal(mapInputAction("HOME"), "3");
});

test("gateway rejects unknown or malformed remote actions", () => {
  assert.throws(() => mapInputAction("shell"));
  assert.throws(() => mapInputAction("../etc/passwd"));
  assert.throws(() => mapInputAction(null));
});

test("gateway validates tap coordinates", () => {
  assert.deepEqual(validateTapCoordinates(1920, 1080), { x: 1920, y: 1080 });
  assert.throws(() => validateTapCoordinates(-1, 20));
  assert.throws(() => validateTapCoordinates(1.5, 20));
  assert.throws(() => validateTapCoordinates(10001, 20));
});

test("gateway bearer authentication compares the complete token", () => {
  assert.equal(isAuthorized("Bearer abc123", "abc123"), true);
  assert.equal(isAuthorized("Bearer abc124", "abc123"), false);
  assert.equal(isAuthorized("abc123", "abc123"), false);
  assert.equal(isAuthorized("Bearer abc123", ""), false);
});


test("gateway health endpoint is public but reveals no Android details", async () => {
  const server = createGatewayServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("gateway rejects API access without bearer authentication", async () => {
  const server = createGatewayServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/status`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("gateway rejects unknown API routes without invoking Android commands", async () => {
  const server = createGatewayServer({ token: "test-token-with-at-least-32-characters" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/not-a-route`, {
      headers: { Authorization: "Bearer test-token-with-at-least-32-characters" }
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("gateway CORS allows only the configured exact origin", async () => {
  const server = createGatewayServer({
    token: "test-token-with-at-least-32-characters",
    allowedOrigin: "https://tv.example.test"
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const allowed = await fetch(`http://127.0.0.1:${address.port}/api/not-a-route`, {
      headers: {
        Origin: "https://tv.example.test",
        Authorization: "Bearer test-token-with-at-least-32-characters"
      }
    });
    assert.equal(allowed.status, 404);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://tv.example.test");

    const denied = await fetch(`http://127.0.0.1:${address.port}/api/not-a-route`, {
      headers: {
        Origin: "https://attacker.example.test",
        Authorization: "Bearer test-token-with-at-least-32-characters"
      }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("gateway rejects unsupported and empty APK uploads before ADB access", async () => {
  const server = createGatewayServer({ token: "test-token-with-at-least-32-characters" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}/api/apk`;
  const headers = { Authorization: "Bearer test-token-with-at-least-32-characters" };
  try {
    const unsupported = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, "Content-Type": "text/plain" },
      body: "not an apk"
    });
    assert.equal(unsupported.status, 415);

    const empty = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/vnd.android.package-archive" },
      body: ""
    });
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { error: "APK body is empty" });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});


test("gateway status reports Android properties through the injected ADB adapter", async () => {
  const calls = [];
  const runAdb = async args => {
    calls.push(args);
    const key = args.at(-1);
    if (key === "sys.boot_completed") return { stdout: "1", stderr: "" };
    if (key === "ro.build.version.release") return { stdout: "14", stderr: "" };
    if (key === "ro.product.model") return { stdout: "Redroid", stderr: "" };
    if (args.includes("get-state")) return { stdout: "device", stderr: "" };
    return { stdout: "", stderr: "" };
  };
  const token = "test-token-with-at-least-32-characters";
  const server = createGatewayServer({ token, runAdb });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/status`, {
      headers: { Authorization: "Bearer " + token }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      connected: true, bootCompleted: true, androidRelease: "14", model: "Redroid"
    });
    assert.ok(calls.some(args => args.includes("getprop") && args.includes("sys.boot_completed")));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("gateway remote input sends only the mapped Android keycode", async () => {
  const calls = [];
  const runAdb = async args => {
    calls.push(args);
    if (args.includes("get-state")) return { stdout: "device", stderr: "" };
    return { stdout: "", stderr: "" };
  };
  const token = "test-token-with-at-least-32-characters";
  const server = createGatewayServer({ token, runAdb });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/input`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "DPAD_CENTER" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.ok(calls.some(args => args.slice(-3).join(" ") === "input keyevent 23"));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});


test("gateway streams APK bytes to the ADB installer and returns its result", async () => {
  const calls = [];
  const apkBytes = Buffer.from("mock-apk-binary");
  const runAdb = async args => {
    calls.push(args);
    if (args.includes("get-state")) return { stdout: "device", stderr: "" };
    if (args.includes("install")) {
      const installedBytes = await readFile(args.at(-1));
      assert.deepEqual(installedBytes, apkBytes);
      return { stdout: "Success", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
  const token = "test-token-with-at-least-32-characters";
  const server = createGatewayServer({ token, runAdb });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/apk`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/vnd.android.package-archive"
      },
      body: apkBytes
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, output: "Success" });
    assert.ok(calls.some(args => args.includes("install") && args.includes("-r")));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});


test("gateway validates Android package names before launch", () => {
  assert.equal(validatePackageName("com.example.tv"), "com.example.tv");
  assert.equal(validatePackageName("org.example_app.player2"), "org.example_app.player2");
  for (const value of ["", "com", ".example.app", "com..app", "com.example;reboot", "com.example/app", "com.example app", null, 42]) {
    assert.throws(() => validatePackageName(value));
  }
});

test("gateway launches only the validated package using Android monkey", async () => {
  const calls = [];
  const runAdb = async args => {
    calls.push(args);
    if (args.includes("get-state")) return { stdout: "device", stderr: "" };
    if (args.includes("monkey")) return { stdout: "Events injected: 1", stderr: "" };
    return { stdout: "", stderr: "" };
  };
  const token = "test-token-with-at-least-32-characters";
  const server = createGatewayServer({ token, runAdb });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/launch`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ packageName: "com.example.tv" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true, packageName: "com.example.tv", output: "Events injected: 1"
    });
    assert.ok(calls.some(args => args.slice(-5).join(" ") === "shell monkey -p com.example.tv 1"));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("gateway rejects shell-like package launch input without invoking ADB", async () => {
  let invoked = false;
  const token = "test-token-with-at-least-32-characters";
  const server = createGatewayServer({ token, runAdb: async () => { invoked = true; return { stdout: "", stderr: "" }; } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/launch`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ packageName: "com.example; reboot" })
    });
    assert.equal(response.status, 400);
    assert.equal(invoked, false);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});


test("gateway lists validated third-party Android packages from the connected device", async () => {
  const calls = [];
  const runAdb = async args => {
    calls.push(args);
    if (args.includes("get-state")) return { stdout: "device", stderr: "" };
    if (args.includes("pm")) return {
      stdout: "package:com.example.tv\npackage:org.sample.player\npackage:com.example.tv\npackage:bad;command\npackage:com.valid_app.client\n",
      stderr: ""
    };
    return { stdout: "", stderr: "" };
  };
  const token = "test-token-with-at-least-32-characters";
  const server = createGatewayServer({ token, runAdb });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/apps`, {
      headers: { Authorization: "Bearer " + token }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      count: 3,
      apps: [
        { packageName: "com.example.tv" },
        { packageName: "com.valid_app.client" },
        { packageName: "org.sample.player" }
      ]
    });
    assert.ok(calls.some(args => args.slice(-4).join(" ") === "pm list packages -3"));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("gateway app list requires authentication", async () => {
  const server = createGatewayServer({ runAdb: async () => { throw new Error("ADB must not run"); } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/apps`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
