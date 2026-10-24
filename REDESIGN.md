# Redesign "Animated dossiers" (ramo `redesign-dossiers`)

Documento de trabalho. Atualizado à medida que o trabalho avança; é a referência se a
conversa for compactada.

**Regras:** trabalho só no ramo `redesign-dossiers`. Sem merge no `main` e sem deploy.
O pipeline de dados (`scripts/fetch-*`, `run.mjs`), o Worker (`cron-trigger/`), os JSON
(`data/`, `public/data/`) e os workflows não mudam: só o front-end. Todo o texto do site
fica em inglês. Antes de qualquer merge, mostrar as capturas (320, 390 e 1360 px) ao Rui.

**Referência visual:** `design-reference/Dossiers.dc.html` (base, direção B) e
`design-reference/Main.dc.html` (só a faixa de manchetes e o mapa). São ficheiros de
canvas: lê-se o CSS, o SVG e os textos; não se copiam tal e qual.

## 1. Plano

**Estrutura (B):** cabeçalho; faixa de manchetes; faixa do monitor (ECG e palavra de
estado); à esquerda a lista "Records"; à direita o dossier aberto como folha de papel com
separador, linhas "Subject" e "Filed" escritas à máquina, carimbo de estado e o conteúdo.

**Ficheiros:**

| Ficheiro | O quê |
|---|---|
| `public/index.html` | Faixa de manchetes com botão de pausa; estrutura B do monitor e de Records; sai a grelha de inventário |
| `public/app.js` | Separadores, hash, linhas à máquina, carimbo, barras de tinta, número-chave em Records, mapa do Planet |
| `public/ticker.js` (novo) | Faixa de manchetes |
| `public/charts.js` | `dotMap` aceita anel a pulsar por ponto |
| `public/styles.css` | Design B; animações só com transform/opacity; bloco prefers-reduced-motion |
| `config/palette.json`, `test/contrast.test.mjs` | Pares de contraste novos |
| `scripts/screenshots.mjs`, `scripts/measure-contrast.mjs` | Capturas e superfícies novas |

**Separadores e hash:**
- `role="tablist"` vertical (`aria-orientation="vertical"`), cada dossier um
  `<button role="tab">` com `aria-selected` e `aria-controls`; folha com
  `role="tabpanel"` e `aria-labelledby`.
- Teclado: setas (cima/baixo e esquerda/direita), Home e End. Só o separador ativo tem
  `tabindex="0"` (roving tabindex).
- Sem acordeão: há sempre um dossier aberto, a qualquer largura.
- Hash: escolher um dossier faz `history.replaceState(null, '', '#planet')`. Ao carregar
  lê-se o hash; hash desconhecido abre o primeiro. `hashchange` abre o dossier pedido.
- Animações de abertura (texto à máquina, carimbo a bater, barras de tinta) tocam uma vez
  ao abrir um dossier, incluindo o primeiro ao carregar. Os dados só são lidos ao carregar
  a página, por isso não há atualizações que as repitam.

**Movimento:** contínuo só o ECG (já existe) e a faixa de manchetes. Só transform e
opacity, CSS puro, sem bibliotecas novas. Com prefers-reduced-motion nada se mexe: o
carimbo e o texto aparecem logo, a faixa fica parada.

**Texto à máquina sem cortes:** em vez de animar a largura em `ch` com `nowrap` (como na
referência, que corta a 320 px e não usa só transform/opacity), cada letra é um `<span>`
com atraso de `opacity`. O texto quebra linha normalmente. As letras têm `aria-hidden` e o
texto completo vai num elemento só para leitores de ecrã.

**Faixa de manchetes:**
- Manchetes de conflito e de IA e trabalho do `gdelt-doc.json`, intercaladas, até ~16.
- Títulos com `textContent`; ligações só http(s), `target="_blank"`,
  `rel="noopener noreferrer"`.
- Cópia do loop com `aria-hidden="true"` e ligações com `tabindex="-1"`.
- Botão visível de pausa com `aria-pressed`; pára com `:hover` e `:focus-within`.
- prefers-reduced-motion: parada, sem cópia, sem botão; percorre-se dentro da faixa.

**Mapa do Planet:** o `dotMap` atual com o contorno Natural Earth, posição por latitude e
longitude, tamanho pela magnitude. Só os sismos das últimas 24 h têm anel a pulsar
(transform scale + opacity); os outros ficam parados. Mantém-se a lista de sismos com uma
ligação por sismo.

**Contraste:** só cores que já estão em `config/palette.json` (as cores extra da
referência, `#14160F`, `#3A3C2E`, `#2A2C20`, não entram). Pares novos a acrescentar:
texto da faixa sobre o fundo da faixa, separador ativo sobre `tile`, pontos do mapa
(`ink`, `danger-ink`) sobre papel como gráfico (3:1).

## 2. Decisões do Rui

1. **Sem grelha de inventário.** Em vez dela, uma linha com o número-chave por baixo do
   nome de cada entrada em Records. Só números que o site já calcula (por exemplo
   120,136 cortes atribuídos à IA no Work and AI; M7 e o local no Planet; 85 s no What
   lies ahead). Sem número fiável, mostra-se o estado da fonte.
2. **Carimbo com a fonte stencil atual** (Big Shoulders Stencil Display), maior e com o
   efeito de bater.

## 3. Ajustes ao plano

**a. DATA OUTDATED por dossier, com a cadência real de cada fonte.** Aprovado pelo Rui
a 24 out 2026, com duas alterações (Challenger pelo calendário; regra de "todas as
fontes"). Aplicado em `public/freshness.js` (`STAMP_SOURCES`, `stampFreshness`).

| Fonte | Cadência real | Janela | Entra no carimbo de |
|---|---|---|---|
| GDELT event files | 30 min | 90 min (3×) | Armed conflict, monitor |
| UCDP | descarga diária; dados mensais | 3 dias desde a última descarga, e o último mês com dados no máximo 2 meses antes do mês atual (em outubro: setembro ou agosto passam; julho já é atraso) | Armed conflict, monitor |
| Challenger (layoffs) | mensal, calendário publicado | 3 dias depois da data prevista do próximo relatório (`releaseCalendar` em `data/curated/layoffs.json`; o de outubro: 5 nov, atraso a partir de 8 nov 00:00 UTC) | Work and AI, monitor |
| USGS | 30 min | 90 min | Planet, monitor |
| NASA EONET | 30 min | 90 min | Planet, monitor |
| World Bank | descarga diária; dados anuais | 3 dias desde a última descarga | Economy (só DATA OUTDATED) |
| Doomsday Clock | anual, em janeiro | 13 meses desde `setAt` | What lies ahead, monitor |
| Horizontes (IPCC, WMO) | manual; afirmações datadas | sem janela | nenhum |
| GDELT DOC, HN e arXiv, resumo por IA | 30 min / 30 min / diário | 90 min / 90 min / 3 dias | nenhum (só "delayed" na lista de fontes) |
| Índice (`index.json`) | 30 min | 90 min | monitor |

Regra (monitor e dossiers): se **todas** as fontes que sustentam o estado estão fora da
janela, o carimbo diz DATA OUTDATED. Se só algumas estão, mantém-se o estado calculado e
aparece uma nota curta com os nomes ("1 source delayed: UCDP"). No monitor, também diz
DATA OUTDATED quando o próprio `index.json` está fora da janela (o número já é velho).

**b. Faixa de manchetes:** se o GDELT estiver recusado, mostra a última lista boa com a
etiqueta de desatualizada; se não houver nenhuma, a faixa esconde-se por completo, sem
espaço vazio.

**c. Ecrãs estreitos:** a lista de dossiers fica compacta (grelha de duas colunas ou fila
que quebra linha) para o conteúdo não ficar tão abaixo, mantendo o teclado e o padrão
ARIA.

## 4. Verificação final

- [x] `npm test`: testes de esquema e de contraste, com os pares novos (54 passam).
- [x] Contraste medido no browser (`scripts/measure-contrast.mjs`): tudo passa; faixa 6.61 e separador aberto 6.53 no pior ponto (`tube-low`).
- [x] Capturas a 320, 390 e 1360 px: dossier Work and AI, dossier Planet, cabeçalho com
      a faixa. Sem erros na consola e sem scroll horizontal.
- [x] Carimbo DATA OUTDATED forçado no browser (`outdated-*.png`).
- [x] Faixa: pausa visível, pára com rato e foco, parada com reduced-motion; escondida
      sem dados.
- [x] Teclado: setas, Home, End; hash guardado e lido.
- [x] Tamanho final do JS e do CSS, comparado com antes (antes: app.js 34,930 B,
      charts.js 7,027 B, ecg.js 4,010 B, freshness.js 678 B, styles.css 13,048 B).
- [x] Mostrar as capturas ao Rui (primeira ronda, 24 out). Anéis aprovados (2 pulsos e
      depois parados).
- [x] Ajuste (a) aplicado; testes de uma fonte atrasada e de todas atrasadas; capturas
      `outdated-*` refeitas e `delayed-390` (só o UCDP atrasado).
- [ ] Aprovação final das capturas antes do merge.

## 5. Progresso

- Ramo `redesign-dossiers` criado a partir de `main` (`82ca979`).
- Feito: faixa (`public/ticker.js`, botão "Pause headlines"/"Play headlines" com o texto
  a mudar, sem `aria-pressed`); Records como separadores ARIA com número-chave; folha com
  linhas à máquina, carimbo stencil maior a bater; barras de tinta; anéis nos sismos das
  últimas 24 h; grelha de inventário removida; pares de contraste novos em
  `config/palette.json` e teste `redesign pairs are listed`; `measure-contrast.mjs` mede a
  faixa e o separador aberto (todos passam).
- Corrigido: letras invisíveis no texto à máquina. Animação de 1 ms com `steps(1, end)`
  acabava no passo 0 por arredondamento a partir de ~1 s de atraso; passou a fade linear
  de 60 ms.
- Decisão a confirmar com o Rui: os anéis dos sismos recentes pulsam 2 vezes ao abrir o
  Planet (menos de 5 s) e depois ficam parados como anel. Um pulso contínuo seria
  movimento com mais de 5 s sem botão de pausa.
- Corrigido: com movimento reduzido a página tinha 9,307 px de scroll horizontal (o
  texto oculto "(opens in a new tab)" escapava à faixa parada); `.ticker__window` passou a
  `position: relative`.
- Verificado no browser: separadores (setas, Home, End, Tab para o painel), hash
  (desconhecido abre o primeiro, `hashchange`, recarregar), faixa (hover, foco, botão,
  cópia `aria-hidden` sem tab, `_blank` + `noopener noreferrer`, HTML num título fica
  texto, `javascript:` não vira ligação, sem manchetes a faixa desaparece), movimento
  reduzido (nada anima).
- Tamanhos (bytes, sem compressão → gzip): JS 46,645 → 50,356 (+3.7 KB; gzip 16,365 →
  18,200, +1.8 KB), CSS 13,048 → 15,897 (+2.8 KB; gzip 3,855 → 4,644, +0.8 KB),
  index.html 5,490 → 6,163. Sem fontes nem bibliotecas novas.
- Capturas em `screenshots/` (git-ignored): `work-*`, `planet-*`, `header-*`,
  `outdated-*`, `reduced-motion-1360`, `state-*-320`.
- Ajuste (a) aplicado: janelas por fonte em `public/freshness.js`; calendário da
  Challenger de 2026 em `data/curated/layoffs.json` (`releaseCalendar`, substitui
  `maxAgeDays`; esquema em `scripts/lib/curated-schema.mjs`). Se o `curated.json`
  publicado ainda não tiver o calendário (antes do merge), vale a regra antiga dos 35 dias.
  `npm test`: 59 passam. Capturas sem erros nem scroll horizontal.
