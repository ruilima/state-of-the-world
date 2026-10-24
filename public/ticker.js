// Headline strip under the masthead: the real GDELT headlines the site
// already collects, sliding sideways. Titles are untrusted text: they are
// inserted with textContent, and only http(s) URLs become links.
//
// - Each headline carries its topic ("Conflict", "Work & AI") and its date.
// - A visible button pauses it (motion longer than 5 seconds must be
//   stoppable); hovering or focusing a headline pauses it too (CSS).
// - The second copy of the list only exists to close the loop: it is
//   aria-hidden and its links are out of the tab order.
// - With prefers-reduced-motion it stands still and scrolls by hand (CSS).
// - If GDELT refused the latest request, it shows the last good list with
//   a note; with no list at all the whole strip stays hidden.

const SPEED = 45; // pixels per second
const MAX_ITEMS = 16;

/** The strip's topics, from the published GDELT DOC file. */
export const tickerTopics = (files) => {
  const doc = files['gdelt-doc']?.data?.queries ?? {};
  return [{ topic: 'Conflict', query: doc.conflictHeadlines }, { topic: 'Work & AI', query: doc.aiLayoffHeadlines }];
};

/** "Last good list, from …" when GDELT refused the latest request, else null. */
export function staleNote(topics, fmt) {
  const stale = topics.map((t) => t.query).filter((q) => q?.items?.length && q.status === 'stale' && q.fetchedAt);
  return stale.length ? `Last good list, from ${fmt(stale.map((q) => q.fetchedAt).sort()[0])}` : null;
}

/** Interleaves the topics' lists (so one topic does not fill the strip), up to `max`. */
export function pickHeadlines(topics, max = MAX_ITEMS) {
  const lists = topics.filter((t) => t.query?.items?.length);
  const items = [];
  for (let i = 0; items.length < max && lists.some((t) => i < t.query.items.length); i++) {
    for (const t of lists) if (i < t.query.items.length && items.length < max) items.push({ ...t.query.items[i], topic: t.topic });
  }
  return items;
}

/** What one headline shows: topic, title, link (http(s) only, else null) and source line. */
export function itemParts(a, fmtDay) {
  return {
    topic: a.topic,
    title: a.title,
    href: /^https?:\/\//i.test(a.url ?? '') ? a.url : null,
    src: [a.domain, a.date && !Number.isNaN(Date.parse(a.date)) ? fmtDay(a.date) : null].filter(Boolean).join(', '),
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The same headline as HTML, for the build (scripts/prerender.mjs). */
export function itemHtml(a, fmtDay) {
  const p = itemParts(a, fmtDay);
  const text = p.href
    ? `<a href="${esc(p.href)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}<span class="visually-hidden"> (opens in a new tab)</span></a>`
    : `<span>${esc(p.title)}</span>`;
  return `<li><span class="ticker__topic">${esc(p.topic)}</span> ${text} <span class="ticker__src">${esc(p.src)}</span></li>`;
}

function item(a, copy, fmtDay) {
  const p = itemParts(a, fmtDay);
  const li = document.createElement('li');
  const topic = document.createElement('span');
  topic.className = 'ticker__topic';
  topic.textContent = p.topic;
  const text = document.createElement(p.href ? 'a' : 'span');
  text.textContent = p.title;
  if (p.href) {
    text.href = p.href;
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
  src.textContent = p.src;
  li.append(topic, ' ', text, ' ', src);
  return li;
}

/**
 * topics: [{ topic, query }] where query is a GDELT DOC result ({ status, fetchedAt, items }).
 * fmt: formats an ISO time for the "last good list" note; fmtDay: a headline's date.
 */
export function mountTicker(root, topics, fmt, fmtDay) {
  const items = pickHeadlines(topics);
  if (!items.length) {
    root.hidden = true;
    return;
  }

  const noteText = staleNote(topics, fmt);
  const note = root.querySelector('.ticker__note');
  note.textContent = noteText ?? '';
  note.hidden = !noteText;

  const track = root.querySelector('.ticker__track');
  const [main, copy] = track.querySelectorAll('.ticker__list');
  main.replaceChildren(...items.map((a) => item(a, false, fmtDay)));
  copy.replaceChildren(...items.map((a) => item(a, true, fmtDay)));
  root.hidden = false;
  // One copy's width per loop, at a steady reading speed.
  track.style.setProperty('--ticker-duration', `${Math.max(20, Math.round(main.scrollWidth / SPEED))}s`);

  const button = root.querySelector('.ticker__toggle');
  button.addEventListener('click', () => {
    const paused = root.classList.toggle('is-paused');
    button.textContent = paused ? 'Play headlines' : 'Pause headlines';
  });
}
