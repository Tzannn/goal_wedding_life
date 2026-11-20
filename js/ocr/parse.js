// Turns noisy OCR text from a Tanita DC-360 slip into candidate field values.
// The slip layout is fixed, so rows are aligned against the known sequence
// rather than trusted one label at a time.

export const FORMATS = {
  weight: { dec: 1, min: 25, max: 300 },
  fatPct: { dec: 1, min: 4, max: 75 },
  fatMass: { dec: 1, min: 2, max: 200 },
  ffm: { dec: 1, min: 15, max: 160 },
  muscle: { dec: 1, min: 14, max: 150 },
  tbw: { dec: 1, min: 10, max: 120 },
  tbwPct: { dec: 1, min: 20, max: 85 },
  bone: { dec: 1, min: 0.8, max: 9 },
  bmrKj: { dec: 0, min: 2500, max: 21000 },
  bmrKcal: { dec: 0, min: 600, max: 5000 },
  metabolicAge: { dec: 0, min: 12, max: 99 },
  visceral: { dec: 0, min: 1, max: 59 },
  bmi: { dec: 1, min: 10, max: 90 },
  ideal: { dec: 1, min: 30, max: 130 },
  obesity: { dec: 1, min: -70, max: 300, signed: true },
  age: { dec: 0, min: 10, max: 99 },
  height: { dec: 1, min: 90, max: 230 },
  clothes: { dec: 1, min: 0, max: 3 },
  fatLow: { dec: 1, min: 2, max: 50 },
  fatHigh: { dec: 1, min: 5, max: 60 },
  fatMassLow: { dec: 1, min: 0.5, max: 60 },
  fatMassHigh: { dec: 1, min: 1, max: 90 },
  r6: { dec: 1, min: 100, max: 1500 },
  r50: { dec: 1, min: 100, max: 1500 },
  x6: { dec: 1, min: 1, max: 150, signed: true, abs: true },
  x50: { dec: 1, min: 1, max: 150, signed: true, abs: true },
};

// Look-alike characters, applied only inside the numeric part of a row.
const TO_DIGIT = {
  O: '0', o: '0', Q: '0', D: '0', U: '0',
  I: '1', l: '1', '|': '1', i: '1', '!': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  G: '6', b: '6', c: '6',
  T: '7', '/': '7', Y: '7',
  B: '8', '&': '8',
  g: '9', q: '9',
  A: '4', a: '4',
};

// The reverse, applied only inside label text.
const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const similarity = (a, b) => {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
};

const JUNK_EDGE = /^[\s|\][(){}\\/!'"`.,:;_~=^*©®°»«‘’“”•·—–-]+(?=.)|[\s|\][(){}\\/!'"`,:;_~=^*©®°»«‘’“”•·—–-]+$/g;
const clean = (line) => line.replace(JUNK_EDGE, '').trim();

const looksLikeValueToken = (t) => /\d/.test(t) || /^[%¥]$/.test(t) || /^k[gqyJj]?$/i.test(t) || /^kc/i.test(t);

// Splits a row into label text and value text. OCR keeps the wide gap between
// the left and right columns; full-width rows fall back to scanning tokens.
export function splitRow(line) {
  const s = clean(line);
  const wide = s.split(/\s{3,}/).filter(Boolean);
  if (wide.length >= 2) return { label: wide.slice(0, -1).join(' '), value: wide[wide.length - 1] };
  const tokens = s.split(/\s+/);
  let i = tokens.length;
  while (i > 0 && looksLikeValueToken(tokens[i - 1])) i--;
  return { label: tokens.slice(0, i).join(' '), value: tokens.slice(i).join(' ') };
}

function lettersOf(label) {
  let out = '';
  for (const c of label.toUpperCase()) {
    if (c >= 'A' && c <= 'Z') out += c;
    else if (TO_LETTER[c]) out += TO_LETTER[c];
  }
  return out;
}

// Cuts the unit off the value text and maps look-alike characters to digits.
export function numericText(value, unit) {
  let s = value.replace(/[‘’“”`'"~_^*]/g, '');
  const firstDigit = s.search(/[0-9OoQDIlSBZG]/);
  if (firstDigit < 0) return '';
  const cutAt = (re) => {
    const rest = s.slice(firstDigit + 1);
    const hit = rest.search(re);
    if (hit >= 0) s = s.slice(0, firstDigit + 1 + hit);
  };
  if (unit === 'kg' || unit === 'kj' || unit === 'kcal') cutAt(/[kKxXK]/);
  else if (unit === 'cm') cutAt(/[cCeE][mMnNrRhH]/);
  else if (unit === '%') cutAt(/[%¥#$]/);
  else cutAt(/[A-Zac-fh-pr-z%]/);

  let out = '';
  let lastWasGap = false;
  for (const c of s) {
    if (/[0-9]/.test(c)) { out += c; lastWasGap = false; }
    else if ('.,:;'.includes(c)) { if (!out.includes('.')) out += '.'; lastWasGap = false; }
    else if (c === '-' || c === '–' || c === '—') { if (!out) out += '-'; }
    else if (c === ' ') lastWasGap = true;
    else if (TO_DIGIT[c]) { out += TO_DIGIT[c]; lastWasGap = false; }
  }
  void lastWasGap;
  return out;
}

// Applies a field's print format. Every kg and % value prints exactly one
// decimal, so a lost decimal point can be restored from the digit count.
export function coerce(key, text) {
  const fmt = FORMATS[key];
  if (!fmt || !text) return null;
  const negative = fmt.signed && text.startsWith('-');
  let t = text.replace(/-/g, '').replace(/^\.+/, '');
  if (!/\d/.test(t)) return null;
  let value = null;
  let digits;
  if (fmt.dec === 0) {
    digits = t.split('.')[0];
    value = parseInt(digits, 10);
  } else if (t.includes('.')) {
    const [a, b] = t.split('.');
    digits = a + (b ? b[0] : '');
    if (b) value = parseFloat(`${a}.${b[0]}`);
    else if (a.length >= 2) value = parseFloat(`${a.slice(0, -1)}.${a.slice(-1)}`);
  } else if (t.length >= 2) {
    // A misread % or k glues an extra digit on the end of two-digit values.
    if (t.length === 4 && fmt.max < 100) t = t.slice(0, 3);
    digits = t;
    value = parseFloat(`${t.slice(0, -1)}.${t.slice(-1)}`);
  }
  if (value === null || Number.isNaN(value)) return null;
  if (negative && !fmt.abs) value = -value;
  if (value < fmt.min || value > fmt.max) return null;
  return { value, digits };
}

export const RESULT_ROWS = [
  { label: 'WEIGHT', key: 'weight', unit: 'kg' },
  { label: 'FAT', key: 'fatPct', unit: '%' },
  { label: 'FATMASS', key: 'fatMass', unit: 'kg' },
  { label: 'FFM', key: 'ffm', unit: 'kg' },
  { label: 'MUSCLEMASS', key: 'muscle', unit: 'kg' },
  { label: 'TBW', key: 'tbw', unit: 'kg' },
  { label: 'TBW', key: 'tbwPct', unit: '%' },
  { label: 'BONEMASS', key: 'bone', unit: 'kg' },
  { label: 'BMR', key: 'bmrKj', unit: 'kj' },
  { label: '', key: 'bmrKcal', unit: 'kcal' },
  { label: 'METABOLICAGE', key: 'metabolicAge', unit: '' },
  { label: 'VISCERALFATRATING', key: 'visceral', unit: '' },
  { label: 'BMI', key: 'bmi', unit: '' },
  { label: 'IDEALBODYWEIGHT', key: 'ideal', unit: 'kg', valueOptional: true },
  { label: '', key: 'ideal', unit: 'kg' },
  { label: 'DEGREEOFOBESITY', key: 'obesity', unit: '%', valueOptional: true },
  { label: '', key: 'obesity', unit: '%' },
];

function hasUnit(value, unit) {
  if (unit === 'kg') return /[kKxX]\s*[gqy9a3]?/.test(value);
  if (unit === 'kj') return /[kK]\s*[jJIl]/.test(value);
  if (unit === 'kcal') return /[kKxX]\s*c/i.test(value);
  if (unit === '%') return /[%¥]/.test(value);
  return false;
}

function rowScore(line, row) {
  const { label, value } = splitRow(line);
  const letters = lettersOf(label);
  const parsed = coerce(row.key, numericText(value, row.unit));
  let score = 0;
  if (row.label) {
    const sim = similarity(letters, row.label);
    score += sim * 3;
    if (sim < 0.34) score -= 1.5;
  } else {
    // A value-only row must have no real label in front of it.
    score += letters.length <= 2 ? 1.2 : -1.5;
  }
  if (parsed) score += 1;
  else if (!row.valueOptional) score -= 0.3;
  if (hasUnit(value, row.unit)) score += 0.6;
  return { score, parsed };
}

// Longest-path alignment of OCR lines onto the fixed sequence of rows.
export function alignRows(lines, rows = RESULT_ROWS) {
  const n = lines.length, m = rows.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  const cache = lines.map((line) => rows.map((row) => rowScore(line, row)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const skipLine = dp[i - 1][j], skipRow = dp[i][j - 1];
      const cell = cache[i - 1][j - 1];
      const match = dp[i - 1][j - 1] + cell.score;
      if (cell.score > 0.5 && match >= skipLine && match >= skipRow) {
        dp[i][j] = match; move[i][j] = 1;
      } else if (skipLine >= skipRow) {
        dp[i][j] = skipLine; move[i][j] = 2;
      } else {
        dp[i][j] = skipRow; move[i][j] = 3;
      }
    }
  }
  const pairs = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (move[i][j] === 1) { pairs.push({ line: i - 1, row: j - 1, ...cache[i - 1][j - 1] }); i--; j--; }
    else if (move[i][j] === 2) i--;
    else j--;
  }
  return pairs.reverse();
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function fuzzyMonth(raw) {
  const t = raw.toUpperCase().replace(/0/g, 'O').replace(/[^A-Z]/g, '');
  if (t.length < 2) return -1;
  let best = -1, bestSim = 0;
  MONTHS.forEach((m, i) => {
    const s = similarity(t.slice(0, 4), m);
    if (s > bestSim) { bestSim = s; best = i; }
  });
  return bestSim >= 0.6 ? best : -1;
}

const asDigits = (s) => s.replace(/[OoQD]/g, '0').replace(/[Il|!]/g, '1').replace(/[Ss]/g, '5')
  .replace(/B/g, '8').replace(/b/g, '6').replace(/[Zz]/g, '2').replace(/[^0-9]/g, '');

// The day, a slash, then the three letters of the month. The second slash is
// often lost or read as a letter, so it is not required.
const DAY_PART = /([0-9OoQDIl|!SsBZzV](?:\s?[0-9OoQDIl|!SsBZz])?)\s*[/\\|lI]\s*([A-Za-z0]{3})/;
const isPlain = (s) => /^\d+$/.test(s);

// "02/NOV/2026 06:14" in its many misread forms. Each line can give the day
// and month, the time, or both: a tilted slip can split them over two rows, and
// the engine often runs the year into the time ("202606:14"). The year is left
// out on purpose: on these slips 6 and 0 are nearly identical at photo
// resolution. `dayClean` and `timeClean` mark parts read as plain digits, with
// no letter standing in for one, which makes them more trustworthy.
export function parseDates(lines) {
  const found = [];
  for (const line of lines) {
    const read = {};
    const d = line.match(DAY_PART);
    if (d) {
      const month = fuzzyMonth(d[2]);
      const raw = d[1].replace(/\s/g, '');
      const day = parseInt(asDigits(raw).slice(-2), 10);
      // A letter or digit stuck to the front means the day was not read cleanly.
      const stuck = d.index > 0 && /[A-Za-z0-9]/.test(line[d.index - 1]);
      if (month >= 0 && day >= 1 && day <= 31) Object.assign(read, { day, month, dayClean: isPlain(raw) && !stuck });
    }
    // Away from a date, only a colon marks a time, so 6.25kHz is never 06:25.
    const sep = 'day' in read ? '[:;.,]' : '[:;]';
    const times = [...line.matchAll(new RegExp(`([0-9OoQDIl|!SsBb]{1,2})\\s*${sep}\\s*([0-9OoQDIl|!SsBZz]{1,2})(?!\\d)`, 'g'))];
    const t = times[times.length - 1];
    if (t) {
      const hour = parseInt(asDigits(t[1]), 10), minute = parseInt(asDigits(t[2]), 10);
      // A minute with one digit left is cut off: the hour still counts.
      const whole = asDigits(t[2]).length === 2;
      if (hour <= 23 && (!whole || minute <= 59)) {
        Object.assign(read, { hour, hourClean: isPlain(t[1]) });
        if (whole) Object.assign(read, { minute, timeClean: isPlain(t[1] + t[2]) });
      }
    }
    if ('day' in read || 'hour' in read) found.push({ ...read, raw: line.trim() });
  }
  return found;
}

const PHYSIQUES = [
  'HIDDEN OBESE', 'OBESE', 'SOLIDLY-BUILT', 'UNDER EXERCISED', 'STANDARD',
  'STANDARD MUSCULAR', 'THIN', 'THIN & MUSCULAR', 'VERY MUSCULAR',
];

export function parsePhysique(lines) {
  // The rating is the boxed line right after the PHYSIQUE RATING heading.
  let start = -1;
  lines.forEach((line, i) => {
    const L = line.toUpperCase().replace(/[^A-Z]/g, '');
    if (similarity(L.slice(-14), 'PHYSIQUERATING') > 0.55) start = i;
  });
  const pool = start >= 0 ? lines.slice(start + 1, start + 4) : lines;
  let best = null, bestSim = 0;
  for (const line of pool) {
    const L = line.toUpperCase().replace(/[^A-Z]/g, '');
    if (L.length < 3) continue;
    for (const name of PHYSIQUES) {
      const s = similarity(L, name.replace(/[^A-Z]/g, ''));
      if (s > bestSim) { bestSim = s; best = name; }
    }
  }
  return bestSim >= 0.55 ? best : null;
}

const rowsOf = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

const NUMBERISH = /[0-9OIlSBZ/]{1,3}\s?[.,:;]\s?[0-9OIlSBZ]|[0-9OIlSBZ/]{2,4}/g;

function numberChunks(text) {
  return (text.match(NUMBERISH) || []).map((c) => numericText(c, '').replace(/^-/, ''));
}

// Returns { candidates: { key: [ {value, digits} ] }, dates, physique }.
export function parseSections(sections) {
  const candidates = {};
  const add = (key, parsed) => {
    if (parsed) (candidates[key] ||= []).push(parsed);
  };
  const byName = Object.fromEntries(sections.map((s) => [s.name, rowsOf(s.text)]));
  const allLines = sections.flatMap((s) => rowsOf(s.text));

  const resultLines = byName.result || allLines;
  for (const p of alignRows(resultLines, RESULT_ROWS)) add(RESULT_ROWS[p.row].key, p.parsed);

  const head = byName.head || allLines;
  head.forEach((line, i) => {
    const { label, value } = splitRow(line);
    const letters = lettersOf(label);
    if (similarity(letters, 'AGE') >= 0.66) add('age', coerce('age', numericText(value, '')));
    if (similarity(letters, 'HEIGHT') >= 0.6) add('height', coerce('height', numericText(value, 'cm')));
    if (similarity(lettersOf(line).slice(0, 13), 'CLOTHESWEIGHT') >= 0.55) {
      const inline = coerce('clothes', numericText(value, 'kg'));
      if (inline) add('clothes', inline);
      else if (head[i + 1]) add('clothes', coerce('clothes', numericText(splitRow(head[i + 1]).value || head[i + 1], 'kg')));
    }
  });

  // First range row is fat %, second is fat mass.
  const range = byName.range || [];
  const pairs = [];
  for (const line of range) {
    const body = line.replace(/^\s*(F\w{1,2}\s*[%¥]?|F\w{1,2}\s+M\w{2,4})\s+/i, '');
    const nums = numberChunks(body);
    if (nums.length >= 2) pairs.push(nums.slice(-2));
  }
  if (pairs[0]) { add('fatLow', coerce('fatLow', pairs[0][0])); add('fatHigh', coerce('fatHigh', pairs[0][1])); }
  if (pairs[1]) { add('fatMassLow', coerce('fatMassLow', pairs[1][0])); add('fatMassHigh', coerce('fatMassHigh', pairs[1][1])); }

  const tail = byName.tail || allLines;
  const biaR = tail.find((l) => /^\W*[Rr]\s/.test(l));
  const biaX = tail.find((l) => /^\W*[Xx×]\s/.test(l));
  const twoNums = (l) => (l ? [...l.matchAll(/-?\s*\d{1,4}\s*[.,]\s*\d/g)].map((m) => m[0].replace(/\s/g, '').replace(',', '.')) : []);
  const r = twoNums(biaR), x = twoNums(biaX);
  if (r.length >= 2) { add('r6', coerce('r6', r[0])); add('r50', coerce('r50', r[1])); }
  if (x.length >= 2) { add('x6', coerce('x6', x[0])); add('x50', coerce('x50', x[1])); }

  return {
    candidates,
    dates: parseDates(head.length ? head : allLines),
    physique: parsePhysique(tail),
    gender: parseGender(head),
  };
}

// The right half of the INPUT box, read as a column: gender, age, height, then
// clothes weight, from top to bottom.
export function parseInputColumn(lines) {
  const found = {};
  const heightAt = lines.findIndex((l) => /\b1\d{2}\s*[.,]\s*[\dOo]\s*[cCoOeE]/.test(l));
  if (heightAt >= 0) {
    const m = lines[heightAt].match(/\b(1\d{2})\s*[.,]\s*([\dOo])/);
    found.height = coerce('height', `${m[1]}.${m[2].replace(/[Oo]/, '0')}`);
    for (let i = heightAt - 1; i >= Math.max(0, heightAt - 2); i--) {
      const age = lines[i].replace(/[^0-9OoSlI]/g, '');
      const parsed = age.length === 2 ? coerce('age', numericText(age, '')) : null;
      if (parsed) { found.age = parsed; break; }
    }
    for (const line of lines.slice(heightAt + 1)) {
      const parsed = /[kK]/.test(line) ? coerce('clothes', numericText(line, 'kg')) : null;
      if (parsed) { found.clothes = parsed; break; }
    }
  }
  return found;
}

export function parseGender(lines) {
  for (const line of lines) {
    const L = lettersOf(line);
    // Checked in this order because MALE is contained in FEMALE.
    if (/FEMAL/.test(L) || (L.startsWith('FE') && similarity(L, 'FEMALE') >= 0.66)) return 'female';
    if (similarity(L, 'MALE') >= 0.75 || (/MAL/.test(L) && (L.startsWith('GEN') || similarity(L.slice(0, 6), 'GENDER') >= 0.6))) return 'male';
  }
  return null;
}

// A candidate read from one row's value column, using its known format.
export function candidateFrom(row, text) {
  // Anything left of a wide gap is a stray mark or the end of a long label.
  let t = text.trim().split(/\s{2,}/).pop() || '';
  // Integer rows sit beside a long label; only the last token is the value.
  if (FORMATS[row.key].dec === 0 && !row.unit) t = t.trim().split(/\s+/).pop() || '';
  return coerce(row.key, numericText(t, row.unit));
}
