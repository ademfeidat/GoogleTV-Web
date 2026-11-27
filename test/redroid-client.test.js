import test from "node:test";
import assert from "node:assert/strict";
import { buildEmbedUrl, normalizeEndpoint, remoteActionPayload } from "../src/redroid-client.js";

test("accepts HTTPS endpoints and removes trailing slash", () => {
  assert.equal(normalizeEndpoint("https://android.example/"), "https://android.example");
});
test("allows HTTP only for loopback development", () => {
  assert.equal(normalizeEndpoint("http://127.0.0.1:8080/"), "http://127.0.0.1:8080");
  assert.throws(() => normalizeEndpoint("http://android.example"), /HTTPS/);
});
test("rejects credentials and non-HTTP protocols", () => {
  assert.throws(() => normalizeEndpoint("https://user:pass@android.example"), /credentials/);
  assert.throws(() => normalizeEndpoint("file:///tmp/x"), /HTTP or HTTPS/);
});
test("builds encoded ws-scrcpy embed URL", () => {
  assert.equal(buildEmbedUrl("https://stream.example/", "192.168.1.20:5555"), "https://stream.example/embed.html?device=192.168.1.20%3A5555");
});
test("rejects empty or control-character device IDs", () => {
  assert.throws(() => buildEmbedUrl("https://stream.example", ""), /device ID/);
  assert.throws(() => buildEmbedUrl("https://stream.example", "redroid\n5555"), /device ID/);
});
test("only allowlisted TV remote actions can be serialized", () => {
  assert.deepEqual(remoteActionPayload("DPAD_CENTER"), { action: "DPAD_CENTER" });
  assert.throws(() => remoteActionPayload("shell rm -rf /"), /Unsupported/);
});
