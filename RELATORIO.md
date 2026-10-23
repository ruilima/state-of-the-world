# Relatório — State of the World (antes "Estado do Mundo")

Data: 23 de outubro de 2026. Estado: tudo construído e testado localmente, **nada
publicado**. O repositório GitHub e o projeto Cloudflare ficam a teu cargo; os passos
estão no `README.md`.

## 1. Endpoints

Testados a 23/10/2026 a partir desta máquina.

| Fonte | URL | Funciona? | Chave? | Frequência no site |
|---|---|---|---|---|
| GDELT DOC 2.0 | `https://api.gdeltproject.org/api/v2/doc/doc` | **Parcialmente.** Responde 429 ("Please limit requests to one every 5 seconds") mesmo com 20–45 s entre pedidos, e por vezes corta a ligação ("fetch failed"). Algumas consultas passam: numa execução típica, 2 a 4 das 5. | Não | 30 min (com "última lista boa") |
| GDELT ficheiros de eventos (alternativa acrescentada) | `https://data.gdeltproject.org/gdeltv2/lastupdate.txt` + `…/AAAAMMDDHHMMSS.export.CSV.zip` | **Sim.** Sem limite de tráfego; 672 ficheiros (7 dias) descarregados sem falhas. | Não | 30 min |
| USGS | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{4.5_week,significant_month}.geojson` | **Sim.** | Não | 30 min |
| NASA EONET v3 | `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30` | **Sim.** O cabeçalho diz `application/rss+xml`, mas o corpo é JSON. | Não | 30 min |
| Hacker News | `https://hn.algolia.com/api/v1/search_by_date` (pesquisa oficial; a API Firebase também responde, mas não tem pesquisa) | **Sim.** | Não | 30 min |
| arXiv | `https://export.arxiv.org/api/query` | **Sim.** Atom XML. | Não | 30 min |
| UCDP API | `https://ucdpapi.pcr.uu.se/api/gedevents/<versão>` | **Não testável sem token:** responde 401 "API token required. Add header: x-ucdp-access-token". O código do modo API está escrito segundo a documentação, mas **nunca correu**. | Sim (`UCDP_TOKEN`) | diária |
| UCDP downloads | `https://ucdp.uu.se/downloads/` (lista de ficheiros) | **Sim.** Inclui os eventos candidatos mensais (`candidateged/GEDEvent_v26_0_9.csv`, setembro de 2026), o acumulado de 2026 e o Battle-Related Deaths anual (`brd/ucdp-brd-dyadic-261-csv.zip`). | Não | diária |
| World Bank | `https://api.worldbank.org/v2/country/{WLD,EUU,PRT}/indicator/{FP.CPI.TOTL.ZG,SL.UEM.TOTL.ZS,NY.GDP.MKTP.KD.ZG}?format=json` | **Sim.** Envelope `[metadata, dados]`; `lastupdated` 2026-10-08; último ano com dados: 2025. | Não | diária |

## 2. Contraste

### Limiar do teste

`test/contrast.test.mjs` usa `THRESHOLD = { text: 4.5, graphic: 3 }`: **4,5:1** para pares
marcados `text` e **3:1** para pares `graphic`, segundo `config/palette.json`. Os carimbos
levam texto e por isso são tratados como `text` (4,5:1). O teste também falha se algum
token de `public/styles.css` divergir de `config/palette.json`.

### Pares e rácios

| Par | Hex | Rácio nos hex | Pior píxel renderizado | Superfície medida |
|---|---|---|---|---|
| Luz de tubo / sala | `#D6D1B1` / `#1F2119` | 10,56 | 8,94 | cabeçalho |
| Luz baixa / sala | `#A6A084` / `#1F2119` | 6,19 | 5,24 | cabeçalho |
| Verde-doente / painel | `#8EA35B` | 5,85 (sobre `#1F2119`) | 6,11 | monitor |
| Âmbar / painel | `#C68A2E` | 5,49 | 5,73 | monitor |
| Vermelho claro / painel | `#E0705A` | 5,14 | 5,37 | monitor |
| Tinta / papel | `#2B2519` / `#CDC2A2` | 8,57 | 8,57 | papel |
| Tinta gasta / papel | `#4A4536` | 5,39 | 5,39 | papel |
| Verde de carimbo / papel | `#384D1C` | 5,27 | 5,27 | papel |
| Âmbar de carimbo / papel | `#663D0B` | 5,29 | 5,29 | papel |
| Sangue seco / papel | `#8A2C20` | 4,81 | 4,81 | papel |

### Pergunta 1: porque é que o verde e o âmbar "sobem" se a luz de tubo desce?

**Como meço o pior píxel** (`scripts/measure-contrast.mjs`):

1. A página abre no Chrome a 1360×900.
2. Para cada superfície, escolho uma faixa sem texto: o espaço entre o título e a hora no
   cabeçalho, a margem inferior do monitor, o canto de uma casa do inventário, o fundo
   da folha de papel. Faço scroll até ela estar no ecrã, porque o grão é
   `position: fixed` e uma captura de página inteira não o apanharia.
3. Leio a luminância WCAG de cada píxel da faixa.
4. Comparo cada cor de texto com o píxel de fundo **mais próximo dela em luminância**.
   Para texto claro sobre fundo escuro, é o píxel mais claro da faixa.

**Porque sobem:** na tabela que te mandei, as linhas não eram da mesma superfície. Peço
desculpa: a tabela não o dizia e por isso parecia contraditória.

- **A luz de tubo foi medida no cabeçalho.** Aí o fundo é a sala nua (`#1F2119`), mais a
  vinheta (que no topo central é transparente) e o grão, que *acrescenta* luz. O pior píxel
  fica mais claro que `#1F2119`, e o rácio desce de 10,56 para 8,94.
- **O verde, o âmbar e o vermelho foram medidos no monitor e nas casas do inventário**,
  que são os únicos sítios onde a página os usa. Essas superfícies têm um painel
  `rgb(14 16 11 / 0.55)` por cima da sala. O fundo fica `#161811`, mais escuro que a sala:
  só por isso o verde iria a 6,43 sem textura. Com o grão por cima, desce para 6,11, que
  continua acima dos 5,85 calculados sobre a sala nua.
- **Na mesma superfície, todas as cores descem.** No monitor, a luz de tubo mede 11,03
  (contra 11,61 sem textura).

**Teste de controlo** (`COMPARE=1 node scripts/measure-contrast.mjs`): as cores de estado
medidas sobre o cabeçalho, onde a página nunca as usa, dão verde 4,95, âmbar 4,64 e
**vermelho claro 4,36, abaixo de 4,5**. Hoje não há problema, porque o vermelho só aparece
dentro do monitor e do inventário. Mas fica a regra: **as cores de estado claras só podem
ir sobre os painéis escuros, nunca diretamente sobre a sala.** Se um dia for preciso
vermelho sobre a sala, tem de ser mais claro, por exemplo `#E8826D` (6,08:1 nos hex e cerca de 5,16:1 contra o pior píxel do cabeçalho).

## 3. Pergunta 2: GDELT DOC e "última lista boa"

**O que a página diz quando o GDELT recusa:**

- **Manchetes guardadas (conflitos e trabalho/IA).** Cada consulta guarda o seu último
  resultado bom. Se a consulta mais recente for recusada, a lista guardada aparece com
  um aviso logo por baixo: *"Last good list, from 23 Oct, 13:23 UTC. GDELT refused the
  latest request, so this has not been refreshed since."* Confirmei-o na página
  renderizada, em ambos os dossiers.
- **Curvas de cobertura.** Uma curva antiga leva o aviso *"Last good curve for …
  (from …). GDELT refused the latest request."* Uma curva que nunca chegou leva *"No
  curve for armed conflict: GDELT refused the request and there is no earlier curve to
  fall back on."*
- **Consulta sem nada guardado.** Aparece *"No headlines: the GDELT API refused our
  requests (rate limit) and there is no earlier list to fall back on. It retries every
  30 minutes."*
- **Lista de fontes no fim do dossier.** Mostra *"GDELT (headlines) — live, some requests
  refused"* quando só parte das consultas passou.

**O índice de conflito usa só os ficheiros de eventos de 15 minutos.**

- O sinal `conflictNews` em `config/index.json` lê `gdelt-events` →
  `data.materialShare24h`.
- Nenhum sinal lê `gdelt-doc`. Acrescentei um teste (`test/index.test.mjs`) que falha se
  algum sinal passar a ler `gdelt-doc`.
- O outro sinal de conflito, `conflictDeaths`, vem do UCDP.
- A legenda do gráfico diz: *"The index uses only these 15-minute event files."*

Também retirei a nova tentativa do GDELT DOC: uma consulta recusada fica com a última
lista boa e não acrescenta minutos a cada execução.

## 4. Dados fora do ramo principal: ramo `data` (proposta implementada)

**Como funciona** (`.github/workflows/update.yml`):

1. O `main` tem só código. `public/data/` está no `.gitignore` e saiu do repositório.
2. Cada execução restaura `public/data/` a partir do ramo `data`.
3. Corre os fetches. Se uma fonte falhar, fica o último ficheiro bom, marcado `stale`.
4. Testa e faz **force-push de um único commit** para `data`, que substitui o anterior.
5. Faz o deploy para o Cloudflare Pages com `wrangler pages deploy public`.

**Porquê o ramo `data` e não um artefacto ou cache de build:**

- **Estado entre execuções.** O pipeline precisa do "último JSON bom" da execução
  anterior. Um ramo está sempre lá.
  - Um artefacto do Actions não é lido facilmente pela execução seguinte (é preciso a API
    e o id da execução anterior) e expira (no máximo 90 dias).
  - A cache do Actions é despejada ao fim de 7 dias sem uso e não garante persistência.
  - Se o estado se perder, o site volta a mostrar "sem dados" até tudo ser
    descarregado de novo.
- **Pode ser inspecionado.** Qualquer pessoa vê os JSON atuais no GitHub (ramo `data`),
  o que ajuda a depurar e dá transparência a um site público.
- **Sem crescimento do repositório.** Um commit novo a cada 30 minutos com ~350 KB de JSON
  daria milhares de commits por mês. Como o ramo `data` é sempre um commit órfão
  substituído, o histórico não cresce. O GitHub recolhe os objetos órfãos.
- **`main` limpo.** O histórico do `main` só tem alterações de código, e o CI de testes
  (`ci.yml`) não dispara com cada atualização de dados.

**Custo desta escolha:** não fica histórico dos dados. O índice guarda a sua própria
série de 7 dias dentro de `index.json`. Se quiseres histórico mais longo, a extensão
simples é um commit diário num ramo `data-archive`. Não está implementado.

**Primeira execução:** sem ramo `data`, o workflow corre todas as fontes e descarrega 7
dias de ficheiros GDELT (`GDELT_MAX_DOWNLOADS=672`).

## 5. Segredos necessários no GitHub

| Segredo | Obrigatório? | Para quê |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Sim, para publicar | `wrangler pages deploy`. Token com permissão *Account → Cloudflare Pages → Edit*. |
| `CLOUDFLARE_ACCOUNT_ID` | Sim, para publicar | Id da conta Cloudflare (Workers & Pages → Account ID). |
| `UCDP_TOKEN` | Não | Eventos UCDP pela API. Sem ele, usam-se os ficheiros mensais oficiais. |
| `ANTHROPIC_API_KEY` | Não | Resumo diário "AI-generated". Sem ela, o bloco fica escondido. |

O `GITHUB_TOKEN` é fornecido pelo Actions. Tens de ativar *Settings → Actions → General
→ Workflow permissions → Read and write* para o workflow poder fazer push do ramo
`data`. Sem os segredos da Cloudflare, o workflow continua a atualizar o ramo `data` e
só salta o deploy.

## 6. Horizontes (IPCC e OMM): verificados na fonte primária

Os dois ficaram, agora com `verified: true`. A frase do IPCC foi **corrigida**: a minha
versão anterior ("no início da década de 2030, na maioria dos cenários") era uma
paráfrase imprecisa.

**IPCC**

- **Autor:** IPCC, *Climate Change 2023: Synthesis Report*, Summary for Policymakers.
- **Data:** 20 de março de 2023. Confirmada no comunicado de imprensa do IPCC
  ("INTERLAKEN, Switzerland, March 20, 2023").
- **Link primário:** https://www.ipcc.ch/report/ar6/syr/downloads/report/IPCC_AR6_SYR_SPM.pdf
- **Texto original:**
  - Secção B.1.1: "In the near term, global warming is more likely than not to reach
    1.5°C even under the very low GHG emission scenario".
  - Nota 29: "the midpoint of the first 20-year running average period during which the
    assessed average global surface temperature change reaches 1.5°C lies in the first
    half of the 2030s" (em todos os cenários do WGI exceto o de emissões muito altas).
- **Frase publicada:** "Global warming is more likely than not to reach 1.5 °C in the
  near term (2021–2040), even under the very low emissions scenario. In most scenarios,
  the midpoint of the first 20-year period that averages 1.5 °C falls in the first half
  of the 2030s."

**OMM**

- **Autor:** Organização Meteorológica Mundial, *WMO Global Annual to Decadal Climate
  Update (2025–2029)*.
- **Data:** 28 de maio de 2025.
- **Link primário:** https://wmo.int/publication-series/wmo-global-annual-decadal-climate-update-2025-2029
- **Texto original:** "70% chance that 5-year average warming for 2025-2029 will be more
  than 1.5 °C".
- **Frase publicada:** "There is a 70% chance that the 5-year average warming for
  2025–2029 will be more than 1.5 °C above pre-industrial levels."

## 7. O que está em tempo real, o que é anual ou manual, e o que precisa de ação tua

**Tempo quase real (30 min):**
- sismos (USGS) e eventos naturais (EONET);
- parte de "conflito material" nos eventos GDELT;
- manchetes e curvas GDELT, quando a API aceita;
- Hacker News e arXiv;
- o Índice de Condição. Estava em 49,7, CAUTION, com 85 de 100 de peso coberto.

**Mensal:** UCDP, eventos candidatos (último mês: setembro de 2026). Funciona sem token,
pelos ficheiros de download. A secção diz em que modo está.

**Anual:**
- UCDP Battle-Related Deaths (versão 26.1, até 2025);
- World Bank (até 2025);
- Doomsday Clock, à mão.

**Manual:** `data/curated/layoffs.json`, `doomsday.json`, `horizons.json`.

**Precisa de ação tua:**

1. **Criar o repositório público e configurar os segredos** (secção 5). Depois, criar o
   projeto Cloudflare Pages `state-of-the-world` como Direct Upload (passos no README).
2. **Confirmar nas fontes primárias** o que está marcado "to be confirmed":
   - os dois números de despedimentos: ~119k no setor tecnológico (Layoffs.fyi, via
     LatestLY) e mais de 100k nos EUA com a IA citada (via compilação Challenger);
   - o artigo da Harvard Business School citado em "What sceptics say";
   - o Doomsday Clock: 85 s a 27/01/2026, e 90/90/89/85 s em 2023–2026.
3. **Preencher `monthly` em `layoffs.json`** com os relatórios Challenger. Até lá, esse
   sinal fica fora do índice, e a página diz isso.

## 8. Mudança do site para inglês

- **Interface toda em inglês:**
  - dossiers: Armed conflict, Work and AI, Planet, Economy, What lies ahead;
  - carimbos: STABLE, CAUTION, DANGER, DATA OUTDATED (as formas mantêm-se);
  - estado das fontes: live, delayed, failed, off;
  - também as mensagens de dados em falta, o rodapé, os metadados, `lang="en"`, os
    textos alternativos dos gráficos e a página "How the index is calculated"
    (`how-the-index-works.html`).
- **Datas e números en-GB:** "23 Oct 2026", "13:23 UTC", "13,286". Troquei "Sept" por
  "Sep" e as datas não partem entre o dia e o mês.
- **Ficheiros curados em inglês**, com fontes, autores e datas preservados.
- **Strings que os scripts escrevem nos dados**, também em inglês: categorias EONET,
  indicadores do Banco Mundial, notas UCDP, motivos de sinais em falta. O prompt do
  resumo por IA passou a pedir inglês.
- **Layout:**
  - Forcei cada estado (STABLE, CAUTION, DANGER) e o carimbo DATA OUTDATED a 320 px e a
    1360 px.
  - O script de screenshots verifica agora se a palavra de estado, os carimbos, as casas
    do inventário e os nomes dos dossiers saem da sua caixa.
  - Única falha encontrada: a 320 px, "earthquakes" não cabia numa casa com um terço da
    largura. Abaixo de 400 px o inventário passa a duas colunas.
  - Resultado final: sem transbordo nem scroll horizontal.
- **Procura de português:**
  - Grep nos ficheiros do site e varrimento do texto renderizado (texto visível,
    `aria-label`, `title`, `<desc>`) dos cinco dossiers e da página do índice.
  - Zero ocorrências. Só aparecem acentos em nomes de lugares vindos do USGS (Río
    Grande, San José, Sámi), que são nomes próprios.
- **Testes:** 28 passam, 0 falham, 8 saltados (testes ao vivo, que só correm com
  `LIVE=1`). O contraste renderizado passa em todos os pares (secção 2).
- **Limpeza:** os títulos do GDELT vinham com espaços a mais ("5 , 000"). Corrijo
  vírgulas e pontos. Os hífenes espaçados ("AI - driven") ficam como vêm, porque não
  se distinguem com segurança de travessões verdadeiros.

## 9. Limitações conhecidas

- **GDELT DOC:** vai continuar a recusar muitos pedidos, provavelmente ainda mais a
  partir dos IPs partilhados do GitHub. Ver a secção 3.
- **Manchetes GDELT com ruído:** o filtro por palavras no título ajuda, mas deixa passar
  algumas sem relação.
- **Modo API do UCDP:** nunca foi executado (falta o token).
- **Contraste das cores de estado sobre a sala nua:** ver a regra na secção 2.
