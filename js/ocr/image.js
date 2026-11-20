// Finds the paper slip in a phone photo, straightens it, flattens the lighting
// and cuts it into the printed sections, ready for text recognition.
// Plain canvas and typed arrays, so it runs fully offline.

const DEG = Math.PI / 180;

export async function decodeImage(source) {
  const isUrl = typeof source === 'string';
  const url = isUrl ? source : URL.createObjectURL(source);
  const img = new Image();
  // The load event, not img.decode(): decode() can stall on a page that is
  // not currently being drawn.
  const loaded = new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('That file could not be opened as a photo.'));
  });
  img.src = url;
  try {
    await loaded;
  } catch (err) {
    if (!isUrl) URL.revokeObjectURL(url);
    throw err;
  }
  return { img, release: () => { if (!isUrl) URL.revokeObjectURL(url); } };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function context(c) {
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  return x;
}

function grayOf(canvas) {
  const { width: w, height: h } = canvas;
  const d = context(canvas).getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    g[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  }
  return { g, w, h };
}

function otsu(values) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < values.length; i++) hist[values[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = values.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

// Morphology along one axis using a running count. `pad` is the value assumed
// outside the image.
function slide(src, dst, count, stride, lineStride, lines, r, need, pad) {
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += i < 0 || i >= count ? pad : src[base + i * stride];
    for (let i = 0; i < count; i++) {
      dst[base + i * stride] = sum >= need ? 1 : 0;
      const out = i - r, inn = i + r + 1;
      sum -= out < 0 || out >= count ? pad : src[base + out * stride];
      sum += inn < 0 || inn >= count ? pad : src[base + inn * stride];
    }
  }
}

function dilate(mask, w, h, r) {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  slide(mask, a, w, 1, w, h, r, 1, 0);
  slide(a, b, h, w, 1, w, r, 1, 0);
  return b;
}

function erode(mask, w, h, r) {
  const size = 2 * r + 1;
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  slide(mask, a, w, 1, w, h, r, size, 1);
  slide(a, b, h, w, 1, w, r, size, 1);
  return b;
}

function fillHoles(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (p) => { if (!mask[p] && !seen[p]) { seen[p] = 1; stack[top++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (top) {
    const p = stack[--top];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || !seen[i] ? 1 : 0;
  return out;
}

function components(mask, w, h) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const found = [];
  for (let start = 0; start < labels.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = found.length + 1;
    let top = 0, area = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top) {
      const p = stack[--top];
      const x = p % w;
      area++;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = id; stack[top++] = p + 1; }
      if (p >= w && mask[p - w] && !labels[p - w]) { labels[p - w] = id; stack[top++] = p - w; }
      if (p < w * (h - 1) && mask[p + w] && !labels[p + w]) { labels[p + w] = id; stack[top++] = p + w; }
    }
    found.push({ id, area });
  }
  return { labels, found };
}

function boxBlur(src, w, h, r) {
  const a = new Uint8Array(w * h), out = new Uint8Array(w * h);
  const size = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[y * w + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      a[y * w + x] = sum / size;
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += a[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / size;
      sum += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function principalAxis(px, py) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const n = px.length;
  for (let i = 0; i < n; i++) {
    sx += px[i]; sy += py[i];
    sxx += px[i] * px[i]; syy += py[i] * py[i]; sxy += px[i] * py[i];
  }
  const cx = sx / n, cy = sy / n;
  const cxx = sxx / n - cx * cx, cyy = syy / n - cy * cy, cxy = sxy / n - cx * cy;
  const spread = Math.sqrt(Math.max(0, (cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy));
  const major = (cxx + cyy + spread) / 2, minor = Math.max(1e-6, (cxx + cyy - spread) / 2);
  return { cx, cy, theta: 0.5 * Math.atan2(2 * cxy, cxx - cyy), elongation: Math.sqrt(major / minor) };
}

function axesFromTheta(theta) {
  // `along` runs down the slip; `across` runs left to right.
  let ax = Math.cos(theta), ay = Math.sin(theta);
  if (ay < 0 || (Math.abs(ay) < 1e-6 && ax < 0)) { ax = -ax; ay = -ay; }
  return { ax, ay, bx: ay, by: -ax };
}

function rotateAxes({ ax, ay }, delta) {
  const c = Math.cos(delta), s = Math.sin(delta);
  const nx = ax * c - ay * s, ny = ax * s + ay * c;
  return { ax: nx, ay: ny, bx: ny, by: -nx };
}

// Locates the slip. Paper is bright and colourless, which separates it from skin,
// wood floors and tables; printed ink then pins down the exact position, so a
// white shirt touching the paper cannot stretch the result.
export function findSlip(img) {
  const maxSide = 800;
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
  const x = context(cv);
  x.drawImage(img, 0, 0, cv.width, cv.height);
  const { width: w, height: h } = cv;
  const d = x.getImageData(0, 0, w, h).data;
  const score = new Uint8Array(w * h);
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < score.length; i += 4, p++) {
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    const sat = max ? (max - min) / max : 0;
    score[p] = max * Math.max(0, 1 - Math.max(0, sat - 0.1) * 3.2);
    gray[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  }
  const t = otsu(score);
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < raw.length; i++) raw[i] = score[i] > t ? 1 : 0;

  const r = Math.max(2, Math.round(maxSide * 0.011));
  const closed = erode(dilate(raw, w, h, r), w, h, r);
  const filled = fillHoles(closed, w, h);
  const { labels, found } = components(filled, w, h);

  // Ink: pixels clearly darker than their bright surroundings.
  const blur = boxBlur(gray, w, h, Math.max(4, Math.round(maxSide * 0.012)));
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = blur[i] > 95 && gray[i] < blur[i] * 0.84 ? 1 : 0;

  const counts = new Map();
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] && ink[i]) counts.set(labels[i], (counts.get(labels[i]) || 0) + 1);
  }
  let best = null, bestCount = 0;
  const minArea = w * h * 0.012;
  for (const c of found) {
    if (c.area < minArea) continue;
    const n = counts.get(c.id) || 0;
    if (n > bestCount) { bestCount = n; best = c; }
  }
  if (!best || bestCount < 120) return null;

  // Collect the ink inside the chosen paper region.
  let px = [], py = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === best.id && ink[i]) { px.push(i % w); py.push((i - (i % w)) / w); }
  }
  // Fit the long axis, discarding strays (finger edges, creases) each round.
  let fit = principalAxis(px, py);
  for (let round = 0; round < 3; round++) {
    const axes = axesFromTheta(fit.theta);
    const us = px.map((_, i) => (px[i] - fit.cx) * axes.bx + (py[i] - fit.cy) * axes.by);
    const sorted = [...us].sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * 0.02)], high = sorted[Math.floor(sorted.length * 0.98)];
    const span = high - low;
    const keep = us.map((u) => u >= low - span * 0.04 && u <= high + span * 0.04);
    px = px.filter((_, i) => keep[i]);
    py = py.filter((_, i) => keep[i]);
    fit = principalAxis(px, py);
  }
  const points = { x: px.map((v) => v / k), y: py.map((v) => v / k) };
  return { ...fitBounds(points, axesFromTheta(fit.theta)), points, elongation: fit.elongation };
}

// The tightest upright box around the print for a given orientation.
function fitBounds(points, axes) {
  const n = points.x.length;
  const us = new Float64Array(n), vs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    us[i] = points.x[i] * axes.bx + points.y[i] * axes.by;
    vs[i] = points.x[i] * axes.ax + points.y[i] * axes.ay;
  }
  us.sort();
  vs.sort();
  const pick = (a, q) => a[Math.min(n - 1, Math.floor(n * q))];
  const u0 = pick(us, 0.003), u1 = pick(us, 0.997), v0 = pick(vs, 0.001), v1 = pick(vs, 0.999);
  const marginU = (u1 - u0) * 0.035, marginV = (u1 - u0) * 0.05;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return {
    cx: cu * axes.bx + cv * axes.ax,
    cy: cu * axes.by + cv * axes.ay,
    width: u1 - u0 + marginU * 2,
    height: v1 - v0 + marginV * 2,
    axes,
  };
}

// Pulls an upright rectangle out of the photo in slip coordinates.
function extract(img, geo, { scale, v0 = -geo.height / 2, v1 = geo.height / 2, u0 = -geo.width / 2, u1 = geo.width / 2 }) {
  const { ax, ay, bx, by } = geo.axes;
  const c = makeCanvas((u1 - u0) * scale, (v1 - v0) * scale);
  const x = context(c);
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  const vMid = (v0 + v1) / 2, uMid = (u0 + u1) / 2;
  const px = geo.cx + vMid * ax + uMid * bx, py = geo.cy + vMid * ay + uMid * by;
  x.setTransform(
    scale * bx, scale * ax, scale * by, scale * ay,
    c.width / 2 - scale * (bx * px + by * py),
    c.height / 2 - scale * (ax * px + ay * py),
  );
  x.drawImage(img, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

// Finds the small rotation that makes printed rows sharpest. Expects a flattened
// image, where only real print is dark.
function estimateSkew(canvas, rangeDeg = 7, stepDeg = 0.25) {
  const { g, w, h } = grayOf(canvas);
  const inner0 = Math.floor(w * 0.08), inner1 = Math.ceil(w * 0.92);
  const threshold = 100;
  const xs = [], ys = [];
  for (let y = 0; y < h; y++) {
    for (let x = inner0; x < inner1; x++) {
      if (g[y * w + x] < threshold) { xs.push(x - w / 2); ys.push(y); }
    }
  }
  if (xs.length < 50) return 0;
  const pad = Math.ceil(w * Math.tan(rangeDeg * DEG)) + 2;
  const rows = new Int32Array(h + pad * 2);
  let bestAngle = 0, bestScore = -1;
  for (let a = -rangeDeg; a <= rangeDeg + 1e-9; a += stepDeg) {
    const t = Math.tan(a * DEG);
    rows.fill(0);
    for (let i = 0; i < xs.length; i++) rows[Math.round(ys[i] + xs[i] * t) + pad]++;
    let s = 0;
    for (let i = 1; i < rows.length; i++) { const dv = rows[i] - rows[i - 1]; s += dv * dv; }
    if (s > bestScore) { bestScore = s; bestAngle = a; }
  }
  // The shear that flattens the rows is opposite to the rotation that squares
  // the crop onto them.
  return -bestAngle * DEG;
}

// Evens out shadows and creases: each pixel is divided by the local paper
// brightness, estimated from a coarse grid of bright percentiles.
export function flatten(canvas, [low, high] = [0.45, 0.92]) {
  const { g, w, h } = grayOf(canvas);
  const tile = Math.max(24, Math.round(w / 14));
  const nx = Math.max(2, Math.ceil(w / tile) + 1), ny = Math.max(2, Math.ceil(h / tile) + 1);
  const grid = new Float32Array(nx * ny);
  const hist = new Uint32Array(256);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = Math.max(0, Math.floor((i - 0.75) * tile)), x1 = Math.min(w, Math.ceil((i + 0.75) * tile));
      const y0 = Math.max(0, Math.floor((j - 0.75) * tile)), y1 = Math.min(h, Math.ceil((j + 0.75) * tile));
      hist.fill(0);
      let n = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { hist[g[y * w + x]]++; n++; }
      let need = n * 0.1, v = 255;
      while (v > 0 && need > 0) { need -= hist[v]; if (need > 0) v--; }
      grid[j * nx + i] = Math.max(60, v);
    }
  }
  const out = makeCanvas(w, h);
  const ctx = context(out);
  const im = ctx.createImageData(w, h);
  const px = im.data;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(ny - 1.001, y / tile), j = Math.floor(fy), ty = fy - j;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(nx - 1.001, x / tile), i = Math.floor(fx), tx = fx - i;
      const a = grid[j * nx + i], b = grid[j * nx + i + 1];
      const c = grid[(j + 1) * nx + i], d = grid[(j + 1) * nx + i + 1];
      const bg = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      // Stretch so paper is pure white and print is close to black.
      let v = g[y * w + x] / bg;
      v = (v - low) / (high - low);
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const p = (y * w + x) * 4;
      px[p] = px[p + 1] = px[p + 2] = 255 * v;
      px[p + 3] = 255;
    }
  }
  ctx.putImageData(im, 0, 0);
  return out;
}

// Finds the solid black headings (RESULT, DESIRABLE RANGE, INDICATOR).
function findBands(canvas) {
  const { g, w, h } = grayOf(canvas);
  const x0 = Math.floor(w * 0.2), x1 = Math.ceil(w * 0.8);
  const threshold = Math.min(otsu(g), 130);
  const dark = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (g[y * w + x] < threshold) n++;
    dark[y] = n / (x1 - x0);
  }
  // Headings measure at least 4% of the slip's width. The solid bars in the
  // graphs below them stay under 2.6%, however sharp the photo is.
  const minHeight = Math.max(3, w * 0.033), maxHeight = w * 0.12;
  const bands = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && dark[y] > 0.5;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      const size = y - start;
      const inside = start > h * 0.04 && y < h * 0.97;
      if (size >= minHeight && size <= maxHeight && inside) bands.push({ y0: start, y1: y });
      start = -1;
    }
  }
  return bands;
}

// Band spacing is lopsided (about 3:1), which identifies the three headings and
// reveals an upside-down slip. The long gap is also about one slip width, so a
// stray bar that happens to give the right ratio cannot win.
function orderBands(bands, width) {
  if (bands.length < 3) return { bands, flipped: false };
  const misfit = (longGap) => (longGap > width * 0.75 && longGap < width * 1.6 ? 0 : 2);
  let best = null, bestErr = Infinity, flipped = false;
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      for (let m = j + 1; m < bands.length; m++) {
        const gap1 = bands[j].y0 - bands[i].y0, gap2 = bands[m].y0 - bands[j].y0;
        const upright = Math.abs(Math.log(gap1 / gap2 / 3)) + misfit(gap1);
        const reversed = Math.abs(Math.log(gap2 / gap1 / 3)) + misfit(gap2);
        if (upright < bestErr) { bestErr = upright; best = [bands[i], bands[j], bands[m]]; flipped = false; }
        if (reversed < bestErr) { bestErr = reversed; best = [bands[i], bands[j], bands[m]]; flipped = true; }
      }
    }
  }
  return { bands: best, flipped, err: bestErr };
}

// Removes the printed frames around each block: long straight runs of ink that
// text can never produce and that OCR tends to read as stray characters.
function removeRules(canvas) {
  const { width: w, height: h } = canvas;
  const ctx = context(canvas);
  const d = ctx.getImageData(0, 0, w, h).data;
  const dark = (x, y) => d[(y * w + x) * 4] < 110;
  const paint = [];
  const longV = Math.max(40, Math.round(w * 0.13));
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && dark(x, y)) { run++; continue; }
      if (run >= longV) paint.push([x - 1, y - run, 3, run]);
      run = 0;
    }
  }
  const longH = Math.round(w * 0.32);
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && dark(x, y)) { run++; continue; }
      if (run >= longH) paint.push([x - run, y - 1, run, 3]);
      run = 0;
    }
  }
  ctx.fillStyle = '#fff';
  for (const [px, py, pw, ph] of paint) ctx.fillRect(px, py, pw, ph);
  return canvas;
}

const medianOf = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

// Cuts a cleaned section into single printed rows. When the number of rows is
// known, the deepest valleys in the ink profile mark the boundaries even if
// slanted rows leave no fully white gap between them.
export function splitRows(canvas, { expected = 0 } = {}) {
  const { g, w, h } = grayOf(canvas);
  const margin = Math.round(w * 0.02);
  const ink = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = margin; x < w - margin; x++) if (g[y * w + x] < 120) n++;
    ink[y] = n;
  }
  const smoothOver = (r) => {
    const out = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let sum = 0, n = 0;
      for (let i = Math.max(0, y - r); i <= Math.min(h - 1, y + r); i++) { sum += ink[i]; n++; }
      out[y] = sum / n;
    }
    return out;
  };

  let bounds = [];
  if (expected > 1) {
    // Rows are found by their ink peaks rather than by even spacing, because
    // the printed block has blank lines in it. One extra slot allows for those.
    const pitch = h / (expected + 1);
    const smooth = smoothOver(Math.max(1, Math.round(pitch / 6)));
    const candidates = [];
    for (let y = 1; y < h - 1; y++) {
      if (smooth[y] >= smooth[y - 1] && smooth[y] > smooth[y + 1]) candidates.push(y);
    }
    candidates.sort((a, b) => smooth[b] - smooth[a]);
    let peaks = [];
    for (const y of candidates) {
      if (peaks.every((p) => Math.abs(p - y) >= pitch * 0.62)) peaks.push(y);
      if (peaks.length === expected + 1) break;
    }
    const strength = medianOf(peaks.map((p) => smooth[p]));
    peaks = peaks.filter((p) => smooth[p] >= strength * 0.18).sort((a, b) => a - b);
    const reach = pitch * 0.66;
    bounds = peaks.map((p, i) => [
      Math.round(Math.max(p - reach, i ? (peaks[i - 1] + p) / 2 : 0)),
      Math.round(Math.min(p + reach, i < peaks.length - 1 ? (p + peaks[i + 1]) / 2 : h)),
    ]);
  } else {
    const smooth = smoothOver(1);
    const on = w * 0.008;
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const inked = y < h && smooth[y] > on;
      if (inked && start < 0) start = y;
      if (!inked && start >= 0) {
        if (y - start >= w * 0.016) bounds.push([start, y]);
        start = -1;
      }
    }
    // A run far taller than the rest is two rows touching.
    const typical = medianOf(bounds.map(([a, b]) => b - a)) || w * 0.05;
    const cut = (a, b) => {
      if (b - a < typical * 1.6) return [[a, b]];
      const from = a + Math.round((b - a) * 0.3), to = a + Math.round((b - a) * 0.7);
      let best = from;
      for (let y = from; y < to; y++) if (smooth[y] < smooth[best]) best = y;
      return [...cut(a, best), ...cut(best + 1, b)];
    };
    const pad = Math.round(w * 0.012);
    bounds = bounds.flatMap(([a, b]) => cut(a, b)).map(([a, b]) => [Math.max(0, a - pad), Math.min(h, b + pad)]);
  }
  return bounds.map(([y0, y1]) => ({ y0, y1, canvas: cropRow(canvas, 0, y0, w, y1 - y0) }));
}

function resized(src, f) {
  const c = makeCanvas(src.width * f, src.height * f);
  const ctx = context(c);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function fromGray(g, w, h) {
  const c = makeCanvas(w, h);
  const ctx = context(c);
  const img = ctx.createImageData(w, h);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g[p];
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Other renderings of one printed row, so a misread digit can be outvoted. The
// slip is dot-matrix: a slight blur at double size joins the dots into strokes,
// a hard threshold drops faint specks, and a smaller copy changes which strokes
// the engine notices. Done by hand rather than with canvas filters, which not
// every phone browser supports.
export function variantsOf(canvas) {
  const big = resized(canvas, 2);
  const { g, w, h } = grayOf(big);
  const soft = boxBlur(g, w, h, 1);
  const cut = otsu(soft);
  const hard = new Uint8Array(soft.length);
  for (let i = 0; i < soft.length; i++) hard[i] = soft[i] < cut ? 0 : 255;
  return [fromGray(boxBlur(soft, w, h, 1), w, h), fromGray(hard, w, h), resized(canvas, 0.7)];
}

// The top part of a section, where the date is printed.
export const topOf = (canvas, share) => cropRow(canvas, 0, 0, canvas.width, Math.round(canvas.height * share));

// Copies a region onto a white canvas with a little breathing room.
export function cropRow(src, x, y, w, h) {
  const pad = 14;
  const c = makeCanvas(w + pad * 2, h + pad * 2);
  const ctx = context(c);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, x, y, w, h, pad, pad, w, h);
  return c;
}

// Full preparation: returns upright, cleaned crops for each printed section.
export function prepare(img, { targetWidth = 1000, stretch = [0.45, 0.92], flip = false, clean = true } = {}) {
  const located = findSlip(img);
  const whole = {
    cx: img.naturalWidth / 2, cy: img.naturalHeight / 2,
    width: img.naturalWidth, height: img.naturalHeight,
    axes: { ax: 0, ay: 1, bx: 1, by: 0 }, fallback: true,
  };
  const turn = (g) => ({ ...g, axes: { ax: -g.axes.ax, ay: -g.axes.ay, bx: -g.axes.bx, by: -g.axes.by } });

  // Geometry always uses the same contrast setting, so straightening and section
  // finding do not change between recognition passes.
  const GEOMETRY = [0.45, 0.92];

  // Straighten in two steps, then re-measure the crop for the final angle.
  const straighten = (start, points) => {
    let geo = flip ? turn(start) : start;
    let delta = 0;
    const refit = (axes) => (points ? { ...geo, ...fitBounds(points, axes) } : { ...geo, axes });
    const probeScale = 520 / geo.width;
    for (const [range, step] of [[9, 0.5], [2, 0.25]]) {
      const d = estimateSkew(flatten(extract(img, geo, { scale: probeScale }), GEOMETRY), range, step);
      delta += d;
      geo = refit(rotateAxes(geo.axes, d));
    }
    const uprightScale = 520 / geo.width;
    let upright = flatten(extract(img, geo, { scale: uprightScale }), GEOMETRY);
    let ordered = orderBands(findBands(upright), upright.width);
    let turned = false;
    if (ordered.flipped) {
      geo = turn(geo);
      upright = flatten(extract(img, geo, { scale: uprightScale }), GEOMETRY);
      ordered = orderBands(findBands(upright), upright.width);
      turned = true;
    }
    return { geo, delta, uprightScale, upright, ordered, turned };
  };

  let view = straighten(located || whole, located?.points);
  // Background down both sides of a close-up can fool the paper finder. The
  // frame is mostly paper then, so straightening the whole of it works better.
  if (located && !view.ordered.bands.length) {
    const plain = straighten(whole, null);
    if (plain.ordered.bands.length) view = plain;
  }
  const { geo, delta, uprightScale, upright, ordered, turned } = view;

  const toSlip = (y) => y / uprightScale - geo.height / 2;
  const scale = targetWidth / geo.width;
  const sections = [];

  // Rotates the crop about one point, so that point stays where it is.
  const rotatedAbout = (g, u, v, delta) => {
    const axes = rotateAxes(g.axes, delta);
    const px = g.cx + v * g.axes.ax + u * g.axes.bx, py = g.cy + v * g.axes.ay + u * g.axes.by;
    return { ...g, axes, cx: px - v * axes.ax - u * axes.bx, cy: py - v * axes.ay - u * axes.by };
  };

  const addSection = (name, y0, y1, { u0, u1 } = {}) => {
    if (y1 - y0 < 10) return;
    const v0 = toSlip(y0), v1 = toSlip(y1);
    const span = { u0: u0 ?? -geo.width / 2, u1: u1 ?? geo.width / 2 };
    const local = estimateSkew(flatten(extract(img, geo, { scale: uprightScale, v0, v1, ...span }), GEOMETRY), 6, 0.25);
    const localGeo = rotatedAbout(geo, (span.u0 + span.u1) / 2, (v0 + v1) / 2, local);
    const crop = flatten(extract(img, localGeo, { scale, v0, v1, ...span }), stretch);
    sections.push({ name, canvas: clean ? removeRules(crop) : crop, skew: local / DEG });
  };

  const [b1, b2, b3] = ordered.bands;
  const trim = Math.round(520 * 0.004);
  // How much of the slip the photo shows: all of it, or a close-up of the top.
  let layout = 'unknown';
  if (ordered.bands.length >= 3) {
    layout = 'full';
    addSection('head', 0, b1.y0 - trim);
    addSection('result', b1.y1 + trim, b2.y0 - trim);
    // Paper curves in the hand, so rows slant differently across the width.
    // The value column is narrow enough to straighten on its own. It starts a
    // little above the row area so the first value is never clipped; the rest
    // of the heading bar is removed with the other printed rules.
    addSection('values', b1.y1 - 7, b2.y0 - trim, { u0: -geo.width * 0.02, u1: geo.width / 2 });
    addSection('headRight', 0, b1.y0 - trim, { u0: -geo.width * 0.02, u1: geo.width / 2 });
    addSection('range', b2.y1 + trim, b3.y0 - trim);
    // The bar graphs carry no numbers; only the physique rating and the
    // bioelectrical rows below them are worth reading.
    addSection('tail', Math.min(upright.height - 12, b3.y1 + 520 * 1.1), upright.height);
  } else if (ordered.bands.length === 2) {
    // RESULT and DESIRABLE RANGE, with the range block below the second bar.
    layout = 'upper';
    addSection('head', 0, b1.y0 - trim);
    addSection('result', b1.y1 + trim, b2.y0 - trim);
    addSection('values', b1.y1 + trim, b2.y0 - trim, { u0: -geo.width * 0.02, u1: geo.width / 2 });
    addSection('headRight', 0, b1.y0 - trim, { u0: -geo.width * 0.02, u1: geo.width / 2 });
    addSection('range', b2.y1 + trim, upright.height);
    addSection('tail', b2.y1 + trim, upright.height);
  } else if (ordered.bands.length === 1 && b1.y0 > upright.height * 0.1 && b1.y1 < upright.height * 0.62) {
    // A close photo of the top of the slip: the date and INPUT box above the
    // RESULT bar and the result rows below it, which is all a round needs.
    layout = 'top';
    addSection('head', 0, b1.y0 - trim);
    addSection('result', b1.y1 + trim, upright.height);
    addSection('values', b1.y1 - 7, upright.height, { u0: -geo.width * 0.02, u1: geo.width / 2 });
    addSection('headRight', 0, b1.y0 - trim, { u0: -geo.width * 0.02, u1: geo.width / 2 });
  } else {
    const crop = flatten(extract(img, geo, { scale }), stretch);
    sections.push({ name: 'all', canvas: clean ? removeRules(crop) : crop, skew: 0 });
  }
  return { geo, bands: ordered.bands, sections, upright, skew: delta / DEG, turned, found: !!located, layout };
}
