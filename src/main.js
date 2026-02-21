import { GenSynthEngine } from "./engine.js";
import { arcsPlugin } from "./plugins/arcs.js";
import { circlesPlugin } from "./plugins/circles.js";
import { linesPlugin } from "./plugins/lines.js";
import { snakesPlugin } from "./plugins/snakes.js";
import { segmentsPlugin } from "./plugins/segments.js";
import { spiralsPlugin } from "./plugins/spirals.js";
import { squigglesPlugin } from "./plugins/squiggles.js";

const canvas = document.getElementById("stage");
const paramsForm = document.getElementById("params-form");
const algoSelect = document.getElementById("algo-select");
const hud = document.getElementById("hud");

const playPauseBtn = document.getElementById("play-pause-btn");
const restartBtn = document.getElementById("restart-btn");
const speedBtn = document.getElementById("speed-btn");
const cameraBtn = document.getElementById("camera-btn");
const shareBtn = document.getElementById("share-btn");
const infoBtn = document.getElementById("info-btn");
const fpsIndicator = document.getElementById("fps-indicator");
const playPauseIconPath = document.getElementById("play-pause-icon-path");
const paramsToggleBtn = document.getElementById("params-toggle-btn");
const paramsToggleIconPath = document.getElementById("params-toggle-icon-path");
const infoScreen = document.getElementById("info-screen");
const infoBackdrop = document.getElementById("info-backdrop");
const infoCloseBtn = document.getElementById("info-close-btn");
const infoDiagram = document.getElementById("info-diagram");

const PLAY_ICON_PATH = "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z";
const PAUSE_ICON_PATH = "M6 4h4v16H6zM14 4h4v16h-4z";
const MINIMIZE_ICON_PATH = "M5 12h14";
const MAXIMIZE_ICON_PATH = "M12 5v14M5 12h14";
const SPEED_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
const SNAPSHOT_BACKGROUND = "#ffffff";
const SELECTED_PLUGIN_STORAGE_KEY = "gensynth:selected-plugin:v1";
const FPS_SAMPLE_INTERVAL_MS = 500;
const SHARE_PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/u;
const SHARE_SCHEMA_VERSION = 1;
const SHARE_FEEDBACK_DURATION_MS = 1800;

let paramsCollapsed = false;
let speedIndex = 0;
let fpsRafId = 0;
let fpsSampleStartMs = 0;
let fpsFrameCount = 0;
let fpsVisible = false;
let infoVisible = false;
let shareFeedbackTimer = 0;

const plugins = [
  arcsPlugin,
  circlesPlugin,
  linesPlugin,
  snakesPlugin,
  segmentsPlugin,
  spiralsPlugin,
  squigglesPlugin,
];
const pluginsById = new Map(plugins.map((plugin) => [plugin.id, plugin]));

function loadSelectedPluginId() {
  try {
    return localStorage.getItem(SELECTED_PLUGIN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSelectedPluginId(pluginId) {
  if (typeof pluginId !== "string" || pluginId.length === 0) {
    return;
  }

  try {
    localStorage.setItem(SELECTED_PLUGIN_STORAGE_KEY, pluginId);
  } catch {
    // Ignore storage write failures.
  }
}

const storedPluginId = loadSelectedPluginId();
const defaultPlugin = pluginsById.get(storedPluginId) ?? circlesPlugin;

for (const plugin of plugins) {
  const option = document.createElement("option");
  option.value = plugin.id;
  option.textContent = plugin.name;
  algoSelect.append(option);
}
algoSelect.value = defaultPlugin.id;
persistSelectedPluginId(defaultPlugin.id);

function setRunUi(running) {
  if (!playPauseBtn) {
    return;
  }

  playPauseBtn.setAttribute("aria-label", running ? "Pause" : "Play");
  playPauseBtn.title = running ? "Pause" : "Play";

  if (playPauseIconPath) {
    playPauseIconPath.setAttribute("d", running ? PAUSE_ICON_PATH : PLAY_ICON_PATH);
  }
}

function setParamsPanelCollapsed(collapsed) {
  paramsCollapsed = collapsed;

  if (paramsForm) {
    paramsForm.classList.toggle("is-hidden", collapsed);
    paramsForm.setAttribute("aria-hidden", collapsed ? "true" : "false");
  }

  if (hud) {
    hud.classList.toggle("hud-collapsed", collapsed);
  }

  if (paramsToggleBtn) {
    const label = collapsed ? "Show parameters" : "Hide parameters";
    paramsToggleBtn.setAttribute("aria-label", label);
    paramsToggleBtn.title = label;
  }

  if (paramsToggleIconPath) {
    paramsToggleIconPath.setAttribute("d", collapsed ? MAXIMIZE_ICON_PATH : MINIMIZE_ICON_PATH);
  }
}

function setPlaybackSpeed(index) {
  if (!SPEED_OPTIONS.length) {
    return;
  }

  const normalizedIndex = ((index % SPEED_OPTIONS.length) + SPEED_OPTIONS.length) % SPEED_OPTIONS.length;
  speedIndex = normalizedIndex;
  const speed = SPEED_OPTIONS[speedIndex];

  engine.setPlaybackMultiplier(speed);

  if (speedBtn) {
    const label = `Playback speed ${speed}x`;
    speedBtn.textContent = `${speed}x`;
    speedBtn.setAttribute("aria-label", label);
    speedBtn.title = label;
  }
}

function setFpsUi(fps) {
  if (!fpsIndicator) {
    return;
  }

  if (!Number.isFinite(fps)) {
    fpsIndicator.textContent = "-- fps";
    return;
  }

  fpsIndicator.textContent = `${Math.round(fps)} fps`;
}

function fpsLoop(timestamp) {
  if (fpsSampleStartMs === 0) {
    fpsSampleStartMs = timestamp;
    fpsFrameCount = 0;
  }

  fpsFrameCount += 1;
  const elapsedMs = timestamp - fpsSampleStartMs;
  if (elapsedMs >= FPS_SAMPLE_INTERVAL_MS) {
    const fps = (fpsFrameCount * 1000) / elapsedMs;
    setFpsUi(fps);
    fpsSampleStartMs = timestamp;
    fpsFrameCount = 0;
  }

  fpsRafId = requestAnimationFrame(fpsLoop);
}

function startFpsMonitor() {
  if (!fpsIndicator) {
    return;
  }

  if (fpsRafId) {
    cancelAnimationFrame(fpsRafId);
  }

  fpsSampleStartMs = 0;
  fpsFrameCount = 0;
  setFpsUi(Number.NaN);
  fpsRafId = requestAnimationFrame(fpsLoop);
}

function stopFpsMonitor() {
  if (fpsRafId) {
    cancelAnimationFrame(fpsRafId);
    fpsRafId = 0;
  }

  fpsSampleStartMs = 0;
  fpsFrameCount = 0;
}

function setFpsVisible(visible) {
  fpsVisible = Boolean(visible);

  if (fpsIndicator) {
    fpsIndicator.hidden = !fpsVisible;
  }

  if (fpsVisible) {
    startFpsMonitor();
    return;
  }

  stopFpsMonitor();
  setFpsUi(Number.NaN);
}

function setInfoVisible(visible) {
  infoVisible = Boolean(visible);

  if (infoScreen) {
    infoScreen.hidden = !infoVisible;
    infoScreen.setAttribute("aria-hidden", infoVisible ? "false" : "true");
  }

  if (infoBtn) {
    const label = infoVisible ? "Hide info" : "Show info";
    infoBtn.setAttribute("aria-label", label);
    infoBtn.title = label;
    infoBtn.classList.toggle("is-active", infoVisible);
  }

  if (!infoVisible) {
    setInfoDiagramCallout("");
  }
}

function setInfoDiagramCallout(part) {
  if (!infoDiagram) {
    return;
  }

  const callouts = infoDiagram.querySelectorAll("[data-callout]");
  callouts.forEach((callout) => {
    callout.classList.toggle("is-visible", part.length > 0 && callout.dataset.callout === part);
  });
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function makeSnapshotFilename() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");
  return `gensynth-${yyyy}${mm}${dd}-${hh}${min}${sec}.png`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createSnapshotCanvas(sourceCanvas) {
  if (!(sourceCanvas instanceof HTMLCanvasElement)) {
    return null;
  }

  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = Math.max(1, sourceCanvas.width);
  snapshotCanvas.height = Math.max(1, sourceCanvas.height);

  const snapshotCtx = snapshotCanvas.getContext("2d");
  if (!snapshotCtx) {
    return null;
  }

  snapshotCtx.fillStyle = SNAPSHOT_BACKGROUND;
  snapshotCtx.fillRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
  snapshotCtx.drawImage(sourceCanvas, 0, 0);

  return snapshotCanvas;
}

function downloadCanvasSnapshot() {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const filename = makeSnapshotFilename();
  const exportCanvas = createSnapshotCanvas(canvas) ?? canvas;
  if (typeof exportCanvas.toBlob === "function") {
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      downloadBlob(blob, filename);
    }, "image/png");
    return;
  }

  const link = document.createElement("a");
  link.href = exportCanvas.toDataURL("image/png");
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function resetShareButtonUi() {
  if (!shareBtn) {
    return;
  }

  shareBtn.classList.remove("is-copied", "is-error");
  shareBtn.setAttribute("aria-label", "Copy share URL");
  shareBtn.title = "Copy share URL";
}

function setShareButtonUiCopied() {
  if (!shareBtn) {
    return;
  }

  shareBtn.classList.remove("is-error");
  shareBtn.classList.add("is-copied");
  shareBtn.setAttribute("aria-label", "Share URL copied");
  shareBtn.title = "Share URL copied";
}

function setShareButtonUiError() {
  if (!shareBtn) {
    return;
  }

  shareBtn.classList.remove("is-copied");
  shareBtn.classList.add("is-error");
  shareBtn.setAttribute("aria-label", "Unable to copy share URL");
  shareBtn.title = "Unable to copy share URL";
}

function scheduleShareButtonUiReset() {
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
  }

  shareFeedbackTimer = window.setTimeout(() => {
    shareFeedbackTimer = 0;
    resetShareButtonUi();
  }, SHARE_FEEDBACK_DURATION_MS);
}

function encodeSharePayload(payload) {
  try {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary)
      .replace(/\+/gu, "-")
      .replace(/\//gu, "_")
      .replace(/=+$/u, "");
  } catch {
    return null;
  }
}

function decodeSharePayload(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0) {
    return null;
  }

  try {
    const normalized = encoded.replace(/-/gu, "+").replace(/_/gu, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(normalized + padding);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const json = new TextDecoder().decode(bytes);
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== "object") {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  textarea.remove();
  return copied;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below.
    }
  }

  return fallbackCopyText(text);
}

function createShareUrl() {
  const algoId = engine.getCurrentPluginId();
  if (typeof algoId !== "string" || algoId.length === 0) {
    return null;
  }

  const payload = {
    v: SHARE_SCHEMA_VERSION,
    a: algoId,
    s: engine.getCompactPluginSettings(),
  };
  const encoded = encodeSharePayload(payload);
  if (!encoded) {
    return null;
  }

  const url = new URL(window.location.href);
  url.search = `?${encoded}`;
  url.hash = "";
  return url.toString();
}

function readSharedPayloadFromAddress() {
  const url = new URL(window.location.href);
  const raw = url.search.startsWith("?")
    ? url.search.slice(1)
    : url.search;

  if (!raw || raw.includes("&") || raw.includes("=") || !SHARE_PAYLOAD_PATTERN.test(raw)) {
    return null;
  }

  return raw;
}

function clearShareParamFromAddress() {
  const url = new URL(window.location.href);
  const raw = url.search.startsWith("?")
    ? url.search.slice(1)
    : url.search;
  if (!raw || !SHARE_PAYLOAD_PATTERN.test(raw)) {
    return;
  }

  url.search = "";
  const cleaned = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", cleaned);
}

async function copyShareUrlToClipboard() {
  const shareUrl = createShareUrl();
  if (!shareUrl) {
    setShareButtonUiError();
    scheduleShareButtonUiReset();
    return;
  }

  const copied = await copyTextToClipboard(shareUrl);
  if (copied) {
    setShareButtonUiCopied();
  } else {
    setShareButtonUiError();
  }
  scheduleShareButtonUiReset();
}

function applySharedStateFromUrl() {
  const encoded = readSharedPayloadFromAddress();
  if (!encoded) {
    return;
  }

  try {
    const payload = decodeSharePayload(encoded);
    if (!payload) {
      return;
    }

    if (payload.v !== SHARE_SCHEMA_VERSION) {
      return;
    }

    if (typeof payload.a !== "string") {
      return;
    }

    const plugin = pluginsById.get(payload.a);
    if (!plugin) {
      return;
    }

    engine.setPlugin(plugin);
    algoSelect.value = plugin.id;
    persistSelectedPluginId(plugin.id);

    if (payload.s && typeof payload.s === "object") {
      engine.applyCompactPluginSettings(payload.s);
    }
  } finally {
    clearShareParamFromAddress();
  }
}

const engine = new GenSynthEngine({
  canvas,
  paramsForm,
  plugin: defaultPlugin,
  onRunStateChange: (running) => {
    setRunUi(running);
  },
});

engine.init();
setRunUi(engine.running);
setParamsPanelCollapsed(false);
setPlaybackSpeed(0);
setFpsVisible(false);
setInfoVisible(true);
setInfoDiagramCallout("");
resetShareButtonUi();
applySharedStateFromUrl();

playPauseBtn?.addEventListener("click", () => {
  if (engine.running) {
    engine.stop();
    return;
  }
  engine.start();
});

restartBtn.addEventListener("click", () => {
  engine.restart();
});

algoSelect?.addEventListener("change", () => {
  const selected = pluginsById.get(algoSelect.value);
  if (!selected) {
    return;
  }

  engine.setPlugin(selected);
  persistSelectedPluginId(selected.id);
});

paramsToggleBtn?.addEventListener("click", () => {
  setParamsPanelCollapsed(!paramsCollapsed);
});

speedBtn?.addEventListener("click", () => {
  setPlaybackSpeed(speedIndex + 1);
});

cameraBtn?.addEventListener("click", () => {
  downloadCanvasSnapshot();
});

shareBtn?.addEventListener("click", async () => {
  await copyShareUrlToClipboard();
});

infoBtn?.addEventListener("click", () => {
  setInfoVisible(!infoVisible);
});

infoBackdrop?.addEventListener("click", () => {
  setInfoVisible(false);
});

infoCloseBtn?.addEventListener("click", () => {
  setInfoVisible(false);
});

infoDiagram?.addEventListener("pointermove", (event) => {
  const target = event.target instanceof Element
    ? event.target.closest("[data-info-part]")
    : null;
  setInfoDiagramCallout(target?.dataset.infoPart ?? "");
});

infoDiagram?.addEventListener("pointerleave", () => {
  setInfoDiagramCallout("");
});

window.addEventListener("keydown", (event) => {
  if (event.repeat || isTypingTarget(event.target)) {
    return;
  }

  if (event.key === "Escape" && infoVisible) {
    event.preventDefault();
    setInfoVisible(false);
    return;
  }

  const isInfoKey = event.key.toLowerCase() === "i";
  if (isInfoKey) {
    event.preventDefault();
    setInfoVisible(!infoVisible);
    return;
  }

  const isQuestionKey = event.key === "?" || (event.code === "Slash" && event.shiftKey);
  if (!isQuestionKey) {
    return;
  }

  event.preventDefault();
  setFpsVisible(!fpsVisible);
});

window.addEventListener("beforeunload", () => {
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = 0;
  }
  stopFpsMonitor();
  engine.destroy();
});

engine.start();
setRunUi(engine.running);
