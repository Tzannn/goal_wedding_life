// Everything the app works out from the raw readings: progress, belts, ranks,
// trophies and the coach's notes. No rendering and no storage in this file.

export const SLIP_ROWS = [
  { key: 'weight', label: 'Weight', unit: 'kg', dec: 1, required: true },
  { key: 'fatPct', label: 'Fat %', unit: '%', dec: 1, required: true },
  { key: 'fatMass', label: 'Fat mass', unit: 'kg', dec: 1 },
  { key: 'ffm', label: 'FFM', hint: 'Fat-free mass', unit: 'kg', dec: 1 },
  { key: 'muscle', label: 'Muscle mass', unit: 'kg', dec: 1, required: true },
  { key: 'tbw', label: 'TBW', hint: 'Total body water', unit: 'kg', dec: 1 },
  { key: 'tbwPct', label: 'TBW %', unit: '%', dec: 1 },
  { key: 'bone', label: 'Bone mass', unit: 'kg', dec: 1 },
  { key: 'bmrKj', label: 'BMR', unit: 'kJ', dec: 0 },
  { key: 'bmrKcal', label: 'BMR', unit: 'kcal', dec: 0 },
  { key: 'metabolicAge', label: 'Metabolic age', unit: '', dec: 0 },
  { key: 'visceral', label: 'Visceral fat rating', unit: '', dec: 0 },
  { key: 'bmi', label: 'BMI', unit: '', dec: 1 },
  { key: 'ideal', label: 'Ideal body weight', unit: 'kg', dec: 1 },
  { key: 'obesity', label: 'Degree of obesity', unit: '%', dec: 1 },
];

export const RANGE_ROWS = [
  { key: 'fatLow', label: 'Fat % low', unit: '%', dec: 1 },
  { key: 'fatHigh', label: 'Fat % high', unit: '%', dec: 1 },
  { key: 'fatMassLow', label: 'Fat mass low', unit: 'kg', dec: 1 },
  { key: 'fatMassHigh', label: 'Fat mass high', unit: 'kg', dec: 1 },
];

export const INPUT_ROWS = [
  { key: 'age', label: 'Age', unit: '', dec: 0 },
  { key: 'height', label: 'Height', unit: 'cm', dec: 1 },
  { key: 'clothes', label: 'Clothes weight', unit: 'kg', dec: 1 },
];

export const BIO_ROWS = [
  { key: 'r6', label: 'R at 6.25 kHz', unit: '', dec: 1 },
  { key: 'r50', label: 'R at 50 kHz', unit: '', dec: 1 },
  { key: 'x6', label: 'X at 6.25 kHz', unit: '', dec: 1 },
  { key: 'x50', label: 'X at 50 kHz', unit: '', dec: 1 },
];

// `better`: +1 higher is better, -1 lower is better, 0 neither.
export const METRICS = [
  { key: 'fatPct', label: 'Body fat', unit: '%', dec: 1, better: -1 },
  { key: 'fatMass', label: 'Fat mass', unit: 'kg', dec: 1, better: -1 },
  { key: 'muscle', label: 'Muscle mass', unit: 'kg', dec: 1, better: 1 },
  { key: 'ffm', label: 'Fat-free mass', unit: 'kg', dec: 1, better: 1 },
  { key: 'weight', label: 'Weight', unit: 'kg', dec: 1, better: 0 },
  { key: 'tbw', label: 'TBW', hint: 'Total body water', unit: 'kg', dec: 1, better: 0 },
  { key: 'tbwPct', label: 'TBW %', hint: 'Share of body weight', unit: '%', dec: 1, better: 0 },
  { key: 'bone', label: 'Bone mass', unit: 'kg', dec: 1, better: 0 },
  { key: 'bmrKcal', label: 'BMR', unit: 'kcal', dec: 0, better: 1 },
  { key: 'metabolicAge', label: 'Metabolic age', unit: 'yrs', dec: 0, better: -1 },
  { key: 'visceral', label: 'Visceral fat rating', unit: '', dec: 0, better: -1 },
  { key: 'obesity', label: 'Degree of obesity', unit: '%', dec: 1, better: -1 },
  { key: 'bmi', label: 'BMI', unit: '', dec: 1, better: 0 },
  { key: 'phase', label: 'Phase angle', hint: 'From the bioelectrical data', unit: '°', dec: 2, better: 1, derived: true },
];

export const metricOf = (key) => METRICS.find((m) => m.key === key);

// Tanita's nine physique ratings, laid out as the scanner defines them:
// rows run from high to low body fat, columns from low to high muscle.
export const PHYSIQUE_GRID = [
  ['HIDDEN OBESE', 'OBESE', 'SOLIDLY-BUILT'],
  ['UNDER EXERCISED', 'STANDARD', 'STANDARD MUSCULAR'],
  ['THIN', 'THIN & MUSCULAR', 'VERY MUSCULAR'],
];

export const PHYSIQUES = PHYSIQUE_GRID.flat();

export const physiqueCell = (name) => {
  for (let r = 0; r < 3; r++) {
    const c = PHYSIQUE_GRID[r].indexOf(name);
    if (c >= 0) return { r, c };
  }
  return null;
};

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
export const physiqueLabel = (name) => (name ? titleCase(name) : '');

// ---------- small helpers ----------

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const asDate = (r) => new Date(r.takenAt);
export const byTime = (a, b) => a.takenAt.localeCompare(b.takenAt);

// Rounds trained where there is no scanner count towards the round number and
// the weekly streak, never towards the numbers. They carry `training: true`.
export const timelineOf = (list, trainings = []) => [...list, ...trainings.map((t) => ({ ...t, training: true }))].sort(byTime);
export const fixed = (v, dec = 1) => (isNum(v) ? v.toFixed(dec) : '–');
export const signed = (v, dec = 1) => {
  if (!isNum(v)) return '–';
  const r = Number(v.toFixed(dec));
  if (r === 0) return (0).toFixed(dec);
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(dec)}`;
};
const DAY = 86400000;
export const daysBetween = (a, b) => (asDate(b) - asDate(a)) / DAY;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = MON;
export const shortDate = (d) => `${d.getDate()} ${MON[d.getMonth()]}`;
export const longDate = (d) => `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
export const monthLong = (d) => `${MON[d.getMonth()]} ${d.getFullYear()}`;
export const monthShort = (d) => `${MON[d.getMonth()]} ’${String(d.getFullYear()).slice(2)}`;
const pad2 = (n) => String(n).padStart(2, '0');
// The local calendar day, in the same form that starts every `takenAt`.
export const dayKeyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const clock = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const clockFromMinutes = (m) => `${pad2(Math.floor(m / 60))}:${pad2(Math.round(m % 60))}`;

export function withDerived(r) {
  const out = { ...r };
  if (isNum(r.r50) && isNum(r.x50) && r.r50 > 0) {
    out.phase = (Math.atan(Math.abs(r.x50) / r.r50) * 180) / Math.PI;
  }
  return out;
}

const minutesOfDay = (r) => {
  const d = asDate(r);
  return d.getHours() * 60 + d.getMinutes();
};

// The time this person normally scans, once there is enough history to say.
export function usualMinutes(list) {
  if (list.length < 3) return null;
  const sorted = list.map(minutesOfDay).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const isUnusualTime = (r, usual) => usual !== null && Math.abs(minutesOfDay(r) - usual) >= 180;

// ---------- official scores ----------

// One good or bad day cannot move a rank: belts and trophies use the average of
// the latest three scans.
export function official(list, key, count = 3) {
  const values = list.slice(-count).map((r) => r[key]).filter(isNum);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const firstValue = (list, key) => {
  for (const r of list) if (isNum(r[key])) return r[key];
  return null;
};

export function defaultGoals(first, sex) {
  const low = isNum(first?.fatLow) ? first.fatLow : sex === 'female' ? 21 : 11;
  const high = isNum(first?.fatHigh) ? first.fatHigh : sex === 'female' ? 33 : 21.9;
  const muscleStart = isNum(first?.muscle) ? first.muscle : 50;
  return {
    fatPct: Math.round(low + (high - low) / 3),
    muscle: Math.round(muscleStart + (sex === 'female' ? 3 : 5)),
    visceral: 9,
    metabolicAge: isNum(first?.age) ? first.age : 30,
  };
}

const BELT_DEFS = [
  { id: 'burn', name: 'Burn Belt', key: 'fatPct', label: 'Body fat', unit: '%', dec: 1, dir: -1 },
  { id: 'iron', name: 'Iron Belt', key: 'muscle', label: 'Muscle mass', unit: 'kg', dec: 1, dir: 1 },
  { id: 'core', name: 'Core Belt', key: 'visceral', label: 'Visceral fat', unit: '', dec: 0, dir: -1 },
  { id: 'time', name: 'Time Belt', key: 'metabolicAge', label: 'Metabolic age', unit: 'yrs', dec: 0, dir: -1 },
];

export function belts(list, goals) {
  return BELT_DEFS.map((b) => {
    const start = firstValue(list, b.key);
    const now = official(list, b.key);
    const goal = goals?.[b.key];
    let progress = 0;
    let won = false;
    if (isNum(start) && isNum(now) && isNum(goal)) {
      const span = goal - start;
      const already = b.dir < 0 ? start <= goal : start >= goal;
      progress = already ? 1 : Math.max(0, Math.min(1, (now - start) / span));
      won = b.dir < 0 ? now <= goal : now >= goal;
    }
    return { ...b, start, now, goal, progress, won };
  });
}

const RANKS = [
  { name: 'Rookie', at: 0 },
  { name: 'Prospect', at: 0.2 },
  { name: 'Contender', at: 0.4 },
  { name: 'Challenger', at: 0.6 },
  { name: 'Title Shot', at: 0.8 },
  { name: 'Undisputed', at: 1 },
];

export const RANK_NAMES = RANKS.map((r) => r.name);

export function rankOf(list, goals) {
  const all = belts(list, goals);
  const score = all.reduce((sum, b) => sum + b.progress, 0) / all.length;
  const undisputed = all.every((b) => b.won);
  let index = 0;
  RANKS.forEach((r, i) => {
    if (score >= r.at && i < RANKS.length - 1) index = i;
  });
  if (undisputed) index = RANKS.length - 1;
  const next = RANKS[index + 1] || null;
  return {
    index,
    name: RANKS[index].name,
    score,
    next: next?.name ?? null,
    from: RANKS[index].at,
    to: next?.at ?? 1,
    won: all.filter((b) => b.won).length,
    belts: all,
  };
}

// ---------- headline ----------

export function headline(list) {
  if (!list.length) return null;
  const first = list[0], last = list[list.length - 1];
  const delta = (k) => (isNum(first[k]) && isNum(last[k]) ? last[k] - first[k] : null);
  const fat = delta('fatMass');
  const muscle = delta('muscle');
  const weight = delta('weight');
  const transformed = isNum(fat) && isNum(muscle) ? muscle - fat : null;
  let verdict = 'Baseline set';
  if (list.length > 1 && isNum(fat) && isNum(muscle)) {
    const fatDown = fat < -0.05, fatUp = fat > 0.05, muscleUp = muscle > 0.05, muscleDown = muscle < -0.05;
    if (fatDown && muscleUp) verdict = 'Winning on points';
    else if (fatDown) verdict = muscleDown ? 'Cutting. Protect the muscle' : 'Fat is falling';
    else if (muscleUp) verdict = fatUp ? 'Building. Watch the fat' : 'Muscle is climbing';
    else if (fatUp || muscleDown) verdict = 'Tough stretch. Reset';
    else verdict = 'Holding the line';
  }
  return { first, last, fat, muscle, weight, transformed, verdict, rounds: list.length, days: Math.round(daysBetween(first, last)) };
}

const weekIndex = (date) => {
  // Weeks start on Monday. Local noon avoids daylight-saving edges.
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const monday = d.getDate() - ((d.getDay() + 6) % 7);
  const start = new Date(d.getFullYear(), d.getMonth(), monday, 12);
  return Math.round(start.getTime() / (7 * DAY));
};

export function weekStreak(list, today = new Date()) {
  if (!list.length) return 0;
  const weeks = new Set(list.map((r) => weekIndex(asDate(r))));
  const nowWeek = weekIndex(today);
  let w = weeks.has(nowWeek) ? nowWeek : nowWeek - 1;
  if (!weeks.has(w)) return 0;
  let streak = 0;
  while (weeks.has(w)) { streak++; w--; }
  return streak;
}

export function nextScan(list, today = new Date()) {
  if (!list.length) return null;
  const gaps = [];
  for (let i = 1; i < list.length; i++) gaps.push(daysBetween(list[i - 1], list[i]));
  const sorted = gaps.sort((a, b) => a - b);
  const typical = sorted.length ? Math.max(1, Math.round(sorted[sorted.length >> 1])) : 7;
  const due = new Date(asDate(list[list.length - 1]).getTime() + typical * DAY);
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysUntil = Math.round((startOfDay(due) - startOfDay(today)) / DAY);
  return { typical, due, daysUntil };
}

// ---------- rounds ----------

const ROUND_KEYS = ['fatMass', 'muscle', 'fatPct', 'visceral', 'metabolicAge', 'weight'];

export function judgeRound(list, index) {
  const cur = list[index], prev = list[index - 1];
  if (!prev) return { title: 'Day one', tone: 'even', rows: [], line: 'The baseline is on the card.' };
  const rows = ROUND_KEYS.filter((k) => isNum(cur[k]) && isNum(prev[k])).map((k) => {
    const m = metricOf(k);
    const change = cur[k] - prev[k];
    const moved = Math.abs(change) >= 0.5 * 10 ** -m.dec;
    return { key: k, label: m.label, unit: m.unit, dec: m.dec, change, value: cur[k], good: moved && m.better !== 0 ? change * m.better > 0 : null };
  });
  const dFat = isNum(cur.fatMass) && isNum(prev.fatMass) ? cur.fatMass - prev.fatMass : 0;
  const dMuscle = isNum(cur.muscle) && isNum(prev.muscle) ? cur.muscle - prev.muscle : 0;
  const net = dMuscle - dFat;
  if (net > 0.15) return { title: 'Round won', tone: 'won', rows, net, line: 'More muscle, less fat than last time out.' };
  if (net < -0.15) return { title: 'Tough round', tone: 'lost', rows, net, line: 'Champions drop rounds and still take the fight.' };
  return { title: 'Even round', tone: 'even', rows, net, line: 'You held your ground.' };
}

const RECORDS = [
  { key: 'fatMass', dir: -1, label: 'Lowest fat mass' },
  { key: 'fatPct', dir: -1, label: 'Lowest body fat' },
  { key: 'muscle', dir: 1, label: 'Most muscle' },
  { key: 'metabolicAge', dir: -1, label: 'Youngest metabolic age' },
  { key: 'visceral', dir: -1, label: 'Lowest visceral fat' },
  { key: 'bmrKcal', dir: 1, label: 'Highest BMR' },
];

export function newRecords(list, index = list.length - 1) {
  const cur = list[index];
  const before = list.slice(0, index);
  if (!before.length) return [];
  const out = [];
  for (const rec of RECORDS) {
    if (!isNum(cur[rec.key])) continue;
    const past = before.map((r) => r[rec.key]).filter(isNum);
    if (!past.length) continue;
    const best = rec.dir < 0 ? Math.min(...past) : Math.max(...past);
    if (rec.dir < 0 ? cur[rec.key] < best : cur[rec.key] > best) {
      const m = metricOf(rec.key);
      out.push({ ...rec, value: cur[rec.key], unit: m.unit, dec: m.dec });
    }
  }
  return out;
}

export function personalBests(list) {
  return RECORDS.map((rec) => {
    const options = list.filter((r) => isNum(r[rec.key]));
    if (!options.length) return null;
    const best = options.reduce((a, b) => (rec.dir < 0 ? (b[rec.key] < a[rec.key] ? b : a) : (b[rec.key] > a[rec.key] ? b : a)));
    const m = metricOf(rec.key);
    return { ...rec, value: best[rec.key], unit: m.unit, dec: m.dec, reading: best };
  }).filter(Boolean);
}

// ---------- trophies ----------

const physiqueScore = (name) => {
  const cell = physiqueCell(name);
  return cell ? cell.r + cell.c : null;
};

const TROPHY_DEFS = [
  { id: 'first-bell', name: 'First Bell', how: 'Log your first scan', test: (c) => c.n >= 1 },
  { id: 'five-rounds', name: 'Five Rounds', how: 'Log 5 scans', test: (c) => c.n >= 5 },
  { id: 'twelve-rounds', name: 'Twelve Rounds', how: 'Log 12 scans, a full title fight', test: (c) => c.n >= 12 },
  { id: 'streak-4', name: 'Training Camp', how: 'Train 4 weeks in a row', test: (c) => c.streak >= 4 },
  { id: 'streak-12', name: 'Iron Habit', how: 'Train 12 weeks in a row', test: (c) => c.streak >= 12 },
  { id: 'class-up', name: 'Class Up', how: 'Improve your physique rating', test: (c) => c.physiqueUp },
  { id: 'recomp', name: 'Recomp Confirmed', how: 'Fat down and muscle up, held for 2 weeks', test: (c) => c.span >= 14 && c.dFat <= -0.2 && c.dMuscle >= 0.2 },
  { id: 'fat-1', name: 'First Kilo Down', how: 'Lose 1 kg of fat', test: (c) => c.dFat <= -1 },
  { id: 'fat-5', name: 'Five Down', how: 'Lose 5 kg of fat', test: (c) => c.dFat <= -5 },
  { id: 'fat-10', name: 'Ten Down', how: 'Lose 10 kg of fat', test: (c) => c.dFat <= -10 },
  // Muscle cannot appear in days, so these wait until water swings have settled.
  { id: 'muscle-1', name: 'Lean Kilo', how: 'Gain 1 kg of muscle, held for 2 weeks', test: (c) => c.span >= 14 && c.dMuscle >= 1 },
  { id: 'muscle-3', name: 'Three Up', how: 'Gain 3 kg of muscle, held for 6 weeks', test: (c) => c.span >= 42 && c.dMuscle >= 3 },
  { id: 'in-range', name: 'In The Range', how: 'Reach the desirable fat % on your slip', test: (c) => isNum(c.fatPct) && isNum(c.fatHigh) && c.fatPct <= c.fatHigh },
  { id: 'clean-core', name: 'Clean Core', how: 'Get visceral fat under 10', test: (c) => isNum(c.visceral) && c.visceral < 10 },
  { id: 'time-5', name: 'Time Machine', how: 'Take 5 years off your metabolic age', test: (c) => c.dMeta <= -5 },
  { id: 'time-age', name: 'Younger Than You', how: 'Reach a metabolic age at or under your real age', test: (c) => isNum(c.meta) && isNum(c.age) && c.meta <= c.age },
];

// Each trophy is dated by the first scan that earned it. Rounds trained
// without a scan count towards the streak trophies.
export function trophies(list, trainings = []) {
  const earned = new Map();
  for (let i = 0; i < list.length; i++) {
    const upto = list.slice(0, i + 1);
    const first = upto[0], cur = upto[i];
    const avgFat = official(upto, 'fatMass'), avgMuscle = official(upto, 'muscle');
    const startFat = firstValue(upto, 'fatMass'), startMuscle = firstValue(upto, 'muscle');
    const startPhysique = physiqueScore(first.physique);
    const curPhysique = physiqueScore(cur.physique);
    const ctx = {
      n: upto.length,
      streak: bestRun([...upto, ...trainings.filter((t) => t.takenAt <= cur.takenAt)]),
      span: daysBetween(first, cur),
      dFat: isNum(avgFat) && isNum(startFat) && upto.length > 1 ? avgFat - startFat : 0,
      dMuscle: isNum(avgMuscle) && isNum(startMuscle) && upto.length > 1 ? avgMuscle - startMuscle : 0,
      dMeta: upto.length > 1 && isNum(official(upto, 'metabolicAge')) && isNum(first.metabolicAge) ? official(upto, 'metabolicAge') - first.metabolicAge : 0,
      meta: official(upto, 'metabolicAge'),
      age: cur.age,
      visceral: official(upto, 'visceral'),
      fatPct: official(upto, 'fatPct'),
      fatHigh: cur.fatHigh,
      physiqueUp: startPhysique !== null && curPhysique !== null && curPhysique > startPhysique,
    };
    for (const t of TROPHY_DEFS) {
      if (!earned.has(t.id) && t.test(ctx)) earned.set(t.id, cur);
    }
  }
  return TROPHY_DEFS.map((t) => ({ ...t, earnedAt: earned.get(t.id) ?? null }));
}

function bestRun(list) {
  const weeks = [...new Set(list.map((r) => weekIndex(asDate(r))))].sort((a, b) => a - b);
  let best = 0, run = 0;
  weeks.forEach((w, i) => {
    run = i && w === weeks[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

// ---------- the coach ----------

export function coachNotes(list) {
  const notes = [];
  const n = list.length;
  if (!n) return notes;
  const last = list[n - 1], first = list[0], prev = list[n - 2];
  if (n === 1) {
    notes.push({ tone: 'plan', tag: 'Next round', body: 'Scan again at this same time of day, before food and training. Matching conditions is what makes rounds comparable.' });
    return notes;
  }
  const usual = usualMinutes(list);
  if (isUnusualTime(last, usual)) {
    notes.push({ tone: 'caution', tag: 'Check the clock', body: `This scan was at ${clock(asDate(last))} and you usually scan around ${clockFromMinutes(usual)}. Body water changes through the day, so compare it with care.` });
  }
  if (prev && isNum(last.ffm) && isNum(prev.ffm) && isNum(last.tbw) && isNum(prev.tbw)) {
    const dLean = last.ffm - prev.ffm, dWater = last.tbw - prev.tbw;
    if (dLean >= 0.5 && dWater >= dLean * 0.85) {
      notes.push({ tone: 'caution', tag: 'Mostly water', body: `Lean mass rose ${dLean.toFixed(1)} kg since your last scan and body water rose ${dWater.toFixed(1)} kg, so water explains most of it. Real muscle grows about 0.5 to 1 kg a month at best.` });
    } else if (dLean <= -0.5 && dWater <= dLean * 0.85) {
      notes.push({ tone: 'caution', tag: 'Water dip', body: `Lean mass fell ${Math.abs(dLean).toFixed(1)} kg and body water fell ${Math.abs(dWater).toFixed(1)} kg. That points to hydration, not lost muscle.` });
    }
  }
  const dW = isNum(last.weight) && isNum(first.weight) ? last.weight - first.weight : null;
  const dF = isNum(last.fatMass) && isNum(first.fatMass) ? last.fatMass - first.fatMass : null;
  if (isNum(dW) && isNum(dF) && dW > 0.2 && dF < -0.2) {
    notes.push({ tone: 'fire', tag: 'The scale missed it', body: `Weight is up ${dW.toFixed(1)} kg since Day One, yet fat is down ${Math.abs(dF).toFixed(1)} kg. A bathroom scale would have called that a loss.` });
  } else if (isNum(dF) && dF < -0.2) {
    notes.push({ tone: 'fire', tag: 'Fat is falling', body: `${Math.abs(dF).toFixed(1)} kg of fat gone since Day One. Keep the protein high and keep lifting.` });
  }
  if (isNum(last.fatMass) && isNum(last.fatMassHigh) && last.fatMass > last.fatMassHigh) {
    notes.push({ tone: 'plan', tag: 'Next target', body: `${(last.fatMass - last.fatMassHigh).toFixed(1)} kg of fat stands between you and the desirable range on your slip.` });
  }
  return notes.slice(0, 3);
}

// ---------- targets ----------

// Three milestones on the way to the final goal. Gold is the goal itself, which
// the belts also use. Bronze and Silver sit on a straight line from Day One to
// Gold unless the person sets their own numbers.
export const TIERS = [
  { id: 'bronze', name: 'Bronze', color: '#c8834e', months: 7 },
  { id: 'silver', name: 'Silver', color: '#c1c7d3', months: 9 },
  { id: 'gold', name: 'Gold', color: '#edbe55', months: 15 },
];
export const TARGET_KEYS = ['fatPct', 'muscle', 'visceral', 'metabolicAge'];

export const monthKeyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const monthStart = (key) => {
  const [yy, mm] = key.split('-').map(Number);
  return new Date(yy, mm - 1, 1);
};

export function autoTarget(startValue, goal, start, date, goalDate, dec) {
  if (!isNum(startValue) || !isNum(goal)) return null;
  const span = goalDate - start;
  const frac = span > 0 ? Math.min(1, Math.max(0, (date - start) / span)) : 1;
  return Number((startValue + (goal - startValue) * frac).toFixed(dec));
}

export function planFor(list, phases, goals) {
  if (!list.length) return null;
  const start = asDate(list[0]);
  const tiers = TIERS.map((t) => {
    const saved = phases?.find((p) => p.tier === t.id);
    const month = saved?.month ?? monthKeyOf(new Date(start.getFullYear(), start.getMonth() + t.months, 1));
    return { ...t, month, date: monthStart(month), label: saved?.label ?? '', custom: saved?.targets ?? {} };
  });
  const goldDate = tiers[tiers.length - 1].date;
  for (const t of tiers) {
    t.targets = {};
    for (const key of TARGET_KEYS) {
      if (t.id === 'gold') t.targets[key] = isNum(goals?.[key]) ? goals[key] : null;
      else if (isNum(t.custom[key])) t.targets[key] = t.custom[key];
      else t.targets[key] = autoTarget(firstValue(list, key), goals?.[key], start, t.date, goldDate, metricOf(key).dec);
    }
  }
  return { start, tiers, startValues: Object.fromEntries(TARGET_KEYS.map((k) => [k, firstValue(list, k)])) };
}

// The planned value on any date: straight lines between the milestones.
export function planValueAt(plan, key, date) {
  const pts = [{ t: +plan.start, v: plan.startValues[key] }, ...plan.tiers.map((t) => ({ t: +t.date, v: t.targets[key] }))]
    .filter((p) => isNum(p.v))
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return null;
  const t = +date;
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) return pts[i - 1].v + ((pts[i].v - pts[i - 1].v) * (t - pts[i - 1].t)) / (pts[i].t - pts[i - 1].t);
  }
  return pts[pts.length - 1].v;
}

// Where the average of the last 3 scans sits against the plan on that date.
export function planStatus(plan, list, key) {
  const m = metricOf(key);
  const now = official(list, key);
  if (!isNum(now)) return null;
  const planned = planValueAt(plan, key, asDate(list[list.length - 1]));
  if (!isNum(planned)) return { now, planned: null, diff: null };
  const diff = now - planned;
  return { now, planned, diff, onPlan: Math.abs(diff) < 0.5 * 10 ** -m.dec, ahead: diff * m.better > 0 };
}

// How far along the road from Day One to one milestone, and where the plan says
// that should be today. Both run from 0 to 1. Now is the average of the last 3.
export function tierProgress(plan, list, key, tierId, today = new Date()) {
  const tier = plan.tiers.find((t) => t.id === tierId);
  const start = plan.startValues[key];
  const target = tier?.targets[key];
  const now = official(list, key);
  if (!isNum(start) || !isNum(target) || !isNum(now)) return null;
  const span = target - start;
  const share = (v) => (Math.abs(span) < 1e-9 ? 1 : Math.max(0, Math.min(1, (v - start) / span)));
  const planned = planValueAt(plan, key, today);
  return { start, now, target, done: share(now), expected: isNum(planned) ? share(planned) : null };
}

// The first milestone still ahead, or the last one once all have passed.
export const nextTier = (plan, today = new Date()) => plan.tiers.find((t) => t.date > today) ?? plan.tiers[plan.tiers.length - 1];

// ---------- fighter card ----------

// Six game-style ratings out of 99, clockwise from the top of the hexagon.
// Every scale puts 60 on the healthy line for its measure, so a number means the
// same on all six. They are this app's own scales, anchored to the ranges on the
// slip and to widely used references: for motivation, not a medical score.
export const STATS = [
  { id: 'lean', name: 'Lean', how: 'Body fat % against the desirable range printed on your slip.' },
  { id: 'power', name: 'Power', how: 'Fat-free mass for your height (FFMI).' },
  { id: 'engine', name: 'Engine', how: 'Calories burned at rest against the usual figure for your weight, height and age.' },
  { id: 'water', name: 'Water', how: 'Body water as a share of your weight.' },
  { id: 'core', name: 'Core', how: 'Visceral fat rating, read against the marks on your slip.' },
  { id: 'youth', name: 'Youth', how: 'Metabolic age against your real age.' },
];

export const BANDS = [
  { min: 90, max: 99, name: 'Elite' },
  { min: 75, max: 89, name: 'Strong' },
  { min: 60, max: 74, name: 'Good' },
  { min: 40, max: 59, name: 'Fair' },
  { min: 1, max: 39, name: 'Needs work' },
];
export const bandOf = (score) => (isNum(score) ? (BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1]).name : null);

const rate = (v) => Math.max(1, Math.min(99, Math.round(v)));
const f1 = (v) => v.toFixed(1);
const trim = (v) => String(Number(v.toFixed(1)));

// Straight lines between [measure, rating] anchors, carried on past both ends.
function along(x, pts) {
  let i = 1;
  while (i < pts.length - 1 && x > pts[i][0]) i++;
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

// Each scale: the measure, its anchors, and both written out for the person.
const SCALES = {
  lean(v, female) {
    if (!isNum(v.fatPct)) return null;
    const low = isNum(v.fatLow) ? v.fatLow : female ? 21 : 11;
    const high = isNum(v.fatHigh) ? v.fatHigh : female ? 33 : 21.9;
    return {
      x: v.fatPct,
      pts: [[low, 99], [high, 60], [high + 20, 20]],
      measure: `Body fat ${f1(v.fatPct)}%`,
      bench: `60 = ${f1(high)}%, the top of the desirable range on your slip. 99 = ${f1(low)}% or less.`,
    };
  },
  power(v, female) {
    const ffm = isNum(v.ffm) ? v.ffm : isNum(v.weight) && isNum(v.fatMass) ? v.weight - v.fatMass : null;
    if (!isNum(ffm) || !isNum(v.height) || v.height <= 0) return null;
    const ffmi = ffm / (v.height / 100) ** 2;
    const [avg, top] = female ? [15.5, 21] : [19, 25];
    return {
      x: ffmi,
      pts: [[avg - 4, 20], [avg, 60], [top, 99]],
      measure: `FFMI ${f1(ffmi)}, your ${f1(ffm)} kg of fat-free mass divided by height²`,
      bench: `60 = ${avg}, about average for a ${female ? 'woman' : 'man'}. 99 = ${top}, about the natural limit.`,
    };
  },
  engine(v, female) {
    if (!isNum(v.bmrKcal) || !isNum(v.weight) || !isNum(v.height) || !isNum(v.age)) return null;
    // Mifflin-St Jeor: the usual resting burn for this weight, height and age.
    const usual = 10 * v.weight + 6.25 * v.height - 5 * v.age + (female ? -161 : 5);
    const r = v.bmrKcal / usual;
    const pct = (r - 1) * 100;
    const how = Math.abs(pct) < 0.5 ? 'right on' : `${f1(Math.abs(pct))}% ${pct > 0 ? 'above' : 'below'}`;
    return {
      x: r,
      pts: [[0.9, 20], [1, 60], [1.1, 99]],
      measure: `Burns ${Math.round(v.bmrKcal)} kcal at rest, ${how} the usual ${Math.round(usual)} for your size and age`,
      bench: '60 = the usual burn. 99 = 10% above it.',
    };
  },
  water(v, female) {
    if (!isNum(v.tbwPct)) return null;
    const [floor, top] = female ? [45, 55] : [50, 60];
    return {
      x: v.tbwPct,
      pts: [[floor - 10, 20], [floor, 60], [top, 99]],
      measure: `Body water ${f1(v.tbwPct)}% of your weight`,
      bench: `60 = ${floor}%, where the healthy range for ${female ? 'women' : 'men'} starts. 99 = ${top}% or more.`,
    };
  },
  core(v) {
    if (!isNum(v.visceral)) return null;
    return {
      x: v.visceral,
      pts: [[1, 99], [9, 60], [15, 20], [30, 1]],
      measure: `Visceral fat rating ${trim(v.visceral)}`,
      bench: '60 = 9, just under the 10 mark on your slip. 99 = 1.',
    };
  },
  youth(v) {
    if (!isNum(v.metabolicAge) || !isNum(v.age)) return null;
    const gap = v.metabolicAge - v.age;
    const how = Math.abs(gap) < 0.05 ? 'the same' : `${trim(Math.abs(gap))} ${Math.abs(gap) === 1 ? 'year' : 'years'} ${gap > 0 ? 'older' : 'younger'}`;
    return {
      x: gap,
      pts: [[-12, 99], [0, 60], [20, 20]],
      measure: `Metabolic age ${trim(v.metabolicAge)} against your real age of ${v.age}: ${how}`,
      bench: '60 = the same as your real age. 99 = 12 years younger.',
    };
  },
};

function scored(v, sex) {
  const female = sex === 'female';
  const out = {};
  for (const s of STATS) {
    const scale = SCALES[s.id](v, female);
    if (scale) out[s.id] = { ...scale, score: rate(along(scale.x, scale.pts)) };
  }
  return out;
}

const STAT_INPUTS = ['fatPct', 'ffm', 'weight', 'fatMass', 'bmrKcal', 'tbwPct', 'visceral', 'metabolicAge'];

// "Now" uses the average of the last 3 scans, like the belts, so one odd scan
// cannot swing the card.
export function fighterCard(list, sex) {
  if (!list.length) return null;
  const first = list[0], last = list[list.length - 1];
  const recent = Object.fromEntries(STAT_INPUTS.map((k) => [k, official(list, k)]));
  for (const k of ['age', 'height', 'fatLow', 'fatHigh']) recent[k] = last[k];
  const nowFull = scored(recent, sex), startFull = scored(first, sex);
  const scores = (full) => Object.fromEntries(Object.entries(full).map(([id, s]) => [id, s.score]));
  const now = scores(nowFull), start = scores(startFull);
  const ids = STATS.map((s) => s.id).filter((id) => isNum(now[id]));
  if (ids.length < 3) return null;
  const overall = (r) => {
    const have = ids.filter((id) => isNum(r[id]));
    return have.length ? Math.round(have.reduce((sum, id) => sum + r[id], 0) / have.length) : null;
  };
  const details = Object.fromEntries(ids.map((id) => [id, {
    score: now[id],
    start: isNum(start[id]) ? start[id] : null,
    band: bandOf(now[id]),
    measure: nowFull[id].measure,
    bench: nowFull[id].bench,
  }]));
  const ovr = overall(now);
  return { now, start, ids, ovr, ovrStart: overall(start), band: bandOf(ovr), details };
}
