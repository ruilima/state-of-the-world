const nf = (n, d = 2) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: d }).format(n);

const res = await fetch('data/index.json', { cache: 'no-cache' }).catch(() => null);
const index = res?.ok ? await res.json() : null;
const box = document.getElementById('signals');

if (!index?.data) {
  box.innerHTML = '<p class="notice">O ficheiro do índice não está disponível neste momento.</p>';
} else {
  const d = index.data;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = d.thresholds[el.dataset.t];
  const rows = d.signals
    .map(
      (s) => `<tr>
        <th scope="row">${s.name}<span class="meta faded small" style="display:block;font-weight:400">${s.explain}</span></th>
        <td class="num">${s.value == null ? '—' : nf(s.value)}</td>
        <td class="num">${nf(s.calm)}</td>
        <td class="num">${nf(s.alarm)}</td>
        <td class="num">${s.score == null ? `<span title="${s.missing}">fora</span>` : nf(s.score, 0)}</td>
        <td class="num">${s.weight}</td>
        <td class="num">${s.score == null ? '0' : nf(s.effectiveWeight, 1) + '%'}</td>
      </tr>`,
    )
    .join('');
  const missing = d.signals.filter((s) => s.missing).map((s) => `<li><strong>${s.name}:</strong> ${s.missing}.</li>`).join('');
  box.innerHTML = `
    <p>Índice atual: <strong>${d.value == null ? '—' : nf(d.value, 1)}</strong> de 100, calculado ${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(index.fetchedAt))}.</p>
    <div style="overflow-x:auto"><table class="data" style="max-width:none">
      <caption class="visually-hidden">Sinais do Índice de Condição</caption>
      <thead><tr><th scope="col">Sinal</th><th scope="col" class="num">Valor</th><th scope="col" class="num">Calmo</th><th scope="col" class="num">Alarme</th><th scope="col" class="num">Escala</th><th scope="col" class="num">Peso</th><th scope="col" class="num">Peso efetivo</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${missing ? `<p>Fora do cálculo agora:</p><ul class="list">${missing}</ul>` : ''}`;
}
