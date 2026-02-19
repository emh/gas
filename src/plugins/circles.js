import { resolveInkStyle } from "./ink-params.js";

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomAroundCanvas(dimension, radius) {
  const offset = radius * 0.5;
  return randomBetween(-offset, dimension + offset);
}

export const circlesPlugin = {
  id: "circles",
  name: "Circles",

  init() {
    return {
      parameters: [
        {
          type: "range",
          key: "radius",
          label: "Radius",
          min: 0,
          max: 5000,
          default: 1000,
          step: 1,
        },
      ],
    };
  },

  run({ ctx, width, height, params }) {
    const radius = params.radius;
    const { lineThickness, strokeStyle } = resolveInkStyle(params);
    const x = randomAroundCanvas(width, radius);
    const y = randomAroundCanvas(height, radius);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = lineThickness;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  },
};
