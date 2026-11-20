import { store } from '../store.js';
import { esc, sheet, toast } from '../ui.js';
import { initial } from './common.js';
import { restoreFromFile, syncForm, wireSyncForm } from './settings.js';

// After joining, open on the right person's rounds instead of whoever was
// added first.
function pickOwner() {
  const people = store.profiles.map((p) => {
    const count = store.listFor(p.id).length;
    return `<button class="pick" data-id="${esc(p.id)}">
      <span class="avatar">${initial(p.name)}</span>
      <span class="pick-name">${esc(p.name)}<small>${count} ${count === 1 ? 'round' : 'rounds'}</small></span>
    </button>`;
  }).join('');
  return sheet(
    `<h3>Whose phone is this?</h3>
     <p class="sub" style="margin-bottom:12px">Their rounds open first. Tap the name at the top to switch any time.</p>
     <div>${people}</div>`,
    (el, close) => el.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', async () => {
      await store.setActive(b.dataset.id);
      close();
    })),
  );
}

export const onboarding = {
  render() {
    return `<main class="intro">
      <h1 class="intro-mark">Undis<span>puted</span></h1>
      <p>Every scan is a round. Your opponent is the body you started with. Fat in the red corner, muscle in the blue.</p>
      <form data-start style="display:grid;gap:12px">
        <div class="form-row">
          <label for="start-name">What should the ring announcer call you?</label>
          <input class="input" id="start-name" maxlength="24" autocomplete="off" placeholder="Your name" required>
        </div>
        <button class="btn gold block">Step into the ring</button>
      </form>
      <label class="btn ghost file-btn">I have a backup file<input type="file" data-restore></label>
      <button class="btn ghost" data-sync-start>We already sync</button>
      <p class="fine">No account needed, and no internet after the first visit. Your numbers stay on this device unless you both turn on sync.</p>
    </main>`;
  },
  mount(root, ctx) {
    root.querySelector('[data-start]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = root.querySelector('#start-name').value.trim();
      if (!name) return;
      await store.addProfile(name);
      ctx.go('#/home');
    });
    // Another phone joins by connecting to the same private repository.
    root.querySelector('[data-sync-start]').addEventListener('click', async () => {
      const joined = await sheet(
        `<h3>Join your sync</h3>
         <p class="sub" style="margin-bottom:12px">Use the same private repository and access token as your other phone or computer. Everything saved there comes across.</p>
         ${syncForm()}
         <div class="sheet-actions"><button type="button" class="btn" data-no>Cancel</button></div>`,
        (el, close) => {
          el.querySelector('[data-no]').addEventListener('click', () => close(false));
          wireSyncForm(el, () => close(true));
        },
      );
      if (!joined) return;
      if (store.profiles.length) {
        if (store.profiles.length > 1) await pickOwner();
        toast('Connected. This phone is in step.');
        ctx.go('#/home');
      } else {
        toast('Connected, but nothing is saved there yet. Load your rounds on the other phone or computer first.');
      }
    });
    root.querySelector('[data-restore]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const { added } = await restoreFromFile(file);
        toast(`Backup restored. ${added} ${added === 1 ? 'round' : 'rounds'} added.`);
        ctx.go('#/home');
      } catch (err) {
        toast(err.message);
      }
      e.target.value = '';
    });
  },
};
