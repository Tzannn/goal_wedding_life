import { store } from '../store.js';
import { asDate, fixed, isNum, longDate, PHYSIQUE_GRID, physiqueLabel, rankOf, trophies } from '../model.js';
import { beltArt, esc, icon, medalArt } from '../ui.js';
import { duo, header, wireHeader } from './common.js';

const GOAL_CELL = 'VERY MUSCULAR';

function mapHtml(list) {
  const seen = new Set(list.map((r) => r.physique).filter(Boolean));
  const current = [...list].reverse().find((r) => r.physique)?.physique;
  const rowNames = ['High fat', 'Standard', 'Low fat'];
  const cells = PHYSIQUE_GRID.map((row, r) => `<div class="map-axis-y">${rowNames[r]}</div>${row.map((name) => {
    const classes = ['map-cell'];
    if (seen.has(name)) classes.push('been');
    if (name === current) classes.push('now');
    if (name === GOAL_CELL) classes.push('goal');
    const tag = name === current ? '<span class="map-tag">You</span>' : name === GOAL_CELL ? '<span class="map-tag">Goal</span>' : '';
    return `<div class="${classes.join(' ')}">${tag}${esc(physiqueLabel(name))}</div>`;
  }).join('')}`).join('');
  return `<div class="map">${cells}
    <div></div><div class="map-axis-x">Low muscle</div><div class="map-axis-x">Standard</div><div class="map-axis-x">High muscle</div>
  </div>`;
}

// Everything the two of you share lives on the Together page.
function versusHtml() {
  if (store.profiles.length < 2) return '';
  return `<a class="card teaser" href="#/team">
    ${duo()}
    <span class="teaser-main"><b>Together</b><span class="fine">Both of you side by side on the Together page</span></span>
    <span class="teaser-go" aria-hidden="true">${icon.back(22)}</span>
  </a>`;
}

export const belts = {
  render(ctx) {
    const { list, goals, profile } = ctx;
    if (!list.length) {
      return `${header(ctx)}<main class="page"><section class="card"><div class="h"><h2>Four belts await</h2></div>
        <p class="sub">Your belts and rank start after your first scan.</p><a class="btn gold block" href="#/scan" style="margin-top:12px">Scan a slip</a></section></main>`;
    }
    const r = rankOf(list, goals);
    const earned = trophies(list, ctx.trainings);
    const got = earned.filter((t) => t.earnedAt);
    const cards = r.belts.map((b) => `<div class="belt-card${b.won ? ' won' : ''}">
      <div class="belt-art">${beltArt(96)}</div>
      <div>
        <div class="belt-title">${esc(b.name)}</div>
        <div class="belt-sub">${esc(b.label)} ${b.dir < 0 ? 'to' : 'up to'} ${fixed(b.goal, b.dec)}${b.unit ? ` ${esc(b.unit)}` : ''}</div>
        <div class="meter"><i style="width:${(b.progress * 100).toFixed(1)}%"></i></div>
        <div class="belt-foot"><span>Now ${isNum(b.now) ? fixed(b.now, b.dec) : '–'}${b.unit ? ` ${esc(b.unit)}` : ''}</span><span>${b.won ? 'Won' : `${Math.round(b.progress * 100)}%`}</span></div>
      </div>
    </div>`).join('');

    return `${header(ctx)}<main class="page wide">
      <div class="col">
        <section>
          <div class="h"><h2>Four belts. One champion.</h2><a href="#/settings">Goals</a></div>
          <div class="belts">${cards}</div>
          <p class="fine" style="margin-top:8px">Hold all four to become Undisputed. Progress uses the average of your last 3 scans.</p>
        </section>
        <section class="card">
          <div class="h"><h2>The recomp map</h2></div>
          ${mapHtml(list)}
          <p class="fine" style="margin-top:10px">Your scanner's nine physique ratings. Recomposition moves you right and down, toward the corner.</p>
        </section>
      </div>
      <div class="col">
        ${versusHtml()}
        <section class="card">
          <div class="h"><h2>Trophies</h2><span class="aside">${got.length} of ${earned.length}</span></div>
          <div class="trophies">${earned.map((t) => `<div class="trophy${t.earnedAt ? ' got' : ''}">
            <div class="trophy-medal">${medalArt(54)}</div>
            <div class="trophy-name">${esc(t.name)}</div>
            <div class="trophy-how">${t.earnedAt ? esc(longDate(asDate(t.earnedAt))) : esc(t.how)}</div>
          </div>`).join('')}</div>
        </section>
      </div>
    </main>`;
  },
  mount(root, ctx) {
    wireHeader(root, ctx.rerender);
  },
};
