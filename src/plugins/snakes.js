import { resolveInkStyle } from "./ink-params.js";

const DIRECTION_NOISE_SCALE = 0.003;
const DIRECTION_DRIFT_NOISE_SPEED = 0.01;
const DIRECTION_DRIFT_RATIO = 0.25;
const WRAP_MARGIN = 40;
const NOISE_DOMAIN_MIX_X = 15731;
const NOISE_DOMAIN_MIX_Y = 789221;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

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

function noise2(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = smoothstep(fract(x));
  const ty = smoothstep(fract(y));

  const n00 = hash1(x0 * NOISE_DOMAIN_MIX_X + y0 * NOISE_DOMAIN_MIX_Y);
  const n10 = hash1(x1 * NOISE_DOMAIN_MIX_X + y0 * NOISE_DOMAIN_MIX_Y);
  const n01 = hash1(x0 * NOISE_DOMAIN_MIX_X + y1 * NOISE_DOMAIN_MIX_Y);
  const n11 = hash1(x1 * NOISE_DOMAIN_MIX_X + y1 * NOISE_DOMAIN_MIX_Y);

  const nx0 = lerp(n00, n10, tx);
  const nx1 = lerp(n01, n11, tx);
  return lerp(nx0, nx1, ty);
}

function wrapCoordinate(value, max, margin) {
  if (value < -margin) {
    return max + margin;
  }
  if (value > max + margin) {
    return -margin;
  }
  return value;
}

function resetState(state, width, height) {
  state.x = width * 0.5;
  state.y = height * 0.5;
  state.theta = Math.random() * Math.PI * 2;
  state.t = Math.random() * 100000;
  state.dirOffsetX = Math.random() * 100000;
  state.dirOffsetY = Math.random() * 100000;
  state.driftOffset = Math.random() * 100000;
}

function ensureState(state, width, height) {
  if (
    !Number.isFinite(state.x)
    || !Number.isFinite(state.y)
    || !Number.isFinite(state.theta)
    || !Number.isFinite(state.t)
    || !Number.isFinite(state.dirOffsetX)
    || !Number.isFinite(state.dirOffsetY)
    || !Number.isFinite(state.driftOffset)
  ) {
    resetState(state, width, height);
  }
}

export const snakesPlugin = {
  id: "snakes",
  name: "Snakes",

  init({ width, height }) {
    const state = {};
    resetState(state, width, height);

    return {
      parameters: [
        {
          type: "range",
          key: "speed",
          label: "Speed (Step)",
          min: 1,
          max: 10,
          default: 5,
          step: 0.1,
        },
        {
          type: "range",
          key: "turnRate",
          label: "Turn Rate",
          min: 0.0001,
          max: 0.1,
          default: 0.01,
          step: 0.0001,
        },
        {
          type: "range",
          key: "width",
          label: "Width (Spacing)",
          min: 1,
          max: 50,
          default: 5,
          step: 1,
        },
        {
          type: "range",
          key: "stripeProbability",
          label: "Stripe Probability",
          min: 0,
          max: 1,
          default: 0.5,
          step: 0.01,
        },
      ],
      state,
    };
  },

  run({ ctx, width, height, params, state }) {
    ensureState(state, width, height);

    const step = Math.max(0, params.speed);
    if (!(step > 0)) {
      return;
    }

    const turnRate = Math.max(0, params.turnRate);
    const spacing = Math.max(0, params.width);
    const stripeProbability = clamp01(params.stripeProbability);

    const directionNoise = noise2(
      state.x * DIRECTION_NOISE_SCALE + state.dirOffsetX,
      state.y * DIRECTION_NOISE_SCALE + state.dirOffsetY,
    );
    const wobble = (directionNoise * 2 - 1) * turnRate;
    const driftNoise = noise1(state.t * DIRECTION_DRIFT_NOISE_SPEED + state.driftOffset);
    const drift = (driftNoise * 2 - 1) * (turnRate * DIRECTION_DRIFT_RATIO);

    state.theta += wobble + drift;

    const deltaX = Math.cos(state.theta) * step;
    const deltaY = Math.sin(state.theta) * step;
    const nextX = state.x + deltaX;
    const nextY = state.y + deltaY;

    const perpendicularX = -Math.sin(state.theta);
    const perpendicularY = Math.cos(state.theta);
    const halfSpacing = spacing * 0.5;

    const ax1 = state.x + perpendicularX * halfSpacing;
    const ay1 = state.y + perpendicularY * halfSpacing;
    const ax2 = nextX + perpendicularX * halfSpacing;
    const ay2 = nextY + perpendicularY * halfSpacing;

    const bx1 = state.x - perpendicularX * halfSpacing;
    const by1 = state.y - perpendicularY * halfSpacing;
    const bx2 = nextX - perpendicularX * halfSpacing;
    const by2 = nextY - perpendicularY * halfSpacing;

    const { lineThickness, strokeStyle } = resolveInkStyle(params);

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(ax2, ay2);
    ctx.lineTo(bx2, by2);
    ctx.lineTo(bx1, by1);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = lineThickness;
    ctx.strokeStyle = strokeStyle;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(ax2, ay2);
    ctx.moveTo(bx1, by1);
    ctx.lineTo(bx2, by2);

    if (stripeProbability >= 1 || Math.random() < stripeProbability) {
      ctx.moveTo(ax2, ay2);
      ctx.lineTo(bx2, by2);
    }

    ctx.stroke();

    state.x = wrapCoordinate(nextX, width, WRAP_MARGIN);
    state.y = wrapCoordinate(nextY, height, WRAP_MARGIN);
    state.t += 1;
  },
};
