# World Vitals

Signs of a world in transition: https://worldvitals.org

A static dashboard of armed conflict, work and AI, the planet, the economy and what lies
ahead. The data refreshes itself through GitHub Actions; the site is plain HTML/CSS/JS
hosted on Cloudflare Pages.

The repository and the Cloudflare Pages project keep their original name,
`state-of-the-world`. Renaming the Pages project would change its `*.pages.dev` URL and
the deploy configuration; the custom domain `worldvitals.org` points at it.

Design reference (Portuguese): [`plano-design.md`](plano-design.md).
Build report (Portuguese): [`RELATORIO.md`](RELATORIO.md).

## How it works

```
GitHub Actions (.github/workflows/update.yml)
  1. checkout main (code only)
  2. restore public/data/ from the `data` branch (last good files)
  3. node scripts/run.mjs fast|slow|all
       scripts/fetch-*.mjs        → public/data/<source>.json  (fetchedAt, source, status, data)
       scripts/build-curated.mjs  → public/data/curated.json   (from data/curated/*.json)
       scripts/compute-index.mjs  → public/data/index.json     (Condition Index)
       public/data/manifest.json  (health of every source)
  4. npm test
  5. force-push public/data/ to the `data` branch as one commit
  6. wrangler pages deploy public
```

Generated data never lands on `main`. The `data` branch always holds exactly one commit
with the latest files: it is the state the next run starts from, and anyone can inspect
it. When a source fails, its last good file is kept and marked `status: "stale"`, and the
page shows which sources are live, delayed or failed.

Schedule: fast sources every 30 minutes (`7,37 * * * *`), slow sources daily at 05:23 UTC.

| Source | File | Refresh | Key |
|---|---|---|---|
| GDELT 15-minute event files | `gdelt-events.json` | 30 min | no |
| GDELT DOC API (headlines, coverage curves) | `gdelt-doc.json` | 30 min | no (heavily rate-limited) |
| USGS earthquakes | `usgs.json` | 30 min | no |
| NASA EONET v3 | `eonet.json` | 30 min | no |
| Hacker News (Algolia) + arXiv | `pulse.json` | 30 min | no |
| UCDP | `ucdp.json` | daily | `UCDP_TOKEN`, optional |
| World Bank | `worldbank.json` | daily | no |
| AI summary | `digest.json` | daily | `ANTHROPIC_API_KEY`, optional |
| Curated files | `curated.json` | copied every 30 min | — |

## Setup

1. **Create the GitHub repository** (public) and push `main`.
2. **Create the Cloudflare Pages project** once, as a Direct Upload project (no Git
   integration, because Actions uploads the site):
   ```sh
   npx wrangler@4 login
   npx wrangler@4 pages project create state-of-the-world --production-branch=main
   ```
   If the name is taken, choose another and change it in `wrangler.toml` and in the
   deploy step of `.github/workflows/update.yml`.
3. **Create a Cloudflare API token**: My Profile → API Tokens → Create Token → Custom,
   with permission *Account → Cloudflare Pages → Edit*, scoped to your account.
4. **Add the repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | Required | Used for |
   |---|---|---|
   | `CLOUDFLARE_API_TOKEN` | yes, to deploy | `wrangler pages deploy` |
   | `CLOUDFLARE_ACCOUNT_ID` | yes, to deploy | `wrangler pages deploy` (Workers & Pages → Account ID) |
   | `UCDP_TOKEN` | no | UCDP events through the API instead of the download files |
   | `ANTHROPIC_API_KEY` | no | the daily AI-generated summary; without it the block is hidden |

   `GITHUB_TOKEN` is provided by Actions; nothing to add. Without the Cloudflare secrets
   the workflow still fetches and publishes the `data` branch, and skips the deploy.
5. **Allow Actions to push**: Settings → Actions → General → Workflow permissions →
   *Read and write permissions*.
6. **First run**: Actions → *Update data and deploy* → Run workflow (group `all`). With
   no `data` branch yet, it fetches every source and backfills 7 days of GDELT event
   files (a few minutes). After that the schedule takes over.

## Local development

```sh
npm install
npm run fetch:all       # every source + index, writes public/data/ (git-ignored)
npm run serve           # http://localhost:8080
npm test                # palette contrast, schemas (fixtures + published files), index
npm run test:live       # also checks every upstream's current format over the network
npm run shots           # desktop/mobile screenshots into screenshots/ (needs serve + Chrome)
node scripts/measure-contrast.mjs   # contrast measured on the rendered page
```

To work from the live data instead: `git fetch origin data && git archive FETCH_HEAD | tar -x -C public/data`.

## Hand-maintained files

- `data/curated/layoffs.json`: add a row to `monthly` for each Challenger, Gray & Christmas
  monthly report and update `updatedAt`. After 35 days without an update the Work and AI
  file shows the DATA OUTDATED stamp. Set `verified: true` only after reading the value in
  the primary source.
- `data/curated/doomsday.json`: once a year (January).
- `data/curated/horizons.json`: only claims with a named author and a primary-source link.
- `config/index.json`: signals, weights and thresholds of the Condition Index.
- `config/palette.json`: palette. `npm test` fails if a pair in use drops below 4.5:1
  (text) or 3:1 (graphics), or if `public/styles.css` drifts from these values.
