import { buildEmbedUrl, normalizeEndpoint, remoteActionPayload } from "./redroid-client.js";
import "./redroid.css";

const root = document.querySelector("#redroid-root");
root.innerHTML = `
<main class="rt-shell">
  <header class="rt-top">
    <div class="rt-brand"><div class="rt-logo">▶</div><div><h1>GoogleTV Web</h1><p>Redroid cloud Android runtime</p></div></div>
    <nav class="rt-nav"><a href="/">Legacy v86 version</a><a class="active" href="/redroid.html">Redroid runtime</a></nav>
  </header>
  <section class="rt-layout">
    <aside class="rt-panel">
      <h2>Runtime connection</h2>
      <div class="rt-field"><label for="gateway-url">Gateway URL</label><input class="rt-input" id="gateway-url" type="url" placeholder="https://your-domain.example"></div>
      <div class="rt-field"><label for="gateway-token">Gateway access token</label><input class="rt-input" id="gateway-token" type="password" autocomplete="off" placeholder="Paste server token (kept in memory only)"></div>
      <div class="rt-actions"><button class="rt-button primary" id="connect">Check Android</button><button class="rt-button" id="disconnect">Clear credentials</button></div>
      <div class="rt-status" id="connection-status" data-kind="warn" role="status">Not connected. Enter the gateway URL and private access token.</div>
      <div class="rt-kv"><div><small>Connection</small><b id="device-state">Not checked</b></div><div><small>Android release</small><b id="android-release">—</b></div><div><small>Device model</small><b id="android-model">—</b></div><div><small>Boot complete</small><b id="boot-state">—</b></div></div>
      <div class="rt-field"><label for="stream-url">ws-scrcpy-web URL</label><input class="rt-input" id="stream-url" type="url" placeholder="https://stream.example"></div>
      <div class="rt-field"><label for="device-id">ADB device ID (usually host:5555 or serial)</label><input class="rt-input" id="device-id" type="text" value="redroid:5555"></div>
      <div class="rt-actions"><button class="rt-button primary" id="open-stream" disabled>Open Android screen</button><button class="rt-button" id="new-tab" disabled>Open in new tab</button></div>
      <p class="rt-note">The streaming service has its own login. Sign in inside the stream frame if prompted. Cross-origin embedding must be explicitly allowed in ws-scrcpy-web settings and served over HTTPS.</p>
      <div class="rt-field"><label for="apk-file">Install APK (maximum 512 MiB)</label><input class="rt-input" id="apk-file" type="file" accept=".apk,application/vnd.android.package-archive"></div>
      <button class="rt-button" id="install-apk" disabled>Install selected APK</button>
      <div class="rt-status" id="apk-status">Connect to Android before installing an APK.</div>
      <p class="rt-note">The APK is sent directly to the authenticated gateway over HTTPS. It is not stored in this page's local storage.</p>
    </aside>
    <section class="rt-panel">
      <div class="rt-stream-head"><h2>Android TV display</h2><span class="rt-muted" id="stream-state">Stream not started</span></div>
      <div class="rt-screen" id="stream-screen"><div class="rt-empty">Connect to your Redroid server, configure the streaming URL, then open the Android screen here.</div></div>
      <h2 style="margin-top:18px">TV remote</h2>
      <div class="rt-remote" aria-label="Android TV directional remote">
        <span></span><button data-key="DPAD_UP" disabled aria-label="Up">▲</button><span></span>
        <button data-key="DPAD_LEFT" disabled aria-label="Left">◀</button><button class="ok" data-key="DPAD_CENTER" disabled aria-label="OK">OK</button><button data-key="DPAD_RIGHT" disabled aria-label="Right">▶</button>
        <span></span><button data-key="DPAD_DOWN" disabled aria-label="Down">▼</button><span></span>
      </div>
      <div class="rt-remote-actions"><button class="rt-button" data-key="BACK" disabled>Back</button><button class="rt-button" data-key="HOME" disabled>Home</button><button class="rt-button" data-key="MENU" disabled>Menu</button></div>
      <p class="rt-note">Remote actions use the private gateway API. The embedded scrcpy stream also has its own pointer, keyboard and D-pad controls.</p>
    </section>
  </section>
  <footer>GoogleTV-Web · Redroid integration preview · Android runs on your Linux server, not inside this browser tab.</footer>
</main>`;

const $ = id => document.getElementById(id);
let gatewayBase = "";
let accessToken = "";
let connected = false;
let streamUrl = "";

function setStatus(message, kind = "warn") {
  $("connection-status").textContent = message;
  $("connection-status").dataset.kind = kind;
}
function setApkStatus(message, kind = "warn") {
  $("apk-status").textContent = message;
  $("apk-status").dataset.kind = kind;
}
function setConnected(value) {
  connected = value;
  $("device-state").textContent = value ? "ADB connected" : "Not connected";
  $("open-stream").disabled = !value || !streamUrl;
  $("new-tab").disabled = !value || !streamUrl;
  $("install-apk").disabled = !value || !$("apk-file").files.length;
  document.querySelectorAll("[data-key]").forEach(button => { button.disabled = !value; });
}
async function api(path, options = {}) {
  const response = await fetch(gatewayBase + path, {
    ...options,
    headers: { Authorization: "Bearer " + accessToken, ...(options.headers || {}) },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gateway returned HTTP " + response.status);
  return data;
}
function currentStreamUrl() {
  streamUrl = normalizeEndpoint($("stream-url").value, "Streaming URL");
  return buildEmbedUrl(streamUrl, $("device-id").value);
}
async function checkAndroid() {
  try {
    gatewayBase = normalizeEndpoint($("gateway-url").value, "Gateway URL");
    accessToken = $("gateway-token").value.trim();
    if (accessToken.length < 32) throw new Error("The gateway token must contain at least 32 characters.");
    setStatus("Checking Android through the private gateway…", "warn");
    const data = await api("/api/status");
    $("android-release").textContent = data.androidRelease || "Unknown";
    $("android-model").textContent = data.model || "Unknown";
    $("boot-state").textContent = data.bootCompleted ? "Yes" : "Waiting";
    setConnected(Boolean(data.connected));
    if (!data.connected) throw new Error(data.error || "Android is not connected.");
    setStatus(data.bootCompleted ? "Android is connected and boot completed." : "ADB is connected, but Android has not completed boot yet.", data.bootCompleted ? "ok" : "warn");
    if (!data.bootCompleted) setConnected(false);
  } catch (error) {
    setConnected(false);
    setStatus(error.message, "error");
  }
}
async function sendRemote(action) {
  try {
    await api("/api/input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(remoteActionPayload(action)) });
  } catch (error) { setStatus("Remote command failed: " + error.message, "error"); }
}
async function installApk() {
  const file = $("apk-file").files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".apk")) { setApkStatus("Choose a file with the .apk extension.", "error"); return; }
  if (file.size === 0 || file.size > 512 * 1024 * 1024) { setApkStatus("APK must be non-empty and no larger than 512 MiB.", "error"); return; }
  $("install-apk").disabled = true;
  setApkStatus("Uploading and installing " + file.name + "…");
  try {
    const result = await api("/api/apk", { method: "POST", headers: { "Content-Type": "application/vnd.android.package-archive" }, body: file });
    setApkStatus("APK installed successfully. " + (result.output || ""), "ok");
  } catch (error) { setApkStatus(error.message, "error"); }
  finally { $("install-apk").disabled = !connected; }
}
function openStream(newTab = false) {
  try {
    const url = currentStreamUrl();
    if (newTab) window.open(url, "_blank", "noopener,noreferrer");
    else {
      const frame = document.createElement("iframe");
      frame.title = "Redroid Android screen";
      frame.allow = "autoplay; clipboard-read; clipboard-write; fullscreen";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.src = url;
      $("stream-screen").replaceChildren(frame);
    }
    $("stream-state").textContent = "Opening stream…";
  } catch (error) { setStatus(error.message, "error"); }
}

$("connect").addEventListener("click", checkAndroid);
$("disconnect").addEventListener("click", () => {
  gatewayBase = ""; accessToken = ""; streamUrl = "";
  $("gateway-token").value = "";
  $("gateway-url").value = "";
  setConnected(false);
  $("android-release").textContent = "—"; $("android-model").textContent = "—"; $("boot-state").textContent = "—";
  $("stream-screen").innerHTML = '<div class="rt-empty">Credentials cleared. Android remains running on the server.</div>';
  $("stream-state").textContent = "Stream not started";
  setStatus("Credentials cleared from this page's memory.");
  setApkStatus("Connect to Android before installing an APK.");
});
$("stream-url").addEventListener("input", () => {
  try { streamUrl = normalizeEndpoint($("stream-url").value, "Streaming URL"); }
  catch { streamUrl = ""; }
  $("open-stream").disabled = !connected || !streamUrl;
  $("new-tab").disabled = !connected || !streamUrl;
});
$("open-stream").addEventListener("click", () => openStream(false));
$("new-tab").addEventListener("click", () => openStream(true));
$("apk-file").addEventListener("change", () => { $("install-apk").disabled = !connected || !$("apk-file").files.length; });
$("install-apk").addEventListener("click", installApk);
document.querySelectorAll("[data-key]").forEach(button => button.addEventListener("click", () => sendRemote(button.dataset.key)));
