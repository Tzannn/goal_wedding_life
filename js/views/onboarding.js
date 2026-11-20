import { store } from '../store.js';
import { sheet, toast } from '../ui.js';
import { restoreFromFile, syncForm, wireSyncForm } from './settings.js';

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
      <button class="btn ghost" data-sync-start>My partner already syncs</button>
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
    // A second phone joins by connecting to the same private repository.
    root.querySelector('[data-sync-start]').addEventListener('click', async () => {
      const joined = await sheet(
        `<h3>Join your partner</h3>
         <p class="sub" style="margin-bottom:12px">Use the same private repository and access token your partner connected with. Everything they have saved comes across.</p>
         ${syncForm()}
         <div class="sheet-actions"><button type="button" class="btn" data-no>Cancel</button></div>`,
        (el, close) => {
          el.querySelector('[data-no]').addEventListener('click', () => close(false));
          wireSyncForm(el, () => close(true));
        },
      );
      if (!joined) return;
      if (store.profiles.length) {
        toast('Connected. You are in step with your partner.');
        ctx.go('#/home');
      } else {
        toast('Connected, but the repository has no rounds yet. Set up on the first phone, then sync.');
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
