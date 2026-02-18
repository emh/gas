import { GenSynthEngine } from "./engine.js";
import { circlesPlugin } from "./plugins/circles.js";
import { linesPlugin } from "./plugins/lines.js";
import { spiralsPlugin } from "./plugins/spirals.js";

const canvas = document.getElementById("stage");
const paramsForm = document.getElementById("params-form");
const algoSelect = document.getElementById("algo-select");
const hud = document.getElementById("hud");

const playPauseBtn = document.getElementById("play-pause-btn");
const restartBtn = document.getElementById("restart-btn");
const speedBtn = document.getElementById("speed-btn");
const cameraBtn = document.getElementById("camera-btn");
const playPauseIconPath = document.getElementById("play-pause-icon-path");
const paramsToggleBtn = document.getElementById("params-toggle-btn");
const paramsToggleIconPath = document.getElementById("params-toggle-icon-path");

const PLAY_ICON_PATH = "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z";
const PAUSE_ICON_PATH = "M6 4h4v16H6zM14 4h4v16h-4z";
const MINIMIZE_ICON_PATH = "M5 12h14";
const MAXIMIZE_ICON_PATH = "M12 5v14M5 12h14";
const SPEED_OPTIONS = [1, 2, 4, 8, 16, 32];

let paramsCollapsed = false;
let speedIndex = 0;

const plugins = [
  circlesPlugin,
  linesPlugin,
  spiralsPlugin,
];
const pluginsById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
const defaultPlugin = circlesPlugin;

for (const plugin of plugins) {
  const option = document.createElement("option");
  option.value = plugin.id;
  option.textContent = plugin.name;
  algoSelect.append(option);
}
algoSelect.value = defaultPlugin.id;

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

function downloadCanvasSnapshot() {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const filename = makeSnapshotFilename();
  if (typeof canvas.toBlob === "function") {
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      downloadBlob(blob, filename);
    }, "image/png");
    return;
  }

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
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

window.addEventListener("beforeunload", () => {
  engine.destroy();
});

engine.start();
setRunUi(engine.running);
