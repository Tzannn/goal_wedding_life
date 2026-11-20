import { asDate, coachNotes, fighterCard, fixed, headline, isNum, longDate, metricOf, nextScan, RANK_NAMES, rankOf, shortDate, signed, STATS, weekStreak } from '../model.js';
import { lineChart } from '../charts.js';
import { store } from '../store.js';
import { countUp, esc, icon } from '../ui.js';
import { bandScale, deltaHtml, duo, flaggedSet, header, pointsOf, radar, wireHeader } from './common.js';
import { milestoneAhead, teamPeople } from './team.js';

const NOTE_ICON = { caution: icon.alert, fire: icon.flame, plan: icon.target };

function emptyHome(ctx) {
  return `${header(ctx)}<main class="page">
    <section class="poster">
      <p class="poster-kicker"><span>You vs Day One</span><span>Round 1</span></p>
      <div class="poster-number" style="font-size:clamp(84px,27vw,132px)">Day One</div>
      <p class="poster-label">starts with one scan</p>
      <div class="poster-cta">
        <a class="btn gold block" href="#/scan">${icon.camera(22)} Scan your first slip</a>
        <a class="btn block" href="#/new">Key it in instead</a>
      </div>
    </section>
    <section class="card">
      <div class="h"><h2>How the fight works</h2></div>
      <p class="sub">Every Tanita scan is a round. Your opponent is the body you started with. Losing fat and building muscle wins rounds, even when the scale goes up.</p>
    </section>
  </main>`;
}

function poster(h) {
  if (h.rounds < 2) {
    return `<section class="poster">
      <p class="poster-kicker"><span>You vs Day One</span><span>Round 1</span></p>
      <div class="poster-number" style="font-size:clamp(84px,27vw,132px)">Day One</div>
      <p class="poster-label">your baseline is on the card</p>
      <div class="poster-cta"><a class="btn gold block" href="#/scan">${icon.camera(22)} Scan round 2</a></div>
    </section>`;
  }
  const gain = isNum(h.transformed) ? h.transformed : 0;
  const label = gain >= 0 ? 'of your body transformed' : 'behind Day One';
  return `<section class="poster">
    <p class="poster-kicker"><span>You vs Day One</span><span>${h.days} ${h.days === 1 ? 'day' : 'days'} in</span></p>
    <div class="poster-number"><span id="hero-num">${Math.abs(gain).toFixed(1)}</span><span class="unit">kg</span></div>
    <p class="poster-label">${label}</p>
    <div class="corners">
      <div class="corner red">
        <span class="corner-tag">Fat</span>
        <strong>${signed(h.fat, 1)}<small>kg</small></strong>
      </div>
      <div class="corner blue">
        <span class="corner-tag">Muscle</span>
        <strong>${signed(h.muscle, 1)}<small>kg</small></strong>
      </div>
    </div>
    <p class="poster-foot"><span>${esc(h.verdict)}</span><span>The scale only says ${signed(h.weight, 1)} kg</span></p>
  </section>`;
}

function notesCard(list) {
  const notes = coachNotes(list);
  if (!notes.length) return '';
  return `<section class="notes" aria-label="Coach's notes">${notes.map((n) => `
    <div class="note ${n.tone}">
      <div class="note-tag">${NOTE_ICON[n.tone](16)}${esc(n.tag)}</div>
      <p>${esc(n.body)}</p>
    </div>`).join('')}</section>`;
}

function nextCard(list) {
  const nx = nextScan(list);
  const streak = weekStreak(list);
  const when = nx.daysUntil > 1 ? `in ${nx.daysUntil} days, ${shortDate(nx.due)}`
    : nx.daysUntil === 1 ? 'tomorrow'
      : nx.daysUntil === 0 ? 'today'
        : `${Math.abs(nx.daysUntil)} ${Math.abs(nx.daysUntil) === 1 ? 'day' : 'days'} overdue`;
  return `<section class="card">
    <div class="h" style="margin-bottom:6px"><h2>Round ${list.length + 1}</h2><span class="aside">${streak} ${streak === 1 ? 'week' : 'weeks'} in a row</span></div>
    <p class="sub">Due ${when}. Same time of day, before food and training.</p>
    <a class="btn gold block" href="#/scan" style="margin-top:12px">${icon.camera(22)} Scan a slip</a>
  </section>`;
}

function road(list, goals) {
  const r = rankOf(list, goals);
  const pct = Math.round(r.score * 100);
  const toNext = r.next ? Math.max(1, Math.ceil((r.to - r.score) * 100)) : 0;
  const belts = r.belts.map((b) => {
    const nowText = isNum(b.now) ? `${fixed(b.now, b.dec)}${b.unit ? ` ${b.unit}` : ''}` : '–';
    return `<div>
      <div class="belt-mini-name"><span>${esc(b.name)}</span><span>${Math.round(b.progress * 100)}%</span></div>
      <div class="meter"><i style="width:${(b.progress * 100).toFixed(1)}%"></i></div>
      <div class="belt-mini-to">${esc(b.label)} ${nowText} → ${fixed(b.goal, b.dec)}</div>
    </div>`;
  }).join('');
  const stops = RANK_NAMES.slice(1, -1).map((_, i) => `<span class="ladder-stop" style="left:${(i + 1) * 20}%"></span>`).join('');
  return `<section class="card">
    <div class="h"><h2>Road to champion</h2><a href="#/belts">Belts</a></div>
    <div class="road-head"><span class="rank-name">${esc(r.name)}</span><span class="road-pct">${pct}%</span></div>
    <div class="ladder" role="img" aria-label="${pct}% of the way to Undisputed">
      <div class="ladder-fill" style="width:${(r.score * 100).toFixed(1)}%"></div>${stops}
    </div>
    <div class="ladder-names">${RANK_NAMES.filter((_, i) => i === 0 || i === RANK_NAMES.length - 1 || i === r.index).map((n) => `<span class="${n === r.name ? 'on' : ''}">${esc(n)}</span>`).join('')}</div>
    <p class="road-next">${r.next ? `${toNext}% more to reach ${esc(r.next)}. Scored on your last 3 scans, so one good or bad day can't move it.` : 'You hold all four belts.'}</p>
    <div class="belts-mini">${belts}</div>
  </section>`;
}

const TAPE_KEYS = ['fatMass', 'fatPct', 'muscle', 'weight', 'visceral', 'metabolicAge', 'bmrKcal'];

// Now against Day One, or against the scan before it.
function tape(list) {
  const last = list[list.length - 1];
  const canPick = list.length > 2;
  const mode = canPick && store.prefs.tapeBase === 'previous' ? 'previous' : 'first';
  const base = mode === 'previous' ? list[list.length - 2] : list[0];
  const baseName = mode === 'previous' ? 'Previous' : 'Day One';
  const rows = TAPE_KEYS.filter((k) => isNum(base[k]) && isNum(last[k])).map((k) => {
    const m = { ...metricOf(k), dec: 1 };
    return `<tr>
      <td>${esc(m.label)}${m.unit ? ` <span class="fine">${esc(m.unit)}</span>` : ''}</td>
      <td class="day-one">${fixed(base[k], m.dec)}</td>
      <td>${fixed(last[k], m.dec)}</td>
      <td>${deltaHtml(last[k] - base[k], m)}</td>
    </tr>`;
  }).join('');
  const choice = (id, label) => `<button class="pill${mode === id ? ' on' : ''}" data-tape="${id}" aria-pressed="${mode === id}">${label}</button>`;

  const bar = (r, label) => {
    if (!isNum(r.fatMass) || !isNum(r.muscle) || !isNum(r.weight)) return '';
    const parts = [
      { cls: 'fat', v: r.fatMass, name: 'Fat' },
      { cls: 'muscle', v: r.muscle, name: 'Muscle' },
      ...(isNum(r.bone) ? [{ cls: 'bone', v: r.bone, name: 'Bone' }] : []),
    ];
    const total = parts.reduce((s, p) => s + p.v, 0);
    return `<div class="comp-row">
      <span class="comp-name">${label}</span>
      <div class="segbar" role="img" aria-label="${label}: ${parts.map((p) => `${p.name} ${p.v.toFixed(1)} kg`).join(', ')}">
        ${parts.map((p) => {
          const share = (p.v / total) * 100;
          return `<div class="seg ${p.cls}" style="flex:${p.v} 1 0" title="${p.name} ${p.v.toFixed(1)} kg">${share >= 16 ? `${share.toFixed(1)}%` : ''}</div>`;
        }).join('')}
      </div>
    </div>`;
  };

  return `<section class="card">
    <div class="h"><h2>Tale of the tape</h2><span class="aside">${shortDate(asDate(base))} vs ${shortDate(asDate(last))}</span></div>
    ${canPick ? `<div class="filters" role="group" aria-label="Compare Now with" style="margin-bottom:12px">${choice('first', 'vs Day One')}${choice('previous', 'vs Previous scan')}</div>` : ''}
    <table class="tape">
      <thead><tr><th></th><th>${baseName}</th><th>Now</th><th>Change</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="comp">
      ${bar(base, baseName)}
      ${bar(last, 'Now')}
      <div class="legend"><span><i class="box" style="background:var(--red)"></i>Fat</span><span><i class="box" style="background:var(--blue)"></i>Muscle</span><span><i class="box" style="background:#58617a"></i>Bone</span></div>
    </div>
  </section>`;
}

// A game-style hexagon, then each rating against its benchmarks. Ratings and
// their meaning live in the model.
function fighterStats(list, profile) {
  const card = fighterCard(list, profile.sex ?? list[list.length - 1]?.gender ?? 'male');
  if (!card) return '';
  const multi = list.length > 1;
  const svg = radar([
    ...(multi ? [{ ratings: card.start, color: 'var(--canvas-2)', dash: true }] : []),
    { ratings: card.now, color: 'var(--gold)', fill: 0.22, dots: true },
  ], (s) => `<tspan class="rad-name">${s.name.toUpperCase()}</tspan><tspan class="rad-val" dx="6">${isNum(card.now[s.id]) ? card.now[s.id] : '–'}</tspan>`);

  const said = STATS.map((s) => `${s.name} ${isNum(card.now[s.id]) ? card.now[s.id] : 'not rated'}`).join(', ');
  const change = isNum(card.ovrStart) && multi ? card.ovr - card.ovrStart : null;
  const rows = STATS.filter((s) => card.details[s.id]).map((s) => {
    const d = card.details[s.id];
    const moved = multi && isNum(d.start) ? d.score - d.start : null;
    return `<li class="stat-row">
      <div class="stat-head">
        <b>${s.name}</b>
        <span class="stat-band">${d.band}</span>
        ${isNum(moved) && moved !== 0 ? `<span class="delta ${moved > 0 ? 'good' : 'bad'}" title="Since Day One">${signed(moved, 0)}</span>` : ''}
        <span class="stat-score">${d.score}<small>/99</small></span>
      </div>
      <div class="stat-bar" role="img" aria-label="${s.name}: ${d.score} out of 99, ${d.band}. The mark shows 60, the healthy line."><i style="width:${((d.score / 99) * 100).toFixed(1)}%"></i></div>
      <p class="fine">${esc(d.measure)}. ${esc(d.bench)}</p>
    </li>`;
  }).join('');
  return `<section class="card">
    <div class="h" style="align-items:center"><h2>Fighter stats</h2><div class="ovr"><strong>${card.ovr}</strong><span>OVR</span></div></div>
    <p class="sub">Every stat is out of 99, and 60 is the healthy line. Overall you're ${card.band}${isNum(change) && change !== 0 ? `, ${signed(change, 0)} since Day One` : ''}.</p>
    <div class="radar"><svg viewBox="0 0 360 300" role="img" aria-label="Fighter stats out of 99. ${esc(said)}.">${svg}</svg></div>
    <div class="legend" style="justify-content:center">
      <span><i style="background:var(--gold)"></i>Now, last 3 scans</span>
      ${multi ? '<span><i class="dash"></i>Day One</span>' : ''}
      <span><i class="ring"></i>60, the healthy line</span>
    </div>
    ${bandScale()}
    <ul class="stat-rows">${rows}</ul>
    <p class="fine" style="margin-top:14px">Numbers are the average of your last 3 scans. These are this app's own scales, built on the ranges printed on your slip and common references, for motivation rather than a medical score.</p>
  </section>`;
}

// A way in to the side-by-side page once there are two people.
function togetherCard() {
  if (store.profiles.length < 2) return '';
  const ps = teamPeople();
  const ms = milestoneAhead(ps);
  const soon = ms ? ` · ${esc(ms.label || ms.tier.name)} in ${ms.weeks >= 2 ? `${ms.weeks} weeks` : `${ms.days} ${ms.days === 1 ? 'day' : 'days'}`}` : '';
  return `<a class="card teaser" href="#/team">
    ${duo()}
    <span class="teaser-main"><b>Together</b><span class="fine">${ps.map((x) => esc(x.profile.name)).join(' and ')} side by side${soon}</span></span>
    <span class="teaser-go" aria-hidden="true">${icon.back(22)}</span>
  </a>`;
}

function gapCard(list) {
  const flagged = flaggedSet(list);
  const anyFlag = flagged.size > 0;
  return `<section class="card">
    <div class="h"><h2>The gap</h2><a href="#/charts">All charts</a></div>
    <div id="gap-chart"></div>
    <div class="legend" style="margin-top:8px">
      <span><i style="background:var(--blue)"></i>Muscle</span>
      <span><i style="background:var(--red)"></i>Fat</span>
      ${anyFlag ? '<span><i class="hollow"></i>Unusual time of day</span>' : ''}
    </div>
    <p class="fine" style="margin-top:6px">Change in kg since Day One. A wider gap means more of you has been rebuilt.</p>
  </section>`;
}

export function mountGap(el, list, height = 210) {
  const flagged = flaggedSet(list);
  const first = list[0];
  lineChart(el, {
    height,
    unit: 'kg',
    dec: 1,
    zero: true,
    signedValues: true,
    area: true,
    series: [
      { id: 'muscle', name: 'Muscle', color: 'var(--blue)', points: pointsOf(list, 'muscle', flagged, first.muscle) },
      { id: 'fat', name: 'Fat', color: 'var(--red)', points: pointsOf(list, 'fatMass', flagged, first.fatMass) },
    ],
    summary: `Change in muscle and fat in kilograms since ${longDate(asDate(first))}.`,
  });
}

export const home = {
  render(ctx) {
    if (!ctx.list.length) return emptyHome(ctx);
    const { list, goals } = ctx;
    const h = headline(list);
    return `${header(ctx)}<main class="page wide">
      <div class="col">
        ${poster(h)}
        ${notesCard(list)}
        ${list.length > 1 ? nextCard(list) : ''}
        ${togetherCard()}
      </div>
      <div class="col">
        ${road(list, goals)}
        ${fighterStats(list, ctx.profile)}
        ${list.length > 1 ? gapCard(list) : ''}
        ${list.length > 1 ? tape(list) : ''}
      </div>
    </main>`;
  },
  mount(root, ctx) {
    wireHeader(root, ctx.rerender);
    const { list } = ctx;
    if (!list.length) return;
    const h = headline(list);
    const num = root.querySelector('#hero-num');
    if (num && isNum(h.transformed)) countUp(num, Math.abs(h.transformed));
    const gap = root.querySelector('#gap-chart');
    if (gap && list.length > 1 && isNum(list[0].muscle) && isNum(list[0].fatMass)) mountGap(gap, list);
    root.querySelectorAll('[data-tape]').forEach((b) => b.addEventListener('click', async () => {
      await store.setPrefs({ tapeBase: b.dataset.tape });
      ctx.rerender({ keepScroll: true });
    }));
  },
};
