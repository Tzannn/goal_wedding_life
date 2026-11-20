import { store } from './store.js';
import { sync } from './sync.js';
import { esc, icon, toast } from './ui.js';
import { home } from './views/home.js';
import { charts } from './views/charts.js';
import { rounds, round } from './views/rounds.js';
import { belts } from './views/belts.js';
import { settings } from './views/settings.js';
import { onboarding } from './views/onboarding.js';
import { scan, review, beginManual, beginEdit } from './views/scan.js';
import { team } from './views/team.js';

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

const ROUTES = { home, charts, scan, rounds, round, belts, settings, review, team, new: review, edit: review };
const TABS = [
  { route: 'home', label: 'Ring', draw: icon.ring },
  { route: 'charts', label: 'Charts', draw: icon.chart },
  { route: 'scan', label: 'Scan', draw: icon.camera, primary: true },
  { route: 'rounds', label: 'Rounds', draw: icon.rounds },
  { route: 'belts', label: 'Belts', draw: icon.belt },
];

const go = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

function parseRoute() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'home', arg: arg ? decodeURIComponent(arg) : undefined };
}

function drawTabs(current) {
  const active = current === 'round' ? 'rounds' : ['review', 'new', 'edit'].includes(current) ? 'scan' : current;
  tabsEl.hidden = !store.profiles.length;
  tabsEl.innerHTML = TABS.map((t) => (t.primary
    ? `<a class="tab tab-scan${active === t.route ? ' on' : ''}" href="#/${t.route}" aria-label="${t.label}"><span class="bell">${t.draw(28)}</span>${esc(t.label)}</a>`
    : `<a class="tab${active === t.route ? ' on' : ''}" href="#/${t.route}">${t.draw(23)}${esc(t.label)}</a>`)).join('');
}

function context(arg) {
  const profile = store.active;
  const list = store.listFor();
  return { profile, list, goals: store.goalsFor(profile, list), arg, go, rerender: render };
}

let paintedRoute = null;

function render(options = {}) {
  const keepScroll = options.keepScroll || false;
  const y = window.scrollY;
  if (!store.profiles.length) {
    tabsEl.hidden = true;
    app.innerHTML = onboarding.render();
    onboarding.mount(app, { go, rerender: render });
    return;
  }
  const { name, arg } = parseRoute();
  // Opening these routes prepares their form first.
  if (name === 'new' && paintedRoute !== 'new') beginManual();
  if (name === 'edit' && paintedRoute !== `edit/${arg}`) beginEdit(arg);
  paintedRoute = name === 'edit' ? `edit/${arg}` : name;

  const view = ROUTES[name] || home;
  const ctx = context(arg);
  app.innerHTML = view.render(ctx);
  drawTabs(name);
  view.mount?.(app, ctx);
  window.scrollTo(0, keepScroll ? y : 0);
}

window.addEventListener('hashchange', () => render());
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.installPrompt = e; });

// Screens that only show data can redraw when the partner's changes arrive.
// Forms are left alone so nothing half-typed is lost.
const REDRAW = new Set(['home', 'charts', 'rounds', 'round', 'belts', 'team']);

async function boot() {
  await store.load();
  await sync.load();
  store.onChange = () => sync.soon();
  sync.onUpdate(({ changed }) => {
    if (!changed) return;
    if (!document.querySelector('.sheet-back') && REDRAW.has(parseRoute().name)) render({ keepScroll: true });
  });
  render();
  registerWorker();
  sync.run();
  window.addEventListener('online', () => sync.run());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync.runIfStale(60000);
  });
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => toast('A new version is ready', {
      label: 'Restart',
      run: () => worker.postMessage('activate'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      incoming?.addEventListener('statechange', () => {
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) offer(incoming);
      });
    });
  }).catch(() => { /* still works online without it */ });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloaded && window.hasControlled) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.ready.then(() => { window.hasControlled = !!navigator.serviceWorker.controller; });
}

boot().catch((err) => {
  app.innerHTML = `<main class="intro"><h1 class="intro-mark">Something broke</h1><p>${esc(err.message)}</p></main>`;
});
