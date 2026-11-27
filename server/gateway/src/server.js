import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 8080);
const ADB_HOST = process.env.ANDROID_ADB_HOST || "redroid";
const ADB_PORT = Number(process.env.ANDROID_ADB_PORT || 5555);
const SERIAL = `${ADB_HOST}:${ADB_PORT}`;
const TOKEN = process.env.GATEWAY_TOKEN || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const MAX_APK_BYTES = 512 * 1024 * 1024;
const MAX_JSON_BYTES = 4096;
const rateBuckets = new Map();

const KEYCODES = Object.freeze({
  DPAD_UP: "19", DPAD_DOWN: "20", DPAD_LEFT: "21", DPAD_RIGHT: "22",
  DPAD_CENTER: "23", BACK: "4", HOME: "3", MENU: "82",
  PLAY_PAUSE: "85", VOLUME_UP: "24", VOLUME_DOWN: "25", MUTE: "164"
});

export function mapInputAction(action) {
  if (typeof action !== "string" || !Object.hasOwn(KEYCODES, action)) throw new Error("Unsupported input action");
  return KEYCODES[action];
}

export function validateTapCoordinates(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 10000 || y > 10000) {
    throw new Error("Tap coordinates must be integers between 0 and 10000");
  }
  return { x, y };
}

export function isAuthorized(header, expectedToken = TOKEN) {
  if (!expectedToken || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function json(res, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  });
  res.end(body);
}

function originAllowed(req, allowedOrigin = ALLOWED_ORIGIN) {
  const origin = req.headers.origin;
  return !origin || !allowedOrigin || origin === allowedOrigin;
}

function corsHeaders(req, allowedOrigin = ALLOWED_ORIGIN) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigin || origin !== allowedOrigin) return {};
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type",
    "vary": "Origin"
  };
}

function rateLimit(req, res) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 2048) {
    for (const [ip, item] of rateBuckets) if (now - item.start > 60_000) rateBuckets.delete(ip);
  }
  if (bucket.count > 120) { json(res, 429, { error: "Rate limit exceeded" }); return false; }
  return true;
}

async function adb(args, timeout = 20_000) {
  return execFileAsync("adb", args, { timeout, maxBuffer: 1024 * 1024, windowsHide: true });
}

async function ensureDevice(runAdb = adb) {
  await runAdb(["connect", SERIAL], 15_000);
  await runAdb(["-s", SERIAL, "wait-for-device"], 15_000);
  const { stdout } = await runAdb(["-s", SERIAL, "get-state"], 10_000);
  if (stdout.trim() !== "device") throw new Error("Android device is not ready");
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) { const error = new Error("JSON request too large"); error.statusCode = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { const error = new Error("Invalid JSON body"); error.statusCode = 400; throw error; }
}

async function installApk(req, res, headers, runAdb = adb) {
  const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!["application/vnd.android.package-archive", "application/octet-stream"].includes(contentType)) {
    return json(res, 415, { error: "Send the APK as a raw binary request body" }, headers);
  }
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > MAX_APK_BYTES) return json(res, 413, { error: "APK exceeds the 512 MiB limit" }, headers);

  const dir = await mkdtemp(join(tmpdir(), "googletv-apk-"));
  const apkPath = join(dir, `${randomUUID()}.apk`);
  let total = 0;
  try {
    await pipeline(req, new Transform({
      transform(chunk, _encoding, callback) {
        total += chunk.length;
        if (total > MAX_APK_BYTES) { const error = new Error("APK exceeds the 512 MiB limit"); error.statusCode = 413; callback(error); }
        else callback(null, chunk);
      }
    }), createWriteStream(apkPath, { flags: "wx", mode: 0o600 }));
    if (total === 0) return json(res, 400, { error: "APK body is empty" }, headers);
    await ensureDevice(runAdb);
    const { stdout, stderr } = await runAdb(["-s", SERIAL, "install", "-r", apkPath], 180_000);
    return json(res, 200, { ok: true, output: (stdout + stderr).trim() }, headers);
  } catch (error) {
    const status = error.statusCode || 502;
    return json(res, status, {
      error: status === 413 ? "APK exceeds the 512 MiB limit" : "APK installation failed",
      detail: status === 502 ? String(error.stderr || error.message).slice(0, 1200) : undefined
    }, headers);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function handle(req, res, { token = TOKEN, allowedOrigin = ALLOWED_ORIGIN, runAdb = adb } = {}) {
  const headers = corsHeaders(req, allowedOrigin);
  if (!originAllowed(req, allowedOrigin)) return json(res, 403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS") { res.writeHead(204, { ...headers, "access-control-max-age": "600" }); return res.end(); }
  if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true });
  if (!rateLimit(req, res)) return;
  if (!isAuthorized(req.headers.authorization, token)) return json(res, 401, { error: "Unauthorized" }, headers);

  if (req.method === "GET" && req.url === "/api/status") {
    try {
      await ensureDevice(runAdb);
      const [boot, release, model] = await Promise.all([
        runAdb(["-s", SERIAL, "shell", "getprop", "sys.boot_completed"]),
        runAdb(["-s", SERIAL, "shell", "getprop", "ro.build.version.release"]),
        runAdb(["-s", SERIAL, "shell", "getprop", "ro.product.model"])
      ]);
      return json(res, 200, {
        connected: true, bootCompleted: boot.stdout.trim() === "1",
        androidRelease: release.stdout.trim(), model: model.stdout.trim()
      }, headers);
    } catch (error) {
      return json(res, 503, {
        connected: false, error: "Android runtime is not ready",
        detail: String(error.stderr || error.message).slice(0, 500)
      }, headers);
    }
  }

  if (req.method === "POST" && req.url === "/api/input") {
    try {
      const body = await readJson(req);
      await ensureDevice(runAdb);
      if (body.action === "tap") {
        const { x, y } = validateTapCoordinates(body.x, body.y);
        await runAdb(["-s", SERIAL, "shell", "input", "tap", String(x), String(y)]);
      } else {
        await runAdb(["-s", SERIAL, "shell", "input", "keyevent", mapInputAction(body.action)]);
      }
      return json(res, 200, { ok: true }, headers);
    } catch (error) {
      return json(res, error.statusCode || 400, { error: error.message }, headers);
    }
  }

  if (req.method === "POST" && req.url === "/api/apk") return installApk(req, res, headers, runAdb);
  return json(res, 404, { error: "Not found" }, headers);
}

export function createGatewayServer(options = {}) {
  return createServer((req, res) => {
    handle(req, res, options).catch(() => {
      if (!res.headersSent) json(res, 500, { error: "Internal gateway error" });
      else res.destroy();
    });
  });
}

if (process.env.NODE_ENV !== "test" && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (TOKEN.length < 32 || TOKEN === "replace-with-a-random-secret-of-at-least-32-characters") {
    throw new Error("Set GATEWAY_TOKEN to a unique random secret of at least 32 characters");
  }
  const server = createGatewayServer();
  server.listen(PORT, "0.0.0.0", () => process.stdout.write(`GoogleTV Redroid gateway listening on ${PORT}; ADB target ${SERIAL}\n`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
