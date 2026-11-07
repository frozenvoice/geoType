import { expect, test } from './deterministic-test.js';

// Exercise the real renderer and bundled worker without remote tiles, fonts or
// sprites. This fixture is for upgrade regression, not hosted-map quality QA.
const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const koreaId = 'natural-earth:country:KOR';

async function waitForMapFrame(page) {
  await expect.poll(() => page.evaluate(() => {
    const diagnostics = window.__GEOTYPE_E2E_MAP__?.getDiagnostics();
    return diagnostics?.tilesLoaded && !diagnostics.moving && diagnostics.renderedCountryCount > 0;
  }), { timeout: 20_000 }).toBe(true);
}

async function openLocalMap(page, attribution = 'Local map fixture', capabilities = false) {
  const externalRequests = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === styleUrl) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          version: 8,
          sources: {
            ...(capabilities ? {
              // These sources exercise discovery/activation only. Empty vector
              // tiles and an unused DEM do not prove terrain or building quality.
              'synthetic-buildings': {
                type: 'vector',
                tiles: ['http://127.0.0.1:4173/__synthetic-buildings/{z}/{x}/{y}.pbf'],
                minzoom: 14,
                maxzoom: 14,
              },
              'synthetic-dem': {
                type: 'raster-dem',
                tiles: ['http://127.0.0.1:4173/__unused-dem/{z}/{x}/{y}.png'],
                tileSize: 256,
              },
            } : {}),
            local: {
              type: 'geojson',
              attribution,
              data: {
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature', properties: {},
                  geometry: { type: 'Point', coordinates: [127.8, 36.1] },
                }],
              },
            },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#07101d' } },
            { id: 'local-point', type: 'circle', source: 'local', paint: { 'circle-radius': 1 } },
            // Exercise the missing-image resolver without loading a sprite.
            { id: 'local-icon', type: 'symbol', source: 'local', layout: { 'icon-image': 'local-missing-icon' } },
            ...(capabilities ? [{
              id: 'synthetic-building-3d',
              type: 'fill-extrusion',
              source: 'synthetic-buildings',
              'source-layer': 'building',
              minzoom: 13,
              layout: { visibility: 'none' },
              paint: {
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
              },
            }] : []),
          ],
        },
      });
    } else if (new URL(url).pathname.startsWith('/__synthetic-buildings/')) {
      await route.fulfill({ contentType: 'application/x-protobuf', body: '' });
    } else if (new URL(url).hostname === '127.0.0.1') {
      await route.continue();
    } else {
      externalRequests.push(url);
      await route.abort();
    }
  });
  await page.goto('/?mapDiagnostics=1&e2e=1');
  await expect(page.locator('.maplibre-stage')).toHaveAttribute('data-map-style-state', 'loaded');
  await expect(page.getByTestId('selected-country-name')).toHaveText('출발 지역을 선택하세요', { timeout: 20_000 });
  await waitForMapFrame(page);
  return externalRequests;
}

test('local MapLibre renderer preserves globe, camera, hover, selection and Korean IME gameplay', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const requests = await openLocalMap(page);
  const stage = page.locator('.maplibre-stage');
  await expect(stage).toHaveAttribute('data-map-projection', 'globe');
  await expect(stage).toHaveAttribute('data-map-terrain-supported', 'false');
  await expect(stage).toHaveAttribute('data-map-terrain-state', 'not-requested');
  await expect(stage).toHaveAttribute('data-map-building-layer', '');
  await expect(stage).toHaveAttribute('data-map-buildings-state', 'not-requested');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('world.png') });
  const initialZoom = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().zoom);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().zoom)).toBeGreaterThan(initialZoom + 0.5);

  const mobile = testInfo.project.name === 'mobile-chromium';
  await page.evaluate(async (isMobile) => {
    await window.__GEOTYPE_E2E_MAP__.centerOn([127.8, isMobile ? 30.5 : 36.1], 4.8, 30);
  }, mobile);
  await expect.poll(() => page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().pitch)).toBeCloseTo(30, 1);
  await expect.poll(() => page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().zoom)).toBeCloseTo(4.8, 1);
  await waitForMapFrame(page);
  const point = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.project([127.8, 36.1]));
  const bounds = await page.locator('.maplibregl-canvas').boundingBox();
  await page.mouse.move(bounds.x + point.x, bounds.y + point.y);
  await expect.poll(() => page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().lastHoverSelectionId)).toBe(koreaId);
  await expect(page.locator('.maplibre-stage__tooltip')).toHaveText('대한민국');
  await page.mouse.click(bounds.x + point.x, bounds.y + point.y);
  await expect(page.getByTestId('selected-country-name')).toHaveText('대한민국');
  await expect.poll(() => page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().lastSelectionId)).toBe(koreaId);
  await waitForMapFrame(page);
  await page.screenshot({ path: testInfo.outputPath('selected.png') });

  const types = page.locator('.geo-type-fieldset');
  const checkboxes = types.getByRole('checkbox');
  for (let index = 0; index < await checkboxes.count(); index += 1) {
    const checkbox = checkboxes.nth(index);
    const label = (await checkbox.locator('..').innerText()).trim();
    if (label !== '국가' && await checkbox.isChecked()) await checkbox.locator('..').click();
  }
  const country = types.getByRole('checkbox', { name: /^국가$/ });
  if (!(await country.isChecked())) await country.locator('..').click();
  await expect(page.getByTestId('start-game')).toContainText('1문제 시작');
  await page.getByTestId('start-game').click();
  const answer = page.getByRole('textbox', { name: '목표 지명 입력' });
  await expect(answer).toBeEnabled({ timeout: 20_000 });
  await expect(answer).toHaveAttribute('lang', 'ko');
  await page.screenshot({ path: testInfo.outputPath('question.png') });
  await answer.dispatchEvent('compositionstart', { data: '대' });
  await answer.fill('대한민국');
  await answer.press('Enter');
  await expect(page.locator('.verdict')).toHaveCount(0);
  await answer.dispatchEvent('compositionend', { data: '대한민국' });
  await expect(page.locator('.verdict-correct')).toBeVisible();
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 10_000 });
  await waitForMapFrame(page);
  await page.screenshot({ path: testInfo.outputPath('result.png') });
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('synthetic style discovers DEM support and activates building metadata without claiming visual quality', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests = await openLocalMap(page, 'Synthetic capability fixture', true);
  const stage = page.locator('.maplibre-stage');
  await expect(stage).toHaveAttribute('data-map-terrain-supported', 'true');
  // Merely providing a DEM source must not activate optional terrain.
  await expect(stage).toHaveAttribute('data-map-terrain-state', 'not-requested');
  await expect(stage).toHaveAttribute('data-map-building-layer', 'synthetic-building-3d');
  await expect(stage).toHaveAttribute('data-map-building-source', 'synthetic-buildings');
  await expect(stage).toHaveAttribute('data-map-building-source-layer', 'building');
  await expect(stage).toHaveAttribute('data-map-buildings-state', 'active');
  expect(await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().renderedBuildingCount)).toBe(0);
  const diagnostics = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().style);
  expect(diagnostics.terrainSourceIds).toEqual(['synthetic-dem']);
  expect(diagnostics.building).toMatchObject({
    layerId: 'synthetic-building-3d', minZoom: 14,
    heightProperty: 'render_height', baseProperty: 'render_min_height',
  });
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test('source attribution removes adjacent event handlers and keeps credit links in the real control', async ({ page }) => {
  await page.addInitScript(() => { window.attributionExecutions = 0; });
  const requests = await openLocalMap(page,
    'Local credit <a href="https://example.invalid/credits" target="_blank">Map contributors</a> ' +
    '<details open onload="window.attributionExecutions++" ontoggle="window.attributionExecutions++">Local details</details> ' +
    '<a onclick="window.attributionExecutions++" onmouseover="window.attributionExecutions++" href="javascript:window.attributionExecutions++">Unsafe link</a>',
  );
  const attribution = page.locator('.maplibregl-ctrl-attrib-inner');
  await expect(attribution).toContainText('Local credit');
  await expect(attribution).toContainText('Local details');
  const credit = attribution.locator('a', { hasText: 'Map contributors' });
  await expect(credit).toHaveAttribute('href', 'https://example.invalid/credits');
  await expect(credit).toHaveAttribute('target', '_blank');
  expect(await attribution.locator('[onload], [ontoggle], [onclick], [onmouseover], [href^="javascript:"]').count()).toBe(0);
  await attribution.locator('details').dispatchEvent('toggle');
  const unsafe = attribution.locator('a', { hasText: 'Unsafe link' });
  await unsafe.dispatchEvent('mouseover');
  await unsafe.dispatchEvent('click');
  expect(await page.evaluate(() => window.attributionExecutions)).toBe(0);
  expect(requests).toEqual([]);
});

for (const { name, search, id, centroid, locator } of [
  { name: '바티칸 시국', search: '바티칸', id: 'natural-earth:country:VAT', centroid: [12.45, 41.9], locator: true },
  { name: '키리바시', search: '키리바시', id: 'natural-earth:country:KIR', centroid: [-157.38, 1.82], locator: true },
  { name: '뉴질랜드', search: '뉴질랜드', id: 'natural-earth:country:NZL', centroid: [172.8, -41.3], locator: false },
]) {
  test(`${name} 문제는 목표가 보이는 카메라에서 입력이 열린다`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openLocalMap(page);

    await page.getByPlaceholder('한국어, English, ISO 코드').fill(search);
    await page.getByTestId('country-list').getByRole('button', { name: new RegExp(search) }).first().click();
    await expect(page.getByTestId('selected-country-name')).toHaveText(name);

    const types = page.locator('.geo-type-fieldset');
    const checkboxes = types.getByRole('checkbox');
    for (let index = 0; index < await checkboxes.count(); index += 1) {
      const checkbox = checkboxes.nth(index);
      const label = (await checkbox.locator('..').innerText()).trim();
      if (label !== '국가' && await checkbox.isChecked()) await checkbox.locator('..').click();
    }
    const country = types.getByRole('checkbox', { name: /^국가$/ });
    if (!(await country.isChecked())) await country.locator('..').click();
    await expect(page.getByTestId('start-game')).toContainText('1문제 시작');
    await page.getByTestId('start-game').click();

    const answer = page.getByRole('textbox', { name: '목표 지명 입력' });
    // 안전 시간 제한(8초)보다 짧게 기다려, 제한이 아니라 위치 표시로 열렸는지 확인한다.
    await expect(answer).toBeEnabled({ timeout: 7_000 });
    // 입력이 열리는 순간부터 마커가 계속 떠 있어야 한다. 사라졌다 돌아오면 안 된다.
    await page.waitForTimeout(1_000);
    const diagnostics = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics());
    expect(diagnostics.targetLocatorFeatureId).toBe(locator ? id : null);
    // 입력이 열린다고 대상 레이어를 다시 만들면 마커와 강조가 깜빡인다.
    expect(diagnostics.targetRebuildCount).toBe(1);
    // 날짜변경선을 걸친 나라에서 카메라가 지구 반대편을 비추면 안 된다.
    const center = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.getDiagnostics().center);
    const longitudeGap = Math.abs(((center[0] - centroid[0] + 540) % 360) - 180);
    expect(longitudeGap).toBeLessThan(60);
    await page.screenshot({ path: testInfo.outputPath('tiny-target.png') });

    await answer.fill(name);
    await expect(page.locator('.result-screen')).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });
}
