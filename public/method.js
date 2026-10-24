const nf = (n, d = 2) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: d }).format(n);
// Same format as the main page: 24 Oct 2026, 14:39 UTC.
const when = (iso) => `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23' }).format(new Date(iso)).replace(/\bSept\b/, 'Sep')} UTC`;
// Text from data files is inserted as text, never as HTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const res = await fetch('data/index.json', { cache: 'no-cache' }).catch(() => null);
const index = res?.ok ? await res.json() : null;
const box = document.getElementById('signals');

if (!index?.data) {
  box.innerHTML = '<p class="notice">The index file is not available right now.</p>';
} else {
  const d = index.data;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = d.thresholds[el.dataset.t];
  const rows = d.signals
    .map(
      (s) => `<tr>
        <th scope="row">${esc(s.name)}<span class="faded" style="display:block;font-weight:400">${esc(s.explain)}</span></th>
        <td class="num">${s.value == null ? '—' : nf(s.value)}</td>
        <td class="num">${nf(s.calm)}</td>
        <td class="num">${nf(s.alarm)}</td>
        <td class="num">${s.score == null ? 'out' : nf(s.score, 0)}</td>
        <td class="num">${s.weight}%</td>
        <td class="num">${s.score == null ? '0%' : `${nf(s.effectiveWeight, 1)}%`}</td>
      </tr>`,
    )
    .join('');
  const missing = d.signals.filter((s) => s.missing).map((s) => `<li><strong>${esc(s.name)}:</strong> ${esc(s.missing)}.</li>`).join('');
  box.innerHTML = `
    <p>Current index: <strong>${d.value == null ? '—' : nf(d.value, 1)}</strong> of 100, calculated ${when(index.fetchedAt)}.</p>
    <div style="overflow-x:auto"><table class="data" style="max-width:none">
      <caption class="visually-hidden">Condition Index signals</caption>
      <thead><tr><th scope="col">Signal</th><th scope="col" class="num">Value</th><th scope="col" class="num">Calm</th><th scope="col" class="num">Alarm</th><th scope="col" class="num">Score (0–100)</th><th scope="col" class="num">Weight</th><th scope="col" class="num">Effective weight</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${missing ? `<p>Left out of the calculation right now:</p><ul class="list">${missing}</ul>` : ''}`;
}
