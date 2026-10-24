// The <head> preloads one Google Fonts file by its full URL. Google versions
// those URLs (…/v24/…); if it moves to a new file, the preload would fetch a
// file the stylesheet no longer uses. This live test catches that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { http } from '../scripts/lib/io.mjs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const preload = html.match(/<link rel="preload" as="font"[^>]*href="([^"]+)"/)?.[1];

test('only the title face is preloaded, from fonts.gstatic.com', () => {
  assert.match(preload ?? '', /^https:\/\/fonts\.gstatic\.com\/s\/bigshouldersdisplay\/v\d+\/[\w-]+\.woff2$/);
  assert.equal(html.split('rel="preload"').length - 1, 1);
});

const live = process.env.LIVE ? test : test.skip;
live('live: Google Fonts still serves the preloaded title face', async () => {
  const css = await http('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&display=swap', {
    as: 'text',
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
  });
  assert.ok(css.includes(preload), 'the preloaded URL is no longer in the Google Fonts stylesheet');
});
