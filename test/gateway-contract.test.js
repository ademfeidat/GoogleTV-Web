import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorized, mapInputAction, validateTapCoordinates } from "../server/gateway/src/server.js";

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
