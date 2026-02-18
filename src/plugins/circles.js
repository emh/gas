function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
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
    };
  },

  run({ ctx, width, height, params }) {
    const radius = params.radius;
    const lineThickness = params.lineThickness;
    const opacity = clamp01(params.opacity);

    const circlesPerFrame = 3;

    for (let i = 0; i < circlesPerFrame; i += 1) {
      const x = randomAroundCanvas(width, radius);
      const y = randomAroundCanvas(height, radius);

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.lineWidth = lineThickness;
      ctx.strokeStyle = `rgba(0, 0, 0, ${opacity.toFixed(3)})`;
      ctx.stroke();
    }
  },
};
