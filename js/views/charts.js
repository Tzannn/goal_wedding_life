import {
  asDate, autoTarget, clock, fixed, isNum, longDate, METRICS, metricOf, MONTHS, monthKeyOf, monthLong,
  planFor, planStatus, shortDate, signed, TARGET_KEYS,
} from '../model.js';
import { lineChart } from '../charts.js';
import { store } from '../store.js';
import { esc, sheet, toast } from '../ui.js';
import { deltaHtml, flaggedSet, header, pointsOf, wireHeader } from './common.js';

const RANGES = [
  { id: '1m', label: '1M', days: 31 },
  { id: '3m', label: '3M', days: 92 },
  { id: '6m', label: '6M', days: 183 },
  { id: '1y', label: '1Y', days: 366 },
  { id: 'all', label: 'All', days: null },
];

let rangeId = 'all';
let targetKey = 'fatPct';
let targetZoom = 'scans';

function inRange(list) {
  const range = RANGES.find((r) => r.id === rangeId);
  if (!range.days || !list.length) return list;
  const cutoff = asDate(list[list.length - 1]).getTime() - range.days * 864e5;
  return list.filter((r) => asDate(r).getTime() >= cutoff);
}

function bandFor(key, last) {
  if (key === 'fatPct' && isNum(last.fatLow) && isNum(last.fatHigh)) return { low: last.fatLow, high: last.fatHigh, label: 'Desirable range' };
  if (key === 'fatMass' && isNum(last.fatMassLow) && isNum(last.fatMassHigh)) return { low: last.fatMassLow, high: last.fatMassHigh, label: 'Desirable range' };
  return null;
}

// Fat is red and muscle is blue on every screen.
function colorOf(key) {
  if (key === 'fatPct' || key === 'fatMass' || key === 'visceral') return 'var(--red)';
  if (key === 'muscle' || key === 'ffm') return 'var(--blue)';
  return 'var(--canvas-2)';
}

const unitOf = (m) => (m.unit ? ` ${m.unit}` : '');
const chartedIn = (scoped) => METRICS.filter((m) => scoped.some((r) => isNum(r[m.key])));

// ---------- targets ----------

const TARGET_LABELS = { fatPct: 'Body fat', muscle: 'Muscle', visceral: 'Visceral fat', metabolicAge: 'Metabolic age' };
const actualColor = (key) => (key === 'metabolicAge' ? 'var(--canvas)' : colorOf(key));

function until(date) {
  const days = Math.round((date - Date.now()) / 864e5);
  if (days < 0) return 'date passed';
  if (days < 45) {
    const w = Math.max(1, Math.round(days / 7));
    return `in ${w} ${w === 1 ? 'week' : 'weeks'}`;
  }
  return `in ${Math.round(days / 30.44)} months`;
}

// The Targets chart runs from Day One either to just past today, where the
// scans are, or on to one of the milestones. Gold shows the whole plan.
function zoomWindow(plan, list) {
  const start = +plan.start;
  const lastScan = list.length ? +asDate(list[list.length - 1]) : start;
  const tier = plan.tiers.find((t) => t.id === targetZoom);
  if (tier) return { start, end: Math.max(+tier.date, lastScan) };
  const latest = Math.max(lastScan, Date.now());
  return { start, end: latest + Math.max(3 * 864e5, (latest - start) * 0.1) };
}

// The plan line up to the window's end, cut where it leaves the window.
function clipPlan(points, end) {
  const out = [];
  for (const [i, p] of points.entries()) {
    if (+p.t <= end) { out.push(p); continue; }
    const prev = points[i - 1];
    if (prev && +prev.t < end) out.push({ t: new Date(end), y: prev.y + ((end - +prev.t) / (+p.t - +prev.t)) * (p.y - prev.y), cut: true });
    break;
  }
  return out;
}

function targetsCard(plan, list) {
  const m = metricOf(targetKey);
  const unit = unitOf(m);
  const status = planStatus(plan, list, targetKey);
  let statusHtml = '';
  if (status && isNum(status.diff)) {
    statusHtml = status.onPlan
      ? '<span class="status ahead">Right on plan</span>'
      : `<span class="status ${status.ahead ? 'ahead' : 'behind'}">${status.ahead ? 'Ahead of' : 'Behind'} plan by ${fixed(Math.abs(status.diff), m.dec)}${unit}</span>`;
  }
  const rows = plan.tiers.map((t) => {
    const target = t.targets[targetKey];
    const days = (t.date - Date.now()) / 864e5;
    const reached = status && isNum(target) && (m.better < 0 ? status.now <= target : status.now >= target);
    let need = '';
    if (!isNum(target)) need = 'No target';
    else if (reached) need = 'Reached';
    else if (days <= 0) need = 'Not reached';
    else if (status) need = `${signed((target - status.now) / (days / 30.44), Math.max(1, m.dec))}${unit} a month`;
    return `<div class="phase">
      <span class="phase-dot" style="background:${t.color}"></span>
      <div class="phase-main">
        <div class="phase-name">${t.name}${t.label ? ` <span>· ${esc(t.label)}</span>` : ''}</div>
        <div class="fine">${monthLong(t.date)}, ${until(t.date)}</div>
      </div>
      <div class="phase-target"><b>${isNum(target) ? fixed(target, m.dec) : '–'}${isNum(target) && m.unit ? `<small>${esc(m.unit)}</small>` : ''}</b><span class="fine">${need}</span></div>
    </div>`;
  }).join('');
  return `<section class="card">
    <div class="h"><h2>Targets</h2><button class="link-btn" data-edit-targets>Edit</button></div>
    <div class="filters wrap" role="group" aria-label="Target measurement">
      ${TARGET_KEYS.map((k) => `<button class="pill${k === targetKey ? ' on' : ''}" data-target="${k}" aria-pressed="${k === targetKey}">${TARGET_LABELS[k]}</button>`).join('')}
    </div>
    <div class="stat-line" style="margin:12px 0 10px">${statusHtml}${status ? `<span>Now ${fixed(status.now, m.dec)}${esc(unit)}</span>` : ''}</div>
    <div class="filters" role="group" aria-label="Zoom the chart" style="margin-bottom:8px">
      <span class="filters-label">Zoom</span>
      ${[{ id: 'scans', name: 'Scans' }, ...plan.tiers].map((z) => `<button class="pill${z.id === targetZoom ? ' on' : ''}" data-zoom="${z.id}" aria-pressed="${z.id === targetZoom}">${z.name}</button>`).join('')}
    </div>
    <div id="target-chart"></div>
    <div class="legend" style="margin-top:8px">
      <span><i style="background:${actualColor(targetKey)}"></i>Your scans</span>
      <span><i class="dash"></i>Plan</span>
      ${plan.tiers.filter((t) => +t.date <= zoomWindow(plan, list).end).map((t) => `<span><i class="box dot" style="background:${t.color}"></i>${t.name}</span>`).join('')}
    </div>
    <div class="phases">${rows}</div>
    <p class="fine" style="margin-top:10px">Gold is your final goal and also sets your belts. Bronze and Silver sit on a straight line from Day One unless you set your own. Now is the average of your last 3 scans.</p>
  </section>`;
}

function mountTargets(root, plan, list) {
  const el = root.querySelector('#target-chart');
  if (!el) return;
  const m = metricOf(targetKey);
  const unit = unitOf(m);
  const startValue = plan.startValues[targetKey];
  const milestones = plan.tiers.filter((t) => isNum(t.targets[targetKey]));
  const planPoints = [
    ...(isNum(startValue) ? [{ t: plan.start, y: startValue, when: `Day One · ${longDate(plan.start)}`, text: `${fixed(startValue, m.dec)}${unit}` }] : []),
    ...milestones.map((t) => ({ t: t.date, y: t.targets[targetKey], when: `${t.name} · ${monthLong(t.date)}`, text: `${fixed(t.targets[targetKey], m.dec)}${unit}` })),
  ];
  const { start, end } = zoomWindow(plan, list);
  const shown = clipPlan(planPoints, end).map((p) => (p.cut ? { ...p, when: `Plan · ${longDate(p.t)}`, text: `${fixed(p.y, m.dec)}${unit}` } : p));
  lineChart(el, {
    height: 230,
    unit: m.unit,
    dec: m.dec,
    // Under about ten weeks the axis names scan days instead of months.
    monthTicks: end - start > 75 * 864e5,
    xDomain: [new Date(start), new Date(end)],
    today: new Date(),
    series: [
      { id: 'plan', name: 'Plan', color: 'var(--mute)', dash: true, dots: false, raw: true, endLabel: false, points: shown },
      { id: targetKey, name: 'Your scans', color: actualColor(targetKey), points: pointsOf(list, targetKey, flaggedSet(list)) },
    ],
    markers: milestones.filter((t) => +t.date <= end).map((t) => ({ t: t.date, y: t.targets[targetKey], color: t.color })),
    summary: `${m.label}: your scans against the plan from ${longDate(new Date(start))} to ${longDate(new Date(end))}.`,
  });
}

function editTargets(ctx, plan) {
  const { profile } = ctx;
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let yr = Math.min(thisYear, plan.start.getFullYear()); yr <= thisYear + 6; yr++) years.push(yr);

  const blocks = plan.tiers.map((t) => `<fieldset class="phase-edit">
      <legend><span class="phase-dot" style="background:${t.color}"></span>${t.name}</legend>
      <div class="form-grid">
        <div class="form-row"><label for="m-${t.id}">Month</label>
          <select class="input" id="m-${t.id}" data-date>${MONTHS.map((name, i) => `<option value="${i + 1}"${t.date.getMonth() === i ? ' selected' : ''}>${name}</option>`).join('')}</select></div>
        <div class="form-row"><label for="y-${t.id}">Year</label>
          <select class="input" id="y-${t.id}" data-date>${years.map((yr) => `<option${t.date.getFullYear() === yr ? ' selected' : ''}>${yr}</option>`).join('')}</select></div>
        <div class="form-row wide"><label for="l-${t.id}">Name it <small>optional</small></label>
          <input class="input" id="l-${t.id}" maxlength="20" autocomplete="off" placeholder="A wedding, a holiday…" value="${esc(t.label)}"></div>
        ${TARGET_KEYS.map((k) => {
          const m = metricOf(k);
          const v = t.targets[k];
          return `<div class="form-row"><label for="t-${t.id}-${k}">${TARGET_LABELS[k]}${m.unit ? ` <small>${esc(m.unit)}</small>` : ''}</label>
            <input class="input num" id="t-${t.id}-${k}" data-tier="${t.id}" data-key="${k}" inputmode="decimal" autocomplete="off" value="${isNum(v) ? fixed(v, m.dec) : ''}"></div>`;
        }).join('')}
      </div>
    </fieldset>`).join('');

  return sheet(
    `<h3>Targets</h3>
     <p class="sub">Gold is your final goal and also sets your belts. Move a date and Bronze and Silver move with it, unless you typed your own numbers.</p>
     <form data-form>${blocks}
       <p class="field-hint" data-error style="margin-top:12px" hidden></p>
       <div class="sheet-actions">
         <button type="button" class="btn" data-no>Cancel</button>
         <button class="btn gold">Save</button>
       </div>
     </form>`,
    (el, close) => {
      // Numbers the person typed stay put. The rest follow the dates and Gold.
      const typed = new Set(plan.tiers.flatMap((t) => (t.id === 'gold' ? [] : Object.keys(t.custom).filter((k) => isNum(t.custom[k])).map((k) => `${t.id}-${k}`))));
      const dateOf = (id) => new Date(Number(el.querySelector(`#y-${id}`).value), Number(el.querySelector(`#m-${id}`).value) - 1, 1);
      const numberIn = (input) => parseFloat(input.value.replace(',', '.'));
      const follow = () => {
        const goldDate = dateOf('gold');
        for (const t of plan.tiers) {
          if (t.id === 'gold') continue;
          for (const k of TARGET_KEYS) {
            if (typed.has(`${t.id}-${k}`)) continue;
            const goal = numberIn(el.querySelector(`#t-gold-${k}`));
            const v = autoTarget(plan.startValues[k], Number.isFinite(goal) ? goal : null, plan.start, dateOf(t.id), goldDate, metricOf(k).dec);
            el.querySelector(`#t-${t.id}-${k}`).value = isNum(v) ? fixed(v, metricOf(k).dec) : '';
          }
        }
      };
      el.querySelectorAll('[data-date]').forEach((s) => s.addEventListener('change', follow));
      el.querySelectorAll('input[data-tier]').forEach((input) => input.addEventListener('input', () => {
        if (input.dataset.tier === 'gold') follow();
        else typed.add(`${input.dataset.tier}-${input.dataset.key}`);
      }));
      el.querySelector('[data-no]').addEventListener('click', () => close(false));
      el.querySelector('[data-form]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = el.querySelector('[data-error]');
        const fail = (message) => { error.textContent = message; error.hidden = false; };
        const dates = Object.fromEntries(plan.tiers.map((t) => [t.id, dateOf(t.id)]));
        if (!(dates.bronze < dates.silver && dates.silver < dates.gold)) return fail('Put the dates in order: Bronze first, then Silver, then Gold.');
        if (dates.bronze < new Date(plan.start.getFullYear(), plan.start.getMonth(), 1)) return fail('Bronze cannot come before your Day One.');
        const goals = {};
        for (const k of TARGET_KEYS) {
          const v = numberIn(el.querySelector(`#t-gold-${k}`));
          if (!Number.isFinite(v)) return fail('Fill in all four Gold targets with numbers.');
          goals[k] = v;
        }
        const phases = plan.tiers.map((t) => {
          const targets = {};
          if (t.id !== 'gold') {
            for (const k of TARGET_KEYS) {
              const v = numberIn(el.querySelector(`#t-${t.id}-${k}`));
              if (typed.has(`${t.id}-${k}`) && Number.isFinite(v)) targets[k] = v;
            }
          }
          return { tier: t.id, month: monthKeyOf(dates[t.id]), label: el.querySelector(`#l-${t.id}`).value.trim(), targets };
        });
        await store.updateProfile({ ...profile, goals, phases });
        close(true);
      });
    },
  );
}

// ---------- compare ----------

// Any stats can be picked together, and only three colours stay apart for
// every viewer in every combination: red, blue and teal (checked with the
// palette validator, all pairs). Fat-type stats ask for red and muscle-type
// for blue; a picked stat keeps its colour until it is dropped.
const SLOTS = ['red', 'blue', 'teal'];
const SLOT_COLOR = { red: 'var(--red)', blue: 'var(--blue)', teal: 'var(--teal)' };
const FAMILY = { fatPct: 'red', fatMass: 'red', visceral: 'red', obesity: 'red', muscle: 'blue', ffm: 'blue', bmrKcal: 'blue' };
const picksNow = () => store.prefs.compare ?? { fatPct: 'red', muscle: 'blue' };

async function togglePick(key) {
  const picks = { ...picksNow() };
  if (picks[key]) {
    delete picks[key];
  } else {
    const used = new Set(Object.values(picks));
    if (used.size >= SLOTS.length) {
      toast('Three at a time keeps the lines easy to tell apart. Tap one to drop it.');
      return false;
    }
    const want = FAMILY[key] ?? 'teal';
    picks[key] = used.has(want) ? SLOTS.find((s) => !used.has(s)) : want;
  }
  await store.setPrefs({ compare: picks });
  return true;
}

function compareCard(scoped) {
  const picks = picksNow();
  const offered = chartedIn(scoped);
  const chosen = offered.filter((m) => picks[m.key]);
  const chips = offered.map((m) => {
    const slot = picks[m.key];
    return `<button class="pick-chip${slot ? ' on' : ''}" data-pick="${m.key}" aria-pressed="${Boolean(slot)}">${slot ? `<i style="background:${SLOT_COLOR[slot]}"></i>` : ''}${esc(m.label)}</button>`;
  }).join('');
  let body;
  if (!chosen.length) body = '<p class="sub" style="margin-top:12px">Pick up to three stats above.</p>';
  else if (scoped.length < 2) body = '<p class="sub" style="margin-top:12px">This needs two scans in the range.</p>';
  else {
    body = `<div id="compare" style="margin-top:14px"></div>
      <p class="fine" style="margin-top:6px">Each line shows the % change since ${shortDate(asDate(scoped[0]))}, so stats in different units share one scale. Touch the chart for the real numbers.</p>`;
  }
  return `<section class="card">
    <div class="h"><h2>Compare stats</h2><span class="aside">Pick up to 3</span></div>
    <div class="chips" role="group" aria-label="Stats to compare">${chips}</div>
    ${body}
  </section>`;
}

function mountCompare(root, scoped, list) {
  const el = root.querySelector('#compare');
  if (!el) return;
  const picks = picksNow();
  const flagged = flaggedSet(list);
  const series = chartedIn(scoped).filter((m) => picks[m.key]).map((m) => {
    const rows = scoped.filter((r) => isNum(r[m.key]));
    const base = rows[0]?.[m.key];
    const points = isNum(base) && base !== 0 ? rows.map((r) => {
      const pct = ((r[m.key] - base) / Math.abs(base)) * 100;
      return { t: asDate(r), y: pct, flagged: flagged.has(r.id), text: `${fixed(r[m.key], m.dec)}${unitOf(m)} (${signed(pct, 1)}%)` };
    }) : [];
    return { id: m.key, name: m.label, color: SLOT_COLOR[picks[m.key]], points };
  }).filter((s) => s.points.length);
  if (!series.length) return;
  lineChart(el, {
    height: 230,
    unit: '%',
    dec: 1,
    zero: true,
    signedValues: true,
    series,
    summary: `Percentage change since ${longDate(asDate(scoped[0]))} for ${series.map((s) => s.name).join(', ')}.`,
  });
}

// ---------- one chart per stat ----------

const PHASE_NOTE = 'Worked out from R and X at 50 kHz in the bioelectrical data on your slip. '
  + 'It reflects how much healthy cell tissue, mostly muscle, you carry for your body water, so higher is generally better. '
  + 'Healthy adults usually read about 5 to 8°, men higher than women. Scanners differ, so follow your own trend.';

function metricCard(m, scoped) {
  const withValue = scoped.filter((r) => isNum(r[m.key]));
  const first = withValue[0];
  const last = withValue[withValue.length - 1];
  const band = bandFor(m.key, last);
  const rows = [...withValue].reverse().map((r, i, arr) => {
    const older = arr[i + 1];
    const d = asDate(r);
    return `<tr><td>${longDate(d)} <span class="fine">${clock(d)}</span></td><td>${fixed(r[m.key], m.dec)}</td><td>${older ? deltaHtml(r[m.key] - older[m.key], m) : ''}</td></tr>`;
  }).join('');
  return `<section class="card">
    <div class="h" style="margin-bottom:4px"><h2>${esc(m.label)}</h2>${m.hint ? `<span class="aside">${esc(m.hint)}</span>` : ''}</div>
    <div class="big-stat"><strong>${fixed(last[m.key], m.dec)}${m.unit ? `<small>${esc(m.unit)}</small>` : ''}</strong></div>
    <div class="stat-line">
      ${first !== last ? `<span>${deltaHtml(last[m.key] - first[m.key], m)} in this period</span>` : ''}
      <span>${withValue.length} ${withValue.length === 1 ? 'scan' : 'scans'}</span>
    </div>
    <div data-chart="${m.key}"></div>
    ${band ? `<p class="fine" style="margin-top:6px">Desirable range on your slip: ${fixed(band.low, 1)} to ${fixed(band.high, 1)}${esc(unitOf(m))}</p>` : ''}
    ${m.key === 'phase' ? `<p class="fine" style="margin-top:6px">${PHASE_NOTE}</p>` : ''}
    <details class="numbers">
      <summary>See the numbers</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>${esc(m.unit || 'Value')}</th><th>Change</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </details>
  </section>`;
}

export const charts = {
  render(ctx) {
    const { list, profile, goals } = ctx;
    if (!list.length) {
      return `${header(ctx)}<main class="page"><section class="card"><div class="h"><h2>No rounds yet</h2></div>
        <p class="sub">Charts appear after your first scan.</p><a class="btn gold block" href="#/scan" style="margin-top:12px">Scan a slip</a></section></main>`;
    }
    const scoped = inRange(list);
    const plan = planFor(list, profile.phases, goals);
    return `${header(ctx)}<main class="page">
      ${targetsCard(plan, list)}
      <div class="filters" role="group" aria-label="Time range">
        <span class="filters-label">Range</span>
        ${RANGES.map((r) => `<button class="pill${r.id === rangeId ? ' on' : ''}" data-range="${r.id}" aria-pressed="${r.id === rangeId}">${r.label}</button>`).join('')}
      </div>
      ${compareCard(scoped)}
      ${chartedIn(scoped).map((m) => metricCard(m, scoped)).join('')}
    </main>`;
  },
  mount(root, ctx) {
    wireHeader(root, ctx.rerender);
    const again = () => ctx.rerender({ keepScroll: true });
    root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { rangeId = b.dataset.range; again(); }));
    root.querySelectorAll('[data-target]').forEach((b) => b.addEventListener('click', () => { targetKey = b.dataset.target; again(); }));
    root.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => { targetZoom = b.dataset.zoom; again(); }));
    root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => { if (await togglePick(b.dataset.pick)) again(); }));
    const { list, profile, goals } = ctx;
    if (!list.length) return;
    const plan = planFor(list, profile.phases, goals);
    root.querySelector('[data-edit-targets]')?.addEventListener('click', async () => {
      if (await editTargets(ctx, plan)) { toast('Targets saved'); again(); }
    });
    mountTargets(root, plan, list);
    const scoped = inRange(list);
    mountCompare(root, scoped, list);
    const flagged = flaggedSet(list);
    for (const m of chartedIn(scoped)) {
      const last = scoped.filter((r) => isNum(r[m.key])).pop();
      lineChart(root.querySelector(`[data-chart="${m.key}"]`), {
        height: 190,
        unit: m.unit,
        dec: m.dec,
        band: bandFor(m.key, last),
        series: [{ id: m.key, name: m.label, color: colorOf(m.key), points: pointsOf(scoped, m.key, flagged) }],
        summary: `${m.label} over time.`,
      });
    }
  },
};
