import { INK_PARAMETER_DEFS } from "./plugins/ink-params.js";

const DEFAULT_STEP = 1;
const RANGE_EDGE_PADDING_PX = 0;
const RANGE_BOUND_HANDLE_THICKNESS_PX = 3;
const RANGE_CURRENT_HANDLE_DIAMETER_PX = 14;
const RANGE_INTER_HANDLE_MARGIN_PX = 0;
const BASE_CALLS_PER_SECOND = 1;
const MAX_STEPS_PER_FRAME = 120;
const PARAM_NOISE_SPEEDS = [0, 0.001, 0.005, 0.01, 0.1, 0.5];
const DEFAULT_PARAM_NOISE_SPEED_INDEX = 0;
const PARAM_NOISE_DOMAIN_STEP = 127.91831;

function fract(value) {
  return value - Math.floor(value);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function hash1(index) {
  return fract(Math.sin(index * 127.1) * 43758.5453123);
}

function noise1(value) {
  const i0 = Math.floor(value);
  const i1 = i0 + 1;
  const t = smoothstep(fract(value));
  return lerp(hash1(i0), hash1(i1), t);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveBound(bound, context, fallback) {
  const raw = typeof bound === "function" ? bound(context) : bound;
  return toNumber(raw, fallback);
}

function decimalsFromStep(step) {
  const text = String(step);
  if (!text.includes(".")) {
    return 0;
  }

  return Math.min(6, text.split(".")[1].length);
}

function formatValue(value, step) {
  const decimals = decimalsFromStep(step);
  if (decimals === 0) {
    return String(Math.round(value));
  }

  return value
    .toFixed(decimals)
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, "");
}

function formatNoiseSpeed(speed) {
  if (speed === 0) {
    return "0";
  }

  return speed
    .toFixed(3)
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, "");
}

function normalizeIndex(index, length) {
  if (length <= 0) {
    return 0;
  }

  const parsed = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((parsed % length) + length) % length;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value, min, step) {
  if (!(step > 0)) {
    return value;
  }

  const steps = Math.round((value - min) / step);
  return min + steps * step;
}

function isRangeValue(value) {
  return (
    value !== null
    && typeof value === "object"
    && Number.isFinite(value.min)
    && Number.isFinite(value.current)
    && Number.isFinite(value.max)
  );
}

function isBoundsValue(value) {
  return (
    value !== null
    && typeof value === "object"
    && Number.isFinite(value.min)
    && Number.isFinite(value.max)
  );
}

function isRangeDefaultObject(value) {
  return value !== null && typeof value === "object";
}

/**
 * Plugin API:
 * - init({ width, height, ctx, limitContext }) => { parameters, state? }
 * - run({ ctx, width, height, frame, deltaMs, timestamp, params, state, clear })
 *
 * Parameter definition:
 * - Number: { key, label?, min, max, default, step? }
 * - Range: { type: "range", key, label?, min, max, default, step?, allowFunction? }
 * - Bounds: { type: "bounds", key, label?, min, max, default?, step? }
 *
 * Range default behavior:
 * - default omitted -> min/max use full limits, current starts at midpoint.
 * - default is number -> min/max use full limits, current uses default.
 * - default is object -> can set min/max/current.
 *
 * Bounds default behavior:
 * - default omitted -> min/max use full limits.
 * - default is object -> can set min/max.
 */
export class GenSynthEngine {
  constructor({ canvas, paramsForm, statusEl, plugin, onRunStateChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.paramsForm = paramsForm;
    this.statusEl = statusEl;
    this.plugin = plugin;
    this.onRunStateChange = onRunStateChange ?? (() => {});

    if (!this.ctx) {
      throw new Error("Unable to initialize 2D canvas context.");
    }

    this.running = false;
    this.frame = 0;
    this.rafId = 0;
    this.lastTimestamp = 0;
    this.accumulatedMs = 0;
    this.runTimestamp = 0;
    this.playbackMultiplier = 1;
    this.tickIntervalMs = 1000 / BASE_CALLS_PER_SECOND;

    this.width = 1;
    this.height = 1;

    this.rawParamDefs = [];
    this.paramDefs = new Map();
    this.paramValues = {};

    this.scalarInputEls = new Map();
    this.rangeControlEls = new Map();
    this.rangeFunctionButtonEls = new Map();
    this.paramFunctionStates = new Map();
    this.nextNoiseDomainSeed = 1;

    this.pluginState = {};

    this.loop = this.loop.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  init() {
    this.resizeCanvas();
    this.initializePlugin({ useDefaults: true, rerenderHud: true });

    window.addEventListener("resize", this.handleResize);
    this.setStatus("Stopped");
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTimestamp = 0;
    this.accumulatedMs = this.tickIntervalMs;
    this.runTimestamp = performance.now();
    this.setStatus("Running");
    this.onRunStateChange(true);
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    this.setStatus("Stopped");
    this.onRunStateChange(false);
  }

  restart() {
    this.stop();
    this.frame = 0;
    this.lastTimestamp = 0;
    this.accumulatedMs = this.tickIntervalMs;
    this.runTimestamp = performance.now();

    // Recreate plugin state while preserving current parameter values.
    this.initializePlugin({ useDefaults: false, rerenderHud: false });
    this.clearCanvas();

    if (typeof this.plugin.restart === "function") {
      this.plugin.restart(this.createRunContext(performance.now(), 0));
    }

    this.start();
  }

  destroy() {
    window.removeEventListener("resize", this.handleResize);
    this.stop();
  }

  loop(timestamp) {
    if (!this.running) {
      return;
    }

    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
    }

    const deltaMs = Math.max(0, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    this.accumulatedMs += deltaMs;

    let steps = 0;
    let paramsChanged = false;
    while (this.accumulatedMs >= this.tickIntervalMs && steps < MAX_STEPS_PER_FRAME) {
      this.accumulatedMs -= this.tickIntervalMs;
      this.runTimestamp += this.tickIntervalMs;
      if (this.applyParameterFunctions()) {
        paramsChanged = true;
      }
      this.plugin.run(this.createRunContext(this.runTimestamp, this.tickIntervalMs));
      this.frame += 1;
      steps += 1;
    }

    if (steps === MAX_STEPS_PER_FRAME && this.accumulatedMs > this.tickIntervalMs) {
      this.accumulatedMs = this.tickIntervalMs;
    }

    if (paramsChanged) {
      this.syncHudValues();
    }

    this.rafId = requestAnimationFrame(this.loop);
  }

  handleResize() {
    this.resizeCanvas();
    this.initializePlugin({ useDefaults: true, rerenderHud: true });
    this.frame = 0;

    this.clearCanvas();

    if (typeof this.plugin.onResize === "function") {
      this.plugin.onResize(this.createRunContext(performance.now(), 0));
    }

    if (this.running) {
      this.lastTimestamp = 0;
      this.accumulatedMs = this.tickIntervalMs;
    }
  }

  setPlaybackMultiplier(multiplier) {
    const nextMultiplier = toNumber(multiplier, this.playbackMultiplier);
    if (!(nextMultiplier > 0)) {
      return;
    }

    const previousInterval = this.tickIntervalMs;
    this.playbackMultiplier = nextMultiplier;
    this.tickIntervalMs = 1000 / (BASE_CALLS_PER_SECOND * this.playbackMultiplier);

    if (previousInterval > 0) {
      const progress = this.accumulatedMs / previousInterval;
      this.accumulatedMs = clampNumber(progress * this.tickIntervalMs, 0, this.tickIntervalMs);
    }
  }

  setPlugin(plugin, { useDefaults = true, clear = true } = {}) {
    if (!plugin || typeof plugin.init !== "function" || typeof plugin.run !== "function") {
      throw new Error("Invalid plugin.");
    }

    if (plugin === this.plugin) {
      return;
    }

    const wasRunning = this.running;
    this.stop();

    this.plugin = plugin;
    this.frame = 0;
    this.lastTimestamp = 0;
    this.accumulatedMs = this.tickIntervalMs;
    this.runTimestamp = performance.now();

    if (clear) {
      this.clearCanvas();
    }

    this.initializePlugin({ useDefaults, rerenderHud: true });

    if (wasRunning) {
      this.start();
    }
  }

  initializePlugin({ useDefaults, rerenderHud }) {
    const initResult = this.plugin.init(this.createInitContext());
    const pluginParamDefs = Array.isArray(initResult?.parameters)
      ? initResult.parameters
      : [];
    this.rawParamDefs = [...pluginParamDefs, ...INK_PARAMETER_DEFS];
    this.pluginState = initResult?.state ?? {};

    this.resolveParamDefs({ useDefaults });
    this.normalizeFunctionStates();

    if (rerenderHud) {
      this.renderParamsHud();
    }

    this.syncHudValues();
  }

  createInitContext() {
    return {
      width: this.width,
      height: this.height,
      ctx: this.ctx,
      limitContext: this.limitContext(),
    };
  }

  createRunContext(timestamp, deltaMs) {
    return {
      ctx: this.ctx,
      width: this.width,
      height: this.height,
      frame: this.frame,
      deltaMs,
      timestamp,
      params: this.copyParams(),
      state: this.pluginState,
      clear: () => this.clearCanvas(),
    };
  }

  copyParams() {
    const result = {};

    for (const def of this.paramDefs.values()) {
      const value = this.paramValues[def.key];
      if (def.type === "range") {
        result[def.key] = value.current;
      } else if (def.type === "bounds") {
        result[def.key] = {
          min: value.min,
          max: value.max,
        };
      } else {
        result[def.key] = value;
      }
    }

    return result;
  }

  limitContext() {
    return {
      minDim: Math.min(this.width, this.height),
      maxDim: Math.max(this.width, this.height),
    };
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    this.width = Math.max(1, Math.floor(window.innerWidth));
    this.height = Math.max(1, Math.floor(window.innerHeight));

    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  resolveParamDefs({ useDefaults }) {
    const limits = this.limitContext();
    const nextDefs = new Map();

    for (const raw of this.rawParamDefs) {
      if (!raw?.key) {
        continue;
      }
      const group = typeof raw.group === "string" && raw.group.length > 0
        ? raw.group
        : "algo";

      if (raw.type === "range") {
        const min = resolveBound(raw.min, limits, 0);
        const maxCandidate = resolveBound(raw.max, limits, min);
        const max = maxCandidate < min ? min : maxCandidate;
        const step = raw.step > 0 ? raw.step : DEFAULT_STEP;

        const rawDefault = typeof raw.default === "function"
          ? raw.default(limits)
          : raw.default;

        let defaultMin = min;
        let defaultMax = max;
        let defaultCurrent = (min + max) / 2;

        if (rawDefault !== undefined) {
          if (isRangeDefaultObject(rawDefault)) {
            if (Number.isFinite(rawDefault.min)) {
              defaultMin = toNumber(rawDefault.min, min);
            }
            if (Number.isFinite(rawDefault.max)) {
              defaultMax = toNumber(rawDefault.max, max);
            }
            if (defaultMax < defaultMin) {
              defaultMax = defaultMin;
            }

            if (Number.isFinite(rawDefault.current)) {
              defaultCurrent = toNumber(rawDefault.current, defaultCurrent);
            }
          } else {
            defaultCurrent = toNumber(rawDefault, defaultCurrent);
          }
        }

        const resolved = {
          type: "range",
          key: raw.key,
          label: raw.label ?? raw.key,
          group,
          min,
          max,
          step,
          allowFunction: raw.allowFunction !== false,
          defaultMin,
          defaultCurrent,
          defaultMax,
        };

        nextDefs.set(resolved.key, resolved);

        if (useDefaults || !isRangeValue(this.paramValues[resolved.key])) {
          this.paramValues[resolved.key] = this.normalizeRangeTriplet(resolved, {
            min: defaultMin,
            current: defaultCurrent,
            max: defaultMax,
          });
          continue;
        }

        this.paramValues[resolved.key] = this.normalizeRangeTriplet(
          resolved,
          this.paramValues[resolved.key],
        );

        continue;
      }

      if (raw.type === "bounds") {
        const min = resolveBound(raw.min, limits, 0);
        const maxCandidate = resolveBound(raw.max, limits, min);
        const max = maxCandidate < min ? min : maxCandidate;
        const step = raw.step > 0 ? raw.step : DEFAULT_STEP;

        const rawDefault = typeof raw.default === "function"
          ? raw.default(limits)
          : raw.default;

        let defaultMin = min;
        let defaultMax = max;

        if (isRangeDefaultObject(rawDefault)) {
          if (Number.isFinite(rawDefault.min)) {
            defaultMin = toNumber(rawDefault.min, min);
          }
          if (Number.isFinite(rawDefault.max)) {
            defaultMax = toNumber(rawDefault.max, max);
          }
          if (defaultMax < defaultMin) {
            defaultMax = defaultMin;
          }
        }

        const resolved = {
          type: "bounds",
          key: raw.key,
          label: raw.label ?? raw.key,
          group,
          min,
          max,
          step,
          defaultMin,
          defaultMax,
        };

        nextDefs.set(resolved.key, resolved);

        if (useDefaults || !isBoundsValue(this.paramValues[resolved.key])) {
          this.paramValues[resolved.key] = this.normalizeBoundsPair(resolved, {
            min: defaultMin,
            max: defaultMax,
          });
          continue;
        }

        this.paramValues[resolved.key] = this.normalizeBoundsPair(
          resolved,
          this.paramValues[resolved.key],
        );

        continue;
      }

      const min = resolveBound(raw.min, limits, 0);
      const maxCandidate = resolveBound(raw.max, limits, min);
      const max = maxCandidate < min ? min : maxCandidate;
      const step = raw.step > 0 ? raw.step : DEFAULT_STEP;
      const numberDefaultSource = raw.default !== undefined ? raw.default : raw.defaultValue;
      const defaultCandidate = resolveBound(numberDefaultSource, limits, min);
      const defaultValue = clampNumber(defaultCandidate, min, max);

      const resolved = {
        type: "number",
        key: raw.key,
        label: raw.label ?? raw.key,
        group,
        min,
        max,
        step,
        defaultValue,
      };

      nextDefs.set(resolved.key, resolved);

      if (useDefaults || !(resolved.key in this.paramValues)) {
        this.paramValues[resolved.key] = defaultValue;
      } else {
        const current = toNumber(this.paramValues[resolved.key], defaultValue);
        this.paramValues[resolved.key] = clampNumber(current, min, max);
      }
    }

    for (const key of Object.keys(this.paramValues)) {
      if (!nextDefs.has(key)) {
        delete this.paramValues[key];
      }
    }

    this.paramDefs = nextDefs;
  }

  normalizeBoundsPair(def, value) {
    let minValue = clampNumber(toNumber(value.min, def.defaultMin), def.min, def.max);
    let maxValue = clampNumber(toNumber(value.max, def.defaultMax), def.min, def.max);

    minValue = this.snapRangeValue(def, minValue);
    maxValue = this.snapRangeValue(def, maxValue);

    if (maxValue < minValue) {
      maxValue = minValue;
    }

    return {
      min: minValue,
      max: maxValue,
    };
  }

  normalizeRangeTriplet(def, value) {
    let minValue = clampNumber(toNumber(value.min, def.defaultMin), def.min, def.max);
    let maxValue = clampNumber(toNumber(value.max, def.defaultMax), def.min, def.max);

    minValue = this.snapRangeValue(def, minValue);
    maxValue = this.snapRangeValue(def, maxValue);

    if (maxValue < minValue) {
      maxValue = minValue;
    }

    let currentValue = clampNumber(
      toNumber(value.current, def.defaultCurrent),
      minValue,
      maxValue,
    );

    currentValue = this.snapRangeValue(def, currentValue);
    currentValue = clampNumber(currentValue, minValue, maxValue);

    return {
      min: minValue,
      current: currentValue,
      max: maxValue,
    };
  }

  snapRangeValue(def, value) {
    const snapped = snapToStep(value, def.min, def.step);
    return clampNumber(snapped, def.min, def.max);
  }

  createNoiseDomain() {
    const domain = this.nextNoiseDomainSeed * PARAM_NOISE_DOMAIN_STEP;
    this.nextNoiseDomainSeed += 1;
    return domain;
  }

  normalizeNoiseSpeedIndex(index) {
    return normalizeIndex(index, PARAM_NOISE_SPEEDS.length);
  }

  isRangeFunctionEnabled(def) {
    return def?.type === "range" && def.allowFunction !== false;
  }

  normalizeFunctionStates() {
    const nextStates = new Map();
    const usedDomains = new Set();

    for (const def of this.paramDefs.values()) {
      if (!this.isRangeFunctionEnabled(def)) {
        continue;
      }

      const current = this.paramFunctionStates.get(def.key);
      const noiseSpeedIndex = this.normalizeNoiseSpeedIndex(current?.noiseSpeedIndex);
      let noiseDomain = Number.isFinite(current?.noiseDomain)
        ? current.noiseDomain
        : this.createNoiseDomain();

      while (usedDomains.has(noiseDomain)) {
        noiseDomain = this.createNoiseDomain();
      }
      usedDomains.add(noiseDomain);

      nextStates.set(def.key, {
        noiseSpeedIndex,
        noiseDomain,
      });
    }

    this.paramFunctionStates = nextStates;
  }

  createFunctionButton(key, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "param-fn-btn";
    button.dataset.key = key;
    button.addEventListener("click", () => {
      this.cycleParamNoiseSpeed(key);
    });
    this.updateFunctionButtonUi(key, button, label);
    return button;
  }

  cycleParamNoiseSpeed(key) {
    const def = this.paramDefs.get(key);
    if (!this.isRangeFunctionEnabled(def)) {
      return;
    }

    const current = this.paramFunctionStates.get(key) ?? {
      noiseSpeedIndex: DEFAULT_PARAM_NOISE_SPEED_INDEX,
      noiseDomain: this.createNoiseDomain(),
    };

    current.noiseSpeedIndex = this.normalizeNoiseSpeedIndex(current.noiseSpeedIndex + 1);
    this.paramFunctionStates.set(key, current);
    this.updateFunctionButtonUi(key, this.rangeFunctionButtonEls.get(key), def.label);
    this.syncHudValues();
  }

  updateFunctionButtonUi(key, button, label) {
    if (!button) {
      return;
    }

    const state = this.paramFunctionStates.get(key) ?? {
      noiseSpeedIndex: DEFAULT_PARAM_NOISE_SPEED_INDEX,
      noiseDomain: 0,
    };
    const noiseSpeed = PARAM_NOISE_SPEEDS[this.normalizeNoiseSpeedIndex(state.noiseSpeedIndex)];
    const speedLabel = formatNoiseSpeed(noiseSpeed);
    button.textContent = speedLabel;
    button.classList.toggle("is-active", noiseSpeed > 0);
    button.dataset.speed = speedLabel;
    button.setAttribute("aria-label", `${label} noise speed ${speedLabel}`);
    button.title = `noise speed ${speedLabel}`;
  }

  applyParameterFunctions() {
    let changed = false;

    for (const def of this.paramDefs.values()) {
      if (!this.isRangeFunctionEnabled(def)) {
        continue;
      }

      const state = this.paramFunctionStates.get(def.key);
      if (!state) {
        continue;
      }

      const noiseSpeed = PARAM_NOISE_SPEEDS[this.normalizeNoiseSpeedIndex(state.noiseSpeedIndex)];
      if (!(noiseSpeed > 0)) {
        continue;
      }

      if (!Number.isFinite(state.noiseDomain)) {
        state.noiseDomain = this.createNoiseDomain();
      }

      const value = this.paramValues[def.key];
      const noiseValue = noise1(this.frame * noiseSpeed + state.noiseDomain);
      const nextCurrent = value.min + (value.max - value.min) * noiseValue;

      const clampedCurrent = clampNumber(nextCurrent, value.min, value.max);
      if (Math.abs(clampedCurrent - value.current) > 1e-6) {
        this.paramValues[def.key] = {
          min: value.min,
          current: clampedCurrent,
          max: value.max,
        };
        changed = true;
      }
    }

    return changed;
  }

  renderParamsHud() {
    this.paramsForm.textContent = "";
    this.scalarInputEls.clear();
    this.rangeControlEls.clear();
    this.rangeFunctionButtonEls.clear();
    let previousGroup = null;

    for (const def of this.paramDefs.values()) {
      if (def.group === "ink" && previousGroup !== null && previousGroup !== "ink") {
        const separator = document.createElement("div");
        separator.className = "param-separator";
        separator.setAttribute("aria-hidden", "true");
        this.paramsForm.append(separator);
      }

      const row = document.createElement("div");
      row.className = "param-row";

      if (def.type === "range" || def.type === "bounds") {
        const label = document.createElement("div");
        label.className = "param-label";
        label.textContent = def.label;

        const triControl = document.createElement("div");
        triControl.className = "tri-control";
        if (def.type === "bounds") {
          triControl.classList.add("tri-control-bounds");
        }
        triControl.addEventListener("pointerenter", (event) => {
          this.updateTooltipForPointer(def.key, event.clientX, event.clientY);
        });
        triControl.addEventListener("pointermove", (event) => {
          this.updateTooltipForPointer(def.key, event.clientX, event.clientY);
        });
        triControl.addEventListener("pointerleave", () => {
          this.resetTooltipPosition(def.key);
        });

        const track = document.createElement("div");
        track.className = "tri-track";
        track.addEventListener("pointerdown", (event) => {
          if (event.target === track) {
            this.handleTrackPointerDown(def.key, event);
          }
        });

        const minHandle = this.createRangeHandle(def.key, "min", `${def.label} minimum`);
        const maxHandle = this.createRangeHandle(def.key, "max", `${def.label} maximum`);
        track.append(minHandle, maxHandle);

        let currentHandle = null;
        if (def.type === "range") {
          currentHandle = this.createRangeHandle(def.key, "current", `${def.label} current`);
          track.append(currentHandle);
        }

        const tooltip = document.createElement("div");
        tooltip.className = "tri-tooltip";
        tooltip.textContent = "";

        const controlRow = document.createElement("div");
        if (def.type === "range") {
          if (this.isRangeFunctionEnabled(def)) {
            const functionBtn = this.createFunctionButton(def.key, def.label);
            controlRow.className = "param-control-row";
            controlRow.append(functionBtn, triControl);
            this.rangeFunctionButtonEls.set(def.key, functionBtn);
          } else {
            triControl.classList.add("tri-control-bounds");
            controlRow.className = "param-control-row param-control-row-bounds";
            controlRow.append(triControl);
          }
        } else {
          controlRow.className = "param-control-row param-control-row-bounds";
          controlRow.append(triControl);
        }

        triControl.append(track, tooltip);
        row.append(label, controlRow);
        this.paramsForm.append(row);

        this.rangeControlEls.set(def.key, {
          control: triControl,
          track,
          minHandle,
          currentHandle,
          maxHandle,
          tooltip,
          lastTooltipX: null,
          lastTooltipY: null,
        });
        previousGroup = def.group;
        continue;
      }

      const input = document.createElement("input");
      input.id = `param-${def.key}`;
      input.type = "text";
      input.inputMode = "decimal";
      input.value = formatValue(this.paramValues[def.key], def.step);
      input.addEventListener("change", () => this.commitScalarInput(def.key));
      input.addEventListener("blur", () => this.commitScalarInput(def.key));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });

      row.append(input);
      this.paramsForm.append(row);

      this.scalarInputEls.set(def.key, input);
      previousGroup = def.group;
    }
  }

  createRangeHandle(key, bound, ariaLabel) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = `tri-handle tri-handle-${bound}`;
    handle.setAttribute("aria-label", ariaLabel);
    handle.dataset.bound = bound;

    handle.addEventListener("pointerdown", (event) => {
      this.startRangeDrag(key, bound, event);
    });

    handle.addEventListener("keydown", (event) => {
      this.handleRangeKeydown(key, bound, event);
    });

    return handle;
  }

  handleTrackPointerDown(key, event) {
    const bound = this.pickClosestRangeBound(key, event.clientX);
    this.startRangeDrag(key, bound, event);
  }

  pickClosestRangeBound(key, clientX) {
    const def = this.paramDefs.get(key);
    const controls = this.rangeControlEls.get(key);
    if (!def || (def.type !== "range" && def.type !== "bounds") || !controls) {
      return "current";
    }

    const rect = controls.track.getBoundingClientRect();
    if (rect.width <= 0) {
      return def.type === "range" ? "current" : "min";
    }

    const x = clampNumber(clientX - rect.left, 0, rect.width);
    const value = this.paramValues[key];

    const minPosition = this.valueToTrackX(def, value.min, rect.width);
    const maxPosition = this.valueToTrackX(def, value.max, rect.width);

    if (def.type === "bounds") {
      return Math.abs(x - minPosition) <= Math.abs(x - maxPosition) ? "min" : "max";
    }

    const currentPosition = this.valueToTrackX(def, value.current, rect.width);

    if (
      Math.abs(minPosition - currentPosition) <= 2
      && Math.abs(maxPosition - currentPosition) <= 2
    ) {
      if (x < currentPosition - 1) {
        return "min";
      }

      if (x > currentPosition + 1) {
        return "max";
      }

      return "current";
    }

    const positions = {
      min: minPosition,
      current: currentPosition,
      max: maxPosition,
    };

    const candidates = ["current", "min", "max"];
    let best = "current";
    let bestDistance = Infinity;

    for (const candidate of candidates) {
      const distance = Math.abs(x - positions[candidate]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }

    return best;
  }

  startRangeDrag(key, bound, event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    event.preventDefault();

    const move = (moveEvent) => {
      this.dragRangeHandle(key, bound, moveEvent.clientX);
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);

    this.dragRangeHandle(key, bound, event.clientX);
  }

  handleRangeKeydown(key, bound, event) {
    const def = this.paramDefs.get(key);
    if (!def || (def.type !== "range" && def.type !== "bounds")) {
      return;
    }

    if (bound === "current" && def.type !== "range") {
      return;
    }

    const value = this.paramValues[key];
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"];
    if (!keys.includes(event.key)) {
      return;
    }

    event.preventDefault();

    let next = value[bound];

    if (event.key === "Home") {
      next = def.min;
    } else if (event.key === "End") {
      next = def.max;
    } else {
      const multiplier = event.key.startsWith("Page") ? 10 : 1;
      const delta = def.step * multiplier;
      const increaseKeys = ["ArrowUp", "ArrowRight", "PageUp"];
      next += increaseKeys.includes(event.key) ? delta : -delta;
    }

    this.updateRangeValue(key, bound, next);
    this.syncHudValues();
  }

  dragRangeHandle(key, bound, clientX) {
    const def = this.paramDefs.get(key);
    const controls = this.rangeControlEls.get(key);
    if (!def || (def.type !== "range" && def.type !== "bounds") || !controls) {
      return;
    }

    if (bound === "current" && def.type !== "range") {
      return;
    }

    const rect = controls.track.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const trackX = clampNumber(clientX - rect.left, 0, rect.width);
    const value = this.trackXToValue(def, trackX, rect.width);

    this.updateRangeValue(key, bound, value);
    this.syncHudValues();
  }

  updateRangeValue(key, bound, nextValue) {
    const def = this.paramDefs.get(key);
    if (!def || (def.type !== "range" && def.type !== "bounds")) {
      return;
    }

    if (bound === "current" && def.type !== "range") {
      return;
    }

    const value = this.paramValues[key];
    const next = {
      min: value.min,
      max: value.max,
    };
    if (def.type === "range") {
      next.current = value.current;
    }

    if (bound === "min") {
      next.min = nextValue;
      if (next.min > next.max) {
        next.max = next.min;
      }
      if (def.type === "range" && next.current < next.min) {
        next.current = next.min;
      }
    } else if (bound === "max") {
      next.max = nextValue;
      if (next.max < next.min) {
        next.min = next.max;
      }
      if (def.type === "range" && next.current > next.max) {
        next.current = next.max;
      }
    } else if (def.type === "range") {
      next.current = nextValue;
    }

    this.paramValues[key] = def.type === "range"
      ? this.normalizeRangeTriplet(def, next)
      : this.normalizeBoundsPair(def, next);
  }

  syncHudValues() {
    for (const def of this.paramDefs.values()) {
      if (def.type === "range" || def.type === "bounds") {
        const controls = this.rangeControlEls.get(def.key);
        if (controls) {
          const value = this.paramValues[def.key];
          const trackWidth = controls.track.clientWidth || controls.track.getBoundingClientRect().width;

          this.positionRangeHandle(def, controls.minHandle, "min", value.min, trackWidth);
          this.positionRangeHandle(def, controls.maxHandle, "max", value.max, trackWidth);
          if (def.type === "range" && controls.currentHandle) {
            this.positionRangeHandle(def, controls.currentHandle, "current", value.current, trackWidth);
            this.updateCurrentHandleClip(def, controls, value, trackWidth);
            controls.tooltip.textContent = `range: ${formatValue(value.min, def.step)}-${formatValue(value.max, def.step)}\ncurrent: ${formatValue(value.current, def.step)}`;
          } else {
            controls.tooltip.textContent = `range: ${formatValue(value.min, def.step)}-${formatValue(value.max, def.step)}`;
          }

          if (!Number.isFinite(controls.lastTooltipX) || !Number.isFinite(controls.lastTooltipY)) {
            const rect = controls.control.getBoundingClientRect();
            controls.lastTooltipX = rect.left + rect.width / 2;
            controls.lastTooltipY = rect.top + rect.height / 2;
          }

          this.positionTooltip(controls.tooltip, controls.lastTooltipX, controls.lastTooltipY);
        }
      } else {
        const input = this.scalarInputEls.get(def.key);
        if (input) {
          input.value = formatValue(this.paramValues[def.key], def.step);
        }
      }
    }
  }

  valueToTrackX(def, value, trackWidth) {
    const safeWidth = Math.max(0, trackWidth);
    const minX = RANGE_EDGE_PADDING_PX;
    const maxX = Math.max(minX, safeWidth - RANGE_EDGE_PADDING_PX);

    if (def.max <= def.min) {
      return minX;
    }

    const ratio = (value - def.min) / (def.max - def.min);
    const clampedRatio = clampNumber(ratio, 0, 1);
    return minX + clampedRatio * (maxX - minX);
  }

  trackXToValue(def, trackX, trackWidth) {
    const safeWidth = Math.max(0, trackWidth);
    const minX = RANGE_EDGE_PADDING_PX;
    const maxX = Math.max(minX, safeWidth - RANGE_EDGE_PADDING_PX);
    const clampedX = clampNumber(trackX, minX, maxX);

    if (maxX <= minX || def.max <= def.min) {
      return def.min;
    }

    const ratio = (clampedX - minX) / (maxX - minX);
    return def.min + ratio * (def.max - def.min);
  }

  positionRangeHandle(def, handle, bound, value, trackWidth) {
    if (!handle) {
      return;
    }

    const semanticX = this.valueToTrackX(def, value, trackWidth);
    const effectiveWidth = Math.max(0, trackWidth);
    const maxLeft = Math.max(0, effectiveWidth - RANGE_BOUND_HANDLE_THICKNESS_PX);

    if (bound === "min") {
      const left = clampNumber(semanticX, 0, maxLeft);
      handle.style.left = `${left}px`;
      return;
    }

    if (bound === "max") {
      const left = clampNumber(
        semanticX - RANGE_BOUND_HANDLE_THICKNESS_PX,
        0,
        maxLeft,
      );
      handle.style.left = `${left}px`;
      return;
    }

    const currentMaxLeft = Math.max(0, effectiveWidth - RANGE_CURRENT_HANDLE_DIAMETER_PX);
    const left = clampNumber(
      semanticX - RANGE_CURRENT_HANDLE_DIAMETER_PX / 2,
      0,
      currentMaxLeft,
    );
    handle.style.left = `${left}px`;
  }

  updateCurrentHandleClip(def, controls, value, trackWidth) {
    const currentHandle = controls.currentHandle;
    const diameter = RANGE_CURRENT_HANDLE_DIAMETER_PX;
    const radius = diameter / 2;

    const currentCenterX = this.valueToTrackX(def, value.current, trackWidth);
    const minEdgeX = this.valueToTrackX(def, value.min, trackWidth);
    const maxEdgeX = this.valueToTrackX(def, value.max, trackWidth);

    const leftBound = minEdgeX + RANGE_INTER_HANDLE_MARGIN_PX;
    const rightBound = maxEdgeX - RANGE_INTER_HANDLE_MARGIN_PX;

    const circleLeft = currentCenterX - radius;
    const circleRight = currentCenterX + radius;

    const leftClip = clampNumber(leftBound - circleLeft, 0, diameter);
    const rightClip = clampNumber(circleRight - rightBound, 0, diameter);

    currentHandle.style.clipPath = `inset(0 ${rightClip}px 0 ${leftClip}px)`;
  }

  updateTooltipForPointer(key, clientX, clientY) {
    const controls = this.rangeControlEls.get(key);
    if (!controls) {
      return;
    }

    const rect = controls.control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    controls.lastTooltipX = clampNumber(clientX, rect.left, rect.right);
    controls.lastTooltipY = clampNumber(clientY, rect.top, rect.bottom);
    this.positionTooltip(controls.tooltip, controls.lastTooltipX, controls.lastTooltipY);
  }

  resetTooltipPosition(key) {
    const controls = this.rangeControlEls.get(key);
    if (!controls) {
      return;
    }

    const rect = controls.control.getBoundingClientRect();
    controls.lastTooltipX = rect.left + rect.width / 2;
    controls.lastTooltipY = rect.top + rect.height / 2;
    this.positionTooltip(controls.tooltip, controls.lastTooltipX, controls.lastTooltipY);
  }

  positionTooltip(tooltip, anchorX, anchorY) {
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
      tooltip.style.top = "0px";
      tooltip.style.left = "0px";
      return;
    }

    const viewportPadding = 8;
    const yOffset = 14;
    const tooltipHeight = tooltip.offsetHeight || 0;
    const tooltipWidth = tooltip.offsetWidth || 0;

    const centeredLeft = anchorX - tooltipWidth / 2;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - viewportPadding - tooltipWidth);
    const left = clampNumber(centeredLeft, viewportPadding, maxLeft);

    const topCandidate = anchorY + yOffset;
    const maxTop = Math.max(viewportPadding, window.innerHeight - viewportPadding - tooltipHeight);
    const top = clampNumber(topCandidate, viewportPadding, maxTop);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  commitScalarInput(key) {
    const def = this.paramDefs.get(key);
    const input = this.scalarInputEls.get(key);
    if (!def || def.type !== "number" || !input) {
      return;
    }

    const parsed = Number(input.value.trim());
    if (!Number.isFinite(parsed)) {
      input.value = formatValue(this.paramValues[key], def.step);
      return;
    }

    this.paramValues[key] = clampNumber(parsed, def.min, def.max);
    this.syncHudValues();
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  setStatus(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }
}
