// Both people side by side: a shared countdown, each on the road to their own
// milestone, change since each Day One, and the two fighter cards.

import {
  fighterCard, fixed, isNum, metricOf, monthLong, nextTier, planFor,
  STATS, TARGET_KEYS, TIERS, tierProgress, timelineOf, weekStreak,
} from '../model.js';
import { lineChart } from '../charts.js';
import { store } from '../store.js';
import { esc, icon } from '../ui.js';
import { bandScale, colorOfPerson, duo, flaggedSet, openProfiles, pointsOf, radar } from './common.js';

const LABELS = { fatPct: 'Body fat', muscle: 'Muscle', visceral: 'Visceral fat', metabolicAge: 'Metabolic age' };
const SIDE = [
  { key: 'fatPct', label: 'Body fat', unit: 'pts', note: 'Body fat change in percentage points. Below zero is fat lost.' },
  { key: 'fatMass', label: 'Fat mass', unit: 'kg', note: 'Fat mass change in kg. Below zero is fat lost.' },
  { key: 'muscle', label: 'Muscle', unit: 'kg', note: 'Muscle change in kg. Above zero is muscle gained.' },
  { key: 'weight', label: 'Weight', unit: 'kg', note: 'Weight change in kg. The scale alone cannot tell fat from muscle.' },
];

let tierPick = null;
let sideKey = 'fatPct';

export function teamPeople() {
  return store.profiles.slice(0, 2).map((profile) => {
    const list = store.listFor(profile.id);
    const goals = store.goalsFor(profile, list);
    return {
      profile,
      list,
      trainings: store.trainingsFor(profile.id),
      goals,
      color: colorOfPerson(profile.id),
      sex: profile.sex ?? list[list.length - 1]?.gender ?? 'male',
      plan: list.length ? planFor(list, profile.phases, goals) : null,
    };
  });
}

// The soonest milestone either of you has ahead, with the name you gave it.
export function milestoneAhead(ps, today = new Date()) {
  const ahead = ps.filter((x) => x.plan).map((x) => nextTier(x.plan, today)).filter((t) => t.date > today);
  if (!ahead.length) return null;
  const tier = ahead.reduce((a, b) => (b.date < a.date ? b : a));
  const label = ahead.filter((t) => +t.date === +tier.date).map((t) => t.label).find(Boolean) || '';
  const days = Math.ceil((tier.date - today) / 864e5);
  return { tier, label, days, weeks: Math.floor(days / 7) };
}

const nameTag = (x) => `<span class="duel-name"><i style="background:${x.color}"></i>${esc(x.profile.name)}</span>`;

function teamHeader() {
  return `<header class="top">
    <button class="who" data-open-profiles aria-label="Switch person">
      ${duo()}
      <span class="who-name">Together</span>
      ${icon.down(18)}
    </button>
    <div class="top-right"><a class="icon-btn" href="#/settings" aria-label="Settings">${icon.gear(22)}</a></div>
  </header>`;
}

function poster(ps, ms) {
  const corner = (x, side) => {
    const all = timelineOf(x.list, x.trainings);
    const n = all.length;
    const streak = weekStreak(all);
    return `<div class="corner ${side}">
      <span class="corner-tag" style="--tag:${x.color}">${esc(x.profile.name)}</span>
      <strong>${n}<small>${n === 1 ? 'round' : 'rounds'}</small></strong>
      <span class="corner-sub">${streak} ${streak === 1 ? 'week' : 'weeks'} in a row</span>
    </div>`;
  };
  let middle = '<div class="poster-number" style="font-size:clamp(64px,20vw,104px)">All done</div><p class="poster-label">every milestone has passed</p>';
  if (ms) {
    const [n, unit] = ms.weeks >= 2 ? [ms.weeks, 'weeks'] : [ms.days, ms.days === 1 ? 'day' : 'days'];
    middle = `<div class="poster-number"><span>${n}</span><span class="unit">${unit}</span></div>
      <p class="poster-label">to go · ${monthLong(ms.tier.date)}</p>`;
  }
  return `<section class="poster team">
    <p class="poster-kicker"><span>Together</span><span>${ms ? `${ms.tier.name}${ms.label ? ` · ${esc(ms.label)}` : ''}` : ''}</span></p>
    ${middle}
    <div class="corners">${corner(ps[0], 'left')}${corner(ps[1], 'right')}</div>
  </section>`;
}

function roadCard(ps, ms) {
  const tierId = tierPick ?? ms?.tier.id ?? 'gold';
  const def = TIERS.find((t) => t.id === tierId);
  const planned = ps.filter((x) => x.plan).map((x) => ({ x, t: x.plan.tiers.find((t) => t.id === tierId) }));
  const months = [...new Set(planned.map(({ t }) => monthLong(t.date)))];
  const when = months.length <= 1 ? (months[0] ?? '') : planned.map(({ x, t }) => `${esc(x.profile.name)} ${monthLong(t.date)}`).join(' · ');
  const labels = [...new Set(planned.map(({ t }) => t.label).filter(Boolean))];

  const blocks = TARGET_KEYS.map((key) => {
    const m = metricOf(key);
    const rows = ps.map((x) => {
      const p = x.plan ? tierProgress(x.plan, x.list, key, tierId) : null;
      if (!p) return `<div class="duel"><div class="duel-top">${nameTag(x)}<span class="fine">${x.list.length ? 'No target set' : 'No scans yet'}</span></div></div>`;
      const pct = Math.round(p.done * 100);
      const expected = isNum(p.expected) ? Math.round(p.expected * 100) : null;
      return `<div class="duel">
        <div class="duel-top">
          ${nameTag(x)}
          <span class="duel-vals">${fixed(p.now, m.dec)} → ${fixed(p.target, m.dec)}${m.unit ? `<small> ${esc(m.unit)}</small>` : ''}</span>
          <span class="duel-pct">${pct}%</span>
        </div>
        <div class="duel-bar" role="img" aria-label="${esc(x.profile.name)}: ${pct}% of the way to ${def.name}${isNum(expected) ? `. The plan puts you at ${expected}% today` : ''}.">
          <i style="width:${(p.done * 100).toFixed(1)}%;background:${x.color}"></i>
          ${isNum(expected) ? `<em style="left:${(p.expected * 100).toFixed(1)}%"></em>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class="duel-block"><div class="duel-label">${LABELS[key]}</div>${rows}</div>`;
  }).join('');

  return `<section class="card">
    <div class="h"><h2>Road to ${def.name}</h2></div>
    <div class="filters" role="group" aria-label="Milestone">
      ${TIERS.map((t) => `<button class="pill${t.id === tierId ? ' on' : ''}" data-tier="${t.id}" aria-pressed="${t.id === tierId}">${t.name}</button>`).join('')}
    </div>
    <p class="sub" style="margin-top:10px">${when}${labels.length ? ` · ${labels.map(esc).join(' / ')}` : ''}</p>
    ${blocks}
    <div class="legend" style="margin-top:12px"><span><i class="tick"></i>Where the plan puts you today</span></div>
    <p class="fine" style="margin-top:6px">Each bar runs from that person's own Day One to their own ${def.name} target, so different starting points stay fair. Now is the average of the last 3 scans. Change targets on each person's Charts tab.</p>
  </section>`;
}

function sideCard(ps) {
  const def = SIDE.find((s) => s.key === sideKey);
  const anyFlag = ps.some((x) => flaggedSet(x.list).size > 0);
  return `<section class="card">
    <div class="h"><h2>Side by side</h2><span class="aside">Since each Day One</span></div>
    <div class="filters wrap" role="group" aria-label="Measurement">
      ${SIDE.map((s) => `<button class="pill${s.key === sideKey ? ' on' : ''}" data-side="${s.key}" aria-pressed="${s.key === sideKey}">${s.label}</button>`).join('')}
    </div>
    <div id="side-chart" style="margin-top:14px"></div>
    <div class="legend" style="margin-top:8px">
      ${ps.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.profile.name)}</span>`).join('')}
      ${anyFlag ? '<span><i class="hollow"></i>Unusual time of day</span>' : ''}
    </div>
    <p class="fine" style="margin-top:6px">${def.note} Both lines start at zero on your own Day One, so different bodies compare fairly.</p>
  </section>`;
}

function mountSide(root, ps) {
  const el = root.querySelector('#side-chart');
  if (!el) return;
  const def = SIDE.find((s) => s.key === sideKey);
  const m = metricOf(def.key);
  const series = ps.map((x) => {
    const rows = x.list.filter((r) => isNum(r[def.key]));
    if (!rows.length) return null;
    return { id: x.profile.id, name: x.profile.name, color: x.color, points: pointsOf(x.list, def.key, flaggedSet(x.list), rows[0][def.key]) };
  }).filter(Boolean);
  if (!series.length) {
    el.innerHTML = '<p class="sub">No scans yet.</p>';
    return;
  }
  lineChart(el, {
    height: 220,
    unit: def.unit,
    dec: m.dec,
    zero: true,
    signedValues: true,
    series,
    summary: `${def.label} change since each person's own Day One: ${series.map((s) => s.name).join(' and ')}.`,
  });
}

function fightersCard(ps) {
  const cards = ps.map((x) => ({ x, card: x.list.length ? fighterCard(x.list, x.sex) : null }));
  const have = cards.filter((c) => c.card);
  if (!have.length) return '';
  const svg = radar(have.map((c) => ({ ratings: c.card.now, color: c.x.color, fill: 0.12, dots: true })), (s) => `<tspan class="rad-name">${s.name.toUpperCase()}</tspan>`);
  const said = have.map((c) => `${c.x.profile.name}: ${STATS.map((s) => `${s.name} ${c.card.now[s.id] ?? 'not rated'}`).join(', ')}`).join('. ');
  const cell = (c, id) => (c.card && isNum(c.card.now[id]) ? c.card.now[id] : '–');
  return `<section class="card">
    <div class="h"><h2>Fighter stats</h2><span class="aside">Out of 99</span></div>
    <div class="radar"><svg viewBox="0 0 360 300" role="img" aria-label="Fighter stats out of 99. ${esc(said)}.">${svg}</svg></div>
    <div class="legend" style="justify-content:center">
      ${have.map((c) => `<span><i style="background:${c.x.color}"></i>${esc(c.x.profile.name)}</span>`).join('')}
      <span><i class="ring"></i>60, the healthy line</span>
    </div>
    <table class="duo-table">
      <thead><tr><th></th>${cards.map((c) => `<th>${nameTag(c.x)}</th>`).join('')}</tr></thead>
      <tbody>
        ${STATS.map((s) => `<tr><td>${s.name}</td>${cards.map((c) => `<td>${cell(c, s.id)}</td>`).join('')}</tr>`).join('')}
        <tr class="ovr-row"><td>Overall</td>${cards.map((c) => `<td>${c.card ? `${c.card.ovr} <small>${c.card.band}</small>` : '–'}</td>`).join('')}</tr>
      </tbody>
    </table>
    ${bandScale()}
    <p class="fine" style="margin-top:10px">Each of you is rated against your own slip's ranges and the references for your sex, so the numbers compare fairly. Your own Ring tab spells out what each one is measured on.</p>
  </section>`;
}

export const team = {
  render() {
    const ps = teamPeople();
    if (ps.length < 2) {
      return `${teamHeader()}<main class="page"><section class="card">
        <div class="h"><h2>Together</h2></div>
        <p class="sub">Add a second person to see both of you side by side.</p>
        <a class="btn gold block" href="#/settings" style="margin-top:12px">Add a second person</a>
      </section></main>`;
    }
    const ms = milestoneAhead(ps);
    return `${teamHeader()}<main class="page wide">
      <div class="col">
        ${poster(ps, ms)}
        ${roadCard(ps, ms)}
      </div>
      <div class="col">
        ${sideCard(ps)}
        ${fightersCard(ps)}
      </div>
    </main>`;
  },
  mount(root, ctx) {
    root.querySelector('[data-open-profiles]')?.addEventListener('click', () => openProfiles(ctx.rerender));
    const again = () => ctx.rerender({ keepScroll: true });
    root.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => { tierPick = b.dataset.tier; again(); }));
    root.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { sideKey = b.dataset.side; again(); }));
    const ps = teamPeople();
    if (ps.length >= 2) mountSide(root, ps);
  },
};
