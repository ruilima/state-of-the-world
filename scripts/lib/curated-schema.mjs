import { s } from './schema.mjs';

const link = s.obj({ name: s.str, url: s.nullable(s.str) });

export const CURATED = {
  layoffs: s.obj({
    updatedAt: s.str,
    maxAgeDays: s.num,
    figures: s.arr(
      s.obj({
        id: s.str,
        label: s.str,
        period: s.str,
        low: s.nullable(s.num),
        high: s.nullable(s.num),
        unit: s.str,
        source: link,
        via: s.nullable(link),
        publishedAt: s.nullable(s.str),
        verified: s.bool,
      }),
    ),
    // One row per Challenger monthly report.
    monthly: s.arr(s.obj({ month: s.str, total: s.num, aiCited: s.num, source: link, publishedAt: s.str, verified: s.bool })),
    attributionNote: s.obj({ claim: s.str, counter: s.str, sources: s.arr(s.obj({ name: s.str, url: s.str, verified: s.bool })) }),
  }),
  doomsday: s.obj({
    updatedAt: s.str,
    source: link,
    current: s.obj({ seconds: s.num, setAt: s.str, verified: s.bool }),
    history: s.arr(s.obj({ year: s.num, seconds: s.num, verified: s.bool }), { min: 1 }),
  }),
  horizons: s.obj({
    updatedAt: s.str,
    items: s.arr(s.obj({ claim: s.str, who: s.str, date: s.str, horizon: s.str, url: s.str, verified: s.bool })),
  }),
};
