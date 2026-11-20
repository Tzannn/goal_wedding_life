// Hand-built SVG charts: one axis, thin marks, a crosshair readout and
// keyboard access. Series names are written with textContent.

import { shortDate, longDate, clock, signed, fixed, monthShort } from './model.js';

const isWhole = (v) => Math.abs(v - Math.round(v)) < 1e-6;

// Steps are multiples of the precision the slip prints. A finer step would label
// a whole-number rating 11.5, or repeat 3.2 down the axis of a flat line.
function niceTicks(min, max, wanted, precision) {
  if (min === max) { min -= 1; max += 1; }
  const raw = Math.max((max - min) / Math.max(1, wanted - 1), precision);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * mag).find((s) => s >= raw - 1e-9 && isWhole(s / precision));
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Number(v.toFixed(8)));
  let decimals = 0;
  while (decimals < 3 && !isWhole(step * 10 ** decimals)) decimals++;
  return { ticks, lo, hi, decimals };
}

// A time-aware moving trend, so uneven gaps between scans are weighted fairly.
function trendOf(points, days = 7) {
  let value = points[0].y;
  return points.map((p, i) => {
    if (i) {
      const dt = (p.t - points[i - 1].t) / 864e5;
      value += (1 - Math.exp(-dt / days)) * (p.y - value);
    }
    return { t: p.t, y: value };
  });
}

// Month starts across a long span, thinned until the labels have room.
function monthTicks(tMin, tMax, x) {
  const first = new Date(tMin);
  let d = new Date(first.getFullYear(), first.getMonth() + (first.getDate() > 1 ? 1 : 0), 1);
  const months = [];
  while (+d <= tMax) {
    months.push(d);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  for (const step of [1, 2, 3, 4, 6, 12]) {
    const picked = months.filter((_, i) => i % step === 0);
    if (picked.length < 2 || x(+picked[1]) - x(+picked[0]) >= 58) return picked;
  }
  return months.slice(0, 1);
}

let chartCount = 0;

/*
  spec: {
    series: [{ id, name, color, points: [{ t: Date, y, flagged, text, when }],
               dash, dots (false hides them), raw (no trend line), endLabel (false hides it) }],
    unit, dec, height,
    zero: true draws the Day One baseline at 0,
    signedValues: format with + and −,
    band: { low, high, label }, drawn only where it falls inside the data's range,
    area: true washes the area under each line,
    xDomain: [Date, Date] to show a longer span than the points cover,
    monthTicks: true labels the x axis by month,
    markers: [{ t, y, color }] large dots, such as milestones,
    today: Date for a "Today" line,
    summary: text for screen readers,
  }
*/
export function lineChart(host, spec) {
  const uid = ++chartCount;
  host.classList.add('chart');
  host.tabIndex = 0;
  host.setAttribute('role', 'img');
  if (spec.summary) host.setAttribute('aria-label', spec.summary);

  const fmt = (v) => (spec.signedValues ? signed(v, spec.dec) : fixed(v, spec.dec));
  const unitText = spec.unit ? ` ${spec.unit}` : '';
  let active = null;
  let geometry = null;
  let animated = false;
  let hideTimer = 0;

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;

  function draw() {
    const W = Math.max(240, host.clientWidth || 320);
    const H = spec.height || 210;
    const markers = spec.markers || [];

    const all = spec.series.flatMap((s) => s.points);
    const times = [...all.map((p) => +p.t), ...markers.map((k) => +k.t)];
    const tMin = spec.xDomain ? Math.min(+spec.xDomain[0], ...times) : Math.min(...times);
    const tMax = spec.xDomain ? Math.max(+spec.xDomain[1], ...times) : Math.max(...times);

    // End labels need room on the right only when a line ends near that edge.
    const labelled = spec.series.filter((s) => s.endLabel !== false && s.points.length);
    const hasEnds = labelled.length > 0 && labelled.length <= 4;
    const lastT = (s) => Math.max(...s.points.map((p) => +p.t));
    const endsAtEdge = hasEnds && labelled.some((s) => tMax === tMin || (lastT(s) - tMin) / (tMax - tMin) > 0.8);
    const m = { top: 14, right: endsAtEdge ? 62 : 16, bottom: 24, left: 38 };
    const plotW = W - m.left - m.right, plotH = H - m.top - m.bottom;

    // The scale fits the numbers, so small changes stay visible. A reference
    // band does not stretch it: it shows only where it overlaps the numbers.
    const ys = [...all.map((p) => p.y), ...markers.map((k) => k.y)];
    if (spec.zero) ys.push(0);
    const span = Math.max(...ys) - Math.min(...ys);
    const padding = span * 0.08 || 0.5;
    const { ticks, lo, hi, decimals } = niceTicks(Math.min(...ys) - padding, Math.max(...ys) + padding, 5, 10 ** -(spec.dec ?? 1));

    const x = (t) => (tMax === tMin ? m.left + plotW / 2 : m.left + ((+t - tMin) / (tMax - tMin)) * plotW);
    const y = (v) => m.top + (1 - (v - lo) / (hi - lo)) * plotH;

    let svg = '';
    for (const t of ticks) {
      const py = y(t);
      svg += `<line x1="${m.left}" x2="${W - m.right}" y1="${py}" y2="${py}" stroke="var(--rope)" stroke-width="1"/>`;
      svg += `<text x="${m.left - 7}" y="${py + 4.5}" text-anchor="end">${spec.signedValues ? signed(t, decimals) : t.toFixed(decimals)}</text>`;
    }
    if (spec.zero) {
      svg += `<line x1="${m.left}" x2="${W - m.right}" y1="${y(0)}" y2="${y(0)}" stroke="var(--mute)" stroke-width="1"/>`;
    }
    if (spec.band) {
      const top = Math.min(spec.band.high, hi), bottom = Math.max(spec.band.low, lo);
      if (top > bottom) {
        const y0 = y(top), y1 = y(bottom);
        svg += `<rect x="${m.left}" y="${y0}" width="${plotW}" height="${y1 - y0}" fill="var(--good)" opacity="0.13"/>`;
        if (y1 - y0 >= 20) svg += `<text class="band-label" x="${m.left + 7}" y="${y0 + 16}">${spec.band.label}</text>`;
      }
    }

    if (spec.monthTicks) {
      for (const d of monthTicks(tMin, tMax, x)) {
        const px = x(+d);
        if (px < m.left + 12) continue;
        svg += `<text x="${px}" y="${H - 5}" text-anchor="middle">${monthShort(d)}</text>`;
      }
    } else {
      // Every scan when few, otherwise a handful, never overlapping.
      const unique = [...new Set(times)].sort((a, b) => a - b);
      const minGap = 50;
      let lastX = -Infinity;
      const shown = unique.length <= 7 ? unique : unique.filter((_, i) => i % Math.ceil(unique.length / 5) === 0 || i === unique.length - 1);
      shown.forEach((t, i) => {
        const px = x(t);
        const isLast = i === shown.length - 1;
        if (px - lastX < minGap && !isLast) return;
        if (isLast && px - lastX < minGap) return;
        svg += `<text x="${px}" y="${H - 5}" text-anchor="middle">${shortDate(new Date(t))}</text>`;
        lastX = px;
      });
    }

    if (spec.today && +spec.today >= tMin && +spec.today <= tMax) {
      const tx = x(+spec.today);
      svg += `<line x1="${tx}" x2="${tx}" y1="${m.top}" y2="${m.top + plotH}" stroke="var(--mute)" stroke-width="1" stroke-dasharray="3 4"/>`;
      svg += `<text class="today" x="${tx + 5}" y="${m.top + plotH - 6}">Today</text>`;
    }

    spec.series.forEach((s) => {
      const pts = [...s.points].sort((a, b) => a.t - b.t);
      if (!pts.length) return;
      const useTrend = !s.raw && pts.length >= 6;
      const path = (useTrend ? trendOf(pts) : pts).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
      if (spec.area && pts.length > 1) {
        const base = spec.zero ? y(0) : m.top + plotH;
        const line = pts.map((p) => `L${x(p.t).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
        svg += `<path d="M${x(pts[0].t).toFixed(1)} ${base} ${line} L${x(pts[pts.length - 1].t).toFixed(1)} ${base}Z" fill="${s.color}" opacity="0.1"/>`;
      }
      if (pts.length > 1) {
        // Dashed lines skip the draw-in animation, which works by dashing.
        svg += s.dash
          ? `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="6 5" stroke-linejoin="round" stroke-linecap="round"/>`
          : `<path class="draw" pathLength="1" d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      if (s.dots === false) return;
      const r = useTrend ? 3 : 4.5;
      for (const p of pts) {
        svg += p.flagged
          ? `<circle cx="${x(p.t)}" cy="${y(p.y)}" r="${r}" fill="var(--mat)" stroke="${s.color}" stroke-width="2"/>`
          : `<circle cx="${x(p.t)}" cy="${y(p.y)}" r="${r}" fill="${s.color}" stroke="var(--mat)" stroke-width="2"/>`;
      }
    });

    for (const k of markers) {
      svg += `<circle cx="${x(+k.t)}" cy="${y(k.y)}" r="6.5" fill="${k.color}" stroke="var(--mat)" stroke-width="2.5"/>`;
    }

    // The value at the end of each line. Labels that would overlap are nudged
    // apart rather than dropped.
    if (hasEnds) {
      const ends = labelled.map((s) => {
        const last = [...s.points].sort((a, b) => a.t - b.t).pop();
        return { x: x(last.t), y: y(last.y), text: `${fmt(last.y)}${unitText}` };
      }).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 17);
      const overflow = ends.length ? ends[ends.length - 1].y - (m.top + plotH + 4) : 0;
      if (overflow > 0) ends.forEach((e) => { e.y -= overflow; });
      for (const e of ends) svg += `<text class="end" x="${e.x + 10}" y="${e.y + 5}">${e.text}</text>`;
    }

    svg += `<line class="hair" x1="0" x2="0" y1="${m.top}" y2="${m.top + plotH}" stroke="var(--canvas-2)" stroke-width="1" visibility="hidden"/>`;

    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" aria-hidden="true">${svg}</svg>`;
    host.append(tip);

    if (!animated && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const p of host.querySelectorAll('.draw')) {
        p.style.strokeDasharray = '1';
        p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: 'cubic-bezier(.3,.7,.3,1)' });
      }
    }
    animated = true;
    const unique = [...new Set(all.map((p) => +p.t))].sort((a, b) => a - b);
    geometry = { x, unique, W };
    if (active !== null) show(active);
  }

  function show(index) {
    const { x, unique, W } = geometry;
    if (!unique.length) return;
    active = Math.max(0, Math.min(unique.length - 1, index));
    const t = unique[active];
    const px = x(t);
    const hair = host.querySelector('.hair');
    hair.setAttribute('x1', px); hair.setAttribute('x2', px);
    hair.setAttribute('visibility', 'visible');

    tip.replaceChildren();
    const at = spec.series.map((s) => ({ s, p: s.points.find((q) => +q.t === t) })).filter((e) => e.p);
    const when = new Date(t);
    const dateEl = document.createElement('div');
    dateEl.className = 'tip-date';
    dateEl.textContent = at.find((e) => e.p.when)?.p.when ?? `${longDate(when)} · ${clock(when)}`;
    tip.append(dateEl);
    let flagged = false;
    for (const { s, p } of at) {
      flagged = flagged || p.flagged;
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('i');
      key.style.background = s.color;
      const val = document.createElement('b');
      val.textContent = p.text ?? `${fmt(p.y)}${unitText}`;
      const name = document.createElement('span');
      name.textContent = s.name;
      row.append(key, val, name);
      tip.append(row);
    }
    if (flagged) {
      const f = document.createElement('div');
      f.className = 'tip-flag';
      f.textContent = 'Taken at an unusual time';
      tip.append(f);
    }
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const left = px + 12 + tw > W ? px - tw - 12 : px + 12;
    tip.style.transform = `translate(${Math.max(0, left)}px, 2px)`;
  }

  function hide() {
    clearTimeout(hideTimer);
    active = null;
    tip.hidden = true;
    host.querySelector('.hair')?.setAttribute('visibility', 'hidden');
  }

  const fromPointer = (e) => {
    if (!geometry) return;
    const rect = host.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0, bestD = Infinity;
    geometry.unique.forEach((t, i) => {
      const d = Math.abs(geometry.x(t) - px);
      if (d < bestD) { bestD = d; best = i; }
    });
    show(best);
  };
  // A finger shows the readout while it is down. After lifting, the readout
  // stays just long enough to read a tap, then gets out of the way.
  const keep = () => clearTimeout(hideTimer);
  const hideSoon = () => { keep(); hideTimer = setTimeout(hide, 1500); };
  host.addEventListener('pointerdown', (e) => { keep(); fromPointer(e); });
  host.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) { keep(); fromPointer(e); } });
  host.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') hideSoon(); });
  host.addEventListener('pointercancel', hide);
  host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  host.addEventListener('blur', hide);
  host.addEventListener('keydown', (e) => {
    if (!geometry) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      keep();
      const start = active === null ? geometry.unique.length - 1 : active + (e.key === 'ArrowRight' ? 1 : -1);
      show(start);
    } else if (e.key === 'Escape') hide();
  });

  draw();
  let resizeFrame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (host.isConnected) draw(); else ro.disconnect(); });
  });
  ro.observe(host);
  return { uid };
}

export function sparkline(values, { w = 70, h = 24, color = 'var(--canvas-2)' } = {}) {
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const px = (i) => 2 + (i / (values.length - 1)) * (w - 6);
  const py = (v) => 3 + (1 - (v - min) / span) * (h - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${px(last)}" cy="${py(values[last])}" r="3" fill="var(--canvas)"/></svg>`;
}
