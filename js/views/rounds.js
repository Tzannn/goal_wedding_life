import { store } from '../store.js';
import { asDate, BIO_ROWS, clock, fixed, INPUT_ROWS, isNum, isUnusualTime, judgeRound, longDate, physiqueLabel, RANGE_ROWS, SLIP_ROWS, timelineOf, usualMinutes } from '../model.js';
import { confirmSheet, esc, icon, toast } from '../ui.js';
import { header, logNoScanRound, pageTitle, wireHeader } from './common.js';

const TONE_CHIP = { won: 'won', lost: 'lost', even: '' };

// Round numbers count the rounds logged without a scan as well.
const roundNumber = (ctx, id) => timelineOf(ctx.list, ctx.trainings).findIndex((r) => r.id === id) + 1;

function trainingRow(r, n) {
  return `<button class="round training" data-training="${esc(r.id)}" data-number="${n}">
    <div class="round-no"><small>RND</small>${n}</div>
    <div>
      <div class="round-date">${longDate(asDate(r))}</div>
      <div class="round-flags"><span class="chip">No scan</span>${r.note ? `<span class="round-note">${esc(r.note)}</span>` : ''}</div>
    </div>
    <div class="round-values"><em>Trained</em></div>
  </button>`;
}

export const rounds = {
  render(ctx) {
    const { list } = ctx;
    const all = timelineOf(list, ctx.trainings);
    if (!all.length) {
      return `${header(ctx)}<main class="page"><section class="card"><div class="h"><h2>No rounds yet</h2></div>
      <p class="sub">Every scan you log appears here.</p><a class="btn gold block" href="#/scan" style="margin-top:12px">Scan a slip</a></section></main>`;
    }
    const usual = usualMinutes(list);
    const cards = all.map((r, at) => {
      if (r.training) return trainingRow(r, at + 1);
      const i = list.indexOf(r);
      const verdict = judgeRound(list, i);
      const d = asDate(r);
      const unusual = isUnusualTime(r, usual);
      return `<a class="round" href="#/round/${esc(r.id)}">
        <div class="round-no"><small>RND</small>${at + 1}</div>
        <div>
          <div class="round-date">${longDate(d)}<span>${clock(d)}</span></div>
          <div class="round-flags">
            <span class="chip ${TONE_CHIP[verdict.tone]}">${esc(verdict.title)}</span>
            ${unusual ? `<span class="chip warn">${icon.clock(12)}Unusual time</span>` : ''}
          </div>
        </div>
        <div class="round-values">
          <div><em>Fat</em>${fixed(r.fatMass, 1)}</div>
          <div><em>Mus</em>${fixed(r.muscle, 1)}</div>
        </div>
      </a>`;
    }).reverse().join('');
    return `${header(ctx)}<main class="page">
      <div class="h" style="margin:0"><h2>All rounds</h2>
        <span class="h-links"><button class="h-link" data-no-scan>No scan</button><a href="#/new">Key one in</a></span></div>
      <div class="rounds">${cards}</div>
    </main>`;
  },
  mount(root, ctx) {
    wireHeader(root, ctx.rerender);
    root.querySelector('[data-no-scan]')?.addEventListener('click', async () => {
      const logged = await logNoScanRound(ctx.profile);
      if (!logged) return;
      toast(`Round ${logged.number} logged. It counts for your streak.`);
      ctx.rerender({ keepScroll: true });
    });
    root.querySelectorAll('[data-training]').forEach((b) => b.addEventListener('click', async () => {
      const yes = await confirmSheet({
        title: `Delete round ${b.dataset.number}?`,
        body: 'It was logged without a scan. Deleting it takes it out of your round count and your streak.',
        confirm: 'Delete',
        danger: true,
      });
      if (!yes) return;
      await store.deleteTraining(b.dataset.training);
      toast('Round deleted');
      ctx.rerender({ keepScroll: true });
    }));
  },
};

const kv = (rows, r) => rows.filter((f) => isNum(r[f.key])).map((f) => `<dt>${esc(f.label)}</dt><dd>${fixed(r[f.key], f.dec)}${f.unit ? `<small>${esc(f.unit)}</small>` : ''}</dd>`).join('');

export const round = {
  render(ctx) {
    const { list, arg } = ctx;
    const index = list.findIndex((r) => r.id === arg);
    if (index < 0) return `${pageTitle('Round', '#/rounds')}<main class="page"><p class="sub">That round no longer exists.</p></main>`;
    const r = list[index];
    const d = asDate(r);
    const verdict = judgeRound(list, index);
    const extra = kv(RANGE_ROWS, r), input = kv(INPUT_ROWS, r), bio = kv(BIO_ROWS, r);
    return `${pageTitle(`Round ${roundNumber(ctx, r.id)}`, '#/rounds')}<main class="page">
      <section class="card">
        <div class="h" style="margin-bottom:6px"><h2>${longDate(d)}</h2><span class="aside">${clock(d)}</span></div>
        <div class="round-flags"><span class="chip ${TONE_CHIP[verdict.tone]}">${esc(verdict.title)}</span>${r.physique ? `<span class="chip">${esc(physiqueLabel(r.physique))}</span>` : ''}</div>
      </section>
      <section class="card"><div class="h"><h2>Result</h2></div><dl class="kv" style="margin:0">${kv(SLIP_ROWS, r)}</dl></section>
      ${extra ? `<section class="card"><div class="h"><h2>Desirable range</h2></div><dl class="kv" style="margin:0">${extra}</dl></section>` : ''}
      ${input ? `<section class="card"><div class="h"><h2>Input</h2></div><dl class="kv" style="margin:0">${input}</dl></section>` : ''}
      ${bio ? `<section class="card"><div class="h"><h2>Bioelectrical</h2></div><dl class="kv" style="margin:0">${bio}</dl></section>` : ''}
      ${r.hasPhoto ? '<section class="card"><div class="h"><h2>The slip</h2></div><div id="photo"></div></section>' : ''}
      <div class="row-actions">
        <a class="btn" href="#/edit/${esc(r.id)}">${icon.pencil(20)} Edit</a>
        <button class="btn danger" data-delete>Delete</button>
      </div>
    </main>`;
  },
  async mount(root, ctx) {
    const { arg } = ctx;
    root.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const yes = await confirmSheet({
        title: `Delete round ${roundNumber(ctx, arg)}?`,
        body: 'This removes the scan and its photo from this device. It cannot be undone.',
        confirm: 'Delete',
        danger: true,
      });
      if (!yes) return;
      await store.deleteReading(arg);
      toast('Round deleted');
      ctx.go('#/rounds');
    });
    const slot = root.querySelector('#photo');
    if (slot) {
      const blob = await store.photoOf(arg);
      if (blob && slot.isConnected) {
        const img = document.createElement('img');
        img.className = 'slip-photo';
        img.alt = 'Photo of this round\'s Tanita slip';
        img.src = URL.createObjectURL(blob);
        slot.append(img);
      }
    }
  },
};
