import { store } from '../store.js';
import { sync } from '../sync.js';
import { confirmSheet, esc, icon, sheet, shareOrDownload, toast } from '../ui.js';
import { initial, pageTitle } from './common.js';

const pad2 = (n) => String(n).padStart(2, '0');

function ago(iso) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return new Date().toDateString() === d.toDateString() ? `today at ${time}` : `${d.toLocaleDateString()} at ${time}`;
}

export function syncStatus() {
  const cfg = sync.config;
  if (!cfg) return { text: '', bad: false };
  if (sync.busy) return { text: 'Syncing…', bad: false };
  if (cfg.lastError) return { text: cfg.lastError, bad: true };
  return { text: cfg.lastSyncAt ? `Last synced ${ago(cfg.lastSyncAt)}.` : 'Not synced yet.', bad: false };
}

// The connect form, shared with the first screen on a new phone.
export const syncForm = () => `<form data-sync-form style="display:grid;gap:12px">
    <div class="form-row"><label for="sync-repo">Private repository</label>
      <input class="input" id="sync-repo" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="your-name/your-data"></div>
    <div class="form-row"><label for="sync-token">Access token</label>
      <input class="input" id="sync-token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="github_pat_…"></div>
    <p class="field-hint" data-sync-error style="margin:0" hidden></p>
    <button class="btn gold block">Connect</button>
  </form>`;

// Connects from a form made by syncForm(). Resolves true once the first sync
// has run without an error.
export function wireSyncForm(root, onDone) {
  const form = root.querySelector('[data-sync-form]');
  const error = form.querySelector('[data-sync-error]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    error.hidden = true;
    button.disabled = true;
    button.textContent = 'Connecting…';
    try {
      await sync.connect(form.querySelector('#sync-repo').value, form.querySelector('#sync-token').value);
      if (sync.config?.lastError) throw new Error(sync.config.lastError);
      onDone(true);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Connect';
    }
  });
}

function syncCard() {
  const cfg = sync.config;
  const intro = '<p class="sub">Keep both phones in step through a private GitHub repository. Each phone still works offline and catches up whenever it is online.</p>';
  if (!cfg) {
    return `<section class="card">
      <div class="h"><h2>Sync with your partner</h2></div>
      ${intro}
      <div style="margin-top:12px">${syncForm()}</div>
      <p class="fine" style="margin-top:10px">The token stays on this phone and is never part of a backup. Make it a fine-grained token that can only reach this one repository.</p>
    </section>`;
  }
  const status = syncStatus();
  return `<section class="card">
    <div class="h"><h2>Sync with your partner</h2></div>
    <p class="sub">Syncing with <b>${esc(cfg.repo)}</b>.</p>
    <p class="fine" data-sync-status style="margin-top:6px${status.bad ? ';color:var(--warn)' : ''}">${esc(status.text)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <button class="btn" data-sync-now>Sync now</button>
      <button class="btn ghost" data-sync-off>Disconnect</button>
    </div>
  </section>`;
}

const stamp = () => new Date().toISOString().slice(0, 10);
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function promptName(title, confirmLabel, value = '') {
  return sheet(
    `<h3>${esc(title)}</h3>
     <form data-form>
       <input class="input" id="person-name" maxlength="24" autocomplete="off" placeholder="Name" value="${esc(value)}" required aria-label="Name">
       <div class="sheet-actions">
         <button type="button" class="btn" data-no>Cancel</button>
         <button class="btn gold">${esc(confirmLabel)}</button>
       </div>
     </form>`,
    (el, close) => {
      const input = el.querySelector('input');
      input.focus();
      el.querySelector('[data-no]').addEventListener('click', () => close(null));
      el.querySelector('[data-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value.trim()) close(input.value.trim());
      });
    },
  );
}

function promptPerson() {
  return sheet(
    `<h3>New challenger</h3>
     <form data-form style="display:grid;gap:12px">
       <div class="form-row"><label for="person-name">Name</label>
         <input class="input" id="person-name" maxlength="24" autocomplete="off" required></div>
       <div class="form-row"><label for="person-sex">Sex</label>
         <select class="input" id="person-sex"><option value="male">Male</option><option value="female">Female</option></select></div>
       <div class="sheet-actions" style="margin-top:6px">
         <button type="button" class="btn" data-no>Cancel</button>
         <button class="btn gold">Add</button>
       </div>
     </form>`,
    (el, close) => {
      const input = el.querySelector('#person-name');
      input.focus();
      el.querySelector('[data-no]').addEventListener('click', () => close(null));
      el.querySelector('[data-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value.trim()) close({ name: input.value.trim(), sex: el.querySelector('#person-sex').value });
      });
    },
  );
}

export async function restoreFromFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not an Undisputed backup.');
  }
  return store.restore(data);
}

export const settings = {
  render(ctx) {
    const { profile, goals } = ctx;
    const people = store.profiles.map((p) => {
      const n = store.listFor(p.id).length;
      return `<div class="pick" style="cursor:default">
        <span class="avatar${p.id === store.activeId ? '' : ' alt'}">${initial(p.name)}</span>
        <span class="pick-name">${esc(p.name)}<small>${n} ${n === 1 ? 'round' : 'rounds'}</small></span>
        <button class="icon-btn" data-rename="${esc(p.id)}" aria-label="Rename ${esc(p.name)}">${icon.pencil(20)}</button>
        ${store.profiles.length > 1 ? `<button class="btn ghost small" data-remove="${esc(p.id)}">Remove</button>` : ''}
      </div>`;
    }).join('');

    const sinceBackup = store.readings.length - (store.prefs.backupCount || 0);
    const backupNote = store.prefs.backupAt
      ? `Last saved ${new Date(store.prefs.backupAt).toLocaleDateString()}. ${sinceBackup > 0 ? `${sinceBackup} new ${sinceBackup === 1 ? 'round' : 'rounds'} since.` : 'Up to date.'}`
      : 'Not saved yet.';

    return `${pageTitle('Settings', '#/home')}<main class="page">
      <section class="card">
        <div class="h"><h2>People</h2></div>
        <div>${people}</div>
        ${store.profiles.length < 2 ? `<button class="btn block" data-add style="margin-top:10px">${icon.plus(20)} Add a second person</button>` : ''}
      </section>

      <section class="card">
        <div class="h"><h2>${esc(profile.name)}'s goals</h2></div>
        <p class="fine" style="margin:-4px 0 12px">These are also your Gold targets on the Charts tab.</p>
        <form class="form-grid" data-goals>
          <div class="form-row"><label for="g-fat">Body fat %</label><input class="input" id="g-fat" inputmode="decimal" value="${goals.fatPct}"></div>
          <div class="form-row"><label for="g-muscle">Muscle kg</label><input class="input" id="g-muscle" inputmode="decimal" value="${goals.muscle}"></div>
          <div class="form-row"><label for="g-visc">Visceral fat</label><input class="input" id="g-visc" inputmode="numeric" value="${goals.visceral}"></div>
          <div class="form-row"><label for="g-age">Metabolic age</label><input class="input" id="g-age" inputmode="numeric" value="${goals.metabolicAge}"></div>
          <button class="btn gold" style="grid-column:1/-1">Save goals</button>
        </form>
      </section>

      ${syncCard()}

      <section class="card">
        <div class="h"><h2>Your data</h2></div>
        <p class="sub">${sync.config
    ? 'Everything is kept on this phone and synced to your private repository, which keeps every version.'
    : 'Everything stays on this device. Nothing is uploaded, so a backup file is your only safety net if this phone is lost.'}</p>
        <p class="fine" style="margin:8px 0 12px">${esc(backupNote)}</p>
        <div style="display:grid;gap:10px">
          <button class="btn gold" data-backup>Save a backup</button>
          <label class="btn file-btn">Restore a backup<input type="file" data-restore></label>
          <button class="btn" data-csv>Export ${esc(profile.name)} as a spreadsheet</button>
        </div>
      </section>

      <section class="card">
        <div class="h"><h2>Sound</h2></div>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:44px">
          <span>Ring the bell when you save a round</span>
          <input type="checkbox" data-sound ${store.prefs.sound ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--gold)">
        </label>
      </section>

      ${isInstalled() ? '' : `<section class="card">
        <div class="h"><h2>Put it on your phone</h2></div>
        <p class="sub">${isIos()
    ? 'In Safari, tap Share, then Add to Home Screen. It then opens like an app and works with no internet.'
    : 'Open your browser menu and choose Install app or Add to Home screen. It then works with no internet.'}</p>
        <button class="btn block" data-install hidden style="margin-top:12px">Install now</button>
      </section>`}
    </main>`;
  },

  mount(root, ctx) {
    root.querySelector('[data-add]')?.addEventListener('click', async () => {
      const person = await promptPerson();
      if (!person) return;
      await store.addProfile(person.name, person.sex);
      toast(`${person.name} is on the card`);
      ctx.go('#/home');
    });
    root.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', async () => {
      const p = store.profiles.find((x) => x.id === b.dataset.rename);
      const name = await promptName('Rename', 'Save', p.name);
      if (!name) return;
      await store.updateProfile({ ...p, name });
      ctx.rerender({ keepScroll: true });
    }));
    root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      const p = store.profiles.find((x) => x.id === b.dataset.remove);
      const n = store.listFor(p.id).length;
      const yes = await confirmSheet({
        title: `Remove ${p.name}?`,
        body: `This deletes ${n} ${n === 1 ? 'round' : 'rounds'} and their photos from this device. It cannot be undone.`,
        confirm: 'Remove',
        danger: true,
      });
      if (!yes) return;
      await store.deleteProfile(p.id);
      toast(`${p.name} removed`);
      ctx.rerender({ keepScroll: true });
    }));

    root.querySelector('[data-goals]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const read = (id) => parseFloat(root.querySelector(id).value.replace(',', '.'));
      const goals = { fatPct: read('#g-fat'), muscle: read('#g-muscle'), visceral: read('#g-visc'), metabolicAge: read('#g-age') };
      if (Object.values(goals).some((v) => !Number.isFinite(v))) { toast('Fill in all four goals with numbers'); return; }
      await store.updateProfile({ ...ctx.profile, goals });
      toast('Goals saved');
    });

    root.querySelector('[data-backup]')?.addEventListener('click', async () => {
      const text = JSON.stringify(store.backupObject(), null, 1);
      const outcome = await shareOrDownload(`undisputed-backup-${stamp()}.json`, text, 'application/json');
      if (outcome === 'cancelled') return;
      await store.markBackedUp();
      toast('Backup saved');
      ctx.rerender({ keepScroll: true });
    });

    root.querySelector('[data-csv]')?.addEventListener('click', async () => {
      await shareOrDownload(`undisputed-${ctx.profile.name.replace(/\W+/g, '-')}-${stamp()}.csv`, store.csv(), 'text/csv');
    });

    root.querySelector('[data-restore]')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const { added } = await restoreFromFile(file);
        toast(`Backup restored. ${added} new ${added === 1 ? 'round' : 'rounds'} added.`);
        ctx.rerender({ keepScroll: true });
      } catch (err) {
        toast(err.message);
      }
      e.target.value = '';
    });

    root.querySelector('[data-sound]')?.addEventListener('change', (e) => store.setPrefs({ sound: e.target.checked }));

    if (root.querySelector('[data-sync-form]')) {
      wireSyncForm(root, () => {
        toast('Connected. This phone now syncs with your partner.');
        ctx.rerender({ keepScroll: true });
      });
    }
    root.querySelector('[data-sync-now]')?.addEventListener('click', () => sync.run());
    root.querySelector('[data-sync-off]')?.addEventListener('click', async () => {
      const yes = await confirmSheet({
        title: 'Stop syncing on this phone?',
        body: 'Your rounds stay on this phone, and the token is removed from it. The other phone keeps syncing.',
        confirm: 'Disconnect',
      });
      if (!yes) return;
      await sync.disconnect();
      ctx.rerender({ keepScroll: true });
    });
    // Keeps the status line current while this screen is open.
    const off = sync.onUpdate(() => {
      const el = document.querySelector('[data-sync-status]');
      if (!el) { off(); return; }
      const status = syncStatus();
      el.textContent = status.text;
      el.style.color = status.bad ? 'var(--warn)' : '';
    });
    if (root.querySelector('[data-sync-now]')) {
      const el = root.querySelector('[data-sync-status]');
      root.querySelector('[data-sync-now]').addEventListener('click', () => { el.textContent = 'Syncing…'; el.style.color = ''; });
    }

    const installBtn = root.querySelector('[data-install]');
    if (installBtn && window.installPrompt) {
      installBtn.hidden = false;
      installBtn.addEventListener('click', async () => {
        window.installPrompt.prompt();
        await window.installPrompt.userChoice;
        window.installPrompt = null;
        installBtn.hidden = true;
      });
    }
  },
};
