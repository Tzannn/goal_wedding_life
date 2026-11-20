// Keeps both phones in step through one JSON file in a private GitHub
// repository. Each phone works offline as before; whenever it is online it
// merges its own changes with the file and writes the result back. GitHub keeps
// every version, so the history doubles as a backup. The token stays on this
// device and is never part of a backup.

import { db } from './db.js';
import { store } from './store.js';

const API = 'https://api.github.com';
const FILE = 'undisputed-data.json';
const MIN = '1970-01-01T00:00:00.000Z';

let config = null; // { repo, token, api?, lastSyncAt, lastError }
let running = null;
let rerun = false;
let timer = null;
const listeners = new Set();

const notify = (event) => listeners.forEach((fn) => { try { fn(event); } catch { /* a view went away */ } });

// ---------- merging ----------

// Newest edit wins for each person and each round, and a deletion wins over
// any edit made before it. One slip saved separately on both phones (same
// person, same minute) collapses into one round, and so does one day logged
// without a scan on both.
export function merge(a, b) {
  const deleted = { ...(a.deleted || {}) };
  for (const [id, at] of Object.entries(b.deleted || {})) if (!deleted[id] || at > deleted[id]) deleted[id] = at;
  const age = (r) => r.updatedAt || '';
  const unite = (xs, ys) => {
    const map = new Map();
    for (const r of [...xs, ...ys]) {
      const cur = map.get(r.id);
      map.set(r.id, !cur || age(r) > age(cur) ? r : cur);
    }
    return [...map.values()].filter((r) => !(deleted[r.id] && deleted[r.id] >= age(r)));
  };
  const profiles = unite(a.profiles || [], b.profiles || []);
  const people = new Set(profiles.map((p) => p.id));
  const collapse = (list, keyOf) => {
    const slots = new Map();
    for (const r of list) {
      if (!people.has(r.profileId)) continue;
      const key = keyOf(r);
      const cur = slots.get(key);
      if (!cur) { slots.set(key, r); continue; }
      const keep = age(r) > age(cur) || (age(r) === age(cur) && r.id < cur.id) ? r : cur;
      const drop = keep === r ? cur : r;
      deleted[drop.id] = age(drop) || MIN;
      slots.set(key, keep);
    }
    return [...slots.values()];
  };
  const readings = collapse(unite(a.readings || [], b.readings || []), (r) => `${r.profileId}|${r.takenAt}`);
  const trainings = collapse(unite(a.trainings || [], b.trainings || []), (t) => `${t.profileId}|${t.takenAt.slice(0, 10)}`);
  return { profiles, readings, trainings, deleted };
}

// The same data always gives the same text, whatever order it arrived in.
function canonical(doc) {
  const keys = (v) => {
    if (Array.isArray(v)) return v.map(keys);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, keys(v[k])]));
    return v;
  };
  const byId = (list) => [...(list || [])].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return JSON.stringify(keys({ profiles: byId(doc.profiles), readings: byId(doc.readings), trainings: byId(doc.trainings), deleted: doc.deleted || {} }));
}

// ---------- GitHub ----------

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

class Retry extends Error {}

async function call(cfg, path, options = {}) {
  let res;
  try {
    res = await fetch(`${cfg.api || API}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error('Could not reach GitHub. Check the connection and try again.');
  }
  return res;
}

async function problem(res, what) {
  if (res.status === 401) return new Error('GitHub did not accept the token. It may have expired, so make a new one.');
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') return new Error('GitHub asked for a short break. Sync will try again later.');
  if (res.status === 403) return new Error(`The token is not allowed to ${what}. Give it Contents: Read and write on this repository.`);
  if (res.status === 404) return new Error('Repository not found. Check the name, and that the token was made for this repository.');
  return new Error(`GitHub answered ${res.status} while trying to ${what}.`);
}

// "https://github.com/me/data.git" and "me/data" both mean me/data.
export const repoName = (text) => String(text || '').trim()
  .replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');

async function checkRepo(cfg) {
  const res = await call(cfg, `/repos/${cfg.repo}`);
  if (!res.ok) throw await problem(res, 'open the repository');
  const info = await res.json();
  if (!info.private) throw new Error('That repository is public. Use a private one, so only the two of you can see your numbers.');
}

async function syncOnce(cfg) {
  const path = `/repos/${cfg.repo}/contents/${FILE}`;
  const res = await call(cfg, path);
  let remote = { profiles: [], readings: [], deleted: {} };
  let sha = null;
  // 404 means there is no sync file yet, and a brand-new repository with no
  // commits can answer 409. Either way the save below creates the file.
  if (res.status === 200) {
    const body = await res.json();
    sha = body.sha;
    const parsed = JSON.parse(fromBase64(body.content || ''));
    if (parsed?.app !== 'undisputed') throw new Error(`${FILE} in that repository is not an Undisputed sync file.`);
    remote = parsed;
  } else if (res.status !== 404 && res.status !== 409) {
    throw await problem(res, 'read the sync file');
  }

  const local = store.syncDoc();
  const merged = merge(local, remote);
  const changedHere = canonical(merged) !== canonical(local);
  if (changedHere) await store.applySync(merged);

  if (!sha || canonical(merged) !== canonical(remote)) {
    const doc = { app: 'undisputed', kind: 'sync', version: 1, updatedAt: new Date().toISOString(), ...merged };
    const put = await call(cfg, path, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Sync: ${merged.readings.length} rounds`,
        content: toBase64(JSON.stringify(doc, null, 1)),
        ...(sha ? { sha } : {}),
      }),
    });
    // Someone else wrote in between: read again and merge on top.
    if (put.status === 409 || put.status === 422) throw new Retry();
    if (!put.ok) throw await problem(put, 'save the sync file');
  }
  return changedHere;
}

async function saveConfig() {
  await db.setMeta('sync', config);
}

export const sync = {
  get config() { return config; },
  get busy() { return !!running; },

  async load() {
    config = await db.getMeta('sync', null);
  },

  onUpdate(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Checks the repository first, so a wrong name or a public repo never gets
  // any data. `api` is only for testing against a stand-in server.
  async connect(repoText, token, { api } = {}) {
    const cfg = { repo: repoName(repoText), token: String(token || '').trim(), ...(api ? { api } : {}) };
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) throw new Error('Write the repository as owner/name, for example your-name/your-data.');
    if (!cfg.token) throw new Error('Paste the access token from GitHub.');
    await checkRepo(cfg);
    config = { ...cfg, lastSyncAt: null, lastError: null };
    await saveConfig();
    notify({ changed: false });
    return this.run();
  },

  async disconnect() {
    config = null;
    clearTimeout(timer);
    await db.setMeta('sync', null);
    notify({ changed: false });
  },

  // After a change on this phone: wait a moment so several edits go together.
  soon() {
    if (!config) return;
    clearTimeout(timer);
    timer = setTimeout(() => this.run(), 1500);
  },

  runIfStale(ms) {
    if (!config) return null;
    const last = config.lastSyncAt ? Date.parse(config.lastSyncAt) : 0;
    return Date.now() - last > ms ? this.run() : null;
  },

  // One sync at a time; a request during a sync runs again straight after.
  run() {
    if (!config) return Promise.resolve(false);
    if (running) { rerun = true; return running; }
    running = (async () => {
      let changed = false;
      try {
        if (navigator.onLine === false) throw new Error('Waiting for a connection.');
        for (let attempt = 0; ; attempt++) {
          try {
            changed = (await syncOnce(config)) || changed;
            break;
          } catch (err) {
            if (!(err instanceof Retry) || attempt >= 3) throw err instanceof Retry ? new Error('The sync file kept changing. Try again in a moment.') : err;
          }
        }
        if (config) {
          config.lastSyncAt = new Date().toISOString();
          config.lastError = null;
        }
      } catch (err) {
        if (config) config.lastError = err.message;
      }
      if (config) await saveConfig();
      running = null;
      notify({ changed });
      if (rerun) { rerun = false; this.run(); }
      return changed;
    })();
    return running;
  },
};
