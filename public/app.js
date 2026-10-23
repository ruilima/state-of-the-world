import { mountEcg } from './ecg.js';
import { barChart as bar, lineChart as line, dotMap, tableDetails } from './charts.js';

// Narrow screens get a narrower chart box so axis text stays legible
// instead of shrinking with the SVG.
const CHART_W = matchMedia('(max-width: 560px)').matches ? 380 : 640;
const barChart = (items, o) => bar(items, { width: CHART_W, ...o });
const lineChart = (series, o) => line(series, { width: CHART_W, ...o });

// ---------- helpers ----------

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}
const link = (href, text) => h('a', { href, rel: 'noopener' }, text);

const nf = (d = 0) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: d, minimumFractionDigits: d });
const num = (n, d = 0) => nf(d).format(n);
const compact = (n) => (Math.abs(n) >= 100000 ? `${num(n / 1000)} mil` : Math.abs(n) >= 10000 ? `${num(n / 1000, n % 1000 ? 1 : 0)} mil` : num(n));
const pct = (n, d = 1) => `${num(n, d)}%`;
const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });
const dayTime = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' });
const fmtDate = (iso) => dateFmt.format(new Date(iso));
const dayMonth = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });
const fmtMonth = (ym) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));

function ago(iso) {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 48) return `há ${hrs} h`;
  return `há ${Math.round(hrs / 24)} dias`;
}

const STATE_PT = { stable: 'ESTÁVEL', caution: 'CUIDADO', danger: 'PERIGO', stale: 'DADOS DESATUALIZADOS' };

// Every state also has a shape, so it never depends on colour alone.
function shape(state) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shapes = {
    stable: '<circle cx="10" cy="10" r="8" fill="currentColor"/>',
    caution: '<path d="M10 2 19 18H1Z" fill="currentColor"/>',
    danger: '<path d="M10 1 19 10 10 19 1 10Z" fill="currentColor"/><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="var(--paper)" stroke-width="2"/>',
    stale: '<rect x="2" y="2" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 3"/>',
    fail: '<path d="M3 3l14 14M17 3 3 17" stroke="currentColor" stroke-width="3"/>',
  };
  svg.innerHTML = shapes[state];
  return svg;
}

const stateFromScore = (score, t) => (score >= t.danger ? 'danger' : score >= t.caution ? 'caution' : 'stable');

// Country names as UCDP writes them -> Portuguese.
const COUNTRY_PT = {
  Ukraine: 'Ucrânia', Russia: 'Rússia', Yemen: 'Iémen', Pakistan: 'Paquistão', Ethiopia: 'Etiópia', Nigeria: 'Nigéria', Sudan: 'Sudão',
  'South Sudan': 'Sudão do Sul', Mexico: 'México', Colombia: 'Colômbia', Afghanistan: 'Afeganistão', Syria: 'Síria', Iraq: 'Iraque', Israel: 'Israel',
  Lebanon: 'Líbano', Iran: 'Irão', Myanmar: 'Myanmar', 'Myanmar (Burma)': 'Myanmar', 'DR Congo': 'RD Congo', 'DR Congo (Zaire)': 'RD Congo', Somalia: 'Somália',
  Mali: 'Mali', 'Burkina Faso': 'Burkina Faso', Niger: 'Níger', Cameroon: 'Camarões', Mozambique: 'Moçambique', India: 'Índia', Brazil: 'Brasil',
  Haiti: 'Haiti', Philippines: 'Filipinas', Chad: 'Chade', 'Central African Republic': 'Rep. Centro-Africana', Libya: 'Líbia', Egypt: 'Egito',
  Palestine: 'Palestina', Bangladesh: 'Bangladesh', Ecuador: 'Equador', Kenya: 'Quénia', Benin: 'Benim', Thailand: 'Tailândia', Cambodia: 'Camboja',
};
const country = (c) => COUNTRY_PT[c] ?? c;

// ---------- data ----------

const FILES = ['manifest', 'index', 'usgs', 'eonet', 'gdelt-events', 'gdelt-doc', 'pulse', 'worldbank', 'ucdp', 'curated', 'digest'];

async function load() {
  const entries = await Promise.all(
    FILES.map(async (f) => {
      try {
        const res = await fetch(`data/${f}.json`, { cache: 'no-cache' });
        return [f, res.ok ? await res.json() : null];
      } catch {
        return [f, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}

// How often each source should refresh (minutes). Older than 3× → late.
const EXPECT_MIN = { usgs: 30, eonet: 30, 'gdelt-events': 30, 'gdelt-doc': 30, pulse: 30, curated: 30, index: 30, ucdp: 1440, worldbank: 1440, digest: 1440 };
const SOURCE_PT = {
  usgs: 'USGS (sismos)', eonet: 'NASA EONET', 'gdelt-events': 'GDELT (eventos)', 'gdelt-doc': 'GDELT (manchetes)', pulse: 'Hacker News e arXiv',
  worldbank: 'Banco Mundial', ucdp: 'UCDP', curated: 'Ficheiros curados', digest: 'Resumo por IA',
};

function health(id, file) {
  if (!file) return { state: 'fail', text: 'em falha: ficheiro em falta' };
  if (file.status === 'disabled') return { state: 'stale', text: 'desligada' };
  if (file.status === 'error') return { state: 'fail', text: `em falha (${file.error ?? 'sem detalhe'})` };
  const ageMin = (Date.now() - Date.parse(file.lastSuccessAt)) / 60000;
  const late = file.status === 'stale' || ageMin > 3 * (EXPECT_MIN[id] ?? 60);
  if (late) return { state: 'stale', text: `atrasada: último dado bom ${ago(file.lastSuccessAt)}${file.error ? ` (${file.error.slice(0, 90)})` : ''}` };
  return { state: 'stable', text: `viva${file.status === 'partial' ? ', com parte dos pedidos recusados' : ''}: ${ago(file.lastSuccessAt)}` };
}

// ---------- monitor + inventory ----------

function renderMonitor(index) {
  const d = index?.data;
  const state = d?.state ?? 'stable';
  const stateEl = document.getElementById('monitor-state');
  stateEl.className = `monitor__state is-${state}`;
  stateEl.replaceChildren(shape(state), d?.value == null ? 'SEM SINAL' : STATE_PT[state]);
  document.getElementById('monitor-index').textContent = d?.value == null ? '—' : `${num(d.value, 0)} de 100`;
  document.getElementById('monitor-bpm').textContent = d?.bpm == null ? '—' : `${d.bpm} por minuto`;
  mountEcg(document.getElementById('trace'), { state, bpm: d?.bpm ?? 60 });
}

const ICONS = {
  quake: '<path d="M2 24h8l3-10 4 18 4-24 3 16h8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
  tally: '<path d="M7 6v20M13 6v20M19 6v20M25 6v20M3 22 29 10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  storm: '<path d="M16 4a12 12 0 1 0 12 12M16 10a6 6 0 1 0 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="currentColor"/>',
  wire: '<rect x="4" y="5" width="24" height="22" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 11h16M8 16h16M8 21h9" stroke="currentColor" stroke-width="2"/>',
  clock: '<circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M16 16V7M16 16l-5 2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  coin: '<ellipse cx="16" cy="9" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M6 9v7c0 2.2 4.5 4 10 4s10-1.8 10-4V9M6 16v7c0 2.2 4.5 4 10 4s10-1.8 10-4v-7" fill="none" stroke="currentColor" stroke-width="2.2"/>',
};

function renderInventory(files) {
  const sig = Object.fromEntries((files.index?.data?.signals ?? []).map((s) => [s.id, s]));
  const t = files.index?.data?.thresholds ?? { caution: 40, danger: 65 };
  const tone = (id) => (sig[id]?.score == null ? null : stateFromScore(sig[id].score, t));
  const wb = files.worldbank?.data?.indicators?.find((i) => i.id === 'FP.CPI.TOTL.ZG')?.series.find((s) => s.country === 'WLD')?.latest;
  const ucdp = files.ucdp?.data;
  const items = [
    { icon: 'quake', qty: files.usgs?.data ? num(files.usgs.data.counts.m45Week) : '—', label: 'Sismos M4,5+', sub: 'últimos 7 dias', state: tone('quakes'), go: 'planeta' },
    { icon: 'tally', qty: ucdp?.monthly?.length ? compact(ucdp.monthly.at(-1).deaths) : '—', label: 'Mortes em violência organizada', sub: ucdp?.latestMonth ? fmtMonth(ucdp.latestMonth) : '', state: tone('conflictDeaths'), go: 'conflitos' },
    { icon: 'wire', qty: files['gdelt-events']?.data?.materialShare24h != null ? pct(files['gdelt-events'].data.materialShare24h * 100) : '—', label: 'Notícias de conflito material', sub: 'parte dos eventos, 24 h', state: tone('conflictNews'), go: 'conflitos' },
    { icon: 'storm', qty: sig.naturalEvents?.value != null ? num(sig.naturalEvents.value) : '—', label: 'Tempestades e vulcões ativos', sub: 'NASA EONET', state: tone('naturalEvents'), go: 'planeta' },
    { icon: 'clock', qty: files.curated?.data ? `${files.curated.data.doomsday.current.seconds} s` : '—', label: 'Doomsday Clock', sub: 'para a meia-noite', state: tone('doomsday'), go: 'futuro' },
    { icon: 'coin', qty: wb ? pct(wb.value) : '—', label: 'Inflação mundial', sub: wb ? `ano ${wb.year}` : '', state: null, go: 'economia' },
  ];
  document.getElementById('inventory').replaceChildren(
    ...items.map((it) => {
      const box = h('a', { class: 'item__box', href: `#${it.go}`, 'aria-label': `${it.label}, ${it.sub}: ${it.qty}${it.state && it.state !== 'stable' ? `, ${STATE_PT[it.state].toLowerCase()}` : ''}. Abrir dossier.` });
      box.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${ICONS[it.icon]}</svg>`;
      // Colour only when the signal is above the stable band.
      box.append(h('span', { class: `item__qty${it.state && it.state !== 'stable' ? ` is-${it.state}` : ''}`, 'aria-hidden': 'true' }, it.qty));
      return h('li', { class: 'item' }, box, h('p', { class: 'item__label', 'aria-hidden': 'true' }, it.label, h('span', {}, it.sub)));
    }),
  );
}

// ---------- dossiers ----------

function headlineList(items, emptyText) {
  if (!items?.length) return h('p', { class: 'notice' }, emptyText);
  return h(
    'ul',
    { class: 'list' },
    items.map((a) => h('li', {}, link(a.url, a.title), h('span', { class: 'meta' }, `${a.domain ?? a.source ?? ''}${a.date ? `, ${dayTime.format(new Date(a.date))}` : ''}`))),
  );
}

function unverified(flag) {
  return flag ? h('span', { class: 'unverified', title: 'Valor ainda não confirmado na fonte primária' }, 'a confirmar') : null;
}

function docQueryNotice(q, what) {
  if (!q) return `Sem ${what}: o GDELT ainda não respondeu a este pedido.`;
  if (q.status === 'error') return `Sem ${what}: o GDELT recusou os pedidos (limite de tráfego da API). Tenta-se de novo a cada 30 minutos.`;
  return `Sem ${what} nesta janela.`;
}

function renderConflicts(files, t) {
  const u = files.ucdp?.data;
  const g = files['gdelt-events']?.data;
  const doc = files['gdelt-doc']?.data?.queries ?? {};
  const out = [];
  if (u?.monthly?.length) {
    const last = u.monthly.at(-1);
    out.push(h('p', { class: 'lede' }, `Em ${fmtMonth(last.month)}, o UCDP registou ${num(last.deaths)} mortes em violência organizada, em ${num(last.events)} eventos.`));
    out.push(h('p', { class: 'small faded' }, 'Eventos candidatos: a primeira contagem mensal do UCDP, revista no conjunto anual seguinte.'));

    const over = (cell) => cell.deaths >= 1000;
    const top = u.topCountries.slice(0, 3).map((c) => `${country(c.country)} (${num(c.deaths)})`).join(', ');
    out.push(h('h3', {}, 'Onde'));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        dotMap({
          label: `Mapa de mortes em violência organizada em ${fmtMonth(last.month)}. Mais mortes em: ${top}.`,
          dots: u.points.map((p) => ({ lat: p.lat, lon: p.lon, r: Math.min(9, 0.6 + Math.sqrt(p.deaths) * 0.11), over: over(p), hover: `${country(p.country)}: ${num(p.deaths)} mortes, ${p.events} eventos` })),
        }),
        h('figcaption', {}, 'Cada círculo agrega os eventos de uma quadrícula de 1° e cresce com o número de mortes. A vermelho, quadrículas com mil ou mais mortes no mês.'),
      ),
    );
    out.push(
      h(
        'table',
        { class: 'data' },
        h('caption', { class: 'visually-hidden' }, `Países com mais mortes em ${fmtMonth(last.month)}`),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'País'), h('th', { scope: 'col', class: 'num' }, 'Mortes'))),
        h('tbody', {}, u.topCountries.map((c) => h('tr', {}, h('td', {}, country(c.country)), h('td', { class: 'num' }, num(c.deaths))))),
      ),
    );

    const alarm = files.index?.data?.signals?.find((s) => s.id === 'conflictDeaths')?.alarm ?? 25000;
    out.push(h('h3', {}, `Mês a mês, ${last.month.slice(0, 4)}`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        barChart(
          u.monthly.map((m) => ({ label: monthShort.format(new Date(`${m.month}-01T00:00:00Z`)).replace('.', ''), value: m.deaths, hover: `${fmtMonth(m.month)}: ${num(m.deaths)} mortes` })),
          { label: `Mortes por mês em ${last.month.slice(0, 4)}, segundo os eventos candidatos do UCDP.`, format: compact, over: (v) => v >= alarm },
        ),
        h('figcaption', {}, `A vermelho, meses acima de ${num(alarm)} mortes, o valor de alarme usado no índice.`),
        tableDetails('Mortes por mês', ['Mês', 'Mortes', 'Eventos'], u.monthly.map((m) => [fmtMonth(m.month), num(m.deaths), num(m.events)]), [1, 2]),
      ),
    );
  }
  if (u?.annual?.length) {
    const a = u.annual;
    out.push(h('h3', {}, `Desde ${a[0].year}`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart([{ name: 'Mortes em combate', points: a.map((r) => ({ x: r.year, y: r.deaths })) }], {
          label: `Mortes em combate por ano, ${a[0].year}–${a.at(-1).year}. Em ${a.at(-1).year}: ${num(a.at(-1).deaths)}.`,
          formatY: compact,
          formatX: String,
          xTicks: [a[0].year, 2000, 2010, 2020, a.at(-1).year],
        }),
        h('figcaption', {}, `${u.annualNote} Série anual UCDP Battle-Related Deaths, versão ${u.annualVersion}.`),
        tableDetails('Mortes em combate por ano', ['Ano', 'Mortes', 'Conflitos'], a.map((r) => [r.year, num(r.deaths), r.conflicts]), [1, 2]),
      ),
    );
  }

  out.push(h('h3', {}, 'Nas notícias'));
  if (g?.daily?.length) {
    out.push(h('p', {}, `Nas últimas 24 horas, ${pct(g.materialShare24h * 100)} dos ${num(g.events24h)} acontecimentos codificados pelo GDELT foram de conflito material (média de 7 dias: ${pct(g.materialShare7d * 100)}).`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart([{ name: 'Conflito material', points: g.daily.map((d) => ({ x: Date.parse(d.date), y: d.materialShare * 100 })) }], {
          label: 'Parte diária de acontecimentos de conflito material no GDELT, últimos 7 dias.',
          height: 150,
          formatY: (v) => pct(v, 0),
          formatX: (x) => dayMonth.format(new Date(x)),
          yMin: 0,
        }),
        h('figcaption', {}, 'O GDELT codifica automaticamente notícias de todo o mundo; mede atenção mediática, não vítimas.'),
      ),
    );
  }
  const cov = ['coverageArmedConflict', 'coverageCeasefire', 'coverageSanctions'].map((k) => doc[k]).filter((q) => q?.items?.length);
  if (cov.length) {
    const dashes = [null, '6 4', '2 3'];
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart(
          cov.map((q, i) => ({ name: q.label, dash: dashes[i], points: q.items.map((p) => ({ x: Date.parse(p.date), y: p.value })) })),
          { label: `Volume de cobertura nos últimos 30 dias: ${cov.map((q) => q.label).join(', ')}.`, formatY: (v) => pct(v, 2), formatX: (x) => dayMonth.format(new Date(x)), yMin: 0 },
        ),
        h('figcaption', {}, `Percentagem de toda a cobertura monitorizada pelo GDELT que menciona cada tema. Linhas: contínua, ${cov[0].label}${cov[1] ? `; tracejada, ${cov[1].label}` : ''}${cov[2] ? `; pontilhada, ${cov[2].label}` : ''}.`),
      ),
    );
  } else {
    out.push(h('p', { class: 'notice' }, docQueryNotice(doc.coverageArmedConflict, 'curvas de cobertura por tema')));
  }
  out.push(h('h3', {}, 'Manchetes recentes'));
  out.push(headlineList(doc.conflictHeadlines?.items, docQueryNotice(doc.conflictHeadlines, 'manchetes')));
  if (doc.conflictHeadlines?.status === 'stale' && doc.conflictHeadlines.fetchedAt) out.push(h('p', { class: 'small faded' }, `Lista guardada de ${dayTime.format(new Date(doc.conflictHeadlines.fetchedAt))}; o GDELT recusou o pedido mais recente.`));

  if (files.ucdp) {
    out.push(
      h(
        'p',
        { class: 'colophon' },
        'Dados: ',
        link('https://ucdp.uu.se/', 'UCDP — Uppsala Conflict Data Program'),
        `, Uppsala University, licença CC BY 4.0. ${files.ucdp.source.citation ?? ''} Modo: ${files.ucdp.mode === 'api' ? 'API com token' : 'ficheiros de download oficiais'}. ${files.ucdp.modeNote ?? ''}`,
      ),
    );
  }
  return out;
}

function renderWork(files) {
  const c = files.curated?.data?.layoffs;
  const doc = files['gdelt-doc']?.data?.queries ?? {};
  const pulse = files.pulse?.data;
  const out = [];
  if (c) {
    out.push(h('p', { class: 'lede' }, 'Quantos empregos se perdem e quanto disso é mesmo a IA? Os números variam conforme a fonte; mostra-se cada um com a sua origem.'));
    out.push(h('h3', {}, 'Números de referência'));
    out.push(
      h(
        'ul',
        { class: 'list' },
        c.figures.map((f) => {
          const value = f.high && f.high !== f.low ? `${compact(f.low)} a ${compact(f.high)}` : f.high == null ? `mais de ${compact(f.low)}` : `cerca de ${compact(f.low)}`;
          return h(
            'li',
            {},
            h('span', { class: 'big-number' }, value),
            ' ',
            unverified(!f.verified),
            h('br'),
            `${f.label}, ${f.period}${f.detail ? ` (${f.detail})` : ''}.`,
            h('span', { class: 'meta' }, 'Fonte: ', link(f.source.url, f.source.name), f.via ? `, via ${f.via.name}` : '', f.publishedAt ? `, ${fmtDate(f.publishedAt)}` : ''),
          );
        }),
      ),
    );

    out.push(h('h3', {}, 'Cortes atribuídos à IA, mês a mês'));
    if (c.monthly.length) {
      const rows = [...c.monthly].sort((a, b) => a.month.localeCompare(b.month));
      out.push(
        h(
          'figure',
          { class: 'figure' },
          barChart(rows.map((r) => ({ label: monthShort.format(new Date(`${r.month}-01T00:00:00Z`)).replace('.', ''), value: r.aiCited, hover: `${fmtMonth(r.month)}: ${num(r.aiCited)} cortes atribuídos à IA, de ${num(r.total)}` })), {
            label: 'Cortes de emprego nos EUA atribuídos à IA, por mês (Challenger, Gray & Christmas).',
            format: compact,
          }),
          tableDetails('Cortes por mês', ['Mês', 'Atribuídos à IA', 'Total', 'Confirmado'], rows.map((r) => [fmtMonth(r.month), num(r.aiCited), num(r.total), r.verified ? 'sim' : 'a confirmar']), [1, 2]),
        ),
      );
    } else {
      out.push(
        h(
          'p',
          { class: 'notice' },
          'Série mensal ainda por preencher. A fonte a seguir é o relatório mensal da ',
          link('https://www.challengergray.com/blog/category/job-cuts/', 'Challenger, Gray & Christmas'),
          '. Até lá, este sinal fica fora do Índice de Condição.',
        ),
      );
    }

    out.push(h('h3', {}, 'Duas leituras'));
    out.push(
      h(
        'div',
        { class: 'two-col' },
        h('div', { class: 'side' }, h('p', {}, h('strong', {}, 'O que as empresas declaram. '), c.attributionNote.claim)),
        h(
          'div',
          { class: 'side' },
          h('p', {}, h('strong', {}, 'O que dizem os céticos. '), c.attributionNote.counter),
          h('ul', { class: 'list small' }, c.attributionNote.sources.map((s) => h('li', {}, link(s.url, s.name), ' ', unverified(!s.verified)))),
        ),
      ),
    );
  }
  out.push(h('h3', {}, 'Manchetes recentes'));
  out.push(headlineList(doc.aiLayoffHeadlines?.items, docQueryNotice(doc.aiLayoffHeadlines, 'manchetes')));
  if (pulse) {
    out.push(h('div', { class: 'two-col' }, h('div', {}, h('h3', {}, 'Na comunidade técnica'), headlineList(pulse.hn.slice(0, 6).map((x) => ({ ...x, source: 'Hacker News' })), 'Sem publicações recentes.')), h('div', {}, h('h3', {}, 'Investigação recente'), headlineList(pulse.arxiv.slice(0, 6).map((x) => ({ ...x, source: 'arXiv' })), 'Sem artigos recentes.'))));
  }
  return out;
}

function renderPlanet(files) {
  const q = files.usgs?.data;
  const e = files.eonet?.data;
  const out = [];
  if (q) {
    const s = q.strongest;
    out.push(h('p', { class: 'lede' }, `${num(q.counts.m45Week)} sismos de magnitude 4,5 ou mais nos últimos 7 dias. O mais forte: M${num(s.mag, 1)}, ${s.place}.`));
  }
  if (q || e) {
    const quakeOver = (x) => x.mag >= 7 || x.alert === 'red' || x.alert === 'orange';
    out.push(
      h(
        'figure',
        { class: 'figure' },
        dotMap({
          label: `Mapa com ${q?.quakes.length ?? 0} sismos de magnitude 4,5 ou mais na última semana e ${e?.events.length ?? 0} eventos naturais abertos.`,
          dots: (q?.quakes ?? []).map((x) => ({ lat: x.lat, lon: x.lon, r: 0.6 + 0.45 * Math.max(0, x.mag - 4.5) ** 1.5, over: quakeOver(x), hover: `M${num(x.mag, 1)}, ${x.place}, ${dayTime.format(new Date(x.time))}` })),
          crosses: (e?.events ?? []).map((x) => ({ lat: x.lat, lon: x.lon, hover: `${x.categoryPt}: ${x.title}` })),
        }),
        h('figcaption', {}, 'Círculos: sismos (o tamanho cresce com a magnitude; a vermelho, magnitude 7 ou mais, ou alerta laranja ou vermelho do USGS). Cruzes: eventos naturais abertos no NASA EONET.'),
      ),
    );
  }
  const cols = [];
  if (q) {
    cols.push(
      h(
        'div',
        {},
        h('h3', {}, 'Sismos mais fortes'),
        h(
          'ol',
          { class: 'list' },
          q.quakes.slice(0, 8).map((x) => h('li', {}, link(x.url, `M${num(x.mag, 1)} ${x.place ?? ''}`), h('span', { class: 'meta' }, `${dayTime.format(new Date(x.time))}, ${num(x.depthKm)} km de profundidade${x.tsunami ? ', aviso de tsunami' : ''}`))),
        ),
      ),
    );
  }
  if (e) {
    const rows = Object.entries(e.byCategory).sort((a, b) => b[1] - a[1]);
    cols.push(
      h(
        'div',
        {},
        h('h3', {}, 'Eventos naturais abertos'),
        h(
          'table',
          { class: 'data' },
          h('caption', { class: 'visually-hidden' }, 'Eventos naturais abertos por categoria'),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Categoria'), h('th', { scope: 'col', class: 'num' }, 'Abertos'))),
          h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', {}, e.categoryNames[k] ?? k), h('td', { class: 'num' }, num(v))))),
        ),
        h('p', { class: 'small faded' }, 'Eventos com atividade nos últimos 30 dias que a NASA ainda não deu por encerrados.'),
      ),
    );
  }
  out.push(h('div', { class: 'two-col' }, cols));
  return out;
}

function renderEconomy(files) {
  const wb = files.worldbank?.data;
  if (!wb) return [];
  const out = [h('p', { class: 'lede' }, 'Um painel lento: o Banco Mundial publica valores anuais e revê-os poucas vezes por ano.')];
  const dashes = { WLD: null, EUU: '6 4', PRT: '2 3' };
  for (const ind of wb.indicators) {
    const lastYear = Math.max(...ind.series.flatMap((s) => s.points.map((p) => p.year)));
    const firstYear = Math.min(...ind.series.flatMap((s) => s.points.map((p) => p.year)));
    out.push(h('h3', {}, `${ind.name}, ${ind.unit}`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart(
          ind.series.map((s) => ({ name: s.countryName, dash: dashes[s.country], points: s.points.map((p) => ({ x: p.year, y: p.value })) })),
          {
            label: `${ind.name} de ${firstYear} a ${lastYear}: ${ind.series.map((s) => `${s.countryName} ${s.latest ? pct(s.latest.value) + ' em ' + s.latest.year : 'sem dados'}`).join('; ')}.`,
            height: 180,
            formatY: (v) => pct(v, 0),
            formatLabel: (v) => pct(v, 1),
            formatX: String,
            xTicks: [firstYear, lastYear],
          },
        ),
        h('figcaption', {}, `Linha contínua: Mundo; tracejada: União Europeia; pontilhada: Portugal. Último ano com dados: ${lastYear}. Atualizado pelo Banco Mundial em ${ind.lastUpdated ? fmtDate(ind.lastUpdated) : 'data desconhecida'}.`),
        tableDetails(ind.name, ['Ano', ...ind.series.map((s) => s.countryName)], [...new Set(ind.series.flatMap((s) => s.points.map((p) => p.year)))].sort().map((y) => [y, ...ind.series.map((s) => { const p = s.points.find((pp) => pp.year === y); return p ? pct(p.value) : '—'; })]), [1, 2, 3]),
      ),
    );
  }
  out.push(h('p', { class: 'colophon' }, 'Dados: ', link('https://data.worldbank.org/', 'World Bank Open Data'), ', licença CC BY 4.0.'));
  return out;
}

function renderFuture(files) {
  const c = files.curated?.data;
  const dg = files.digest;
  const out = [];
  if (c) {
    const dd = c.doomsday;
    out.push(h('p', { class: 'lede' }, h('span', { class: 'big-number' }, `${dd.current.seconds} segundos`), ' para a meia-noite no Doomsday Clock, o mais perto de sempre.'));
    out.push(h('p', { class: 'small' }, `Definido a ${fmtDate(dd.current.setAt)} pelo `, link(dd.source.url, dd.source.name), '. ', unverified(!dd.current.verified)));
    out.push(h('h3', {}, 'Os últimos anos'));
    out.push(h('ol', { class: 'seq' }, dd.history.map((r) => h('li', {}, `${r.year}: ${r.seconds} segundos `, unverified(!r.verified)))));

    out.push(h('h3', {}, 'Horizontes'));
    out.push(h('p', { class: 'small faded' }, c.horizons.rule ?? 'Só entram afirmações com autor e fonte primária.'));
    const items = [...c.horizons.items].sort((a, b) => a.horizon.localeCompare(b.horizon));
    out.push(
      h(
        'ol',
        { class: 'seq' },
        items.map((it) => h('li', {}, h('strong', {}, `${it.horizon}. `), it.claim, h('span', { class: 'meta', style: 'display:block' }, link(it.url, it.who), `, ${fmtDate(it.date)} `, unverified(!it.verified)))),
      ),
    );
  }
  if (dg?.status === 'ok' || (dg?.status === 'stale' && dg.data)) {
    out.push(h('h3', {}, 'Resumo do dia ', h('span', { class: 'ai-label' }, 'Gerado por IA')));
    out.push(h('p', { class: 'small faded' }, `Escrito por um modelo de linguagem a partir das manchetes desta página, ${ago(dg.lastSuccessAt)}. Pode conter erros: confirma nas fontes.`));
    for (const p of dg.data.paragraphs) {
      out.push(h('p', {}, p.text));
      if (p.sources.length) out.push(h('p', { class: 'small' }, 'Fontes: ', ...p.sources.flatMap((s, i) => [i ? '; ' : '', link(s.url, s.source || s.title)])));
    }
  }
  return out;
}

const DOSSIERS = [
  { id: 'conflitos', name: 'Conflitos armados', sources: ['ucdp', 'gdelt-events', 'gdelt-doc'], signals: ['conflictNews', 'conflictDeaths'], render: renderConflicts },
  { id: 'trabalho', name: 'Trabalho e IA', sources: ['curated', 'gdelt-doc', 'pulse'], signals: ['aiLayoffs'], render: renderWork, curatedAge: true },
  { id: 'planeta', name: 'Planeta', sources: ['usgs', 'eonet'], signals: ['quakes', 'naturalEvents'], render: renderPlanet },
  { id: 'economia', name: 'Economia', sources: ['worldbank'], signals: [], render: renderEconomy },
  { id: 'futuro', name: 'O que aí vem', sources: ['curated', 'digest'], signals: ['doomsday'], render: renderFuture },
];

function dossierStamp(d, files) {
  if (d.curatedAge) {
    const l = files.curated?.data?.layoffs;
    if (l && (Date.now() - Date.parse(l.updatedAt)) / 864e5 > l.maxAgeDays) return 'stale';
  }
  const t = files.index?.data?.thresholds ?? { caution: 40, danger: 65 };
  const scores = (files.index?.data?.signals ?? []).filter((s) => d.signals.includes(s.id) && s.score != null).map((s) => s.score);
  return scores.length ? stateFromScore(Math.max(...scores), t) : null;
}

function renderRecords(files) {
  const root = document.getElementById('registos');
  const slots = [];
  for (const d of DOSSIERS) {
    const hs = d.sources.map((id) => ({ id, ...health(id, files[id]) })).filter((x) => !(x.id === 'digest' && x.text === 'desligada'));
    const live = hs.filter((x) => x.state === 'stable').length;
    const lastOk = d.sources.map((id) => files[id]?.lastSuccessAt).filter(Boolean).sort().at(-1);
    const panelId = `dossier-${d.id}`;

    const slot = h(
      'button',
      { class: 'slot', type: 'button', id: `slot-${d.id}`, 'aria-expanded': 'false', 'aria-controls': panelId },
      h('span', { class: 'slot__name' }, d.name),
      h('span', { class: 'slot__meta' }, `${lastOk ? timeFmt.format(new Date(lastOk)) : '—'}, ${live === hs.length ? (hs.length === 1 ? 'fonte viva' : 'fontes vivas') : `${live} de ${hs.length} fontes vivas`}`),
    );

    const stamp = dossierStamp(d, files);
    let body;
    try {
      body = d.render(files);
    } catch (err) {
      console.error(d.id, err);
      body = [h('p', { class: 'notice' }, 'Não foi possível desenhar este dossier com os dados atuais. As fontes abaixo mostram o estado de cada uma.')];
    }
    if (!body.length) body = [h('p', { class: 'notice' }, 'Ainda não há dados guardados para este dossier. As fontes abaixo dizem porquê.')];

    const paper = h(
      'article',
      { class: 'paper', 'aria-labelledby': `title-${d.id}` },
      stamp ? h('p', { class: `stamp stamp--${stamp}` }, shape(stamp), STATE_PT[stamp]) : null,
      ...body,
      h(
        'ul',
        { class: 'health', 'aria-label': 'Estado das fontes' },
        hs.map((x) => h('li', { class: x.state === 'stable' ? '' : x.state === 'fail' ? 'danger-value' : '' }, shape(x.state), h('span', { class: 'h-name' }, SOURCE_PT[x.id] ?? x.id), h('span', { class: 'h-state' }, x.text))),
      ),
    );
    const panel = h(
      'section',
      { class: 'dossier', id: panelId, hidden: true, tabindex: '-1' },
      h('div', { class: 'tab' }, h('h2', { id: `title-${d.id}` }, d.name), lastOk ? h('time', { datetime: lastOk }, `arquivado ${dayTime.format(new Date(lastOk))}`) : null),
      paper,
    );
    root.append(slot, panel);
    slots.push({ d, slot, panel });
  }

  const wide = matchMedia('(min-width: 961px)');
  const open = (id, { focus = false } = {}) => {
    for (const s of slots) {
      const on = s.d.id === id;
      // On narrow screens other dossiers stay as they are (accordion);
      // on wide screens exactly one is open.
      if (!on && !wide.matches) continue;
      s.slot.setAttribute('aria-expanded', String(on));
      s.panel.hidden = !on;
    }
    if (focus) document.getElementById(`dossier-${id}`)?.focus({ preventScroll: !wide.matches ? false : true });
  };
  for (const s of slots) {
    s.slot.addEventListener('click', () => {
      const isOpen = s.slot.getAttribute('aria-expanded') === 'true';
      if (isOpen && !wide.matches) {
        s.slot.setAttribute('aria-expanded', 'false');
        s.panel.hidden = true;
        return;
      }
      history.replaceState(null, '', `#${s.d.id}`);
      open(s.d.id);
    });
  }
  const fromHash = () => {
    const id = location.hash.slice(1);
    if (DOSSIERS.some((d) => d.id === id)) {
      open(id, { focus: true });
      document.getElementById(`slot-${id}`)?.scrollIntoView({ block: 'start' });
    }
  };
  window.addEventListener('hashchange', fromHash);
  const initial = DOSSIERS.find((d) => `#${d.id}` === location.hash)?.id ?? DOSSIERS[0].id;
  // The first dossier starts open at every width, so the paper is never empty.
  open(initial);
  wide.addEventListener('change', () => open(slots.find((s) => !s.panel.hidden)?.d.id ?? DOSSIERS[0].id));
}

// ---------- boot ----------

const files = await load();
const gen = files.manifest?.generatedAt;
document.getElementById('updated').textContent = gen ? `atualizado ${dayTime.format(new Date(gen))}` : 'Sem registo de atualização';
renderMonitor(files.index);
renderInventory(files);
renderRecords(files);
