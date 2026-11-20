import { store } from '../store.js';
import { asDate, BIO_ROWS, INPUT_ROWS, isNum, isUnusualTime, judgeRound, newRecords, physiqueLabel, PHYSIQUES, RANGE_ROWS, rankOf, shortDate, SLIP_ROWS, trophies, usualMinutes } from '../model.js';
import { readSlip, releaseEngine, STAGES } from '../ocr/reader.js';
import { crossCheck, deriveMissing } from '../ocr/verify.js';
import { confetti, confirmSheet, esc, icon, ringBell, sheet, toast } from '../ui.js';
import { deltaHtml, header, pageTitle, wireHeader } from './common.js';

// The photo batch in progress and the form currently being reviewed.
const flow = { queue: [], total: 0, position: 0, draft: null };

const ALL_ROWS = [...SLIP_ROWS, ...RANGE_ROWS, ...INPUT_ROWS, ...BIO_ROWS];
const SIGNED_KEYS = new Set(['obesity', 'x6', 'x50']);
const pad = (n) => String(n).padStart(2, '0');
const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function suggestProfile(values, gender) {
  if (store.profiles.length < 2 || !isNum(values.height)) return store.activeId;
  const active = store.active;
  if (isNum(active.height) && Math.abs(active.height - values.height) <= 1.5) return active.id;
  const other = store.profiles.find((p) => isNum(p.height) && Math.abs(p.height - values.height) <= 1.5 && (!gender || !p.sex || p.sex === gender));
  return other ? other.id : store.activeId;
}

// Encoded directly rather than with canvas.toBlob, which waits on an
// idle-priority browser task.
function canvasToBlob(canvas) {
  const [head, body] = canvas.toDataURL('image/jpeg', 0.72).split(',');
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: head.match(/:(.*?);/)[1] });
}

function showReading(file) {
  const el = document.createElement('div');
  el.className = 'reading';
  el.setAttribute('role', 'status');
  const url = URL.createObjectURL(file);
  el.innerHTML = `<div class="reading-frame"><img alt=""></div>
    <div class="reading-stage"></div>
    <div class="reading-count"></div>`;
  el.querySelector('img').src = url;
  document.body.append(el);
  if (flow.total > 1) el.querySelector('.reading-count').textContent = `Slip ${flow.position} of ${flow.total}`;
  return {
    stage: (i) => { el.querySelector('.reading-stage').textContent = STAGES[i]; },
    close: () => { el.remove(); URL.revokeObjectURL(url); },
  };
}

async function startBatch(files, ctx) {
  flow.queue = [...files];
  flow.total = files.length;
  flow.position = 0;
  await nextSlip(ctx);
}

async function finishBatch(ctx) {
  flow.draft = null;
  flow.total = 0;
  flow.position = 0;
  await releaseEngine();
  ctx.go('#/home');
}

async function nextSlip(ctx) {
  const file = flow.queue.shift();
  if (!file) { await finishBatch(ctx); return; }
  flow.position++;
  const overlay = showReading(file);
  overlay.stage(0);
  let result = null;
  let failure = null;
  try {
    const list = store.listFor();
    const last = list[list.length - 1];
    const profile = store.active;
    result = await readSlip(file, {
      onStage: overlay.stage,
      known: { ...(isNum(profile.height) ? { height: profile.height } : {}), ...(isNum(profile.age) ? { age: profile.age } : {}) },
      prior: last ?? {},
      hintDate: new Date(file.lastModified),
    });
  } catch (err) {
    failure = err.message;
  }
  overlay.close();

  if (failure || !result.isSlip) {
    const next = await sheet(
      `<h3>Couldn't read that one</h3>
       <p class="sub">${esc(failure || 'No Tanita slip was found in this photo. Lay it flat, fill the frame and try again.')}</p>
       <div class="sheet-actions">
         <button class="btn" data-a="${flow.queue.length ? 'skip' : 'retry'}">${flow.queue.length ? 'Skip this one' : 'Try again'}</button>
         <button class="btn gold" data-a="manual">Key it in</button>
       </div>`,
      (el, close) => el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => close(b.dataset.a))),
    );
    if (next === 'manual') {
      startManual();
      ctx.go('#/review');
    } else if (next === 'skip') {
      await nextSlip(ctx);
    } else {
      flow.queue = [];
      flow.total = 0;
      ctx.go('#/scan');
    }
    return;
  }

  const photo = result.preview ? canvasToBlob(result.preview) : null;
  const when = result.date || new Date(file.lastModified) || new Date();
  flow.draft = {
    source: 'scan',
    values: result.values,
    status: result.status,
    relationsOk: result.relationsOk,
    takenAt: toInput(when),
    dateRead: !!result.date,
    dateSure: !!result.date && result.dateSure,
    dateOptions: (result.dateOptions || []).map(toInput),
    physique: result.physique,
    // A close-up of the top of the slip has no physique rating to read.
    physiqueSure: !!result.physique || result.layout === 'top' || result.layout === 'upper',
    gender: result.gender,
    layout: result.layout,
    photo,
    photoUrl: photo ? URL.createObjectURL(photo) : null,
    profileId: suggestProfile(result.values, result.gender),
    touched: new Set(),
  };
  carryRange(flow.draft);
  ctx.go('#/review');
}

const RANGE_KEYS = ['fatLow', 'fatHigh', 'fatMassLow', 'fatMassHigh'];

// A close-up of the top of the slip has no desirable range on it. The fat %
// range depends only on age and sex, so it comes from the same person's last
// round at the same age, and the fat mass range is worked out from it. Run
// again when the slip moves to the other person.
function carryRange(draft) {
  for (const k of draft.carried || []) if (!draft.touched.has(k)) delete draft.values[k];
  draft.carried = [];
  if (draft.source !== 'scan' || draft.layout === 'full') return;
  const v = draft.values;
  if (isNum(v.fatLow) && isNum(v.fatHigh)) return;
  const last = store.listFor(draft.profileId).filter((r) => isNum(r.fatLow) && isNum(r.fatHigh)).pop();
  if (!last || (isNum(v.age) && isNum(last.age) && v.age !== last.age)) return;
  for (const k of ['fatLow', 'fatHigh']) if (!isNum(v[k])) { v[k] = last[k]; draft.carried.push(k); }
  const { values, filled } = deriveMissing(v);
  for (const k of ['fatMassLow', 'fatMassHigh']) if (filled.includes(k)) { v[k] = values[k]; draft.carried.push(k); }
}

function startManual() {
  // Facts that rarely change are carried over, so "Work out the blanks" can
  // calculate BMI and the rest straight away.
  const profile = store.active;
  const list = store.listFor();
  const last = list[list.length - 1];
  const carried = {};
  if (isNum(profile.height)) carried.height = profile.height;
  if (isNum(profile.age)) carried.age = profile.age;
  for (const key of ['fatLow', 'fatHigh']) if (isNum(last?.[key])) carried[key] = last[key];
  flow.draft = {
    source: 'manual', values: carried, status: {}, takenAt: toInput(new Date()), dateSure: true, physique: last?.physique ?? null, physiqueSure: true,
    gender: last?.gender ?? profile.sex ?? null, photo: null, photoUrl: null, profileId: store.activeId, touched: new Set(),
  };
}

// ---------- the start screen ----------

export const scan = {
  render(ctx) {
    return `${header(ctx)}<main class="page">
      <section class="card">
        <div class="h"><h2>Read a slip</h2></div>
        <ul class="tips">
          <li><b>1</b><span>Lay the slip flat and let it fill the frame.</span></li>
          <li><b>2</b><span>Use good light, with no shadow across the numbers.</span></li>
          <li><b>3</b><span>Keep the whole slip in shot, from the TANITA logo to the last line.</span></li>
        </ul>
      </section>
      <div class="scan-actions">
        <label class="btn gold block file-btn">${icon.camera(22)} Take a photo<input type="file" accept="image/*" capture="environment" data-pick></label>
        <label class="btn block file-btn">Choose from your photos<input type="file" accept="image/*" multiple data-pick></label>
        <a class="btn ghost block" href="#/new">Key it in instead</a>
      </div>
      <p class="fine" style="text-align:center">Read on this device. Your photo is never uploaded.</p>
    </main>`;
  },
  mount(root, ctx) {
    wireHeader(root, ctx.rerender);
    root.querySelectorAll('[data-pick]').forEach((input) => input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = '';
      if (files.length) startBatch(files, ctx);
    }));
  },
};

// ---------- the form used for scans, manual entry and edits ----------

const parseNum = (s) => {
  const t = String(s).trim().replace(',', '.').replace('−', '-');
  if (t === '' || t === '-') return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
};

function fieldRow(f, draft) {
  const v = draft.values[f.key];
  const text = isNum(v) ? v.toFixed(f.dec) : '';
  const mode = SIGNED_KEYS.has(f.key) ? 'text' : f.dec === 0 ? 'numeric' : 'decimal';
  return `<div class="field" data-key="${f.key}">
    <span class="field-mark none"></span>
    <label for="f-${f.key}">${esc(f.label)}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>
    <input id="f-${f.key}" inputmode="${mode}" autocomplete="off" enterkeyhint="next" value="${text}">
    <span class="field-unit">${esc(f.unit)}</span>
  </div>`;
}

function readForm(root) {
  const values = {};
  for (const f of ALL_ROWS) {
    const input = root.querySelector(`#f-${f.key}`);
    const v = input ? parseNum(input.value) : undefined;
    if (v !== undefined) values[f.key] = v;
  }
  return values;
}

// A scanned age or height that does not match the person on file.
function offFile(key, value, draft) {
  if (draft.source !== 'scan' || (key !== 'age' && key !== 'height')) return null;
  const p = store.profiles.find((x) => x.id === draft.profileId);
  const known = p?.[key];
  if (!isNum(known) || Math.abs(value - known) <= (key === 'age' ? 1 : 2)) return null;
  return `${p.name}'s ${key} on file is ${key === 'age' ? known : `${known} cm`}. Check the slip.`;
}

const MARK = { ok: () => icon.check(18), attn: () => icon.alert(18), neutral: () => '<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>', none: () => '' };
const MARK_LABEL = { ok: 'Adds up with the other values', attn: 'Check this value', neutral: 'Read from the slip', none: '' };

function refreshMarks(root, draft) {
  const values = readForm(root);
  const live = crossCheck(values);
  let okCount = 0, attnCount = 0, filled = 0;
  root.querySelectorAll('.field[data-key]').forEach((row) => {
    const key = row.dataset.key;
    const val = values[key];
    let state = 'none', hint = null, expected = null;
    if (isNum(val)) {
      const check = live[key];
      if (check?.attn) {
        state = 'attn';
        expected = check.expected;
        hint = isNum(expected) ? `The other values point to ${expected}.` : 'This does not add up with the other values.';
      } else if (draft.status?.[key]?.state === 'check' && !draft.touched.has(key)) {
        // Checked before the arithmetic: a value calculated from its neighbours
        // always agrees with them, so agreement proves nothing here.
        state = 'attn';
        hint = 'Not sure about this one. Compare it with your slip.';
      } else if (offFile(key, val, draft) && !draft.touched.has(key)) {
        // Age and height update the person's details when the round is saved,
        // so a misread here would quietly spread.
        state = 'attn';
        hint = offFile(key, val, draft);
      } else if (check?.ok > 0) {
        state = 'ok';
      } else {
        state = 'neutral';
      }
    } else if (draft.status && draft.source === 'scan' && SLIP_ROWS.some((f) => f.key === key)) {
      state = 'attn';
      hint = 'Could not read this one.';
    }
    if (SLIP_ROWS.some((f) => f.key === key)) {
      if (isNum(val)) filled++;
      if (state === 'ok') okCount++;
      if (state === 'attn') attnCount++;
    }
    row.classList.toggle('attn', state === 'attn');
    const mark = row.querySelector('.field-mark');
    mark.className = `field-mark ${state}`;
    mark.innerHTML = MARK[state]();
    if (MARK_LABEL[state]) mark.setAttribute('title', MARK_LABEL[state]); else mark.removeAttribute('title');
    row.querySelector('.field-hint')?.remove();
    if (hint) {
      const h = document.createElement('div');
      h.className = 'field-hint';
      h.textContent = hint;
      if (isNum(expected)) {
        const use = document.createElement('button');
        use.type = 'button';
        use.textContent = `Use ${expected}`;
        use.addEventListener('click', () => {
          const dec = ALL_ROWS.find((f) => f.key === key).dec;
          row.querySelector('input').value = expected.toFixed(dec);
          draft.touched.add(key);
          refreshMarks(root, draft);
        });
        h.append(use);
      }
      row.append(h);
    }
  });
  const summary = root.querySelector('[data-summary]');
  if (summary) {
    summary.querySelector('.summary-num').innerHTML = `${okCount}<small> / ${SLIP_ROWS.length}</small>`;
    summary.querySelector('.sub').textContent = attnCount
      ? `confirmed by the slip's own arithmetic. ${attnCount} marked in amber ${attnCount === 1 ? 'needs' : 'need'} your eyes.`
      : 'confirmed by the slip\'s own arithmetic. Metabolic age and visceral fat have nothing to check against, so give those a glance.';
  }
  const canDerive = root.querySelector('[data-derive]');
  if (canDerive) canDerive.hidden = deriveMissing(values).filled.length === 0;
  void filled;
}

function group(title, rows, draft, open, note = '') {
  return `<details class="numbers" ${open ? 'open' : ''}>
    <summary>${esc(title)}</summary>
    ${note ? `<p class="fine" style="margin-top:6px">${esc(note)}</p>` : ''}
    <div class="fields">${rows.map((f) => fieldRow(f, draft)).join('')}</div>
  </details>`;
}

// "2026-11-17T06:24" as "17 Nov 06:24".
const readable = (value) => {
  const d = new Date(value);
  return `${shortDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// A date the reader could not confirm is never saved quietly: the person is
// asked to check it, with the other dates the photo pointed to one tap away. A
// scanned date earlier than that person's latest round is checked too, since a
// misread digit often moves a slip back in time.
function dateHint(draft, target) {
  if (draft.dateChecked || draft.source !== 'scan') return '';
  if (!draft.dateRead) return '<span class="field-hint" data-date-hint style="margin:0">Could not read the date. Please set it.</span>';
  const list = store.listFor(target.id).filter((r) => r.id !== draft.editId);
  const latest = list[list.length - 1];
  // One scan a day is the habit, so a second round on the same day is more
  // likely a misread digit, or the same slip scanned twice.
  const sameDay = list.find((r) => r.takenAt.slice(0, 10) === draft.takenAt.slice(0, 10));
  const early = !sameDay && latest && draft.takenAt < latest.takenAt;
  if (draft.dateSure && !early && !sameDay) return '';
  const why = [
    ...(draft.dateSure ? [] : ['The photo was hard to read here.']),
    ...(sameDay ? [`${target.name} already has a round on ${readable(sameDay.takenAt)}.`] : []),
    ...(early ? [`It is earlier than the last round saved for ${target.name} (${readable(latest.takenAt)}).`] : []),
  ].join(' ');
  const options = draft.dateOptions || [];
  return `<span class="field-hint" data-date-hint style="margin:0">Check this date against the slip. ${esc(why)}${options.length ? ' It could also be:' : ''}</span>
    ${options.length ? `<div class="chips" data-date-hint>${options.map((v) => `<button type="button" class="pick-chip" data-date-option="${esc(v)}">${esc(readable(v))}</button>`).join('')}</div>` : ''}`;
}

export const review = {
  render(ctx) {
    const draft = flow.draft;
    if (!draft) return `${pageTitle('Scan', '#/scan')}<main class="page"><p class="sub">Nothing to review. <a href="#/scan">Scan a slip</a>.</p></main>`;
    const isEdit = !!draft.editId;
    const target = store.profiles.find((p) => p.id === draft.profileId) || ctx.profile;
    const rounds = store.listFor(target.id).length;
    const title = isEdit ? 'Edit round' : draft.source === 'scan' ? 'Check the slip' : 'Key it in';
    const counter = flow.total > 1 ? `<p class="fine">Slip ${flow.position} of ${flow.total}</p>` : '';
    const physOptions = ['<option value="">Not on this slip</option>', ...PHYSIQUES.map((p) => `<option value="${esc(p)}" ${draft.physique === p ? 'selected' : ''}>${esc(physiqueLabel(p))}</option>`)].join('');
    const whoSwitch = store.profiles.length > 1 && !isEdit ? `<div class="form-row">
        <label>Whose slip is this?</label>
        <div class="profile-switch">${store.profiles.map((p) => `<button type="button" class="pill${p.id === draft.profileId ? ' on' : ''}" data-who="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>
      </div>` : '';

    return `${pageTitle(title, isEdit ? `#/round/${esc(draft.editId)}` : '#/scan')}<main class="page">
      <form data-entry novalidate style="display:flex;flex-direction:column;gap:14px">
        ${draft.source === 'scan' ? `<section class="card summary" data-summary>
          <div class="summary-num"></div>
          <div><p class="sub"></p>${counter}</div>
        </section>` : ''}
        ${draft.photoUrl ? `<details class="card" style="padding-block:10px">
          <summary style="cursor:pointer;font:600 16px/1.7 var(--tight);letter-spacing:.05em;text-transform:uppercase;color:var(--canvas-2)">Compare with the photo</summary>
          <img class="slip-photo" src="${draft.photoUrl}" alt="The straightened slip" style="margin-top:8px">
        </details>` : ''}
        <section class="card">
          <div style="display:grid;gap:12px">
            ${whoSwitch}
            <div class="form-row">
              <label for="f-date">Date and time on the slip</label>
              <input class="input" type="datetime-local" id="f-date" value="${draft.takenAt}" required>
              ${dateHint(draft, target)}
            </div>
          </div>
        </section>
        <section class="card">
          <div class="h" style="margin-bottom:4px"><h2>Result</h2></div>
          <div class="fields">${SLIP_ROWS.map((f) => fieldRow(f, draft)).join('')}</div>
          <button type="button" class="btn block small" data-derive hidden style="margin-top:12px">Work out the blanks</button>
        </section>
        <section class="card">
          <div class="form-row">
            <label for="f-physique">Physique rating</label>
            <select class="input" id="f-physique">${physOptions}</select>
            ${draft.physiqueSure ? '' : '<span class="field-hint" style="margin:0">Could not read this one. Please pick it.</span>'}
          </div>
          ${group('Desirable range', RANGE_ROWS, draft, false, draft.carried?.length ? `This photo doesn't show the range, so it comes from ${target.name}'s last round at the same age.` : '')}
          ${group('Input details', INPUT_ROWS, draft, false)}
          ${group('Bioelectrical data', BIO_ROWS, draft, false)}
        </section>
        <div class="save-bar">
          <button class="btn gold block">${isEdit ? 'Save changes' : `Save as round ${rounds + 1}`}</button>
        </div>
        ${isEdit ? '' : '<button type="button" class="btn ghost block" data-discard style="min-height:44px">Discard this slip</button>'}
      </form>
    </main>`;
  },

  mount(root, ctx) {
    const draft = flow.draft;
    if (!draft) return;
    const form = root.querySelector('[data-entry]');
    refreshMarks(form, draft);
    // Scanned slips open any group holding something to check.
    form.querySelectorAll('details.numbers').forEach((d) => { if (d.querySelector('.field.attn')) d.open = true; });

    form.addEventListener('input', (e) => {
      const key = e.target.closest('.field')?.dataset.key;
      if (key) draft.touched.add(key);
      refreshMarks(form, draft);
    });
    form.querySelectorAll('[data-who]').forEach((b) => b.addEventListener('click', () => {
      draft.values = { ...draft.values, ...readForm(form) };
      draft.takenAt = form.querySelector('#f-date').value || draft.takenAt;
      draft.profileId = b.dataset.who;
      carryRange(draft);
      ctx.rerender({ keepScroll: true });
    }));
    // Picking or typing a date counts as checking it.
    const dateInput = form.querySelector('#f-date');
    const checked = () => {
      draft.takenAt = dateInput.value || draft.takenAt;
      draft.dateChecked = true;
      form.querySelectorAll('[data-date-hint]').forEach((el) => el.remove());
    };
    dateInput.addEventListener('change', checked);
    form.querySelectorAll('[data-date-option]').forEach((b) => b.addEventListener('click', () => {
      dateInput.value = b.dataset.dateOption;
      checked();
    }));
    form.querySelector('[data-derive]')?.addEventListener('click', () => {
      const { values, filled } = deriveMissing(readForm(form));
      for (const key of filled) {
        const f = ALL_ROWS.find((x) => x.key === key);
        const input = form.querySelector(`#f-${key}`);
        if (f && input) input.value = values[key].toFixed(f.dec);
      }
      refreshMarks(form, draft);
    });
    form.querySelector('[data-discard]')?.addEventListener('click', async () => {
      const yes = await confirmSheet({ title: 'Discard this slip?', body: 'Nothing has been saved yet.', confirm: 'Discard', danger: true, cancel: 'Keep it' });
      if (!yes) return;
      flow.draft = null;
      if (flow.queue.length) await nextSlip(ctx);
      else await finishBatch(ctx);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); save(form, draft, ctx); });
  },
};

async function save(form, draft, ctx) {
  const values = readForm(form);
  const takenAt = form.querySelector('#f-date').value;
  const missing = ['weight', 'fatPct', 'muscle'].filter((k) => !isNum(values[k]));
  if (!takenAt) { toast('Set the date and time first'); return; }
  if (missing.length) {
    const first = form.querySelector(`#f-${missing[0]}`);
    first.focus();
    toast('Weight, fat % and muscle mass are needed to save a round');
    return;
  }
  const physique = form.querySelector('#f-physique').value || null;
  const payload = { ...values, takenAt, physique, gender: draft.gender, source: draft.source };

  let id = draft.editId || null;
  const duplicate = store.duplicateOf(draft.profileId, takenAt, draft.editId);
  if (duplicate) {
    const replace = await confirmSheet({
      title: 'Already logged',
      body: 'A round with this exact date and time exists. Replace it with this one?',
      confirm: 'Replace',
      cancel: 'Go back',
    });
    if (!replace) return;
    id = duplicate.id;
  }

  const profile = store.profiles.find((p) => p.id === draft.profileId);
  const beforeList = store.listFor(profile.id);
  const beforeGoals = store.goalsFor(profile, beforeList);
  const beforeRank = beforeList.length ? rankOf(beforeList, beforeGoals) : null;
  const beforeTrophies = new Set(trophies(beforeList).filter((t) => t.earnedAt).map((t) => t.id));

  const saved = await store.saveReading(profile.id, payload, { photo: draft.photo, id });
  if (draft.profileId !== store.activeId) await store.setActive(draft.profileId);
  flow.draft = null;

  if (draft.editId) {
    toast('Round updated');
    ctx.go(`#/round/${saved.id}`);
    return;
  }
  celebrate(saved, profile, beforeRank, beforeTrophies, ctx);
}

function celebrate(saved, profile, beforeRank, beforeTrophies, ctx) {
  const fresh = store.profiles.find((p) => p.id === profile.id);
  const list = store.listFor(fresh.id);
  const index = list.findIndex((r) => r.id === saved.id);
  const verdict = judgeRound(list, index);
  const records = newRecords(list, index);
  const goals = store.goalsFor(fresh, list);
  const rank = rankOf(list, goals);
  const fresher = trophies(list).filter((t) => t.earnedAt && !beforeTrophies.has(t.id));
  const promoted = beforeRank && rank.index > beforeRank.index;
  const unusual = isUnusualTime(list[index], usualMinutes(list));
  const hasMore = flow.queue.length > 0;

  const rows = verdict.rows.map((r) => `<div class="bout-row"><span>${esc(r.label)}</span><span>${deltaHtml(r.change, r.key)}<b style="margin-left:12px">${r.value.toFixed(r.dec)}</b></span></div>`).join('');
  const recordLine = records.map((r) => `${r.label} ${r.value.toFixed(r.dec)}${r.unit ? ` ${r.unit}` : ''}`).join(' · ');
  const unlocks = [
    ...(promoted ? [{ title: `Promoted to ${rank.name}`, sub: 'Your rank moved up' }] : []),
    ...fresher.map((t) => ({ title: t.name, sub: 'Trophy unlocked' })),
    ...(records.length ? [{ title: `${records.length} new ${records.length === 1 ? 'record' : 'records'}`, sub: recordLine }] : []),
  ];

  const el = document.createElement('div');
  el.className = 'bout';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="bout-inner">
    <p class="bout-round">Round ${index + 1} · ${shortDate(asDate(list[index]))}</p>
    <h2 class="bout-title ${verdict.tone === 'won' ? 'won' : ''}">${esc(verdict.title)}</h2>
    <p class="bout-line">${esc(verdict.line)}${unusual ? ' This scan was at an unusual time, so read it with care.' : ''}</p>
    ${rows ? `<div class="bout-rows">${rows}</div>` : ''}
    ${unlocks.map((u) => `<div class="unlock">${icon.belt(26)}<div>${esc(u.title)}<small>${esc(u.sub)}</small></div></div>`).join('')}
    <button class="btn gold block" data-done>${hasMore ? `Next slip (${flow.queue.length} left)` : 'Back to the ring'}</button>
  </div>`;
  document.body.append(el);

  if (store.prefs.sound) ringBell();
  navigator.vibrate?.([30, 60, 30]);
  if (verdict.tone === 'won' || fresher.length || records.length || promoted) confetti();
  el.querySelector('[data-done]').focus({ preventScroll: true });
  el.querySelector('[data-done]').addEventListener('click', async () => {
    el.remove();
    document.querySelector('.confetti')?.remove();
    if (flow.queue.length) await nextSlip(ctx);
    else await finishBatch(ctx);
  });

  // A nudge once there is enough unsaved history to be worth protecting.
  const unsaved = store.readings.length - (store.prefs.backupCount || 0);
  if (unsaved >= 5) toast(`${unsaved} rounds are not backed up yet`, { label: 'Settings', run: () => { el.remove(); ctx.go('#/settings'); } });
}

export function beginManual() {
  startManual();
}

export function beginEdit(id) {
  const r = store.readings.find((x) => x.id === id);
  if (!r) { flow.draft = null; return false; }
  flow.draft = {
    source: r.source || 'manual',
    values: { ...r },
    status: {},
    takenAt: r.takenAt,
    dateSure: true,
    physique: r.physique ?? null,
    physiqueSure: true,
    gender: r.gender ?? null,
    photo: null,
    photoUrl: null,
    profileId: r.profileId,
    editId: r.id,
    touched: new Set(),
  };
  return true;
}
