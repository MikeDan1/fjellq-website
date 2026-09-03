'use strict';

// Kernlogik: simuliertes Höhenfeld (Ridged fBm) -> echte Isolinien via
// Marching Squares -> vereinfachte Polylinien -> SVG mit Höhenzahlen.
// Exportiert generateContourSVG({ seed, width, height, ... }) -> SVG-String.

// ---------- seeded PRNG (mulberry32) ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- klassisches Perlin-Noise (geseedete Permutationstabelle) ----------
function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (hash, x, y) => {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  };

  return function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const aa = perm[X + perm[Y]];
    const ab = perm[X + perm[Y + 1]];
    const ba = perm[X + 1 + perm[Y]];
    const bb = perm[X + 1 + perm[Y + 1]];
    return lerp(
      lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
      lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
      v
    );
  };
}

// ---------- Ridged fBm -> Gebirgs-artiges Höhenfeld ----------
function makeHeightField(seed, octaves) {
  const noise2D = makeNoise2D(seed);
  return function height(x, y) {
    let sum = 0, amp = 0.55, freq = 1.0, prevWeight = 1.0;
    for (let o = 0; o < octaves; o++) {
      let n = noise2D(x * freq, y * freq);
      n = 1 - Math.abs(n);
      n = n * n * prevWeight;
      prevWeight = Math.min(Math.max(n * 1.8, 0), 1);
      sum += n * amp;
      freq *= 2.05;
      amp *= 0.5;
    }
    return sum;
  };
}

function marchingSquares(grid, NX, NY, gridX, gridY, level) {
  const valueAt = (i, j) => grid[j * NX + i];
  const segments = [];
  for (let j = 0; j < NY - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const v00 = valueAt(i, j);
      const v10 = valueAt(i + 1, j);
      const v11 = valueAt(i + 1, j + 1);
      const v01 = valueAt(i, j + 1);

      let caseIdx = 0;
      if (v00 > level) caseIdx |= 8;
      if (v10 > level) caseIdx |= 4;
      if (v11 > level) caseIdx |= 2;
      if (v01 > level) caseIdx |= 1;
      if (caseIdx === 0 || caseIdx === 15) continue;

      const x0 = gridX(i), x1 = gridX(i + 1);
      const y0 = gridY(j), y1 = gridY(j + 1);
      const interp = (va, vb, pa, pb) => {
        const t = (level - va) / (vb - va);
        return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
      };
      const top = () => interp(v00, v10, [x0, y0], [x1, y0]);
      const right = () => interp(v10, v11, [x1, y0], [x1, y1]);
      const bottom = () => interp(v01, v11, [x0, y1], [x1, y1]);
      const left = () => interp(v00, v01, [x0, y0], [x0, y1]);

      switch (caseIdx) {
        case 1: segments.push([left(), bottom()]); break;
        case 2: segments.push([bottom(), right()]); break;
        case 3: segments.push([left(), right()]); break;
        case 4: segments.push([top(), right()]); break;
        case 5: segments.push([left(), top()]); segments.push([bottom(), right()]); break;
        case 6: segments.push([top(), bottom()]); break;
        case 7: segments.push([left(), top()]); break;
        case 8: segments.push([top(), left()]); break;
        case 9: segments.push([top(), bottom()]); break;
        case 10: segments.push([top(), right()]); segments.push([left(), bottom()]); break;
        case 11: segments.push([top(), right()]); break;
        case 12: segments.push([right(), left()]); break;
        case 13: segments.push([right(), bottom()]); break;
        case 14: segments.push([bottom(), left()]); break;
      }
    }
  }
  return segments;
}

function stitch(segments) {
  const key = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3);
  const adjacency = new Map();
  segments.forEach((seg, idx) => {
    const kA = key(seg[0]), kB = key(seg[1]);
    if (!adjacency.has(kA)) adjacency.set(kA, []);
    if (!adjacency.has(kB)) adjacency.set(kB, []);
    adjacency.get(kA).push(idx);
    adjacency.get(kB).push(idx);
  });

  const used = new Array(segments.length).fill(false);
  const polylines = [];
  const otherPoint = (segIdx, pointKey) => {
    const seg = segments[segIdx];
    return key(seg[0]) === pointKey ? seg[1] : seg[0];
  };

  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const poly = [segments[s][0], segments[s][1]];

    let currentKey = key(poly[poly.length - 1]);
    for (let guard = 0; guard < 100000; guard++) {
      const candidates = (adjacency.get(currentKey) || []).filter((idx) => !used[idx]);
      if (candidates.length === 0) break;
      const next = candidates[0];
      used[next] = true;
      const np = otherPoint(next, currentKey);
      poly.push(np);
      currentKey = key(np);
    }

    let startKey = key(poly[0]);
    for (let guard = 0; guard < 100000; guard++) {
      const candidates = (adjacency.get(startKey) || []).filter((idx) => !used[idx]);
      if (candidates.length === 0) break;
      const next = candidates[0];
      used[next] = true;
      const np = otherPoint(next, startKey);
      poly.unshift(np);
      startKey = key(np);
    }

    polylines.push(poly);
  }
  return polylines;
}

function polylineLength(poly) {
  let len = 0;
  for (let i = 1; i < poly.length; i++) {
    len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
  }
  return len;
}

function polylineToPath(poly) {
  return 'M' + poly.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
}

// Douglas-Peucker: reduziert Punktzahl deutlich, ohne die sichtbare Form zu verändern.
function simplify(poly, tolerance) {
  if (poly.length <= 2) return poly;
  const sqTolerance = tolerance * tolerance;

  function sqSegDist(p, a, b) {
    let x = a[0], y = a[1];
    let dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  }

  function simplifyRange(points, first, last, out) {
    let maxDist = sqTolerance, index = -1;
    for (let i = first + 1; i < last; i++) {
      const dist = sqSegDist(points[i], points[first], points[last]);
      if (dist > maxDist) { index = i; maxDist = dist; }
    }
    if (index > -1) {
      if (index - first > 1) simplifyRange(points, first, index, out);
      out.push(points[index]);
      if (last - index > 1) simplifyRange(points, index, last, out);
    }
  }

  const out = [poly[0]];
  simplifyRange(poly, 0, poly.length - 1, out);
  out.push(poly[poly.length - 1]);
  return out;
}

function pointAtFraction(poly, frac) {
  const total = polylineLength(poly);
  const target = total * frac;
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    const dx = poly[i][0] - poly[i - 1][0];
    const dy = poly[i][1] - poly[i - 1][1];
    const segLen = Math.hypot(dx, dy);
    if (acc + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - acc) / segLen;
      const x = poly[i - 1][0] + dx * t;
      const y = poly[i - 1][1] + dy * t;
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      return { x, y, angle };
    }
    acc += segLen;
  }
  const last = poly[poly.length - 1];
  return { x: last[0], y: last[1], angle: 0 };
}

function generateContourSVG(opts) {
  const seed = opts.seed || 1;
  const W = opts.width || 1600;
  const H = opts.height || 900;
  const paramRand = mulberry32(seed * 99991 + 7);

  const octaves = 4 + Math.floor(paramRand() * 3); // 4..6
  const NOISE_SCALE = 2.2 + paramRand() * 0.8; // 2.2..3.0
  const BASE_ELEV = 250 + Math.floor(paramRand() * 300); // 250..550
  const ELEV_RANGE = 600 + Math.floor(paramRand() * 500); // 600..1100
  const GRID_BUDGET = 121 * 69; // Ziel-Zellenzahl, unabhängig vom Seitenverhältnis
  const NX = Math.max(20, Math.round(Math.sqrt((GRID_BUDGET * W) / H)));
  const NY = Math.max(20, Math.round(Math.sqrt((GRID_BUDGET * H) / W)));
  const LEVEL_COUNT = opts.levelCount || 16;
  const INDEX_EVERY = opts.indexEvery || 4;
  const MARGIN = 0.05;
  const EDGE_MARGIN = Math.min(W, H) * 0.03;
  const SIMPLIFY_TOLERANCE = Math.max(1.2, Math.min(W, H) / 700);

  const heightFn = makeHeightField(seed, octaves);
  const grid = new Float64Array(NX * NY);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const nx = (i / (NX - 1)) * NOISE_SCALE;
      const ny = (j / (NY - 1)) * NOISE_SCALE * (H / W);
      const v = heightFn(nx, ny);
      grid[j * NX + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const gridX = (i) => (i / (NX - 1)) * W;
  const gridY = (j) => (j / (NY - 1)) * H;

  const lo = min + (max - min) * MARGIN;
  const hi = max - (max - min) * MARGIN;

  const minorPaths = [];
  const indexPaths = [];
  const labels = [];

  for (let li = 0; li < LEVEL_COUNT; li++) {
    const t = li / (LEVEL_COUNT - 1);
    const level = lo + (hi - lo) * t;
    const isIndex = li % INDEX_EVERY === 0;
    const elevation = Math.round((BASE_ELEV + ELEV_RANGE * t) / 10) * 10;

    const polylines = stitch(marchingSquares(grid, NX, NY, gridX, gridY, level))
      .filter((p) => polylineLength(p) > 20)
      .map((p) => simplify(p, SIMPLIFY_TOLERANCE));
    polylines.forEach((poly) => {
      (isIndex ? indexPaths : minorPaths).push(polylineToPath(poly));
    });

    if (isIndex && polylines.length) {
      const longest = polylines.reduce((a, b) => (polylineLength(a) > polylineLength(b) ? a : b));
      const frac = 0.35 + ((li * 0.13) % 0.3);
      const label = pointAtFraction(longest, frac);
      if (label.x > EDGE_MARGIN && label.x < W - EDGE_MARGIN && label.y > EDGE_MARGIN && label.y < H - EDGE_MARGIN) {
        labels.push({ ...label, elevation });
      }
    }
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <style>
    .contour-minor { fill: none; stroke: var(--line-soft); stroke-width: 1; opacity: 0.3; }
    .contour-index { fill: none; stroke: var(--line); stroke-width: 1.1; opacity: 0.42; }
    .contour-label {
      font-family: 'Noto Sans Miao', -apple-system, 'Segoe UI', sans-serif;
      font-size: ${Math.round(Math.min(W, H) / 110)}px;
      letter-spacing: 0.02em;
      fill: var(--ink-muted);
      stroke: var(--bg);
      stroke-width: 3px;
      paint-order: stroke fill;
      text-anchor: middle;
      opacity: 0.55;
    }
  </style>
  <g class="contour-minor">
    ${minorPaths.map((d) => `<path d="${d}" />`).join('\n    ')}
  </g>
  <g class="contour-index">
    ${indexPaths.map((d) => `<path d="${d}" />`).join('\n    ')}
  </g>
  <g class="contour-label">
    ${labels.map((l) => `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" transform="rotate(${l.angle.toFixed(1)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})">${l.elevation}</text>`).join('\n    ')}
  </g>
</svg>
`;

  return { svg, stats: { indexPaths: indexPaths.length, minorPaths: minorPaths.length, labels: labels.length } };
}

module.exports = { generateContourSVG };
