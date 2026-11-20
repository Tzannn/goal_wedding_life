// Shared interface pieces: icons, sheets, toasts and the save-moment effects.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stroke = (d, size = 24, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icon = {
  ring: (s) => stroke('<path d="M4 20V5M20 20V5M4 8.5h16M4 12.5h16M4 16.5h16"/><path d="M2.5 20h19"/>', s),
  chart: (s) => stroke('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 2.5L20 7"/>', s),
  camera: (s) => stroke('<path d="M4 8h3l1.7-2.6h6.6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/>', s),
  rounds: (s) => stroke('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>', s),
  belt: (s) => stroke('<circle cx="12" cy="12" r="5.5"/><path d="M6.5 9.5H3v5h3.5M17.5 9.5H21v5h-3.5"/><path d="m12 9.6.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z"/>', s),
  gear: (s) => stroke('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.2 19.700l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1A1.7 1.7 0 0 0 3.100 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.300 7.200l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1A1.7 1.7 0 0 0 10 3.100V3a2 2 0 1 1 4 0v.1a1.7 1.700 0 0 0 2.800 1.200l.1-.1a2 2 0 1 1 2.900 2.900l-.1.1A1.7 1.7 0 0 0 20.900 10H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.500 1z"/>', s, 1.7),
  down: (s) => stroke('<path d="m6 9 6 6 6-6"/>', s),
  back: (s) => stroke('<path d="m15 18-6-6 6-6"/>', s),
  check: (s) => stroke('<path d="m5 12.500 4.500 4.500L19 7.500"/>', s, 2.6),
  alert: (s) => stroke('<path d="M12 3.500 2.500 20h19z"/><path d="M12 10v4.500M12 17.500h.01"/>', s),
  clock: (s) => stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s),
  flame: (s) => stroke('<path d="M12 3s5 4.500 5 10a5 5 0 0 1-10 0c0-1.800.8-3.200 1.800-4.200.3 1.500 1.200 2.200 2.200 2.200C12 8 12 3 12 3z"/>', s),
  target: (s) => stroke('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.500"/><path d="M12 12h.01"/>', s),
  plus: (s) => stroke('<path d="M12 5v14M5 12h14"/>', s),
  pencil: (s) => stroke('<path d="m4 20 1-4 11-11 3 3L8 19z"/>', s),
};

export const beltArt = (size = 96) => `<svg width="${size}" viewBox="0 0 96 56" aria-hidden="true"><rect x="1" y="20" width="94" height="16" rx="4" fill="currentColor" opacity=".3"/><rect x="6" y="14" width="17" height="28" rx="4" fill="currentColor" opacity=".72"/><rect x="73" y="14" width="17" height="28" rx="4" fill="currentColor" opacity=".72"/><circle cx="48" cy="28" r="26" fill="currentColor"/><circle cx="48" cy="28" r="20" fill="none" stroke="var(--mat)" stroke-width="2"/><path d="m48 14.500 4.300 8.800 9.700 1.400-7 6.800 1.650 9.650L48 36.600l-8.650 4.550L41 31.500l-7-6.800 9.700-1.400z" fill="var(--mat)"/></svg>`;

export const medalArt = (size = 54) => `<svg width="${size}" height="${size}" viewBox="0 0 54 54" aria-hidden="true"><path d="M16 3h9l5 15h-9zM38 3h-9l-5 15h9z" fill="currentColor" opacity=".55"/><circle cx="27" cy="34" r="17" fill="currentColor"/><circle cx="27" cy="34" r="12.500" fill="none" stroke="var(--night)" stroke-width="1.500"/><path d="m27 25.500 2.700 5.500 6.100.9-4.400 4.300 1 6-5.400-2.800-5.400 2.800 1-6-4.400-4.300 6.100-.9z" fill="var(--night)"/></svg>`;

let toastTimer = null;

export function toast(message, action = null) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', () => { el.remove(); action.run(); });
    el.append(b);
  }
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), action ? 9000 : 3600);
}

// Opens a bottom sheet with `html`. Resolves when closed.
export function sheet(html, onMount = () => {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    const previous = document.activeElement;
    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      back.remove();
      previous?.focus?.();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };
    back.addEventListener('click', (e) => { if (e.target === back) close(undefined); });
    document.addEventListener('keydown', onKey);
    document.body.append(back);
    onMount(back.firstElementChild, close);
  });
}

export function confirmSheet({ title, body, confirm, danger = false, cancel = 'Cancel' }) {
  return sheet(
    `<h3>${esc(title)}</h3><p class="sub">${esc(body)}</p>
     <div class="sheet-actions">
       <button class="btn" data-no>${esc(cancel)}</button>
       <button class="btn ${danger ? 'danger' : 'gold'}" data-yes>${esc(confirm)}</button>
     </div>`,
    (el, close) => {
      el.querySelector('[data-no]').addEventListener('click', () => close(false));
      el.querySelector('[data-yes]').addEventListener('click', () => close(true));
      el.querySelector('[data-no]').focus();
    },
  ).then(Boolean);
}

const prefersStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function countUp(el, to, { dec = 1, ms = 900 } = {}) {
  if (!el) return;
  if (prefersStill()) { el.textContent = to.toFixed(dec); return; }
  // The element keeps its final value until the first frame actually draws.
  let start = null;
  const step = (now) => {
    start ??= now;
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = (to * eased).toFixed(dec);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Two strikes of a ring bell, synthesised so no sound file is needed.
export function ringBell() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const strike = (at) => {
      for (const [freq, level, decay] of [[1046, 0.13, 1.0], [2215, 0.06, 0.6], [3520, 0.03, 0.35]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + decay + 0.05);
      }
    };
    strike(ctx.currentTime + 0.02);
    strike(ctx.currentTime + 0.26);
    setTimeout(() => ctx.close(), 2200);
  } catch { /* sound is a bonus */ }
}

export function confetti(pieces = 130) {
  if (prefersStill()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth; c.height = innerHeight;
  document.body.append(c);
  const x = c.getContext('2d');
  const colors = ['#edbe55', '#f3eee3', '#e5484d', '#3e8bff'];
  const bits = Array.from({ length: pieces }, () => ({
    x: Math.random() * c.width,
    y: -20 - Math.random() * c.height * 0.5,
    w: 5 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    vx: -1.2 + Math.random() * 2.4,
    vy: 2.2 + Math.random() * 3.4,
    r: Math.random() * Math.PI,
    vr: -0.14 + Math.random() * 0.28,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const end = performance.now() + 3200;
  const frame = (now) => {
    x.clearRect(0, 0, c.width, c.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vy += 0.02;
      x.save();
      x.translate(b.x, b.y);
      x.rotate(b.r);
      x.fillStyle = b.color;
      x.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      x.restore();
    }
    if (now < end) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

export async function shareOrDownload(filename, text, type) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
