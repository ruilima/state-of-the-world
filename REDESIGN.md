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

**a. DATA OUTDATED por dossier, com a cadência real de cada fonte.** A tabela (abaixo)
tem de ser mostrada ao Rui e aprovada **antes** de ser aplicada. Até lá o carimbo usa a
regra atual (estado do índice; DATA OUTDATED só no Work and AI, ficheiro curado com mais
de 35 dias).

Proposta (por aprovar):

| Fonte | Cadência real | Janela | Entra no carimbo de |
|---|---|---|---|
| GDELT event files | 30 min | 90 min (3×) | Armed conflict |
| GDELT DOC (manchetes) | 30 min | 90 min | nenhum (só a lista de fontes) |
| UCDP | descarga diária; dados mensais | 3 dias desde a última descarga, e último mês com dados no máximo 2 meses antes do mês atual | Armed conflict |
| Layoffs (Challenger, Layoffs.fyi) | manual, mensal | 35 dias desde `updatedAt` (regra atual) | Work and AI |
| Hacker News e arXiv | 30 min | 90 min | nenhum |
| USGS | 30 min | 90 min | Planet |
| NASA EONET | 30 min | 90 min | Planet |
| World Bank | descarga diária; dados anuais | 3 dias desde a última descarga | Economy (só DATA OUTDATED; sem sinal no índice) |
| Doomsday Clock | anual, em janeiro, manual | 13 meses desde `setAt` | What lies ahead |
| Horizontes (IPCC, WMO) | manual; afirmações datadas | sem janela: cada uma mostra a sua data | nenhum |
| Resumo por IA | diário | 3 dias | nenhum |
| Índice (monitor) | 30 min | 90 min (já aplicado) | monitor |

Regra: o carimbo de um dossier diz DATA OUTDATED quando alguma fonte que entra no seu
carimbo está fora da janela; senão diz o estado calculado pelo índice. As fontes que não
entram no carimbo continuam a aparecer como "delayed" na lista de fontes.

**b. Faixa de manchetes:** se o GDELT estiver recusado, mostra a última lista boa com a
etiqueta de desatualizada; se não houver nenhuma, a faixa esconde-se por completo, sem
espaço vazio.

**c. Ecrãs estreitos:** a lista de dossiers fica compacta (grelha de duas colunas ou fila
que quebra linha) para o conteúdo não ficar tão abaixo, mantendo o teclado e o padrão
ARIA.

## 4. Verificação final

- [ ] `npm test`: testes de esquema e de contraste, com os pares novos.
- [ ] Contraste medido no browser (`scripts/measure-contrast.mjs`).
- [ ] Capturas a 320, 390 e 1360 px: dossier Work and AI, dossier Planet, cabeçalho com
      a faixa. Sem erros na consola e sem scroll horizontal.
- [ ] Carimbo DATA OUTDATED forçado no browser.
- [ ] Faixa: pausa visível, pára com rato e foco, parada com reduced-motion; escondida
      sem dados.
- [ ] Teclado: setas, Home, End; hash guardado e lido.
- [ ] Tamanho final do JS e do CSS, comparado com antes (antes: app.js 34,930 B,
      charts.js 7,027 B, ecg.js 4,010 B, freshness.js 678 B, styles.css 13,048 B).
- [ ] Mostrar as capturas ao Rui antes de qualquer merge.

## 5. Progresso

- Ramo `redesign-dossiers` criado a partir de `main` (`82ca979`).
