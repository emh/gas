export const INK_PARAMETER_DEFS = [
  {
    type: "range",
    key: "lineThickness",
    label: "Line Thickness",
    min: 0.5,
    max: 10,
    default: 1,
    step: 0.1,
    group: "ink",
  },
  {
    type: "range",
    key: "opacity",
    label: "Opacity",
    min: 0.01,
    max: 1,
    default: 0.5,
    step: 0.01,
    group: "ink",
  },
  {
    type: "range",
    key: "hue",
    label: "Hue",
    min: 0,
    max: 360,
    default: 0,
    step: 1,
    group: "ink",
  },
  {
    type: "range",
    key: "saturation",
    label: "Saturation",
    min: 0,
    max: 100,
    default: 0,
    step: 1,
    group: "ink",
  },
  {
    type: "range",
    key: "lightness",
    label: "Lightness",
    min: 0,
    max: 100,
    default: 0,
    step: 1,
    group: "ink",
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHue(value) {
  return ((value % 360) + 360) % 360;
}

export function resolveInkStyle(params) {
  const lineThickness = Math.max(0.01, Number(params.lineThickness) || 1);
  const opacity = clamp(Number(params.opacity) || 0, 0, 1);
  const hue = normalizeHue(Number(params.hue) || 0);
  const saturation = clamp(Number(params.saturation) || 0, 0, 100);
  const lightness = clamp(Number(params.lightness) || 0, 0, 100);
  const strokeStyle = `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${opacity.toFixed(3)})`;

  return {
    lineThickness,
    strokeStyle,
  };
}
