import { resolveInkStyle } from "./ink-params.js";

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomIntInclusive(min, max) {
  const floorMin = Math.ceil(min);
  const floorMax = Math.floor(max);
  return Math.floor(randomBetween(floorMin, floorMax + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
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

function normalizeHue(value) {
  return ((value % 360) + 360) % 360;
}

function angleDelta(from, to) {
  const fullTurn = Math.PI * 2;
  let delta = (to - from + Math.PI) % fullTurn;
  if (delta < 0) {
    delta += fullTurn;
  }
  return delta - Math.PI;
}

function applyVerticalBias(angle, bias) {
  if (bias <= 0) {
    return angle;
  }

  const up = Math.PI * 0.5;
  const down = up + Math.PI;
  const deltaUp = angleDelta(angle, up);
  const deltaDown = angleDelta(angle, down);
  const nearestDelta = Math.abs(deltaUp) <= Math.abs(deltaDown) ? deltaUp : deltaDown;
  const blend = 0.08 + clamp01(bias) * 0.4;

  return angle + nearestDelta * blend;
}

function softlyContainPoint(point, {
  minX,
  maxX,
  minY,
  maxY,
  centerX,
  centerY,
}) {
  if (point.x < minX) {
    point.x = minX + (minX - point.x) * 0.2;
  }
  if (point.x > maxX) {
    point.x = maxX - (point.x - maxX) * 0.2;
  }
  if (point.y < minY) {
    point.y = minY + (minY - point.y) * 0.2;
  }
  if (point.y > maxY) {
    point.y = maxY - (point.y - maxY) * 0.2;
  }

  point.x += (centerX - point.x) * 0.02;
  point.y += (centerY - point.y) * 0.02;
}

export const squigglesPlugin = {
  id: "squiggles",
  name: "Squiggles",

  init() {
    return {
      parameters: [
        {
          type: "range",
          key: "segments",
          label: "Segments",
          min: 1,
          max: 20,
          default: 5,
          step: 1,
        },
        {
          type: "range",
          key: "length",
          label: "Length",
          min: 1,
          max: 1000,
          default: 100,
          step: 1,
        },
        {
          type: "range",
          key: "arcAmount",
          label: "Arc Amount",
          min: 0,
          max: 1,
          default: 0.55,
          step: 0.01,
        },
        {
          type: "range",
          key: "turniness",
          label: "Turniness",
          min: 0,
          max: 1,
          default: 0.9,
          step: 0.01,
        },
        {
          type: "range",
          key: "zigzagBias",
          label: "Zigzag Bias",
          min: 0,
          max: 1,
          default: 0.55,
          step: 0.01,
        },
        {
          type: "range",
          key: "curlicueChance",
          label: "Curlicue Chance",
          min: 0,
          max: 1,
          default: 0.45,
          step: 0.01,
        },
        {
          type: "range",
          key: "verticalBias",
          label: "Vertical Bias",
          min: 0,
          max: 1,
          default: 0.45,
          step: 0.01,
        },
        {
          type: "range",
          key: "dotChance",
          label: "Dot Chance",
          min: 0,
          max: 1,
          default: 0.65,
          step: 0.01,
        },
      ],
    };
  },

  run({ ctx, width, height, params }) {
    const segments = clamp(Math.round(params.segments), 1, 20);
    const baseLength = clamp(Number(params.length) || 0, 1, 1000);
    const arcAmount = clamp01(params.arcAmount);
    const turniness = clamp01(params.turniness);
    const zigzagBias = clamp01(params.zigzagBias);
    const curlicueChance = clamp01(params.curlicueChance);
    const verticalBias = clamp01(params.verticalBias);
    const dotChance = clamp01(params.dotChance);
    const { lineThickness } = resolveInkStyle(params);
    const baseHue = normalizeHue(Number(params.hue) || 0);
    const baseSaturation = clamp(Number(params.saturation) || 0, 0, 100);
    const baseLightness = clamp(Number(params.lightness) || 0, 0, 100);
    const baseOpacity = clamp01(Number(params.opacity) || 0);

    const shortestSide = Math.max(1, Math.min(width, height));
    const maxBoundsSize = Math.max(24, shortestSide * 0.95);
    const boundsSize = maxBoundsSize > 40
      ? randomBetween(40, Math.min(140, maxBoundsSize))
      : maxBoundsSize;
    const halfBounds = boundsSize * 0.5;
    const centerX = randomBetween(0, width);
    const centerY = randomBetween(0, height);
    const pad = Math.min(boundsSize * 0.18, halfBounds - 1);

    const containment = {
      minX: centerX - halfBounds + pad,
      maxX: centerX + halfBounds - pad,
      minY: centerY - halfBounds + pad,
      maxY: centerY + halfBounds - pad,
      centerX,
      centerY,
    };

    let point = {
      x: centerX + randomBetween(-halfBounds * 0.2, halfBounds * 0.2),
      y: centerY + randomBetween(-halfBounds * 0.2, halfBounds * 0.2),
    };
    let angle = randomBetween(0, Math.PI * 2);
    let zigSign = Math.random() < 0.5 ? -1 : 1;
    const inkNoiseSeed = randomBetween(0, 100000);
    let inkProgress = randomBetween(0, 1000);

    function applySegmentInk() {
      const thicknessNoise = noise1(inkNoiseSeed + inkProgress * 0.35) * 2 - 1;
      const opacityNoise = noise1(inkNoiseSeed + 97.31 + inkProgress * 0.28) * 2 - 1;
      const segmentThickness = Math.max(0.01, lineThickness * (1 + thicknessNoise * 0.12));
      const segmentOpacity = clamp01(baseOpacity * (1 + opacityNoise * 0.14));
      const segmentStrokeStyle = `hsla(${Math.round(baseHue)}, ${Math.round(baseSaturation)}%, ${Math.round(baseLightness)}%, ${segmentOpacity.toFixed(3)})`;

      ctx.lineWidth = segmentThickness;
      ctx.strokeStyle = segmentStrokeStyle;
      ctx.fillStyle = segmentStrokeStyle;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < segments; i += 1) {
      const progress = i / Math.max(1, segments - 1);
      const segmentLength = baseLength
        * (1 - progress * 0.35)
        * randomBetween(0.75, 1.2);
      const bigTurn = Math.random() < turniness;
      const turnMagnitude = bigTurn
        ? randomBetween(0.7, 2.4)
        : randomBetween(0.15, 0.65);

      if (Math.random() < zigzagBias) {
        zigSign *= -1;
      }

      angle += zigSign * turnMagnitude;
      angle = applyVerticalBias(angle, verticalBias);

      const nextPoint = {
        x: point.x + Math.cos(angle) * segmentLength,
        y: point.y + Math.sin(angle) * segmentLength,
      };
      softlyContainPoint(nextPoint, containment);

      const perpendicular = angle + Math.PI * 0.5;
      const arcOffset = arcAmount * segmentLength * randomBetween(-0.65, 0.65);
      const controlPoint = {
        x: (point.x + nextPoint.x) * 0.5 + Math.cos(perpendicular) * arcOffset,
        y: (point.y + nextPoint.y) * 0.5 + Math.sin(perpendicular) * arcOffset,
      };
      softlyContainPoint(controlPoint, containment);

      inkProgress += segmentLength * 0.02;
      applySegmentInk();
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, nextPoint.x, nextPoint.y);
      ctx.stroke();

      point = nextPoint;
    }

    if (Math.random() < curlicueChance) {
      const loops = randomIntInclusive(8, 16);
      let curlicueAngle = angle + randomBetween(-0.6, 0.6);
      let radius = Math.min(boundsSize, shortestSide) * randomBetween(0.03, 0.08);
      let p = { x: point.x, y: point.y };

      for (let i = 0; i < loops; i += 1) {
        curlicueAngle += randomBetween(0.45, 0.9) * (Math.random() < 0.5 ? -1 : 1);
        radius *= 0.9;

        const next = {
          x: p.x + Math.cos(curlicueAngle) * radius,
          y: p.y + Math.sin(curlicueAngle) * radius,
        };
        const perpendicular = curlicueAngle + Math.PI * 0.5;
        const arcOffset = radius * randomBetween(-0.7, 0.7) * (0.4 + arcAmount * 0.6);
        const controlPoint = {
          x: (p.x + next.x) * 0.5 + Math.cos(perpendicular) * arcOffset,
          y: (p.y + next.y) * 0.5 + Math.sin(perpendicular) * arcOffset,
        };

        softlyContainPoint(next, containment);
        softlyContainPoint(controlPoint, containment);

        inkProgress += radius * 0.4;
        applySegmentInk();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, next.x, next.y);
        ctx.stroke();

        p = next;
      }

      point = p;
    }

    if (Math.random() < dotChance) {
      const dotRadius = clamp(lineThickness * randomBetween(0.9, 1.8), 0.6, 6);
      inkProgress += dotRadius;
      applySegmentInk();
      ctx.beginPath();
      ctx.arc(
        point.x + randomBetween(-1.5, 1.5),
        point.y + randomBetween(-1.5, 1.5),
        dotRadius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  },
};
