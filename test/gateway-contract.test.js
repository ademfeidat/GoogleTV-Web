import test from "node:test";
import assert from "node:assert/strict";
import { createGatewayServer, isAuthorized, mapInputAction, validateTapCoordinates } from "../server/gateway/src/server.js";

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
