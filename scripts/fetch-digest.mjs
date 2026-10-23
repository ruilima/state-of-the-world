// Optional daily summary written by Claude from the headlines we already
// collected. Runs only when ANTHROPIC_API_KEY is set (CI secret); without it
// the output has status "disabled" and the site hides the block.
// Every link in the summary must be one of the input headlines: anything
// else is dropped, so the model cannot invent sources.
import Anthropic from '@anthropic-ai/sdk';
import { join } from 'node:path';
import { runSource, readJson, writeJson, OUT_DIR } from './lib/io.mjs';

const MODEL = 'claude-opus-5-5';

async function collectHeadlines() {
  const doc = await readJson(join(OUT_DIR, 'gdelt-doc.json'));
  const pulse = await readJson(join(OUT_DIR, 'pulse.json'));
  const usgs = await readJson(join(OUT_DIR, 'usgs.json'));
  const items = [
    ...(doc?.data?.queries?.conflictHeadlines?.items ?? []).map((a) => ({ topic: 'conflict', title: a.title, source: a.domain, url: a.url })),
    ...(doc?.data?.queries?.aiLayoffHeadlines?.items ?? []).map((a) => ({ topic: 'work and AI', title: a.title, source: a.domain, url: a.url })),
    ...(pulse?.data?.hn ?? []).slice(0, 5).map((a) => ({ topic: 'work and AI', title: a.title, source: 'Hacker News', url: a.url })),
    ...(usgs?.data?.significant ?? []).slice(0, 5).map((q) => ({ topic: 'planet', title: `M${q.mag} earthquake — ${q.place}`, source: 'USGS', url: q.url })),
  ];
  return items.map((it, i) => ({ id: i + 1, ...it }));
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['paragraphs'],
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'sources'],
        properties: {
          text: { type: 'string' },
          sources: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
};

export const run = async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    const out = { id: 'digest', source: { name: 'AI-generated summary', url: null, license: null }, status: 'disabled', fetchedAt: new Date().toISOString(), lastSuccessAt: null, error: null, data: null };
    await writeJson(join(OUT_DIR, 'digest.json'), out);
    console.log('off    digest (no ANTHROPIC_API_KEY)');
    return out;
  }
  return runSource({
    id: 'digest',
    source: { name: `AI-generated summary (${MODEL})`, url: 'https://www.anthropic.com/', license: null },
    async fetchData() {
      const headlines = await collectHeadlines();
      if (headlines.length < 3) throw new Error('too few headlines to summarise');
      const client = new Anthropic();
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system:
          'You write a factual, sober summary in plain English for a public dashboard about the state of the world. ' +
          'Use only the headlines provided; do not add facts, numbers or sources that are not in them. ' +
          'Write 2 to 4 short paragraphs (about 150 words in total). Each paragraph lists, in `sources`, the ids of the headlines it is based on. ' +
          'No alarmist adjectives and no forecasts of your own. If the headlines are unclear, say less.',
        messages: [{ role: 'user', content: `Headlines from the last 24–72 hours (JSON):\n${JSON.stringify(headlines)}` }],
      });
      if (response.stop_reason === 'refusal') throw new Error(`request refused (${response.stop_details?.category ?? 'no category'})`);
      if (response.stop_reason === 'max_tokens') throw new Error('response cut off (max_tokens)');
      const text = response.content.find((b) => b.type === 'text')?.text;
      const parsed = JSON.parse(text);
      const byId = new Map(headlines.map((h) => [h.id, h]));
      const paragraphs = parsed.paragraphs.map((p) => ({
        text: p.text,
        sources: [...new Set(p.sources)].filter((id) => byId.has(id)).map((id) => ({ title: byId.get(id).title, source: byId.get(id).source, url: byId.get(id).url })),
      }));
      return { meta: { model: response.model }, data: { label: 'AI-generated', paragraphs } };
    },
  });
};

if (import.meta.url === `file://${process.argv[1]}`) await run();
