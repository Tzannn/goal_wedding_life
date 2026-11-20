// The slip's numbers depend on each other (fat mass + lean mass = weight, and so
// on). These relations are used to confirm what OCR read and to repair digits it
// got wrong, so accuracy does not rest on recognition alone.

import { FORMATS } from './parse.js';

// `tol` covers the printer rounding each value to its displayed precision.
export const RELATIONS = [
  { id: 'fat-mass', vars: ['weight', 'fatPct', 'fatMass'], tol: 0.13,
    gap: (v) => v.fatMass - (v.weight * v.fatPct) / 100,
    solve: {
      fatMass: (v) => (v.weight * v.fatPct) / 100,
      fatPct: (v) => (v.fatMass / v.weight) * 100,
      weight: (v) => (v.fatMass / v.fatPct) * 100,
    } },
  { id: 'lean', vars: ['weight', 'fatMass', 'ffm'], tol: 0.11,
    gap: (v) => v.ffm - (v.weight - v.fatMass),
    solve: {
      ffm: (v) => v.weight - v.fatMass,
      weight: (v) => v.ffm + v.fatMass,
      fatMass: (v) => v.weight - v.ffm,
    } },
  { id: 'parts', vars: ['ffm', 'muscle', 'bone'], tol: 0.16,
    gap: (v) => v.ffm - (v.muscle + v.bone),
    solve: {
      ffm: (v) => v.muscle + v.bone,
      muscle: (v) => v.ffm - v.bone,
      bone: (v) => v.ffm - v.muscle,
    } },
  { id: 'water', vars: ['tbw', 'tbwPct', 'weight'], tol: 0.16,
    gap: (v) => v.tbwPct - (v.tbw / v.weight) * 100,
    solve: {
      tbwPct: (v) => (v.tbw / v.weight) * 100,
      tbw: (v) => (v.tbwPct * v.weight) / 100,
      weight: (v) => (v.tbw / v.tbwPct) * 100,
    } },
  { id: 'energy', vars: ['bmrKj', 'bmrKcal'], tol: 2.7,
    gap: (v) => v.bmrKj - v.bmrKcal * 4.184,
    solve: {
      bmrKj: (v) => v.bmrKcal * 4.184,
      bmrKcal: (v) => v.bmrKj / 4.184,
    } },
  { id: 'bmi', vars: ['bmi', 'weight', 'height'], tol: 0.1,
    gap: (v) => v.bmi - v.weight / (v.height / 100) ** 2,
    solve: {
      bmi: (v) => v.weight / (v.height / 100) ** 2,
      weight: (v) => v.bmi * (v.height / 100) ** 2,
    } },
  { id: 'ideal', vars: ['ideal', 'height'], tol: 0.08,
    gap: (v) => v.ideal - 22 * (v.height / 100) ** 2,
    solve: {
      ideal: (v) => 22 * (v.height / 100) ** 2,
      height: (v) => 100 * Math.sqrt(v.ideal / 22),
    } },
  { id: 'obesity', vars: ['obesity', 'weight', 'ideal'], tol: 0.23,
    gap: (v) => v.obesity - ((v.weight - v.ideal) / v.ideal) * 100,
    solve: {
      obesity: (v) => ((v.weight - v.ideal) / v.ideal) * 100,
      weight: (v) => v.ideal * (1 + v.obesity / 100),
      ideal: (v) => v.weight / (1 + v.obesity / 100),
    } },
  { id: 'range-low', vars: ['fatMassLow', 'ffm', 'fatLow'], tol: 0.07,
    gap: (v) => v.fatMassLow - (v.ffm * v.fatLow) / (100 - v.fatLow),
    solve: { fatMassLow: (v) => (v.ffm * v.fatLow) / (100 - v.fatLow) } },
  { id: 'range-high', vars: ['fatMassHigh', 'ffm', 'fatHigh'], tol: 0.07,
    gap: (v) => v.fatMassHigh - (v.ffm * v.fatHigh) / (100 - v.fatHigh),
    solve: { fatMassHigh: (v) => (v.ffm * v.fatHigh) / (100 - v.fatHigh) } },
];

const has = (v, keys) => keys.every((k) => Number.isFinite(v[k]));
const holds = (rel, v) => Math.abs(rel.gap(v)) <= rel.tol + 1e-9;

export function roundFor(key, value) {
  const dec = FORMATS[key]?.dec ?? 1;
  const m = 10 ** dec;
  return Math.round(value * m) / m;
}

const digitsOf = (key, value) => {
  const dec = FORMATS[key]?.dec ?? 1;
  return Math.abs(value).toFixed(dec).replace('.', '');
};

function score(values, support) {
  let s = 0;
  for (const rel of RELATIONS) {
    if (!has(values, rel.vars)) continue;
    if (holds(rel, values)) {
      // A closer fit is worth a little more: rounding can hide a one-step error.
      s += 10 + 1.5 * (1 - Math.abs(rel.gap(values)) / rel.tol);
    } else {
      s -= 7;
    }
  }
  for (const key of Object.keys(values)) s += support(key, values[key]);
  return s;
}

// Pairs of digits this thermal font makes easy to confuse at photo resolution.
const SIMILAR = new Set(['08', '06', '09', '38', '39', '56', '58', '68', '69', '89', '17', '27', '35']);
const similarDigits = (a, b) => SIMILAR.has(a < b ? a + b : b + a);

// Edit distance where a look-alike digit swap costs half of any other change.
function digitDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const swap = a[i - 1] === b[j - 1] ? 0 : similarDigits(a[i - 1], b[j - 1]) ? 0.5 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + swap);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Numbers that appear in several relations: an error in one of these disturbs
// many others.
const HUBS = ['weight', 'fatMass', 'ffm', 'ideal', 'height', 'muscle'];

// How far a value can plausibly drift from the same person's previous slip.
const PRIOR_TOLERANCE = { height: 0.5, ideal: 0.1, age: 1, bone: 0.2, visceral: 1, metabolicAge: 4, fatLow: 0, fatHigh: 0 };

// candidates: { key: [{ value, digits }] } merged from every OCR pass.
// known: fixed facts such as the profile height, used only when OCR found none.
// prior: the same person's latest values, a tie-breaker between readings.
export function solve(candidates, known = {}, prior = {}) {
  // Vote tallies per field.
  const tally = {};
  for (const [key, list] of Object.entries(candidates)) {
    const t = (tally[key] = new Map());
    for (const c of list) {
      const id = String(c.value);
      const e = t.get(id) || { value: c.value, digits: c.digits, votes: 0 };
      e.votes += 1;
      t.set(id, e);
    }
  }
  const allKeys = new Set([...Object.keys(tally), ...RELATIONS.flatMap((r) => r.vars)]);

  const support = (key, value) => {
    const t = tally[key];
    let s = 0;
    // Something this slip's owner already showed on earlier slips.
    if (Number.isFinite(prior[key])) {
      const near = PRIOR_TOLERANCE[key] ?? 0;
      s += Math.abs(value - prior[key]) <= near + 1e-9 ? 1.5 : 0;
    }
    if (!t) return s;
    const hit = t.get(String(value));
    if (hit) return s + 1.5 + hit.votes * 0.6;
    // A repair is cheap when it is one digit away from what OCR saw, and must
    // earn its place when it is not: one relation can never overturn a reading
    // that looks nothing like the answer.
    const target = digitsOf(key, value);
    let best = 9, votes = 0;
    for (const e of t.values()) {
      best = Math.min(best, digitDistance(e.digits, target));
      votes = Math.max(votes, e.votes);
    }
    if (best <= 0.5) return s - 0.3;
    if (best <= 1) return s - 1.5;
    if (best <= 2) return s - 6;
    // A lone reading may just be a neighbouring row that slipped into this slot.
    return s - (votes >= 2 ? 18 : 6);
  };

  // Start from the most voted reading of each field.
  const initial = {};
  for (const key of allKeys) {
    const t = tally[key];
    if (t && t.size) initial[key] = [...t.values()].sort((a, b) => b.votes - a.votes)[0].value;
    else if (Number.isFinite(known[key])) initial[key] = known[key];
  }
  const knownKeys = Object.keys(known).filter((k) => !tally[k]);

  // Improves one field at a time until nothing changes. `locked` holds a field
  // still, so a trial value is not immediately undone.
  const optionsFor = (key, current) => {
    const options = new Set();
    if (Number.isFinite(current[key])) options.add(current[key]);
    if (tally[key]) for (const e of tally[key].values()) options.add(e.value);
    for (const rel of RELATIONS) {
      const fn = rel.solve[key];
      if (!fn) continue;
      if (!has(current, rel.vars.filter((k) => k !== key))) continue;
      const raw = fn(current);
      if (!Number.isFinite(raw)) continue;
      // Rounding means the printed value can be one step either side.
      const step = 10 ** -(FORMATS[key]?.dec ?? 1);
      for (const k of [-1, 0, 1]) options.add(roundFor(key, roundFor(key, raw) + k * step));
    }
    const fmt = FORMATS[key];
    return [...options].filter((o) => !fmt || (o >= fmt.min && o <= fmt.max));
  };
  const ascend = (start, locked = null) => {
    const current = { ...start };
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
      for (const key of allKeys) {
        if (key === locked) continue;
        let bestV = current[key];
        let bestS = Number.isFinite(current[key]) ? score(current, support) : -Infinity;
        const trial = { ...current };
        for (const o of optionsFor(key, current)) {
          trial[key] = o;
          const s = score(trial, support);
          if (s > bestS + 1e-9) { bestS = s; bestV = o; }
        }
        if (bestV !== current[key] && Number.isFinite(bestV)) { current[key] = bestV; changed = true; }
      }
      if (!changed) break;
    }
    return current;
  };

  // One greedy climb can settle on repairing everything around a single bad
  // number. Restarting from each plausible value of the numbers that many
  // relations share finds the reading that explains the whole slip.
  let values = ascend(initial);
  let bestTotal = score(values, support);
  for (const hub of HUBS) {
    for (const option of optionsFor(hub, initial)) {
      if (option === initial[hub]) continue;
      const settled = ascend(ascend({ ...initial, [hub]: option }, hub));
      const total = score(settled, support);
      if (total > bestTotal + 1e-9) { bestTotal = total; values = settled; }
    }
  }

  // Grade every field. A relation only proves a value when every other number
  // in it was also read from the slip; a value calculated from its neighbours
  // would otherwise "confirm" itself.
  const isSeen = (key) => !!tally[key]?.has(String(values[key])) || knownKeys.includes(key);
  const status = {};
  for (const key of allKeys) {
    if (!Number.isFinite(values[key])) continue;
    const related = RELATIONS.filter((r) => r.vars.includes(key) && has(values, r.vars));
    const ok = related.filter((r) => holds(r, values));
    const bad = related.length - ok.length;
    const seen = isSeen(key);
    const proofs = ok.filter((r) => r.vars.every((v) => v === key || isSeen(v))).length;
    // Agreeing only with a value that was itself calculated proves nothing.
    const leansOnGuess = ok.length > 0 && proofs === 0;
    let state;
    if (bad > 0 || leansOnGuess) state = 'check';
    else if (seen && proofs > 0) state = 'verified';
    else if (!seen && proofs >= 2) state = 'repaired';
    else if (!seen) state = 'check';
    else state = knownKeys.includes(key) ? 'known' : 'read';
    status[key] = { state, proofs, bad };
  }
  const relationsOk = RELATIONS.filter((r) => has(values, r.vars) && holds(r, values)).length;
  const relationsBad = RELATIONS.filter((r) => has(values, r.vars) && !holds(r, values)).length;
  return { values, status, relationsOk, relationsBad };
}

// Live checks for the entry form: which values add up, which do not, and what a
// value would need to be to fit the others.
export function crossCheck(values) {
  const out = {};
  const failing = [];
  for (const rel of RELATIONS) {
    if (!has(values, rel.vars)) continue;
    const ok = holds(rel, values);
    if (!ok) failing.push(rel);
    for (const key of rel.vars) {
      const e = (out[key] ||= { ok: 0, bad: 0, expected: null, attn: false });
      if (ok) {
        e.ok++;
      } else {
        e.bad++;
        if (e.expected === null && rel.solve[key]) e.expected = roundFor(key, rel.solve[key](values));
      }
    }
  }
  // A value that fits elsewhere is probably fine, so the blame for a failed
  // relation goes to the values that fit nothing.
  for (const rel of failing) {
    const suspects = rel.vars.filter((k) => out[k].ok === 0);
    for (const k of suspects.length ? suspects : rel.vars) out[k].attn = true;
  }
  return out;
}

// Fills every blank that the entered values fully determine.
export function deriveMissing(values) {
  const v = { ...values };
  const filled = [];
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const rel of RELATIONS) {
      const missing = rel.vars.filter((k) => !Number.isFinite(v[k]));
      if (missing.length !== 1 || !rel.solve[missing[0]]) continue;
      const key = missing[0];
      const raw = rel.solve[key](v);
      if (!Number.isFinite(raw)) continue;
      v[key] = roundFor(key, raw);
      filled.push(key);
      changed = true;
    }
    if (!changed) break;
  }
  return { values: v, filled };
}
