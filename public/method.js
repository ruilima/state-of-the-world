import { signalsHtml } from './method-table.js';

const res = await fetch('data/index.json', { cache: 'no-cache' }).catch(() => null);
const index = res?.ok ? await res.json() : null;
const box = document.getElementById('signals');

if (!index?.data) {
  box.innerHTML = '<p class="notice">The index file is not available right now.</p>';
} else {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = index.data.thresholds[el.dataset.t];
  // The build may have written the same table already; replacing it changes nothing on screen.
  box.innerHTML = signalsHtml(index);
}
