import { s } from './schema.mjs';

const link = s.obj({ name: s.str, url: s.nullable(s.str) });

export const CURATED = {
  layoffs: s.obj({
    updatedAt: s.str,
    // Challenger's published release dates; the Work and AI stamp goes
    // DATA OUTDATED 3 days after the next report was due.
    releaseCalendar: s.obj({ source: link, note: s.str, releases: s.arr(s.obj({ month: s.str, expectedAt: s.str }), { min: 1 }) }),
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
        // Which tracker the figure comes from; see `scopes`.
        group: s.oneOf('challenger', 'layoffsfyi'),
        // Date the editor read a live counter (Layoffs.fyi has no report date).
        readAt: s.nullable(s.str),
        comparisons: s.arr(s.obj({ label: s.str, value: s.num, companies: s.nullable(s.num), source: link, evidence: s.oneOf('primary', 'secondary') })),
      }, { optional: ['readAt', 'comparisons'] }),
    ),
    scopes: s.map(s.obj({ name: s.str, scope: s.str })),
    scopeNote: s.str,
    // One row per Challenger monthly report.
    monthly: s.arr(s.obj({ month: s.str, total: s.num, aiCited: s.num, source: link, publishedAt: s.str, verified: s.bool })),
    attributionNote: s.obj({ claim: s.str, counter: s.str, sources: s.arr(s.obj({ name: s.str, url: s.str, verified: s.bool })) }),
    // Optional two-sided summary of the trend, with its own source.
    trend: s.obj({ text: s.str, source: link, verified: s.bool }),
  }, { optional: ['trend'] }),
  doomsday: s.obj({
    updatedAt: s.str,
    source: link,
    current: s.obj({ seconds: s.num, setAt: s.str, verified: s.bool }),
    // evidence: "secondary" marks a value backed only by secondary reporting.
    history: s.arr(s.obj({ year: s.num, seconds: s.num, verified: s.bool, evidence: s.oneOf('primary', 'secondary') }, { optional: ['evidence'] }), { min: 1 }),
  }),
  horizons: s.obj({
    updatedAt: s.str,
    items: s.arr(s.obj({ claim: s.str, who: s.str, date: s.str, horizon: s.str, url: s.str, verified: s.bool })),
  }),
};
