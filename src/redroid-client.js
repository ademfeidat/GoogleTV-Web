export function normalizeEndpoint(value, label = "Endpoint") {
  let url;
  try { url = new URL(String(value || "").trim()); }
  catch { throw new Error(label + " must be a valid absolute URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(label + " must use HTTP or HTTPS.");
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHost) throw new Error(label + " must use HTTPS outside localhost.");
  if (url.username || url.password) throw new Error(label + " must not contain embedded credentials.");
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function buildEmbedUrl(base, deviceId) {
  const endpoint = normalizeEndpoint(base, "Streaming endpoint");
  const id = String(deviceId || "").trim();
  if (!id || id.length > 256 || /[\u0000-\u001f]/.test(id)) throw new Error("Enter a valid ADB device ID.");
  return endpoint + "/embed.html?device=" + encodeURIComponent(id);
}

export function remoteActionPayload(action) {
  const allowed = new Set(["DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT", "DPAD_CENTER", "BACK", "HOME", "MENU", "PLAY_PAUSE", "VOLUME_UP", "VOLUME_DOWN", "MUTE"]);
  if (!allowed.has(action)) throw new Error("Unsupported remote action.");
  return { action };
}
