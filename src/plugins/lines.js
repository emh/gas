function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function weightedUnitSample(startDensity, endDensity) {
  const start = Math.max(0, startDensity);
  const end = Math.max(0, endDensity);

  if (start <= 0 && end <= 0) {
    return Math.random();
  }

  const delta = end - start;
  if (Math.abs(delta) < 1e-9) {
    return Math.random();
  }

  const area = (start + end) * 0.5;
  const a = 0.5 * delta;
  const b = start;
  const c = -Math.random() * area;
  const discriminant = Math.max(0, b * b - 4 * a * c);
  const sample = (-b + Math.sqrt(discriminant)) / (2 * a);

  return clamp01(sample);
}

export const linesPlugin = {
  id: "lines",
  name: "Lines",

  init() {
    return {
      parameters: [
        {
          type: "range",
          key: "lineLength",
          label: "Line Length",
          min: 0,
          max: 1000,
          default: 100,
          step: 1,
        },
        {
          type: "range",
          key: "startDensity",
          label: "Start Density",
          min: 0,
          max: 100,
          default: 0,
          step: 1,
          allowFunction: false,
        },
        {
          type: "range",
          key: "endDensity",
          label: "End Density",
          min: 0,
          max: 100,
          default: 100,
          step: 1,
          allowFunction: false,
        },
        {
          type: "range",
          key: "densityDirection",
          label: "Density Direction",
          min: 0,
          max: 360,
          default: 180,
          step: 1,
          allowFunction: false,
        },
      ],
    };
  },

  run({ ctx, width, height, params }) {
    const lineLength = Math.max(0, params.lineLength);
    const lineThickness = params.lineThickness;
    const opacity = clamp01(params.opacity);
    const densityDirection = normalizeDegrees(params.densityDirection) * (Math.PI / 180);
    const linesPerCall = 10;

    const axisX = Math.cos(densityDirection);
    const axisY = Math.sin(densityDirection);
    const perpendicularX = -axisY;
    const perpendicularY = axisX;

    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const axisHalfLength = Math.hypot(width, height) * 0.5;

    for (let i = 0; i < linesPerCall; i += 1) {
      const weightedT = weightedUnitSample(params.startDensity, params.endDensity);
      const axisOffset = (weightedT * 2 - 1) * axisHalfLength;
      const perpendicularOffset = randomBetween(-axisHalfLength, axisHalfLength);

      const lineCenterX = centerX
        + axisX * axisOffset
        + perpendicularX * perpendicularOffset;
      const lineCenterY = centerY
        + axisY * axisOffset
        + perpendicularY * perpendicularOffset;

      const lineDirection = randomBetween(0, Math.PI * 2);
      const halfLength = lineLength * 0.5;
      const dx = Math.cos(lineDirection) * halfLength;
      const dy = Math.sin(lineDirection) * halfLength;

      ctx.beginPath();
      ctx.moveTo(lineCenterX - dx, lineCenterY - dy);
      ctx.lineTo(lineCenterX + dx, lineCenterY + dy);
      ctx.lineWidth = lineThickness;
      ctx.strokeStyle = `rgba(0, 0, 0, ${opacity.toFixed(3)})`;
      ctx.stroke();
    }
  },
};
