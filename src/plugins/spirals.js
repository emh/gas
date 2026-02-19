import { resolveInkStyle } from "./ink-params.js";

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function map01(value, min, max) {
  return min + (max - min) * value;
}

function normalizeAngleRadians(angle) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function polarToXY(centerX, centerY, angleRadians, radius) {
  return {
    x: centerX + radius * Math.cos(angleRadians),
    y: centerY + radius * Math.sin(angleRadians),
  };
}

const BASE_THETA_STEP = 0.1;
const ACCEL_MAG_BASE = 0.03;
const ACCEL_MAG_NOISE_SPEED = 0.01;
const FRICTION = 0.985;
const VELOCITY_MAX = 6;
const BOUNCE_LOSS = 0.85;
const EDGE_PAD = 60;
const EDGE_PUSH = 0.055;
const OUTSIDE_FACTOR = 2;
const SEGMENTS_PER_CALL = 10;
const NOISE_DOMAIN_ACCEL_DIR_X = 10.123;
const NOISE_DOMAIN_ACCEL_DIR_Y = 99.321;
const NOISE_DOMAIN_ACCEL_MAGNITUDE = 777.777;
const NOISE_DOMAIN_RADIUS = 123.456;

function updateCenterBoundedNoisedAccel(state, {
  width,
  height,
  radiusBound,
  directionDrift,
  accelJitter,
}) {
  const margin = radiusBound * OUTSIDE_FACTOR;
  const minX = -margin;
  const maxX = width + margin;
  const minY = -margin;
  const maxY = height + margin;

  const directionNoiseSpeed = Math.max(0, directionDrift);
  let dirX = noise1(state.t * directionNoiseSpeed + NOISE_DOMAIN_ACCEL_DIR_X) * 2 - 1;
  let dirY = noise1(state.t * directionNoiseSpeed + NOISE_DOMAIN_ACCEL_DIR_Y) * 2 - 1;
  const directionLength = Math.hypot(dirX, dirY) || 1;
  dirX /= directionLength;
  dirY /= directionLength;

  const accelMagnitudeNoise = noise1(state.t * ACCEL_MAG_NOISE_SPEED + NOISE_DOMAIN_ACCEL_MAGNITUDE) * 2 - 1;
  const accelMagnitude = Math.max(0, ACCEL_MAG_BASE + accelMagnitudeNoise * accelJitter);

  let accelX = dirX * accelMagnitude;
  let accelY = dirY * accelMagnitude;

  const padX = Math.min(EDGE_PAD, Math.max(0, (maxX - minX) * 0.5));
  const padY = Math.min(EDGE_PAD, Math.max(0, (maxY - minY) * 0.5));

  if (state.cx < minX + padX) {
    accelX += EDGE_PUSH * ((minX + padX) - state.cx);
  }
  if (state.cx > maxX - padX) {
    accelX -= EDGE_PUSH * (state.cx - (maxX - padX));
  }
  if (state.cy < minY + padY) {
    accelY += EDGE_PUSH * ((minY + padY) - state.cy);
  }
  if (state.cy > maxY - padY) {
    accelY -= EDGE_PUSH * (state.cy - (maxY - padY));
  }

  state.vx = (state.vx + accelX) * FRICTION;
  state.vy = (state.vy + accelY) * FRICTION;

  const speed = Math.hypot(state.vx, state.vy);
  if (speed > VELOCITY_MAX) {
    const scale = VELOCITY_MAX / speed;
    state.vx *= scale;
    state.vy *= scale;
  }

  state.cx += state.vx;
  state.cy += state.vy;

  const bounceRetention = clamp(BOUNCE_LOSS, 0, 1);

  if (state.cx < minX) {
    state.cx = minX + (minX - state.cx);
    state.vx = Math.abs(state.vx) * bounceRetention;
  } else if (state.cx > maxX) {
    state.cx = maxX - (state.cx - maxX);
    state.vx = -Math.abs(state.vx) * bounceRetention;
  }

  if (state.cy < minY) {
    state.cy = minY + (minY - state.cy);
    state.vy = Math.abs(state.vy) * bounceRetention;
  } else if (state.cy > maxY) {
    state.cy = maxY - (state.cy - maxY);
    state.vy = -Math.abs(state.vy) * bounceRetention;
  }
}

export const spiralsPlugin = {
  id: "spirals",
  name: "Spirals",

  init({ width, height }) {
    const startX = width * (0.25 + Math.random() * 0.5);
    const startY = height * (0.25 + Math.random() * 0.5);
    const startT = Math.random() * 100000;
    const startAngle = Math.random() * Math.PI * 2;

    return {
      parameters: [
        {
          type: "range",
          key: "tightness",
          label: "Tightness",
          min: 0.1,
          max: 5,
          default: 2,
          step: 0.01,
        },
        {
          type: "bounds",
          key: "radius",
          label: "Radius",
          min: 0,
          max: 1000,
          step: 1,
        },
        {
          type: "range",
          key: "radialSpeed",
          label: "Radius Drift",
          min: 0.001,
          max: 0.01,
          default: 0.002,
          step: 0.001,
        },
        {
          type: "range",
          key: "directionDrift",
          label: "Direction Drift",
          min: 0.001,
          max: 0.05,
          default: 0.01,
          step: 0.001,
          allowFunction: false,
        },
        {
          type: "range",
          key: "accelJitter",
          label: "Accel Jitter",
          min: 0,
          max: 0.2,
          default: 0.1,
          step: 0.005,
          allowFunction: false,
        },
      ],
      state: {
        t: startT,
        cx: startX,
        cy: startY,
        vx: 0,
        vy: 0,
        thetaAngleUnwrapped: startAngle,
        prevX: startX,
        prevY: startY,
        initialized: false,
      },
    };
  },

  run({ ctx, width, height, params, state }) {
    const tightness = Math.max(0.0001, params.tightness);
    const radiusMin = Math.max(0, params.radius.min);
    const radiusMax = Math.max(radiusMin, params.radius.max);
    const radialSpeed = params.radialSpeed;
    const directionDrift = params.directionDrift;
    const accelJitter = params.accelJitter;
    const { lineThickness, strokeStyle } = resolveInkStyle(params);
    const thetaStep = BASE_THETA_STEP;// / tightness;

    ctx.beginPath();

    for (let i = 0; i < SEGMENTS_PER_CALL; i += 1) {
      state.t += 1;

      const radiusNowNoise = noise1(state.t * radialSpeed + NOISE_DOMAIN_RADIUS);
      const radiusNow = map01(radiusNowNoise, radiusMin, radiusMax);

      updateCenterBoundedNoisedAccel(state, {
        width,
        height,
        radiusBound: radiusNow,
        directionDrift,
        accelJitter,
      });

      state.thetaAngleUnwrapped += thetaStep;
      const angleEnd = normalizeAngleRadians(state.thetaAngleUnwrapped);

      const thetaRadialNow = radiusNow / tightness;
      const p1 = polarToXY(state.cx, state.cy, angleEnd, tightness * thetaRadialNow);

      if (!state.initialized) {
        state.prevX = p1.x;
        state.prevY = p1.y;
        state.initialized = true;
        continue;
      }

      ctx.moveTo(state.prevX, state.prevY);
      ctx.lineTo(p1.x, p1.y);
      state.prevX = p1.x;
      state.prevY = p1.y;
    }

    ctx.lineWidth = lineThickness;
    ctx.lineCap = "butt";
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  },
};
