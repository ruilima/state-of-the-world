# Estado do Mundo

Painel estático que mostra conflitos, trabalho e IA, planeta, economia e o que aí vem.
Os dados atualizam-se sozinhos via GitHub Actions; o site é HTML/CSS/JS sem framework.

Referência de design: [`plano-design.md`](plano-design.md).

## Como funciona

```
GitHub Actions (cron)
  └─ scripts/run.mjs fast|slow
       ├─ scripts/fetch-*.mjs   → public/data/<fonte>.json  (fetchedAt, source, status, data)
       ├─ scripts/build-curated.mjs → public/data/curated.json (de data/curated/*.json)
       ├─ scripts/compute-index.mjs → public/data/index.json  (Índice de Condição)
       └─ public/data/manifest.json (estado de cada fonte)
  └─ commit dos JSON + wrangler pages deploy public
```

Se uma fonte falhar, o último JSON bom fica e passa a `status: "stale"`. O site mostra
para cada fonte se está viva, atrasada ou em falha.

| Fonte | Ficheiro | Frequência | Chave |
|---|---|---|---|
| GDELT eventos (ficheiros de 15 min) | `gdelt-events.json` | 30 min | não |
| GDELT DOC API (manchetes, curvas) | `gdelt-doc.json` | 30 min | não (muito limitada por tráfego) |
| USGS sismos | `usgs.json` | 30 min | não |
| NASA EONET v3 | `eonet.json` | 30 min | não |
| Hacker News (Algolia) + arXiv | `pulse.json` | 30 min | não |
| UCDP | `ucdp.json` | diária | `UCDP_TOKEN` opcional |
| Banco Mundial | `worldbank.json` | diária | não |
| Resumo por IA | `digest.json` | diária | `ANTHROPIC_API_KEY` opcional |
| Ficheiros curados | `curated.json` | 30 min (cópia) | — |

## Comandos

```sh
npm install
npm run fetch:fast      # fontes rápidas + índice
npm run fetch:slow      # fontes lentas + índice
npm test                # contraste da paleta, esquemas (fixtures e ficheiros publicados), índice
npm run test:live       # o mesmo + verifica o formato atual de cada fonte na rede
npm run serve           # http://localhost:8080
npm run shots           # screenshots desktop/mobile para screenshots/ (precisa do serve e do Chrome)
node scripts/measure-contrast.mjs   # contraste medido no resultado renderizado
```

## Manutenção manual

- `data/curated/layoffs.json`: acrescentar uma linha a `monthly` por cada relatório
  mensal da Challenger, Gray & Christmas e mudar `updatedAt`. Com mais de 35 dias, o
  dossier mostra o carimbo DADOS DESATUALIZADOS. `verified: true` só depois de lido na
  fonte primária.
- `data/curated/doomsday.json`: uma vez por ano (janeiro).
- `data/curated/horizons.json`: só afirmações com autor e ligação para a fonte primária.
- `config/index.json`: sinais, pesos e limiares do índice.
- `config/palette.json`: paleta; o teste falha se um par usado ficar abaixo de 4,5:1
  (texto) ou 3:1 (gráfico), ou se `public/styles.css` se afastar destes valores.

## Segredos (só no GitHub, nunca no repositório)

| Segredo | Para quê |
|---|---|
| `CLOUDFLARE_API_TOKEN` | deploy (permissão Cloudflare Pages: Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | deploy |
| `UCDP_TOKEN` | opcional: eventos UCDP via API em vez dos ficheiros de download |
| `ANTHROPIC_API_KEY` | opcional: resumo diário gerado por IA |
