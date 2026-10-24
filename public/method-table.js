// The signals table on the method page, as an HTML string. Shared by
// method.js (in the browser) and scripts/prerender.mjs (at build time).
const nf = (n, d = 2) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: d }).format(n);
// Same format as the main page: 24 Oct 2026, 14:39 UTC.
const when = (iso) => `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23' }).format(new Date(iso)).replace(/\bSept\b/, 'Sep')} UTC`;
const day = (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)).replace(/\bSept\b/, 'Sep');
const span = (h) => (h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`);
// When a signal stops counting; the rule itself is in scripts/compute-index.mjs.
function leftOutAfter(s) {
  if (s.ageBasis === 'report' && s.dueAt) return `3 days after the next Challenger report is due (from ${day(Date.parse(s.dueAt) + 3 * 864e5)})`;
  if (s.ageBasis === 'published') return `${span(s.maxAgeHours)} after the latest report was published`;
  if (s.maxAgeHours) return `${span(s.maxAgeHours)} without a successful download`;
  return '—';
}
// Text from data files is inserted as text, never as HTML.
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);


/** The table and notes for `index` (the published index.json). */
export function signalsHtml(index) {
  const d = index.data;
  const rows = d.signals
    .map(
      (s) => `<tr>
        <th scope="row">${esc(s.name)}<span class="faded" style="display:block;font-weight:400">${esc(s.explain)}</span></th>
        <td class="num">${s.value == null ? '—' : nf(s.value)}</td>
        <td class="num">${nf(s.calm)}</td>
        <td class="num">${nf(s.alarm)}</td>
        <td class="num">${s.score == null ? 'out' : nf(s.score, 0)}</td>
        <td class="num">${nf((s.weight / d.weightTotal) * 100, 1)}%</td>
        <td class="num">${s.score == null ? '0%' : `${nf(s.effectiveWeight, 1)}%`}</td>
        <td class="num">${s.score == null ? '—' : nf((s.score * s.effectiveWeight) / 100, 1)}</td>
        <td>${esc(leftOutAfter(s))}</td>
      </tr>`,
    )
    .join('');
  const missing = d.signals.filter((s) => s.missing).map((s) => `<li><strong>${esc(s.name)}:</strong> ${esc(s.missing)}.</li>`).join('');
  return `
    <p>Current index: <strong>${d.value == null ? '—' : nf(d.value, 1)}</strong> of 100, calculated ${when(index.fetchedAt)}.</p>
    <div style="overflow-x:auto"><table class="data" style="max-width:none">
      <caption class="visually-hidden">Condition Index signals</caption>
      <thead><tr><th scope="col">Signal</th><th scope="col" class="num">Value</th><th scope="col" class="num">Calm</th><th scope="col" class="num">Alarm</th><th scope="col" class="num">Score (0–100)</th><th scope="col" class="num">Weight</th><th scope="col" class="num">Effective weight</th><th scope="col" class="num">Points</th><th scope="col">Left out after</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row" colspan="6">Condition Index (sum of points)</th><td class="num">${d.value == null ? '—' : nf(d.value, 1)}</td><td></td></tr></tfoot>
    </table></div>
    ${missing ? `<p>Left out of the calculation right now:</p><ul class="list">${missing}</ul>` : ''}`;
}
