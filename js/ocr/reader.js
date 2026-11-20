// Reads a photographed Tanita DC-360 slip, entirely on this device.
// Several recognition passes each contribute candidate values; the slip's own
// arithmetic then decides between them.

import { decodeImage, prepare, splitRows, topOf, variantsOf } from './image.js';
import { RESULT_ROWS, alignRows, candidateFrom, parseDates, parseGender, parseInputColumn, parsePhysique, parseSections } from './parse.js';
import { solve, RELATIONS } from './verify.js';

const VENDOR = new URL('../../vendor/tesseract/', import.meta.url).href;

const VALUE_CHARS = '0123456789.%kgKJcal-';
const DATE_CHARS = '0123456789/:ABCDEFGJLMNOPRSTUVY';

// Tried in order until the numbers all agree. Different scales and contrast
// settings make different mistakes, which is what the vote relies on.
const PASSES = [
  { targetWidth: 1000, stretch: [0.45, 0.92], blocks: true },
  { targetWidth: 760, stretch: [0.5, 0.9], blocks: false },
  { targetWidth: 1300, stretch: [0.4, 0.88], blocks: false },
];

let enginePromise = null;

function loadEngineScript() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${VENDOR}tesseract.min.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error('The reading engine could not be loaded.'));
    document.head.append(s);
  });
}

const supportsSimd = () => WebAssembly.validate(new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]));

export function engine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      if (!supportsSimd()) throw new Error('This device is too old to read photos. You can still key values in.');
      await loadEngineScript();
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: `${VENDOR}worker.min.js`,
        corePath: `${VENDOR}tesseract-core-simd-lstm.wasm.js`,
        langPath: VENDOR.replace(/\/$/, ''),
        gzip: true,
        cacheMethod: 'none',
        workerBlobURL: false,
        logger: () => {},
      });
    })().catch((err) => { enginePromise = null; throw err; });
  }
  return enginePromise;
}

// Frees the engine's memory once a batch is finished.
export async function releaseEngine() {
  if (!enginePromise) return;
  const p = enginePromise;
  enginePromise = null;
  try { (await p).terminate(); } catch { /* already gone */ }
}

const MODES = {
  block: { tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' },
  line: { tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' },
  value: { tessedit_pageseg_mode: '7', tessedit_char_whitelist: VALUE_CHARS },
  date: { tessedit_pageseg_mode: '7', tessedit_char_whitelist: DATE_CHARS },
  dateBlock: { tessedit_pageseg_mode: '6', tessedit_char_whitelist: DATE_CHARS },
  caps: { tessedit_pageseg_mode: '7', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ&- ' },
};

function makeRecognizer(worker) {
  let current = null;
  return async (canvas, mode) => {
    if (current !== mode) {
      await worker.setParameters({ ...MODES[mode], preserve_interword_spaces: '1', user_defined_dpi: '300' });
      current = mode;
    }
    // A data URL is encoded right here. Handing over the canvas instead would
    // wait on an idle-priority browser task for every single row.
    const res = await worker.recognize(canvas.toDataURL('image/png'));
    return res.data.text;
  };
}

// Decides which printed row each image row is. Seventeen rows means the slip
// segmented perfectly and position alone is enough.
function assignRows(texts) {
  if (texts.length === RESULT_ROWS.length) return texts.map((_, i) => RESULT_ROWS[i]);
  const map = texts.map(() => null);
  for (const p of alignRows(texts)) map[p.line] = RESULT_ROWS[p.row];
  return map;
}

// How well a value-column row fits a slot on the slip, judged by its unit and
// whether the number is possible there. The unit pattern down the column
// (kg, %, kg, kg, kg, kg, %, kg, kJ, kcal...) keeps rows from sliding.
function valueFit(text, slot) {
  const t = text.trim();
  if (slot.valueOptional) return /\d{2}/.test(t) ? -0.6 : 0.3;
  let s = candidateFrom(slot, t) ? 1.5 : -1;
  if (slot.unit === 'kg') s += /[kK]/.test(t) ? 1 : -0.4;
  else if (slot.unit === '%') s += /%/.test(t) ? 1 : -0.2;
  else if (slot.unit === 'kj') s += /[Jj]/.test(t) ? 1.6 : -0.3;
  else if (slot.unit === 'kcal') s += /[ca]/.test(t) ? 1.6 : -0.3;
  else {
    s += /[kK%]/.test(t) ? -1 : 0.6;
    if (slot.key === 'bmi') s += /\./.test(t) ? 0.8 : -0.2;
    else s += /\./.test(t) ? -0.5 : 0.4;
  }
  return s;
}

function alignValues(texts) {
  const n = texts.length, m = RESULT_ROWS.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = dp[i - 1][j - 1] + valueFit(texts[i - 1], RESULT_ROWS[j - 1]);
      const skipRow = dp[i][j - 1], skipLine = dp[i - 1][j] - 0.2;
      if (match >= skipRow && match >= skipLine) { dp[i][j] = match; move[i][j] = 1; }
      else if (skipLine >= skipRow) { dp[i][j] = skipLine; move[i][j] = 2; }
      else { dp[i][j] = skipRow; move[i][j] = 3; }
    }
  }
  const map = texts.map(() => null);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (move[i][j] === 1) { map[i - 1] = RESULT_ROWS[j - 1]; i--; j--; }
    else if (move[i][j] === 2) i--;
    else j--;
  }
  return map;
}

// The value column is read with digits and units only, which is where most of
// the accuracy comes from.
async function readValues(canvas, rec, addCandidate) {
  const rows = splitRows(canvas, { expected: RESULT_ROWS.length });
  const texts = [];
  for (const row of rows) texts.push(await rec(row.canvas, 'value'));
  const layout = alignValues(texts);
  rows.forEach((row, i) => {
    const slot = layout[i];
    if (slot && !slot.valueOptional) addCandidate(slot.key, candidateFrom(slot, texts[i]));
  });
  return texts;
}

// Full rows with labels: a second opinion from a different kind of recognition.
async function readFullRows(canvas, rec, addCandidate) {
  const rows = splitRows(canvas, { expected: RESULT_ROWS.length });
  const texts = [];
  for (const row of rows) texts.push(await rec(row.canvas, 'line'));
  const layout = assignRows(texts);
  rows.forEach((row, i) => {
    const slot = layout[i];
    if (slot && !slot.valueOptional) addCandidate(slot.key, candidateFrom(slot, splitForValue(texts[i]).value));
  });
}

// The value is everything after the last wide gap on the row.
function splitForValue(text) {
  const t = text.trim().replace(/^[|[\](){}]+/, '').replace(/[|[\](){}!]+$/, '').trim();
  const wide = t.split(/\s{3,}/).filter(Boolean);
  if (wide.length >= 2) return { value: wide[wide.length - 1] };
  const tokens = t.split(/\s+/);
  let i = tokens.length;
  while (i > 0 && (/\d/.test(tokens[i - 1]) || /^[%¥]$/.test(tokens[i - 1]) || /^k/i.test(tokens[i - 1]))) i--;
  return { value: tokens.slice(i).join(' ') };
}

async function readRows(canvas, rec) {
  const rows = splitRows(canvas);
  const texts = [];
  for (const row of rows) texts.push(await rec(row.canvas, 'line'));
  return { rows, texts };
}

const DAY_MS = 864e5;

// Votes on each part of the date on its own. A read made only of digits counts
// in full, one where a letter stood in for a digit counts half. The date is
// trusted only when every part has a clear winner, the date is possible, and it
// fits the photo's own time. Any other dates the reads pointed to come back as
// options the person can pick with one tap.
function pickDate(found, now, hint) {
  // A clear winner needs a solid majority, and at least one read of it made of
  // plain digits: shaky reads that agree have often made the same mistake.
  const tally = (key, cleanKey) => {
    const votes = new Map(), clean = new Set();
    let total = 0;
    for (const f of found) {
      if (!(key in f)) continue;
      const plain = !cleanKey || f[cleanKey];
      const w = plain ? 1 : 0.5;
      votes.set(f[key], (votes.get(f[key]) || 0) + w);
      if (plain) clean.add(f[key]);
      total += w;
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked[0]?.[0];
    return { ranked, top, clear: ranked.length > 0 && ranked[0][1] >= 1.5 && ranked[0][1] / total >= 0.75 && clean.has(top) };
  };
  const day = tally('day', 'dayClean'), month = tally('month');
  const hour = tally('hour', 'hourClean'), minute = tally('minute', 'timeClean');
  if (day.top === undefined || month.top === undefined) return { date: null, sure: false, options: [] };

  const hasTime = hour.top !== undefined;
  const latest = now.getTime() + DAY_MS;
  // The year is rarely legible and almost always this one; a month still to come
  // this year belongs to last year, as with a December slip read in January.
  const at = (d, h = hour.top, mi = minute.top ?? 0) => {
    const [hh, mm] = hasTime ? [h, mi] : hint ? [hint.getHours(), hint.getMinutes()] : [0, 0];
    const date = new Date(now.getFullYear(), month.top, d, hh, mm);
    return month.top > now.getMonth() && date.getTime() > latest ? new Date(now.getFullYear() - 1, month.top, d, hh, mm) : date;
  };
  const restClear = month.clear && hour.clear && minute.clear && hasTime;
  let sure = day.clear && restClear;
  let d = day.top;

  // A photo taken soon after the slip printed settles a day the reads split on.
  const soonAfter = (date) => hint && hint - date >= -3600e3 && hint - date <= 12 * 3600e3;
  if (!day.clear && hint) {
    const match = day.ranked.find(([v]) => soonAfter(at(v)));
    if (match) { d = match[0]; sure = restClear; }
  }

  let date = at(d);
  // A day still to come usually means a leading 0 was read as a 1, as in 12 for 02.
  if (date.getTime() > latest) {
    sure = false;
    if (d >= 10 && d < 20 && at(d - 10).getTime() <= latest) date = at(d - 10);
  }
  // A slip cannot print after its own photo, and a year-old slip is unlikely.
  if (hint && date - hint > 3600e3) sure = false;
  if (now - date > 400 * DAY_MS) sure = false;

  // Kept even for a trusted date: the app may still ask about it, for example
  // when it lands before the person's last round. Days the reads saw come
  // first, then the photo's own day when it was taken soon after that time.
  const sameDay = hint && hasTime ? new Date(hint.getFullYear(), hint.getMonth(), hint.getDate(), date.getHours(), date.getMinutes()) : null;
  const alts = [
    ...day.ranked.map(([v]) => at(v)),
    ...(sameDay && soonAfter(sameDay) ? [sameDay] : []),
    ...(hasTime ? minute.ranked.map(([v]) => at(date.getDate(), date.getHours(), v)) : []),
    ...(hasTime ? hour.ranked.map(([v]) => at(date.getDate(), v, date.getMinutes())) : []),
  ];
  const seen = new Set([date.getTime()]);
  const options = alts.filter((a) => {
    if (Number.isNaN(a.getTime()) || a.getTime() > latest || seen.has(a.getTime())) return false;
    seen.add(a.getTime());
    return true;
  }).slice(0, 3);
  return { date, sure, options };
}

// Rows that look like the printed date: a day and month around a slash, or a time.
function dateRowScore(text) {
  if (!text || /kg|cm|INPUT|COMPO|ANALY|TANITA|GENDER|HEIGHT|CLOTH|BODY/i.test(text)) return 0;
  const dayMonth = /[/\\|]\s*[A-Za-z0]{3}/.test(text) || /[/\\|].{1,6}[/\\|]/.test(text);
  return (dayMonth ? 2 : 0) + (/[0-9OB]\s*[:;]\s*\d/.test(text) ? 1 : 0);
}

// Reads the printed date several ways, so one misread digit cannot decide it.
// `rows` and `texts` are a section already cut into rows and read once.
async function readDate(rows, texts, region, rec) {
  const found = [];
  const scores = texts.map(dateRowScore);
  const best = scores.indexOf(Math.max(...scores, 0));
  if (best >= 0 && scores[best] > 0) {
    const picks = [best];
    // A tilted slip can push half the line onto the row above or below.
    if (scores[best] < 3) picks.push(...[best - 1, best + 1].filter((j) => scores[j] > 0));
    for (const i of picks) {
      found.push(...parseDates([texts[i]]));
      for (const view of [rows[i].canvas, ...variantsOf(rows[i].canvas)]) found.push(...parseDates([await rec(view, 'date')]));
    }
  }
  if (!found.length && region) {
    // The rows could not be told apart, so the whole region is read as a block.
    for (const mode of ['block', 'dateBlock']) found.push(...parseDates((await rec(region, mode)).split('\n')));
  }
  return found;
}

// The part of a prepared slip that holds the date: the head, or failing that the
// top of the whole slip.
async function dateSource(sections, rec) {
  if (sections.head) return { region: sections.head, ...(await readRows(sections.head, rec)) };
  if (!sections.all) return null;
  const region = topOf(sections.all, 0.32);
  return { region, ...(await readRows(region, rec)) };
}

function isSettled(result) {
  const keys = RESULT_ROWS.filter((r) => !r.valueOptional).map((r) => r.key);
  const allFound = keys.every((k) => Number.isFinite(result.values[k]));
  return allFound && result.relationsBad === 0 && result.relationsOk >= 7 && keys.every((k) => result.status[k]?.state !== 'check');
}

export const STAGES = ['Finding the slip', 'Straightening it', 'Reading the numbers', 'Checking the arithmetic'];

export async function readSlip(file, { onStage = () => {}, known = {}, prior = {}, now = new Date(), hintDate = null, maxPasses = PASSES.length } = {}) {
  onStage(0);
  const worker = await engine();
  const { img, release } = await decodeImage(file);
  try {
    const candidates = {};
    const addCandidate = (key, parsed) => { if (parsed) (candidates[key] ||= []).push(parsed); };
    const dates = [], physiques = [];
    let gender = null, preview = null, located = false, bandCount = 0, turned = false, result = null, passesRun = 0, layout = 'unknown';

    for (let p = 0; p < Math.min(maxPasses, PASSES.length); p++) {
      passesRun = p + 1;
      onStage(1);
      await pause();
      const prepared = prepare(img, PASSES[p]);
      if (!preview) preview = prepared.upright;
      located = prepared.found; bandCount = prepared.bands.length; turned = prepared.turned; layout = prepared.layout;

      onStage(2);
      const rec = makeRecognizer(worker);
      const section = Object.fromEntries(prepared.sections.map((s) => [s.name, s.canvas]));

      if (section.values) await readValues(section.values, rec, addCandidate);
      if (section.result && PASSES[p].blocks) await readFullRows(section.result, rec, addCandidate);

      // Later passes only re-read what is still unresolved.
      const firstPass = p === 0;
      const needRange = ['fatLow', 'fatHigh', 'fatMassLow', 'fatMassHigh'].some((k) => !candidates[k]);

      const dateOpen = firstPass || !pickDate(dates, now, hintDate).sure;
      if (section.head && dateOpen) {
        const { rows, texts } = await readRows(section.head, rec);
        const parsedHead = parseSections([{ name: 'head', text: texts.join('\n') }]);
        for (const [k, list] of Object.entries(parsedHead.candidates)) {
          if (['age', 'height', 'clothes'].includes(k)) list.forEach((c) => addCandidate(k, c));
        }
        gender = gender || parseGender(texts);
        dates.push(...await readDate(rows, texts, section.head, rec));
      }

      if (section.headRight && (firstPass || !candidates.height || !candidates.age)) {
        const { texts } = await readRows(section.headRight, rec);
        for (const [k, parsed] of Object.entries(parseInputColumn(texts))) addCandidate(k, parsed);
        gender = gender || parseGender(texts);
      }

      if (section.range && (firstPass || needRange)) {
        const text = await rec(section.range, 'block');
        const parsedRange = parseSections([{ name: 'range', text }]);
        for (const [k, list] of Object.entries(parsedRange.candidates)) {
          if (k.startsWith('fat')) list.forEach((c) => addCandidate(k, c));
        }
      }

      if (section.tail && (firstPass || !physiques.length)) {
        const { rows, texts } = await readRows(section.tail, rec);
        const ph = parsePhysique(texts);
        if (ph) physiques.push(ph);
        // The boxed rating gets a second look, restricted to capital letters.
        const title = texts.findIndex((t) => /QUE|RATI|PHYS/i.test(t));
        if (title >= 0 && rows[title + 1]) {
          const caps = await rec(rows[title + 1].canvas, 'caps');
          const again = parsePhysique([caps]);
          if (again) physiques.push(again);
        }
        const parsedTail = parseSections([{ name: 'tail', text: texts.join('\n') }]);
        for (const [k, list] of Object.entries(parsedTail.candidates)) {
          if (/^[rx](6|50)$/.test(k)) list.forEach((c) => addCandidate(k, c));
        }
      }

      if (section.all) {
        const text = await rec(section.all, 'block');
        const parsed = parseSections([{ name: 'all', text }]);
        for (const [k, list] of Object.entries(parsed.candidates)) list.forEach((c) => addCandidate(k, c));
        dates.push(...parsed.dates);
        if (parsed.physique) physiques.push(parsed.physique);
        gender = gender || parsed.gender;
        // Without a head section, the date is looked for at the top of the slip.
        if (dateOpen) {
          const src = await dateSource(section, rec);
          if (src) dates.push(...await readDate(src.rows, src.texts, src.region, rec));
        }
      }

      onStage(3);
      await pause();
      result = solve(candidates, known, prior);
      if (isSettled(result)) break;
    }

    // An unsure date gets one more look on its own, at a size not tried yet.
    let picked = pickDate(dates, now, hintDate);
    if (!picked.sure && passesRun < Math.min(maxPasses, PASSES.length)) {
      const prepared = prepare(img, PASSES[passesRun]);
      const rec = makeRecognizer(worker);
      const src = await dateSource(Object.fromEntries(prepared.sections.map((s) => [s.name, s.canvas])), rec);
      if (src) {
        dates.push(...await readDate(src.rows, src.texts, src.region, rec));
        picked = pickDate(dates, now, hintDate);
      }
    }

    // Reactance always prints negative here, and the sign is easily lost.
    for (const key of ['x6', 'x50']) {
      if (Number.isFinite(result.values[key])) result.values[key] = -Math.abs(result.values[key]);
    }

    const found = Object.keys(candidates).length;
    const recognised = result.relationsOk >= 2 || found >= 6;
    const physique = physiques.length
      ? [...physiques.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;
    return {
      isSlip: recognised && (bandCount >= 2 || result.relationsOk >= 3),
      values: result.values,
      status: result.status,
      relationsOk: result.relationsOk,
      relationsBad: result.relationsBad,
      relationCount: RELATIONS.length,
      date: picked.date,
      dateSure: picked.sure,
      dateOptions: picked.options,
      dateReads: dates,
      physique,
      gender,
      candidates,
      preview,
      located,
      turned,
      // 'full' slip, 'top' or 'upper' close-up without the bottom, or 'unknown'.
      layout,
    };
  } finally {
    release();
  }
}

const pause = () => new Promise((r) => setTimeout(r, 30));
