import { resolveInkStyle } from "./ink-params.js";

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export const arcsPlugin = {
  id: "arcs",
  name: "Arcs",

  init() {
    return {
      parameters: [
        {
          type: "range",
          key: "spread",
          label: "Spread",
          min: 0,
          max: 360,
          default: 60,
          step: 1,
        },
        {
          type: "range",
          key: "direction",
          label: "Direction",
          min: 0,
          max: 360,
          default: 0,
          step: 1,
        },
        {
          type: "range",
          key: "startRadius",
          label: "Start Radius",
          min: 0,
          max: 1000,
          default: 100,
          step: 1,
        },
        {
          type: "range",
          key: "endRadius",
          label: "End Radius",
          min: 0,
          max: 1000,
          default: 100,
          step: 1,
        },
        {
          type: "range",
          key: "arcCount",
          label: "Arc Count",
          min: 0,
          max: 100,
          default: 10,
          step: 1,
        },
      ],
    };
  },

  run({ ctx, width, height, params }) {
    const arcCount = clamp(Math.round(Number(params.arcCount) || 0), 0, 100);
    if (arcCount <= 0) {
      return;
    }

    const spread = clamp(Number(params.spread) || 0, 0, 360);
    const direction = clamp(Number(params.direction) || 0, 0, 360);
    const halfSpread = spread * 0.5;
    const startAngle = degreesToRadians(direction - halfSpread);
    const endAngle = degreesToRadians(direction + halfSpread);
    const startRadius = Math.max(0, Number(params.startRadius) || 0);
    const endRadius = Math.max(0, Number(params.endRadius) || 0);
    const centerX = randomBetween(0, width);
    const centerY = randomBetween(0, height);
    const { lineThickness, strokeStyle } = resolveInkStyle(params);
    const radiusSteps = Math.max(1, arcCount - 1);

    ctx.lineWidth = lineThickness;
    ctx.strokeStyle = strokeStyle;
    ctx.lineCap = "round";

    for (let i = 0; i < arcCount; i += 1) {
      const t = arcCount === 1 ? 0.5 : i / radiusSteps;
      const radius = Math.max(0, lerp(startRadius, endRadius, t));

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.stroke();
    }
  },
};
