# Relatório — World Vitals (antes "State of the World" e "Estado do Mundo")

Última atualização: 23 de outubro de 2026, depois da primeira publicação.

**Estado atual:**
- **Site:** publicado em https://worldvitals.org (o projeto Cloudflare Pages continua a
  chamar-se `state-of-the-world`, e o endereço https://state-of-the-world-1x8.pages.dev
  também funciona), a partir do repositório público
  https://github.com/ruilima/state-of-the-world.
- **Atualização automática:** ativa desde as 15:14 UTC. Fontes rápidas a cada 30 minutos
  (aos :07 e :37) e fontes lentas às 05:23 UTC.
- **O que mudou nesta fase:** secções 10 a 15. As secções 1 a 9 descrevem a construção.

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

## 7. O que está em tempo real, o que é mensal ou anual, e o que é manual

- **Tempo quase real (30 min):**
  - sismos (USGS) e eventos naturais (EONET);
  - parte de "conflito material" nos eventos GDELT de 15 minutos;
  - manchetes e curvas GDELT, quando a API aceita;
  - Hacker News e arXiv;
  - o Índice de Condição.
- **Diário:** World Bank (dados anuais); UCDP, verificado todos os dias; resumo por IA.
- **Mensal:** UCDP, eventos candidatos, pelos downloads oficiais (último mês: setembro
  de 2026); Challenger, à mão, no ficheiro curado.
- **Anual:** UCDP Battle-Related Deaths (até 2025); Doomsday Clock (à mão).
- **Manual:** `data/curated/layoffs.json`, `doomsday.json`, `horizons.json`.

## 8. Mudança do site para inglês

- **Interface toda em inglês:** dossiers, carimbos (STABLE, CAUTION, DANGER, DATA
  OUTDATED, com as mesmas formas), estado das fontes (live, delayed, failed, off),
  mensagens de dados em falta, rodapé, metadados, `lang="en"`, textos alternativos e a
  página "How the index is calculated" (`how-the-index-works.html`).
- **Datas e números en-GB:** "23 Oct 2026", "13:23 UTC", "13,286".
- **Abaixo de 400 px** o inventário passa a duas colunas, porque "earthquakes" não cabia
  numa casa com um terço da largura.
- **Procura de português no site publicado** (texto visível e alternativo, a 1360 px e a
  390 px): zero ocorrências. Só aparecem nomes de lugares do USGS (Río Grande, San José,
  Sámi).

## 9. Limitações conhecidas

- **GDELT DOC:** recusa muitos pedidos (429 ou "fetch failed"), também a partir do GitHub.
  Na primeira execução publicada, as duas listas de manchetes passaram e as três curvas
  de cobertura falharam; a página explica a falta das curvas.
- **Manchetes GDELT com ruído:** o filtro por palavras no título deixa passar algumas sem
  relação.
- **Modo API do UCDP:** nunca correu com um token válido. Só foi testado o caminho de
  falha, com um token inválido (401 → downloads).
- **Cores de estado claras:** só podem ir sobre os painéis escuros (monitor, inventário),
  nunca diretamente sobre a sala.

## 10. Dados verificados nas fontes primárias

**Challenger, Gray & Christmas.** Li os nove relatórios mensais de 2026 (PDF em
challengergray.com) e confirmei todos os valores que me deste.

| Mês | Publicado | Cortes anunciados | Atribuídos à IA |
|---|---|---|---|
| jan | 5 fev 2026 | 108,435 | 7,624 |
| fev | 5 mar 2026 | 48,307 | 4,680 |
| mar | 2 abr 2026 | 60,620 | 15,341 |
| abr | 7 mai 2026 | 83,387 | 21,490 |
| mai | 4 jun 2026 | 97,006 | 38,579 |
| jun | 1 jul 2026 | 45,849 | 14,029 |
| jul | 6 ago 2026 | 33,429 | 10,970 |
| ago | 3 set 2026 | 52,881 | 3,462 |
| set | 1 out 2026 | 43,281 | 3,961 |
| **Total** | | **573,195** | **120,136** |

- **As somas batem com o acumulado** do relatório de setembro. Os acumulados intermédios
  também batem: 12,304 em fevereiro, 27,645 em março, 49,135 em abril, 87,714 em maio,
  101,743 em junho, 112,713 em julho e 116,175 em agosto.
- **Os URLs não seguem um padrão.** O relatório de janeiro chama-se `CR126007123.pdf` e o
  de abril `Challenger-Report-Apr2026001249.pdf`; encontrei-os pela lista de ficheiros
  do site. Cada linha do ficheiro curado tem o URL exato.
- **Dois lados na página:**
  - O total desceu: 573,195 contra 946,426 em jan–set de 2025, menos 39%. Sem o setor
    público, a descida é de 15%; este número está no relatório de setembro.
  - Os cortes atribuídos à IA subiram: 120,136 em jan–set de 2026, mais do dobro dos
    54,836 de todo o 2025.
  - Os dois números de 2025 vêm dos relatórios de setembro e de maio de 2026.
- **Setor tecnológico:** 165,925 contra 107,878, mais 54%.
- **Saiu o valor antigo** ">100 mil até junho", de fonte secundária.

**Layoffs.fyi: continua "to be confirmed".**
- O valor `<N pessoas em N empresas…>` ficou por preencher na tua mensagem.
- A página mostra o valor secundário que indicaste: 125,759 pessoas em 264 empresas em
  2026 até 6 de agosto, e para comparação 122,606 em 278 empresas em todo o 2025, via
  IBTimes. Está marcado "to be confirmed" e "via IBTimes (secondary report)".
- O valor antigo da LatestLY saiu.

**Os dois artigos "Harvard" são diferentes e citam-se separados, cada um com o seu
editor.** Tinhas razão em pôr a troca em causa: o site citava o artigo da HBS.
- **Sy Boles, "AI Hasn't Spurred Widespread Layoffs Yet. Why Not?"**, Harvard Business
  School Working Knowledge (publicado primeiro na Harvard Gazette), 20 out 2026.
  - Afirma que a IA ainda não causou despedimentos generalizados porque a maioria das
    empresas ainda é lenta a pô-la a funcionar.
  - Na página, entra em "What sceptics say" como argumento de que o efeito real ainda é
    pequeno.
- **Thomas H. Davenport e Laks Srinivasan, "Companies Are Laying Off Workers Because of
  AI's Potential—Not Its Performance"**, Harvard Business Review, 29 jan 2026.
  - Com base num inquérito a 1,006 executivos (dezembro de 2025), afirma que as empresas
    cortam pelo que esperam que a IA faça, não pelo que ela já demonstrou.
  - Na página, é a segunda referência do mesmo lado: a atribuição à IA reflete
    expectativas, não substituição comprovada.
- **Terceira referência, também primária:** o comentário da própria Challenger, no
  relatório de janeiro, de que os 16,000 cortes da Amazon pareciam dever-se mais a
  contratação excessiva e a cortes de chefias do que à IA.

**Doomsday Clock.** Confirmado na página do Bulletin: 85 s a 27 jan 2026, 89 s em 2025 e
90 s em 2023. A página não indica o valor de 2024: os 90 s de 2024 aparecem marcados
"secondary source".

## 11. Índice de Condição com o sinal de despedimentos

Com os mesmos dados (a última execução local antes da publicação):

| | Sinal de despedimentos | Pesos | Índice |
|---|---|---|---|
| Antes | fora (série por preencher) | anteriores (aiLayoffs 15, conflictDeaths 25) | **49.7** CAUTION |
| Depois | dentro | novos (abaixo) | **44.3** CAUTION |

- **Pesos atuais em `config/index.json`:** conflictNews 20, conflictDeaths 30, quakes 10,
  naturalEvents 10, aiLayoffs 10, doomsday 20 (total 100).
- **O sinal de despedimentos ficou com 10, não 15,** porque a atribuição à IA é declarada
  pelas próprias empresas. Os 5 pontos passaram para as mortes em violência organizada
  (UCDP), o sinal com dados mais sólidos.
- **Valor do sinal hoje:** 0. É o corte de setembro (3,961) dividido pela média de jan–ago
  (14,522), um rácio de 0.27, abaixo do valor "calmo" de 0.8.
- **No site publicado,** com os dados da primeira execução, o índice está em 45.5,
  CAUTION.

## 12. UCDP

- **Com `UCDP_TOKEN`:** o pedido à API leva o cabeçalho `x-ucdp-access-token`. Um teste
  automático (`test/ucdp.test.mjs`) confirma o cabeçalho e o URL.
- **Se a API falhar,** o módulo usa os downloads oficiais e não dá erro. Testado com um
  token inválido: 401 → downloads, e a página diz "The UCDP API request failed, so
  candidate events were read from the official monthly download."
- **Sem token,** usa os downloads. No site publicado aparece: "Mode: official download
  files. Official downloads: candidate events read from UCDP's monthly file, because no
  API token is set."
- **Versão da API:** o módulo pede `gedevents/<versão candidata>` (hoje `26.0.9`), tirada
  da lista de downloads. O teu exemplo usa `26.1`, que é a versão anual. Se a versão
  candidata não for aceite pela API, o site cai para os downloads e diz isso. Saberemos
  quando o token chegar.

## 13. Workflow e publicação

- **Deploy:** feito com `npx wrangler@4 pages deploy` (wrangler 4.152.0). Não usa a
  `cloudflare/pages-action`, que está arquivada.
- **Projeto Cloudflare Pages:** ainda não existia. O passo "Ensure the Cloudflare Pages
  project exists" criou-o na primeira execução (`state-of-the-world`, com subdomínio
  `state-of-the-world-1x8.pages.dev`). Não precisas de fazer nada.
- **Dados do deploy:** cada execução restaura `public/data/` a partir do ramo `data`,
  atualiza as fontes e publica esse conteúdo. Nunca usa um build anterior da Cloudflare.
- **Push:** o token HTTPS do `gh` nesta máquina não tem permissão de escrita neste
  repositório, por isso o push foi feito por SSH. Também não pode disparar workflows
  (403); a primeira execução manual foi disparada por ti.

**Primeira execução** (manual, run 39974832070, 15:02–15:06 UTC, 4 min 25 s): todos os
passos com sucesso.

| Passo | Resultado |
|---|---|
| Restore last data from the data branch | sem ramo `data`: grupo `all`, 7 dias de GDELT |
| Fetch sources | usgs ok, eonet ok, gdelt-events ok, gdelt-doc partial, pulse ok, curated ok, worldbank ok, ucdp ok (downloads), digest ok; índice 45.5 |
| Check published files | 29/29 |
| Publish data branch | 1 commit, `fa44aed Data snapshot 2026-10-23T15:06Z` |
| Ensure the Cloudflare Pages project exists | projeto criado |
| Deploy to Cloudflare Pages | 20 ficheiros + `_headers` |
| Live schema test | 36 passam, 0 falham, 1 saltado (GDELT DOC com 429: limite de tráfego tolerado, formato não verificado nessa vez) |

**Ramo `data`** (1 commit, 11 ficheiros):

| Ficheiro | Tamanho |
|---|---|
| curated.json | 10 KB |
| digest.json | 5 KB |
| eonet.json | 16 KB |
| gdelt-doc.json | 5 KB |
| gdelt-events.json | 90 KB |
| index.json | 3 KB |
| manifest.json | 2 KB |
| pulse.json | 5 KB |
| ucdp.json | 55 KB |
| usgs.json | 48 KB |
| worldbank.json | 11 KB |

**Verificação do site publicado** (Chrome, 1360 px e 390 px):
- **Carimbos:** Armed conflict CAUTION, Work and AI STABLE, Planet STABLE, What lies
  ahead DANGER (Doomsday Clock). Economy não tem carimbo, porque não há sinal.
- **Monitor:** CAUTION, "46 of 100".
- **Estado das fontes:** todas "live"; GDELT (headlines) aparece "live, some requests
  refused".
- **"Last good list":** ainda não aparece no site publicado. Na primeira execução as
  duas listas de manchetes passaram e não havia lista anterior. As curvas falharam sem
  lista anterior e a página diz "No coverage curves by topic: the GDELT API refused our
  requests…". O aviso "Last good list" já tinha sido verificado localmente e aparece
  quando uma consulta que já teve dados for recusada. Volto a verificar depois das
  execuções agendadas.
- **O índice de conflito lê só `gdelt-events`:** confirmado no `index.json` publicado
  (`conflictNews` com `source=gdelt-events`) e por um teste.
- **Português:** zero ocorrências, exceto nomes de lugares do USGS.
- **Erros:** nenhum erro na página e nenhum scroll horizontal.
- **Testes finais, corridos uma vez contra o URL publicado:**
  - contraste renderizado: todos os pares passam; o pior é 4.81 (sangue seco sobre
    papel);
  - esquema dos 10 ficheiros publicados: todos válidos.

**Cron ativado às 15:14 UTC:** `7,37 * * * *` para as fontes rápidas e `23 5 * * *` para
as lentas. Primeira execução agendada: 15:37 UTC. O GitHub costuma atrasar alguns
minutos as execuções agendadas.

## 14. Resumo por IA

- **Funciona com a chave:** foi gerado na primeira execução.
- **Etiqueta e fontes:** está marcado "AI-generated", com a nota "Written by a language
  model from the headlines on this page… It may contain mistakes". Cada parágrafo tem
  links para as manchetes usadas. O código só aceita como fonte manchetes que lhe foram
  dadas, por isso o modelo não pode inventar links.
- **Correção depois da primeira execução:** os links vindos do Hacker News apareciam
  como "Hacker News" mesmo quando apontavam para outro site (politico.eu, hbs.edu).
  Passam a mostrar o domínio do artigo, com "via Hacker News".
- **Modelo e custo:** `claude-opus-5-5`, esforço `low`, uma vez por dia, na execução das
  05:23 UTC.
  - Cada pedido usa à volta de 2 a 3 mil tokens de entrada e 1 a 2 mil de saída. A
    $4/$20 por milhão de tokens, são cerca de $0.03–0.05 por dia, à volta de
    **$1–1.5 por mês**.
  - É uma estimativa. Os tokens reais passam a ficar em `digest.json` (`usage`) a partir
    da próxima execução diária.
  - Execuções manuais com o grupo `all` ou `slow` também chamam o modelo.
- **Sem a chave,** o bloco fica escondido.

## 15. O que continua por confirmar e o que precisa de ação tua

**Por confirmar:**
- o valor do Layoffs.fyi (falta a tua leitura);
- os 90 s de 2024 do Doomsday Clock (apenas fonte secundária);
- o modo API do UCDP (falta o token).

**Ação tua:**
1. **Layoffs.fyi:** quando leres o contador, envia-me "N pessoas em N empresas, a
   DD/MM/2026" e eu atualizo o ficheiro e tiro o aviso.
2. **Challenger:** as datas de cada relatório estão em `releaseCalendar`, em
   `data/curated/layoffs.json` (calendário oficial de 2026); o de outubro sai a 5 nov
   2026. Acrescenta uma linha a `monthly` e muda `updatedAt`, ou pede-me. Se a linha não
   entrar até 3 dias depois da data prevista, o dossier mostra DATA OUTDATED. Em janeiro
   de 2027 é preciso acrescentar o calendário de 2027.
3. **UCDP_TOKEN:** quando chegar, põe-no nos segredos do repositório. O módulo passa a
   usar a API sozinho e, se falhar, volta aos downloads.
4. **Opcional:** dar ao token do `gh` desta máquina acesso a este repositório
   (*Contents: write* e *Actions: write*), para eu poder fazer push e disparar
   workflows sem SSH nem cliques teus.

## 16. Agendamento externo: Worker com Cron Triggers (23 out, noite)

**Porquê:** o agendador do GitHub nunca disparou neste repositório, nem depois de
desativar e voltar a ativar o workflow. Não houve nenhuma execução com o evento
"schedule" entre as 15:14 e as 19:12 UTC.

**O que foi feito:** a pasta `cron-trigger/` tem um Cloudflare Worker
(`world-vitals-cron-trigger`) com dois Cron Triggers. Cada um chama a API do GitHub
(`POST …/actions/workflows/update.yml/dispatches`, com `ref: main`):

| Cron (UTC) | Grupo do workflow |
|---|---|
| `7,37 * * * *` | `fast` |
| `23 5 * * *` | `slow` (inclui o resumo por IA) |

- **O token vem do segredo `GITHUB_TOKEN` do Worker.** Nunca aparece no código nem no
  log; o log regista só o grupo e o estado HTTP da resposta.
- **Um pedido recusado pelo GitHub dá erro na execução do cron,** e fica visível nos
  logs e em *Cron Events*.
- **Concurrency:** o workflow já tinha o bloco `concurrency` (`group: data-update`,
  `cancel-in-progress: false`), por isso duas execuções nunca correm em simultâneo. Um
  teste confirma que o bloco continua lá.
- **O workflow já não tem `schedule`.** Ao início, as linhas `schedule` ficaram como
  reserva. Foram retiradas a 23 out, depois de o GitHub ter disparado uma vez (ver
  abaixo); agora o Worker é a única fonte de disparos e cada horário corre uma só vez.

**Testes:**
- **Testes unitários** (`cron-trigger/test/worker.test.mjs`), que correm com `npm test`:
  - o URL, o método, os cabeçalhos e o corpo `{ref: "main", inputs: {group}}`;
  - o token nunca aparece no log;
  - um erro do GitHub falha a execução;
  - o modo de ensaio não chama o GitHub;
  - falta de segredo ou cron desconhecido dão erro;
  - os crons do `wrangler.toml` coincidem com o mapeamento e com as opções de `group`
    do workflow;
  - o workflow não tem `schedule` (se voltar, o teste falha).
- **Ensaio no runtime da Cloudflare** (`wrangler dev` local, `DRY_RUN=true`): o evento
  dos dois crons produz exatamente o pedido esperado, sem tocar no GitHub. Feito aqui,
  com resultado certo.

**O que tens de fazer:** criar o token, guardá-lo com `wrangler secret put` e fazer
`wrangler deploy`. Os passos estão no README, secção "Cron trigger".
- O token tem de ser renovado antes de expirar. Quando expirar, o Worker passa a
  registar erros 401 e os dados deixam de se atualizar.
- Para confirmar sem esperar, o README explica como disparar uma vez a sério com
  `wrangler dev` e um `.dev.vars` local.

**Confirmação (23 out, 20:10 UTC):** o Worker foi instalado por volta das 19:36 UTC.
- **19:37:** o disparo não aconteceu. É consistente com o tempo de propagação de um
  Cron Trigger novo, que a Cloudflare indica ser de até 15 minutos.
- **20:07:** primeiro disparo. A execução 40016787438 (`workflow_dispatch`, grupo
  `fast`) terminou com sucesso: correram só as fontes rápidas, o deploy concluiu e o ramo
  `data` recebeu o commit `6539fae` às 20:09. O site mostra "updated 23 Oct, 20:09 UTC".
- **Seguintes:** a cada 30 minutos (aos :07 e :37), mais o grupo `slow` às 05:23 UTC.

**Disparo duplicado e remoção do `schedule` (23 out, 22:20 UTC):**
- O Worker disparou todos os horários entre as 20:07 e as 22:07 UTC, cada um com resposta
  `204` do GitHub. Todas as execuções terminaram com sucesso.
- Às 21:37:49 UTC o agendador do GitHub disparou pela primeira vez (execução 40028160588,
  evento `schedule`), 11 segundos depois do Worker (execução 40028139677). Graças à
  concurrency, correram uma a seguir à outra, ambas com sucesso, mas o trabalho foi feito
  duas vezes. Às 22:07 o GitHub não voltou a disparar.
- Por isso tirei as linhas `schedule` de `.github/workflows/update.yml`. O Worker passa a
  ser a única fonte de disparos. O teste de consistência do Worker falha se um
  `schedule` voltar ao workflow.
