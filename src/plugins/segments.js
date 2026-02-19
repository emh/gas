import { resolveInkStyle } from "./ink-params.js";

const EPSILON = 1e-9;
const POINT_EPSILON = 1e-6;
const MIN_REGION_AREA = 1e-6;
const MAX_SPLIT_ATTEMPTS = 24;
const MAX_REGION_ATTEMPTS_PER_RUN = 8;
const NEAR_SQUARE_THRESHOLD = 0.75;
const ANCHOR_MARGIN_RATIO = 0.05;
const ANCHOR_BAND_START = 0.1;
const ANCHOR_BAND_SPAN = 0.8;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function multiply(point, scalar) {
  return { x: point.x * scalar, y: point.y * scalar };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function polygonSignedArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i];
    const next = poly[(i + 1) % poly.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function polygonArea(poly) {
  return Math.abs(polygonSignedArea(poly));
}

function polygonBoundingBox(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of poly) {
    if (point.x < minX) {
      minX = point.x;
    }
    if (point.y < minY) {
      minY = point.y;
    }
    if (point.x > maxX) {
      maxX = point.x;
    }
    if (point.y > maxY) {
      maxY = point.y;
    }
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function polygonCentroid(poly) {
  const signedArea = polygonSignedArea(poly);
  if (Math.abs(signedArea) < EPSILON) {
    let sumX = 0;
    let sumY = 0;
    for (const point of poly) {
      sumX += point.x;
      sumY += point.y;
    }

    return {
      x: sumX / Math.max(1, poly.length),
      y: sumY / Math.max(1, poly.length),
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i];
    const next = poly[(i + 1) % poly.length];
    const crossTerm = current.x * next.y - next.x * current.y;
    sumX += (current.x + next.x) * crossTerm;
    sumY += (current.y + next.y) * crossTerm;
  }

  return {
    x: sumX / (6 * signedArea),
    y: sumY / (6 * signedArea),
  };
}

function pointInConvexPolygon(point, poly) {
  if (poly.length < 3) {
    return false;
  }

  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i];
    const next = poly[(i + 1) % poly.length];
    const crossValue = cross(subtract(next, current), subtract(point, current));
    const nextSign = crossValue > EPSILON ? 1 : (crossValue < -EPSILON ? -1 : 0);

    if (nextSign === 0) {
      continue;
    }
    if (sign === 0) {
      sign = nextSign;
      continue;
    }
    if (sign !== nextSign) {
      return false;
    }
  }

  return true;
}

function cleanPolygonPoints(points) {
  const cleaned = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > POINT_EPSILON) {
      cleaned.push(point);
    }
  }

  if (cleaned.length >= 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= POINT_EPSILON) {
      cleaned.pop();
    }
  }

  return cleaned;
}

function clipPolygonHalfPlane(poly, linePoint, normal, keepPositiveSide) {
  if (poly.length === 0) {
    return [];
  }

  const sideOf = (point) => dot(subtract(point, linePoint), normal);
  const inside = (side) => (keepPositiveSide ? side >= -EPSILON : side <= EPSILON);

  const output = [];
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i];
    const next = poly[(i + 1) % poly.length];
    const currentSide = sideOf(current);
    const nextSide = sideOf(next);
    const currentInside = inside(currentSide);
    const nextInside = inside(nextSide);

    if (currentInside) {
      output.push(current);
    }

    if (currentInside !== nextInside) {
      const denominator = currentSide - nextSide;
      if (Math.abs(denominator) > EPSILON) {
        const t = currentSide / denominator;
        output.push(add(current, multiply(subtract(next, current), t)));
      }
    }
  }

  return cleanPolygonPoints(output);
}

function linePolygonSegment(poly, linePoint, direction) {
  const intersections = [];

  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const edge = subtract(b, a);
    const denominator = cross(direction, edge);

    if (Math.abs(denominator) < EPSILON) {
      continue;
    }

    const rhs = subtract(a, linePoint);
    const t = cross(rhs, edge) / denominator;
    const u = cross(rhs, direction) / denominator;

    if (u < -POINT_EPSILON || u > 1 + POINT_EPSILON) {
      continue;
    }

    intersections.push({
      point: add(linePoint, multiply(direction, t)),
    });
  }

  const unique = [];
  for (const hit of intersections) {
    const duplicate = unique.some((existing) => (
      Math.hypot(hit.point.x - existing.point.x, hit.point.y - existing.point.y) <= POINT_EPSILON
    ));
    if (!duplicate) {
      unique.push(hit);
    }
  }

  if (unique.length < 2) {
    return null;
  }

  let bestPair = null;
  let bestDistance = -1;
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const pointA = unique[i].point;
      const pointB = unique[j].point;
      const distance = (pointA.x - pointB.x) ** 2 + (pointA.y - pointB.y) ** 2;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [pointA, pointB];
      }
    }
  }

  return bestPair;
}

function splitPolygonByLine(poly, linePoint, direction) {
  const normal = {
    x: -direction.y,
    y: direction.x,
  };

  const positive = clipPolygonHalfPlane(poly, linePoint, normal, true);
  const negative = clipPolygonHalfPlane(poly, linePoint, normal, false);

  if (positive.length < 3 || negative.length < 3) {
    return null;
  }

  const positiveArea = polygonArea(positive);
  const negativeArea = polygonArea(negative);
  if (positiveArea < MIN_REGION_AREA || negativeArea < MIN_REGION_AREA) {
    return null;
  }

  const cutSegment = linePolygonSegment(poly, linePoint, direction);
  if (!cutSegment) {
    return null;
  }

  return {
    positive,
    negative,
    cutSegment,
  };
}

function createRegion(poly, selectionWeight = 1) {
  const area = polygonArea(poly);
  if (area < MIN_REGION_AREA) {
    return null;
  }

  return {
    poly,
    area,
    bbox: polygonBoundingBox(poly),
    selectionWeight: Math.max(0, Number(selectionWeight) || 0),
  };
}

function createRootRegion(width, height) {
  return createRegion([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]);
}

function chooseVerticalCut(region, verticalBias) {
  const { w, h } = region.bbox;
  if (w <= EPSILON || h <= EPSILON) {
    return clamp01(verticalBias) >= 0.5;
  }

  const squareness = Math.min(w, h) / Math.max(w, h);
  if (squareness > NEAR_SQUARE_THRESHOLD) {
    return Math.random() < clamp01(verticalBias);
  }

  return w >= h;
}

function pickSplitAnchor(region, cutIsVertical) {
  const { bbox, poly } = region;
  const width = Math.max(0, bbox.w);
  const height = Math.max(0, bbox.h);
  const margin = Math.min(
    Math.min(width, height) * 0.45,
    Math.min(width, height) * ANCHOR_MARGIN_RATIO,
  );

  for (let attempt = 0; attempt < MAX_SPLIT_ATTEMPTS; attempt += 1) {
    let x;
    let y;

    if (cutIsVertical) {
      x = bbox.x + margin + Math.random() * Math.max(0, width - margin * 2);
      y = bbox.y + (ANCHOR_BAND_START + Math.random() * ANCHOR_BAND_SPAN) * height;
    } else {
      y = bbox.y + margin + Math.random() * Math.max(0, height - margin * 2);
      x = bbox.x + (ANCHOR_BAND_START + Math.random() * ANCHOR_BAND_SPAN) * width;
    }

    const candidate = { x, y };
    if (pointInConvexPolygon(candidate, poly)) {
      return candidate;
    }
  }

  return polygonCentroid(poly);
}

function attemptRegionSplit(region, params) {
  const angleOffsetRadians = (params.angle * Math.PI) / 180;

  for (let attempt = 0; attempt < MAX_SPLIT_ATTEMPTS; attempt += 1) {
    const cutIsVertical = chooseVerticalCut(region, params.verticalBias);
    const baseAngle = cutIsVertical ? Math.PI * 0.5 : 0;
    const direction = {
      x: Math.cos(baseAngle + angleOffsetRadians),
      y: Math.sin(baseAngle + angleOffsetRadians),
    };
    const anchor = pickSplitAnchor(region, cutIsVertical);
    const splitResult = splitPolygonByLine(region.poly, anchor, direction);
    if (!splitResult) {
      continue;
    }

    const regionA = createRegion(splitResult.positive);
    const regionB = createRegion(splitResult.negative);
    if (!regionA || !regionB) {
      continue;
    }

    return {
      regionA,
      regionB,
      cutStart: splitResult.cutSegment[0],
      cutEnd: splitResult.cutSegment[1],
    };
  }

  return null;
}

function ensureRegionListHasRoot(state, width, height) {
  if (!Array.isArray(state.regions)) {
    state.regions = [];
  }

  if (state.regions.length === 0) {
    const root = createRootRegion(width, height);
    if (root) {
      state.regions.push(root);
    }
  }
}

function popRegionBySelectionWeight(regions, uniformity) {
  if (regions.length === 0) {
    return null;
  }

  const uniformityClamped = clamp01(Number(uniformity) || 0);
  const eligibleFraction = 1 - 0.9 * uniformityClamped;
  const eligibleCount = Math.max(1, Math.ceil(regions.length * eligibleFraction));
  const eligibleIndices = regions
    .map((region, index) => ({ index, area: region.area }))
    .sort((a, b) => b.area - a.area)
    .slice(0, eligibleCount)
    .map((entry) => entry.index);

  let totalWeight = 0;
  for (const index of eligibleIndices) {
    totalWeight += Math.max(0, Number(regions[index].selectionWeight) || 0);
  }

  let index = eligibleIndices[0];
  if (!(totalWeight > 0)) {
    index = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
  } else {
    let threshold = Math.random() * totalWeight;
    index = eligibleIndices[eligibleIndices.length - 1];

    for (const candidateIndex of eligibleIndices) {
      threshold -= Math.max(0, Number(regions[candidateIndex].selectionWeight) || 0);
      if (threshold <= 0) {
        index = candidateIndex;
        break;
      }
    }
  }

  const [region] = regions.splice(index, 1);
  return region ?? null;
}

function splitSelectionWeight(parentWeight, fairness) {
  const safeParentWeight = Math.max(0, Number(parentWeight) || 0);
  const fairnessClamped = clamp01(Number(fairness) || 0);
  const maxDeviationFromCenter = 0.5 - 0.5 * fairnessClamped;
  const split = 0.5 + (Math.random() * 2 - 1) * maxDeviationFromCenter;
  const blendedParentScale = safeParentWeight * (1 - fairnessClamped) + fairnessClamped;

  return {
    childAWeight: blendedParentScale * split,
    childBWeight: blendedParentScale * (1 - split),
  };
}

export const segmentsPlugin = {
  id: "segments",
  name: "Segments",

  init({ width, height }) {
    const regions = [];
    const root = createRootRegion(width, height);
    if (root) {
      regions.push(root);
    }

    return {
      parameters: [
        {
          type: "range",
          key: "angle",
          label: "Angle",
          min: -45,
          max: 45,
          default: 0,
          step: 1,
        },
        {
          type: "range",
          key: "verticalBias",
          label: "Vertical Bias",
          min: 0,
          max: 1,
          default: 0.5,
          step: 0.01,
          allowFunction: false,
        },
        {
          type: "range",
          key: "fairness",
          label: "Fairness",
          min: 0,
          max: 1,
          default: 0.5,
          step: 0.01,
          allowFunction: false,
        },
        {
          type: "range",
          key: "uniformity",
          label: "Uniformity",
          min: 0,
          max: 1,
          default: 0.5,
          step: 0.01,
          allowFunction: false,
        },
      ],
      state: {
        regions,
      },
    };
  },

  run({ ctx, width, height, params, state }) {
    ensureRegionListHasRoot(state, width, height);

    const skippedRegions = [];
    let split = null;
    let selectedRegion = null;
    let tries = 0;

    while (state.regions.length > 0 && tries < MAX_REGION_ATTEMPTS_PER_RUN) {
      const candidateRegion = popRegionBySelectionWeight(state.regions, params.uniformity);
      if (!candidateRegion) {
        break;
      }

      split = attemptRegionSplit(candidateRegion, params);
      if (split) {
        selectedRegion = candidateRegion;
        break;
      }

      skippedRegions.push(candidateRegion);
      tries += 1;
    }

    for (const region of skippedRegions) {
      state.regions.push(region);
    }

    if (!split) {
      return;
    }

    const parentWeight = Math.max(0, Number(selectedRegion?.selectionWeight) || 0);
    const { childAWeight, childBWeight } = splitSelectionWeight(parentWeight, params.fairness);
    split.regionA.selectionWeight = childAWeight;
    split.regionB.selectionWeight = childBWeight;

    state.regions.push(split.regionA);
    state.regions.push(split.regionB);

    const { lineThickness, strokeStyle } = resolveInkStyle(params);
    ctx.beginPath();
    ctx.moveTo(split.cutStart.x, split.cutStart.y);
    ctx.lineTo(split.cutEnd.x, split.cutEnd.y);
    ctx.lineWidth = lineThickness;
    ctx.lineCap = "butt";
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  },
};
