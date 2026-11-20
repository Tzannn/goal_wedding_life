// Pieces shared between screens.

import { store } from '../store.js';
import { asDate, BANDS, dayKeyOf, daysBetween, isNum, isUnusualTime, longDate, metricOf, signed, STATS, timelineOf, usualMinutes } from '../model.js';
import { esc, icon, sheet } from '../ui.js';

export const initial = (name) => esc((name || '?').trim().charAt(0).toUpperCase());

// Each person keeps one colour wherever the two of them are shown together.
// Checked with the palette validator against the card colour, all pairs.
export const PERSON_COLORS = ['var(--p1)', 'var(--p2)'];
export const colorOfPerson = (id) => PERSON_COLORS[Math.max(0, store.profiles.findIndex((p) => p.id === id))] ?? PERSON_COLORS[0];

export const duo = () => `<span class="duo">${store.profiles.slice(0, 2).map((p) => `<span class="avatar" style="background:${colorOfPerson(p.id)}">${initial(p.name)}</span>`).join('')}</span>`;

// What a fighter-stat number means, low to high.
export const bandScale = () => `<div class="bands" role="list" aria-label="What the numbers mean">${[...BANDS].reverse().map((b) => `<span role="listitem"><b>${b.min}–${b.max}</b>${b.name}</span>`).join('')}</div>`;

// The fighter-card hexagon. Layers draw in order: { ratings, color, fill, dash, dots }.
// Rings sit on the score bands, and the 60 ring, the healthy line, is brighter.
export function radar(layers, labelOf) {
  const cx = 180, cy = 150, R = 96;
  const angle = (i) => -Math.PI / 2 + (i * Math.PI) / 3;
  const at = (i, f) => [cx + Math.cos(angle(i)) * R * f, cy + Math.sin(angle(i)) * R * f];
  const shape = (f) => STATS.map((_, i) => at(i, f(i)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const share = (ratings, i) => (isNum(ratings[STATS[i].id]) ? ratings[STATS[i].id] : 0) / 99;

  let svg = '';
  for (const level of [40, 60, 75, 90, 99]) {
    const healthy = level === 60;
    svg += `<polygon points="${shape(() => level / 99)}" fill="none" stroke="${healthy ? 'var(--canvas-2)' : 'var(--rope)'}" stroke-opacity="${healthy ? 0.6 : 1}" stroke-width="${healthy || level === 99 ? 1.5 : 1}"/>`;
  }
  STATS.forEach((_, i) => {
    const [x, y] = at(i, 1);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--rope)" stroke-width="1"/>`;
  });
  for (const layer of layers) {
    svg += `<polygon points="${shape((i) => share(layer.ratings, i))}" fill="${layer.fill ? layer.color : 'none'}" fill-opacity="${layer.fill || 0}" stroke="${layer.color}" stroke-width="${layer.dash ? 1.5 : 2}"${layer.dash ? ' stroke-dasharray="4 4"' : ''} stroke-linejoin="round"/>`;
    if (layer.dots) {
      STATS.forEach((_, i) => {
        const [x, y] = at(i, share(layer.ratings, i));
        svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${layer.color}"/>`;
      });
    }
  }
  const [rx, ry] = at(0, 60 / 99);
  svg += `<text class="rad-ring" x="${(rx - 6).toFixed(1)}" y="${(ry + 4).toFixed(1)}" text-anchor="end">60</text>`;
  STATS.forEach((s, i) => {
    const [x, y] = at(i, 1.17);
    const c = Math.cos(angle(i));
    const anchor = Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end';
    const dy = Math.abs(c) < 0.3 ? (Math.sin(angle(i)) < 0 ? -2 : 16) : 6;
    svg += `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${labelOf(s)}</text>`;
  });
  return svg;
}

// Rounds logged without a scan count here too, so the round number and the
// day keep moving on weeks trained away from a scanner.
export function header({ profile, list, trainings = [] }) {
  const all = timelineOf(list, trainings);
  const days = all.length ? Math.round(daysBetween(all[0], all[all.length - 1])) : 0;
  const meta = all.length ? `Round ${all.length}${days > 0 ? ` · Day ${days + 1}` : ''}` : 'Day one';
  return `<header class="top">
    <button class="who" data-open-profiles aria-label="Switch person">
      <span class="avatar">${initial(profile.name)}</span>
      <span class="who-name">${esc(profile.name)}</span>
      ${icon.down(18)}
    </button>
    <div class="top-right">
      <span class="top-meta">${meta}</span>
      <a class="icon-btn" href="#/settings" aria-label="Settings">${icon.gear(22)}</a>
    </div>
  </header>`;
}

export function pageTitle(title, backHref = null) {
  return `<header class="top">
    <div class="who">
      ${backHref ? `<a class="icon-btn" href="${backHref}" aria-label="Back" style="margin-left:-12px">${icon.back(24)}</a>` : ''}
      <h1 class="who-name" style="font-size:30px;font-style:italic;font-weight:800;text-transform:uppercase">${esc(title)}</h1>
    </div>
  </header>`;
}

export function openProfiles(rerender) {
  const onTeam = location.hash.startsWith('#/team');
  const items = store.profiles.map((p) => {
    const count = store.listFor(p.id).length;
    const here = !onTeam && p.id === store.activeId;
    return `<button class="pick" data-id="${esc(p.id)}">
      <span class="avatar${here ? '' : ' alt'}">${initial(p.name)}</span>
      <span class="pick-name">${esc(p.name)}<small>${count} ${count === 1 ? 'round' : 'rounds'}</small></span>
      ${here ? icon.check(22) : ''}
    </button>`;
  }).join('');
  const together = store.profiles.length > 1 ? `<button class="pick" data-team>
      ${duo()}
      <span class="pick-name">Together<small>Both of you side by side</small></span>
      ${onTeam ? icon.check(22) : ''}
    </button>` : '';
  return sheet(
    `<h3>Who's stepping in?</h3>
     <div>${items}${together}</div>
     <div class="sheet-actions"><a class="btn" href="#/settings">Add or edit people</a></div>`,
    (el, close) => {
      el.querySelectorAll('.pick[data-id]').forEach((b) => b.addEventListener('click', async () => {
        await store.setActive(b.dataset.id);
        close();
        if (onTeam) location.hash = '#/home';
        else rerender();
      }));
      el.querySelector('[data-team]')?.addEventListener('click', () => {
        close();
        if (onTeam) rerender();
        else location.hash = '#/team';
      });
      el.querySelector('a.btn').addEventListener('click', () => close());
    },
  );
}

// A round trained where there is no scanner. It counts as a round and keeps
// the streak going, and has no numbers, so the charts skip it. Resolves with
// the saved round and its number, or nothing if cancelled.
export async function logNoScanRound(profile) {
  const today = dayKeyOf(new Date());
  const saved = await sheet(
    `<h3>Trained without a scan</h3>
     <p class="sub" style="margin-bottom:12px">No Tanita at this gym? Log the round so it counts and your streak stays alive. It has no numbers, so the charts skip it.</p>
     <form data-form style="display:grid;gap:12px">
       <div class="form-row"><label for="nr-day">Day you trained</label>
         <input class="input" type="date" id="nr-day" max="${today}" value="${today}" required></div>
       <div class="form-row"><label for="nr-note">Where <small>optional</small></label>
         <input class="input" id="nr-note" maxlength="30" autocomplete="off" placeholder="Hotel gym, home workout…"></div>
       <p class="field-hint" data-error style="margin:0" hidden></p>
       <div class="sheet-actions">
         <button type="button" class="btn" data-no>Cancel</button>
         <button class="btn gold">Log round</button>
       </div>
     </form>`,
    (el, close) => {
      el.querySelector('[data-no]').addEventListener('click', () => close(false));
      el.querySelector('[data-form]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const day = el.querySelector('#nr-day').value;
        const error = el.querySelector('[data-error]');
        const fail = (message) => { error.textContent = message; error.hidden = false; };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail('Pick the day you trained.');
        if (day > today) return fail('Pick today or a day before it.');
        if (store.roundOn(profile.id, day)) return fail(`${profile.name} already has a round on ${longDate(new Date(`${day}T12:00`))}.`);
        close(await store.logTraining(profile.id, day, el.querySelector('#nr-note').value.trim()));
      });
    },
  );
  if (!saved?.id) return null;
  const number = timelineOf(store.listFor(profile.id), store.trainingsFor(profile.id)).findIndex((r) => r.id === saved.id) + 1;
  return { ...saved, number };
}

export function wireHeader(root, rerender) {
  root.querySelector('[data-open-profiles]')?.addEventListener('click', () => openProfiles(rerender));
}

// Change text in the good / bad / neutral colour, with its direction spelled out.
export function deltaHtml(change, metric) {
  const m = typeof metric === 'string' ? metricOf(metric) : metric;
  if (change === null || change === undefined) return '<span class="delta flat">–</span>';
  const flat = Math.abs(change) < 0.5 * 10 ** -m.dec;
  const tone = flat || m.better === 0 ? 'flat' : change * m.better > 0 ? 'good' : 'bad';
  return `<span class="delta ${tone}">${signed(change, m.dec)}</span>`;
}

export const flaggedSet = (list) => {
  const usual = usualMinutes(list);
  return new Set(list.filter((r) => isUnusualTime(r, usual)).map((r) => r.id));
};

export const pointsOf = (list, key, flagged = new Set(), base = 0) => list
  .filter((r) => typeof r[key] === 'number')
  .map((r) => ({ t: asDate(r), y: r[key] - base, flagged: flagged.has(r.id) }));
