import { expect, test as base } from '@playwright/test';

// An automatic fixture guards all deterministic browser tests, including a
// preview that was previously built with an unrelated local .env. Individual
// page routes may fulfill the free style URL with synthetic data or an error.
export const test = base.extend({
  offlineBoundary: [async ({ context, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    const blocked = [];
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin === origin) await route.continue();
      else {
        const url = new URL(route.request().url());
        blocked.push(`${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient');
      }
    });
    await use();
    expect(blocked, 'Deterministic E2E must fulfill external resources locally.').toEqual([]);
  }, { auto: true }],
});
export { expect };
