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
const ACCEL_MAG = 0.03;
const ACCEL_JITTER = 0.1;
const FRICTION = 0.985;
const VELOCITY_MAX = 6;
const BOUNCE_LOSS = 0.85;
const EDGE_PAD = 60;
const EDGE_PUSH = 0.055;
const OUTSIDE_FACTOR = 2;
const SEGMENTS_PER_CALL = 10;

function updateCenterBoundedNoisedAccel(state, {
  width,
  height,
  radiusBound,
  accelNoiseSpeed,
}) {
  const margin = radiusBound * OUTSIDE_FACTOR;
  const minX = -margin;
  const maxX = width + margin;
  const minY = -margin;
  const maxY = height + margin;

  let dirX = noise1(state.t * accelNoiseSpeed + 10) * 2 - 1;
  let dirY = noise1(state.t * accelNoiseSpeed + 99) * 2 - 1;
  const directionLength = Math.hypot(dirX, dirY) || 1;
  dirX /= directionLength;
  dirY /= directionLength;

  const accelMagnitude = ACCEL_MAG + (noise1(state.t * accelNoiseSpeed + 777) * 2 - 1) * ACCEL_JITTER;

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
          key: "accelNoiseSpeed",
          label: "XY Drift",
          min: 0.001,
          max: 0.01,
          default: 0.01,
          step: 0.001,
        },
        {
          type: "range",
          key: "lineThickness",
          label: "Line Thickness",
          min: 0.5,
          max: 10,
          default: 1,
          step: 0.1,
        },
        {
          type: "range",
          key: "opacity",
          label: "Opacity",
          min: 0.01,
          max: 1,
          default: 0.5,
          step: 0.01,
        },
      ],
      state: {
        t: 0,
        cx: width * 0.5,
        cy: height * 0.5,
        vx: 0,
        vy: 0,
        thetaAngleUnwrapped: 0,
        prevX: width * 0.5,
        prevY: height * 0.5,
        initialized: false,
      },
    };
  },

  run({ ctx, width, height, params, state }) {
    const tightness = Math.max(0.0001, params.tightness);
    const radiusMin = Math.max(0, params.radius.min);
    const radiusMax = Math.max(radiusMin, params.radius.max);
    const radialSpeed = params.radialSpeed;
    const accelNoiseSpeed = params.accelNoiseSpeed;
    const lineThickness = params.lineThickness;
    const opacity = clamp(params.opacity, 0, 1);
    const thetaStep = BASE_THETA_STEP;// / tightness;

    ctx.beginPath();

    for (let i = 0; i < SEGMENTS_PER_CALL; i += 1) {
      state.t += 1;

      const radiusNowNoise = noise1(state.t * radialSpeed + 123.456);
      const radiusPrevNoise = noise1((state.t - 1) * radialSpeed + 123.456);
      const radiusNow = map01(radiusNowNoise, radiusMin, radiusMax);
      const radiusPrev = map01(radiusPrevNoise, radiusMin, radiusMax);

      updateCenterBoundedNoisedAccel(state, {
        width,
        height,
        radiusBound: radiusNow,
        accelNoiseSpeed,
      });

      const previousAngle = state.thetaAngleUnwrapped;
      state.thetaAngleUnwrapped += thetaStep;

      const angleStart = normalizeAngleRadians(previousAngle);
      const angleEnd = normalizeAngleRadians(state.thetaAngleUnwrapped);

      const thetaRadialNow = radiusNow / tightness;
      const thetaRadialPrev = radiusPrev / tightness;

      const p0 = polarToXY(state.cx, state.cy, angleStart, tightness * thetaRadialPrev);
      const p1 = polarToXY(state.cx, state.cy, angleEnd, tightness * thetaRadialNow);

      if (!state.initialized) {
        state.prevX = p0.x;
        state.prevY = p0.y;
        state.initialized = true;
      }

      ctx.moveTo(state.prevX, state.prevY);
      ctx.lineTo(p1.x, p1.y);
      state.prevX = p1.x;
      state.prevY = p1.y;
    }

    ctx.lineWidth = lineThickness;
    ctx.lineCap = "butt";
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity.toFixed(3)})`;
    ctx.stroke();
  },
};
