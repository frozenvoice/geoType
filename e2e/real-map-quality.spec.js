import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { isExpectedMapTileCancellation, isOpenFreeMapTileUrl } from '../scripts/map-quality-network.ts';

// These tests collect real hosted-map evidence. An automated assertion PASS is
// never visual approval: inspect the attached images and use map:quality's
// separate, explicit review criteria. The default style has no DEM terrain.
const mapUrl = '/?mapDiagnostics=1&debug=1';
const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const koreaId = 'natural-earth:country:KOR';
const evidenceByTest = new Map();

test.use({ serviceWorkers: 'block' });

function safeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) return `${url.protocol}[resource]`;
  // Keep diagnostics useful without writing a local .env credential to disk.
  return `${url.origin}${url.pathname}${url.search ? '?[redacted]' : ''}`;
}

function safeMessage(message) {
  return message.replace(/https?:\/\/[^\s"'<>]+/g, (url) => safeUrl(url));
}

test.beforeEach(async ({ context, page, baseURL }, testInfo) => {
  const evidence = {
    visualReview: 'REVIEW REQUIRED',
    project: testInfo.project.name,
    viewport: page.viewportSize(),
    url: mapUrl,
    catalog: 'production (no fixture=1)',
    provider: 'real hosted OpenFreeMap (no mapProvider=test)',
    terrain: { status: 'UNSUPPORTED', reason: 'Default OpenFreeMap Liberty supplies no raster-dem source.' },
    buildingGeometry: {
      status: 'NOT VERIFIED',
      reason: 'Rendered building geometry is checked only in the Seoul test. Visual quality requires separate screenshot review.',
    },
    blockedRequests: [],
    failedResponses: [],
    failedRequests: [],
    cancelledRequests: [],
    pageErrors: [],
    consoleErrors: [],
    successfulResources: [],
    snapshots: [],
  };
  evidenceByTest.set(testInfo.testId, evidence);
  const localOrigin = new URL(baseURL).origin;
  page.on('pageerror', (error) => evidence.pageErrors.push(safeMessage(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(safeMessage(message.text()));
  });
  page.on('requestfailed', (request) => {
    const failure = { url: safeUrl(request.url()), error: request.failure()?.errorText };
    const destination = isExpectedMapTileCancellation(request.url(), failure.error)
      ? evidence.cancelledRequests : evidence.failedRequests;
    destination.push(failure);
  });
  page.on('response', (response) => {
    const resource = { url: safeUrl(response.url()), status: response.status() };
    if (response.status() >= 400) evidence.failedResponses.push(resource);
    if (response.ok() && new URL(response.url()).origin !== localOrigin) {
      evidence.successfulResources.push(resource);
    }
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === localOrigin) {
      await route.continue();
      return;
    }
    const isFreeMapResource = url.protocol === 'https:' && url.port === '' &&
      (url.hostname === 'openfreemap.org' || url.hostname.endsWith('.openfreemap.org'));
    if (!isFreeMapResource) {
      evidence.blockedRequests.push(safeUrl(url.href));
      await route.abort('blockedbyclient');
      return;
    }
    // Route only the allowed free host and never follow an external redirect.
    // This prevents a changed provider/style or .env from reaching paid APIs.
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) {
        evidence.blockedRequests.push(`${safeUrl(url.href)} (redirect blocked)`);
        await route.abort('blockedbyclient');
      } else {
        await route.fulfill({ response });
      }
    } catch (error) {
      evidence.failedRequests.push({ url: safeUrl(url.href), error: safeMessage(String(error)) });
      await route.abort('failed');
    }
  });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.indexedDB.deleteDatabase('geotype-geodata');
  });
});

async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  const snapshot = await page.evaluate(() => {
    const stage = document.querySelector('.maplibre-stage');
    return {
      runtime: window.__GEOTYPE_E2E_MAP__?.getDiagnostics() ?? null,
      stage: stage ? Object.fromEntries(Array.from(stage.attributes)
        .filter((attribute) => attribute.name.startsWith('data-'))
        .map((attribute) => [attribute.name, attribute.value])) : null,
    };
  });
  evidenceByTest.get(testInfo.testId).snapshots.push({ name, ...snapshot });
}

async function waitForMap(page) {
  const stage = page.locator('.maplibre-stage');
  await expect(stage).toHaveAttribute('data-map-provider', 'hosted');
  await expect(stage).toHaveAttribute('data-map-style-state', 'loaded', { timeout: 25_000 });
  await expect(stage).toHaveAttribute('data-map-projection', 'globe');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  // Style readiness can precede the production country catalog. Wait for the
  // existing geometry/readiness contract before checking its dependent UI.
  await expect.poll(() => page.evaluate(() => {
    const diagnostic = window.__GEOTYPE_E2E_MAP__?.getDiagnostics();
    return Boolean(diagnostic?.tilesLoaded && !diagnostic.moving && diagnostic.renderedCountryCount > 0);
  }), { timeout: 20_000 }).toBe(true);
  await expect(page.getByTestId('selected-country-name')).toBeVisible();
}

async function openMap(page, testInfo) {
  // Catalog download is independent from hosted style readiness. Install the
  // response listener before navigation, and finish the actual production
  // transfer before starting the existing worker/render readiness checks.
  const catalogUrl = new URL('/geodata/world/countries.geojson', testInfo.project.use.baseURL).href;
  const catalogReady = page.waitForResponse(catalogUrl).then(async (response) => {
    expect(response.status(), 'Production country data must load successfully.').toBe(200);
    expect(await response.finished(), 'Production country download must finish.').toBeNull();
    evidenceByTest.get(testInfo.testId).catalogResponse = {
      url: safeUrl(response.url()), status: response.status(), transfer: 'COMPLETE',
    };
  });
  await Promise.all([page.goto(mapUrl), catalogReady]);
  await waitForMap(page);
  const evidence = evidenceByTest.get(testInfo.testId);
  expect(evidence.successfulResources.some((resource) => resource.url === styleUrl),
    'Default free hosted style must actually load; a provider flag is insufficient.').toBe(true);
  expect(evidence.successfulResources.some((resource) => isOpenFreeMapTileUrl(resource.url)),
    'At least one actual remote map tile must return success.').toBe(true);
  await expect(page.locator('.maplibre-stage')).toHaveAttribute('data-map-terrain-supported', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}

test.afterEach(async ({ page }, testInfo) => {
  const evidence = evidenceByTest.get(testInfo.testId);
  if (!evidence) return;
  if (!page.isClosed()) {
    try { await capture(page, testInfo, 'final-view'); }
    catch (error) { evidence.captureError = String(error); }
  }
  evidence.testBodyStatus = testInfo.status;
  evidence.resourceChecks = evidence.blockedRequests.length === 0 &&
    evidence.failedResponses.length === 0 && evidence.failedRequests.length === 0 && evidence.pageErrors.length === 0 &&
    evidence.consoleErrors.length === 0 ? 'PASS' : 'FAIL';
  const path = testInfo.outputPath('real-map-evidence.json');
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
  await testInfo.attach('real-map-evidence', { path, contentType: 'application/json' });
  evidenceByTest.delete(testInfo.testId);
  expect(evidence.blockedRequests, 'Unexpected external requests were blocked; environment/provider is unsuitable.').toEqual([]);
  expect(evidence.failedResponses, 'Hosted map resources returned HTTP errors.').toEqual([]);
  expect(evidence.failedRequests, 'Hosted map resources failed at the network layer.').toEqual([]);
  expect(evidence.pageErrors, 'Browser runtime errors.').toEqual([]);
  expect(evidence.consoleErrors, 'Browser console errors.').toEqual([]);
});

test('real hosted globe readiness collects desktop/mobile visual evidence', async ({ page }, testInfo) => {
  await openMap(page, testInfo);
  await expect(page.getByTestId('selected-country-name')).toHaveText('출발 지역을 선택하세요');
  await capture(page, testInfo, 'world-globe-review-required');
});

test('real hosted Korea selection uses production country boundaries', async ({ page }, testInfo) => {
  await openMap(page, testInfo);
  await page.getByLabel('국가 검색').fill('대한민국');
  await page.getByTestId('country-list').locator(`[data-country-id="${koreaId}"]`).click();
  await expect(page.getByTestId('selected-country-name')).toHaveText('대한민국');
  await expect(page.locator('.maplibre-stage')).toHaveAttribute('data-selected-country-id', koreaId);
  await waitForMap(page);
  await capture(page, testInfo, 'korea-boundaries-review-required');
});

test('real hosted Seoul pitch records building runtime separately from visual approval', async ({ page }, testInfo) => {
  await openMap(page, testInfo);
  await page.evaluate(async () => {
    await window.__GEOTYPE_E2E_MAP__.centerOn([126.978, 37.5665], 16, 55);
  });
  await expect.poll(() => page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().zoom)).toBeCloseTo(16, 1);
  await expect.poll(() => page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().pitch)).toBeCloseTo(55, 1);
  await expect.poll(() => page.evaluate(() => {
    const diagnostic = window.__GEOTYPE_E2E_MAP__.getDiagnostics();
    return diagnostic.tilesLoaded && !diagnostic.moving;
  }), { timeout: 20_000 }).toBe(true);
  const building = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().style?.building);
  expect(building, 'A data-backed fill-extrusion layer must be discovered in the real loaded style.').toBeTruthy();
  await expect(page.locator('.maplibre-stage')).toHaveAttribute('data-map-buildings-state', 'active');
  await expect.poll(() => page.evaluate(() =>
    window.__GEOTYPE_E2E_MAP__.getDiagnostics().renderedBuildingCount),
  { timeout: 20_000 }).toBeGreaterThan(0);
  const renderedBuildingCount = await page.evaluate(() =>
    window.__GEOTYPE_E2E_MAP__.getDiagnostics().renderedBuildingCount);
  evidenceByTest.get(testInfo.testId).buildingGeometry = {
    status: 'RENDERED GEOMETRY OBSERVED', renderedBuildingCount,
    visualReview: 'REVIEW REQUIRED',
    reason: 'Rendered feature count proves geometry query results, not extrusion appearance or visual quality.',
  };
  evidenceByTest.get(testInfo.testId).buildingRuntime = {
    status: 'ACTIVE', layer: building, visualReview: 'REVIEW REQUIRED',
  };
  await capture(page, testInfo, 'seoul-3d-buildings-review-required');
});
