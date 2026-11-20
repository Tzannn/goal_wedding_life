// App state and persistence. Views read from here; only this file writes.
//
// Every person and every round carries `updatedAt`, set only when something
// about it really changes, and deleted ids are remembered with the time they
// went. That is what lets two phones merge their copies safely (see sync.js).

import { db } from './db.js';
import { byTime, defaultGoals, withDerived } from './model.js';

const newId = () => (window.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const stamp = () => new Date().toISOString();
const byCreated = (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '');

// The same content regardless of key order, ignoring bookkeeping fields.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter((k) => k !== 'updatedAt' && k !== 'hasPhoto').sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

export const CSV_COLUMNS = [
  'takenAt', 'weight', 'fatPct', 'fatMass', 'ffm', 'muscle', 'tbw', 'tbwPct', 'bone', 'bmrKj', 'bmrKcal',
  'metabolicAge', 'visceral', 'bmi', 'ideal', 'obesity', 'physique', 'fatLow', 'fatHigh', 'fatMassLow',
  'fatMassHigh', 'age', 'height', 'clothes', 'r6', 'r50', 'x6', 'x50',
];

export const store = {
  profiles: [],
  readings: [],
  // Rounds trained where there is no scanner: { id, profileId, takenAt (that
  // day at 12:00), note }. They count as rounds and for the streak only.
  trainings: [],
  deleted: {},
  activeId: null,
  prefs: { sound: true, backupAt: null, backupCount: 0 },
  // Called after any change made on this device; sync uses it to catch up.
  onChange: null,

  async load() {
    this.profiles = (await db.all('profiles')).sort(byCreated);
    this.readings = await db.all('readings');
    this.trainings = await db.getMeta('trainings', []);
    this.deleted = await db.getMeta('deleted', {});
    this.activeId = await db.getMeta('activeId');
    if (!this.profiles.some((p) => p.id === this.activeId)) this.activeId = this.profiles[0]?.id ?? null;
    this.prefs = { ...this.prefs, ...(await db.getMeta('prefs', {})) };
  },

  changed() {
    try { this.onChange?.(); } catch { /* sync problems never block saving */ }
  },

  get active() {
    return this.profiles.find((p) => p.id === this.activeId) || null;
  },

  listFor(id = this.activeId) {
    return this.readings.filter((r) => r.profileId === id).sort(byTime).map(withDerived);
  },

  trainingsFor(id = this.activeId) {
    return this.trainings.filter((t) => t.profileId === id).sort(byTime);
  },

  // A scan or a logged round on that calendar day ('YYYY-MM-DD').
  roundOn(profileId, day) {
    return [...this.readings, ...this.trainings].find((r) => r.profileId === profileId && r.takenAt.slice(0, 10) === day) || null;
  },

  async saveTrainings() {
    await db.setMeta('trainings', this.trainings);
  },

  async logTraining(profileId, day, note = '') {
    const training = { id: newId(), profileId, takenAt: `${day}T12:00`, note, createdAt: stamp(), updatedAt: stamp() };
    this.trainings = [...this.trainings, training];
    await this.saveTrainings();
    this.changed();
    return training;
  },

  async deleteTraining(id) {
    this.trainings = this.trainings.filter((t) => t.id !== id);
    await this.saveTrainings();
    await this.forget([id]);
    this.changed();
  },

  goalsFor(profile = this.active, list = this.listFor(profile?.id)) {
    return profile?.goals ?? defaultGoals(list[0], profile?.sex);
  },

  async addProfile(name, sex = null) {
    const profile = { id: newId(), name: name.trim(), sex, createdAt: stamp(), goals: null, updatedAt: stamp() };
    await db.put('profiles', profile);
    this.profiles.push(profile);
    await this.setActive(profile.id);
    this.changed();
    return profile;
  },

  async updateProfile(profile) {
    const before = this.profiles.find((p) => p.id === profile.id);
    if (before && same(before, profile)) return;
    const next = { ...profile, updatedAt: stamp() };
    await db.put('profiles', next);
    this.profiles = this.profiles.map((p) => (p.id === next.id ? next : p));
    this.changed();
  },

  async forget(ids) {
    const at = stamp();
    for (const id of ids) this.deleted[id] = at;
    await db.setMeta('deleted', this.deleted);
  },

  async deleteProfile(id) {
    const gone = this.readings.filter((x) => x.profileId === id);
    for (const r of gone) {
      await db.del('readings', r.id);
      await db.del('photos', r.id);
    }
    const trained = this.trainings.filter((t) => t.profileId === id);
    this.trainings = this.trainings.filter((t) => t.profileId !== id);
    await this.saveTrainings();
    await db.del('profiles', id);
    await this.forget([id, ...gone.map((r) => r.id), ...trained.map((t) => t.id)]);
    this.readings = this.readings.filter((r) => r.profileId !== id);
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.activeId === id) await this.setActive(this.profiles[0]?.id ?? null);
    this.changed();
  },

  async setActive(id) {
    this.activeId = id;
    await db.setMeta('activeId', id);
  },

  async setPrefs(patch) {
    this.prefs = { ...this.prefs, ...patch };
    await db.setMeta('prefs', this.prefs);
  },

  duplicateOf(profileId, takenAt, ignoreId = null) {
    return this.readings.find((r) => r.profileId === profileId && r.takenAt === takenAt && r.id !== ignoreId) || null;
  },

  async saveReading(profileId, values, { photo = null, id = null } = {}) {
    const reading = { ...values, id: id || newId(), profileId, updatedAt: stamp() };
    if (this.readings.find((r) => r.id === reading.id)?.hasPhoto) reading.hasPhoto = true;
    if (photo) {
      await db.put('photos', { id: reading.id, blob: photo });
      reading.hasPhoto = true;
    }
    await db.put('readings', reading);
    this.readings = [...this.readings.filter((r) => r.id !== reading.id), reading];

    // A scan on a day already logged without one takes that round's place.
    const replaced = this.trainings.filter((t) => t.profileId === profileId && t.takenAt.slice(0, 10) === reading.takenAt?.slice(0, 10));
    if (replaced.length) {
      this.trainings = this.trainings.filter((t) => !replaced.includes(t));
      await this.saveTrainings();
      await this.forget(replaced.map((t) => t.id));
    }

    // The newest slip keeps the profile's basic facts up to date.
    const profile = this.profiles.find((p) => p.id === profileId);
    if (profile) {
      const list = this.listFor(profileId);
      const last = list[list.length - 1];
      await this.updateProfile({
        ...profile,
        sex: last.gender ?? profile.sex ?? null,
        age: last.age ?? profile.age ?? null,
        height: last.height ?? profile.height ?? null,
      });
    }
    try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
    this.changed();
    return reading;
  },

  async deleteReading(id) {
    await db.del('readings', id);
    await db.del('photos', id);
    await this.forget([id]);
    this.readings = this.readings.filter((r) => r.id !== id);
    this.changed();
  },

  photoOf: (id) => db.get('photos', id).then((row) => row?.blob ?? null),

  backupObject() {
    return {
      app: 'undisputed',
      version: 1,
      exportedAt: stamp(),
      profiles: this.profiles,
      readings: this.readings.map(({ hasPhoto, ...rest }) => rest),
      trainings: this.trainings,
    };
  },

  async markBackedUp() {
    await this.setPrefs({ backupAt: stamp(), backupCount: this.readings.length });
  },

  // Merges a backup into this device without touching anything it does not name.
  async restore(data) {
    if (data?.app !== 'undisputed' || !Array.isArray(data.profiles) || !Array.isArray(data.readings)) {
      throw new Error('That file is not an Undisputed backup.');
    }
    let added = 0;
    for (const p of data.profiles) {
      if (typeof p?.id !== 'string' || typeof p?.name !== 'string') continue;
      const existing = this.profiles.find((x) => x.id === p.id);
      let merged = { goals: null, createdAt: stamp(), ...existing, ...p };
      // A backup never renames someone already on this device.
      if (existing) merged.name = existing.name;
      // Changing someone already here is a fresh edit; a person new to this
      // device keeps the backup's age, so newer edits elsewhere still win.
      if (existing && !same(existing, merged)) merged = { ...merged, updatedAt: stamp() };
      if (existing && same(existing, merged)) continue;
      await db.put('profiles', merged);
      this.profiles = existing ? this.profiles.map((x) => (x.id === p.id ? merged : x)) : [...this.profiles, merged];
    }
    this.profiles.sort(byCreated);
    const known = new Set(this.profiles.map((p) => p.id));
    for (const r of data.readings) {
      if (typeof r?.id !== 'string' || !known.has(r.profileId) || typeof r.takenAt !== 'string') continue;
      if (this.duplicateOf(r.profileId, r.takenAt, r.id)) continue;
      const existing = this.readings.find((x) => x.id === r.id);
      if (!existing) added++;
      else if (same(existing, r)) continue;
      const next = existing?.hasPhoto ? { ...r, hasPhoto: true } : r;
      await db.put('readings', next);
      this.readings = [...this.readings.filter((x) => x.id !== r.id), next];
    }
    let trainingsAdded = false;
    for (const t of Array.isArray(data.trainings) ? data.trainings : []) {
      if (typeof t?.id !== 'string' || !known.has(t.profileId) || !/^\d{4}-\d{2}-\d{2}T/.test(t.takenAt ?? '')) continue;
      if (this.trainings.some((x) => x.id === t.id) || this.roundOn(t.profileId, t.takenAt.slice(0, 10))) continue;
      this.trainings = [...this.trainings, t];
      trainingsAdded = true;
      added++;
    }
    if (trainingsAdded) await this.saveTrainings();
    if (!this.active && this.profiles[0]) await this.setActive(this.profiles[0].id);
    this.changed();
    return { added, profiles: data.profiles.length };
  },

  // The shared part of the data, in the shape the sync file keeps.
  syncDoc() {
    return {
      profiles: this.profiles,
      readings: this.readings.map(({ hasPhoto, ...rest }) => rest),
      trainings: this.trainings,
      deleted: this.deleted,
    };
  },

  // Writes a merged copy from sync onto this device. Photos stay on the phone
  // that took them. This is not a local change, so it does not call changed().
  async applySync(doc) {
    const profilesNow = new Map(this.profiles.map((p) => [p.id, p]));
    for (const p of doc.profiles) {
      const cur = profilesNow.get(p.id);
      if (!cur || !same(cur, p) || cur.updatedAt !== p.updatedAt) await db.put('profiles', p);
    }
    const keepProfiles = new Set(doc.profiles.map((p) => p.id));
    for (const p of this.profiles) if (!keepProfiles.has(p.id)) await db.del('profiles', p.id);
    this.profiles = [...doc.profiles].sort(byCreated);

    const readingsNow = new Map(this.readings.map((r) => [r.id, r]));
    const next = [];
    for (const r of doc.readings) {
      const cur = readingsNow.get(r.id);
      const merged = cur?.hasPhoto ? { ...r, hasPhoto: true } : r;
      if (!cur || !same(cur, merged) || cur.updatedAt !== merged.updatedAt) await db.put('readings', merged);
      next.push(merged);
    }
    const keepReadings = new Set(doc.readings.map((r) => r.id));
    for (const r of this.readings) {
      if (keepReadings.has(r.id)) continue;
      await db.del('readings', r.id);
      await db.del('photos', r.id);
    }
    this.readings = next;
    this.trainings = (doc.trainings || []).filter((t) => keepProfiles.has(t.profileId));
    await this.saveTrainings();
    this.deleted = { ...doc.deleted };
    await db.setMeta('deleted', this.deleted);
    if (!this.profiles.some((p) => p.id === this.activeId)) await this.setActive(this.profiles[0]?.id ?? null);
  },

  csv(profileId = this.activeId) {
    const quote = (v) => {
      if (v === undefined || v === null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = this.readings.filter((r) => r.profileId === profileId).sort(byTime);
    return [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => quote(r[c])).join(','))].join('\n');
  },
};
