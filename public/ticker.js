// Headline strip under the masthead: the real GDELT headlines the site
// already collects, sliding sideways. Titles are untrusted text: they are
// inserted with textContent, and only http(s) URLs become links.
//
// - A visible button pauses it (motion longer than 5 seconds must be
//   stoppable); hovering or focusing a headline pauses it too (CSS).
// - The second copy of the list only exists to close the loop: it is
//   aria-hidden and its links are out of the tab order.
// - With prefers-reduced-motion it stands still and scrolls by hand (CSS).
// - If GDELT refused the latest request, it shows the last good list with
//   a note; with no list at all the whole strip stays hidden.

const SPEED = 45; // pixels per second
const MAX_ITEMS = 16;

function item(a, copy) {
  const li = document.createElement('li');
  const text = document.createElement(/^https?:\/\//i.test(a.url ?? '') ? 'a' : 'span');
  text.textContent = a.title;
  if (text.tagName === 'A') {
    text.href = a.url;
    text.target = '_blank';
    text.rel = 'noopener noreferrer';
    if (copy) text.tabIndex = -1;
    const hint = document.createElement('span');
    hint.className = 'visually-hidden';
    hint.textContent = ' (opens in a new tab)';
    text.append(hint);
  }
  const src = document.createElement('span');
  src.className = 'ticker__src';
  src.textContent = a.domain ?? '';
  li.append(text, ' ', src);
  return li;
}

/**
 * queries: GDELT DOC query results ({ status, fetchedAt, items }).
 * fmt: formats an ISO time for the "last good list" note.
 */
export function mountTicker(root, queries, fmt) {
  const lists = queries.filter((q) => q?.items?.length);
  // Interleave the lists so one topic does not fill the strip.
  const items = [];
  for (let i = 0; items.length < MAX_ITEMS && lists.some((q) => i < q.items.length); i++) {
    for (const q of lists) if (i < q.items.length && items.length < MAX_ITEMS) items.push(q.items[i]);
  }
  if (!items.length) {
    root.hidden = true;
    return;
  }

  const stale = lists.filter((q) => q.status === 'stale' && q.fetchedAt);
  const note = root.querySelector('.ticker__note');
  if (stale.length) {
    const oldest = stale.map((q) => q.fetchedAt).sort()[0];
    note.textContent = `Last good list, from ${fmt(oldest)}`;
    note.hidden = false;
  }

  const track = root.querySelector('.ticker__track');
  const [main, copy] = track.querySelectorAll('.ticker__list');
  main.replaceChildren(...items.map((a) => item(a, false)));
  copy.replaceChildren(...items.map((a) => item(a, true)));
  root.hidden = false;
  // One copy's width per loop, at a steady reading speed.
  track.style.setProperty('--ticker-duration', `${Math.max(20, Math.round(main.scrollWidth / SPEED))}s`);

  const button = root.querySelector('.ticker__toggle');
  button.addEventListener('click', () => {
    const paused = root.classList.toggle('is-paused');
    button.textContent = paused ? 'Play headlines' : 'Pause headlines';
  });
}
