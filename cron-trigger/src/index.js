// Cron trigger for the "Update data and deploy" GitHub workflow.
//
// GitHub's own scheduler never fired for this repository, so this Worker
// does it: on each Cloudflare Cron Trigger it calls the GitHub API's
// workflow_dispatch endpoint with the right `group` input. It does nothing
// else. The token comes from the Worker secret GITHUB_TOKEN and is never
// logged.
//
// With the variable DRY_RUN = "true" it logs the request it would send and
// does not call GitHub.

const REPO = 'ruilima/state-of-the-world';
const WORKFLOW = 'update.yml';
const REF = 'main';

// Cron expression (as in wrangler.toml) -> workflow `group` input.
// Values must match the `group` options in .github/workflows/update.yml.
export const SCHEDULE = {
  '7,37 * * * *': 'fast', // every 30 minutes: GDELT, USGS, EONET, HN/arXiv, curated, index
  '23 5 * * *': 'slow', // daily 05:23 UTC: World Bank, UCDP, AI summary
};

export function buildDispatch(group, token) {
  return {
    url: `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    init: {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        // GitHub rejects API requests without a User-Agent.
        'User-Agent': 'world-vitals-cron-trigger',
      },
      body: JSON.stringify({ ref: REF, inputs: { group } }),
    },
  };
}

/** Runs one scheduled event. `fetchImpl` is injectable for tests. */
export async function runScheduled(cron, env, fetchImpl = fetch) {
  const group = SCHEDULE[cron];
  if (!group) {
    console.error(JSON.stringify({ event: 'unknown-cron', cron }));
    throw new Error(`no workflow group for cron "${cron}"`);
  }
  const dryRun = env.DRY_RUN === 'true';
  if (!env.GITHUB_TOKEN && !dryRun) {
    console.error(JSON.stringify({ event: 'missing-secret', cron, group }));
    throw new Error('GITHUB_TOKEN secret is not set');
  }

  const { url, init } = buildDispatch(group, env.GITHUB_TOKEN ?? '');
  if (dryRun) {
    console.log(JSON.stringify({ event: 'dry-run', cron, group, url, body: JSON.parse(init.body) }));
    return { dryRun: true, group };
  }

  const res = await fetchImpl(url, init);
  // Success is 204 No Content (or 200 with run details). Read at most a short
  // error message; never echo request headers.
  const detail = res.ok ? '' : (await res.text()).slice(0, 300);
  const log = { event: 'dispatch', cron, group, status: res.status, ok: res.ok, ...(detail && { detail }) };
  if (res.ok) console.log(JSON.stringify(log));
  else console.error(JSON.stringify(log));
  // A failed dispatch fails the cron invocation, so it shows as an error in
  // the Worker's Cron Events and logs.
  if (!res.ok) throw new Error(`GitHub API answered ${res.status}`);
  return { dryRun: false, group, status: res.status };
}

export default {
  async scheduled(controller, env, ctx) {
    await runScheduled(controller.cron, env);
  },
};
