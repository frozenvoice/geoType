/// <reference lib="dom" />

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { loadEnv } from 'vite';

import { GeoDataManifestSchema, GeoFeatureCollectionSchema } from '../src/geodata/schemas';
import type { GeoFeature, GeoFeatureCollection } from '../src/geodata/types';
import {
  resolveMapCapabilityConfiguration,
  type CapabilityConfiguration,
  type MapCapabilityEnvironment,
} from '../src/map/capabilities';
import {
  evaluateMapQualityReview,
  type MapQualityCriterionResult,
} from '../src/map/qualityPolicy';
import {
  resolveMapProvider,
  type MapEnvironment,
  type MapProviderResolution,
} from '../src/map/providers';

const projectRoot = resolve(import.meta.dirname, '..');
const screenshotDirectory = resolve(projectRoot, 'docs/screenshots/map-quality');
const reportPath = resolve(projectRoot, 'docs/map-quality-report.md');
const port = 4397;
const baseUrl = `http://127.0.0.1:${port}`;

const desktopScreenshotNames = [
  'world-browse.png',
  'korea-selected.png',
  'seoul-selected.png',
  'seoul-district-question.png',
  'seoul-station-question.png',
  'small-town-question.png',
] as const;

const mobileScreenshotNames = [
  'world-mobile.png',
  'region-selection-mobile.png',
  'question-mobile.png',
] as const;

type QualityStatus = 'NOT PASSED' | 'REVIEW REQUIRED' | 'PASSED';

type CapabilityAudit = {
  requested: boolean;
  configured: boolean;
  providerSupported: boolean | null;
  runtimeSupported: boolean | null;
  active: boolean | null;
  issues: string[];
};

type QualityResult = {
  status: QualityStatus;
  reason: string;
  providerId: string;
  styleProvider: string;
  capabilities: {
    terrain: CapabilityAudit;
    buildings: CapabilityAudit;
  };
  reviewCriteria: MapQualityCriterionResult[];
  webglAvailable: boolean | null;
  mapResponses: number;
  consoleErrors: string[];
  screenshots: string[];
};

type MapQualityProviderBootstrap = {
  resolution: MapProviderResolution;
  providerId: string;
  styleUrl: string;
  visualQualityEligible: boolean;
  declaredTerrainSupport: boolean | null;
  declaredBuildingsSupport: boolean | null;
};

export type RuntimeCapabilityAttributes = {
  terrainSupported: string | null;
  terrainState: string | null;
  buildingLayer: string | null;
  buildingState: string | null;
};

export type RuntimeCapabilityDiagnostics = {
  terrain: { supported: boolean | null; active: boolean | null };
  buildings: { supported: boolean | null; active: boolean | null };
};

export function resolveMapQualityProvider(
  environment: MapEnvironment,
): MapQualityProviderBootstrap {
  const resolution = resolveMapProvider(environment);
  if (!resolution.ok) {
    return {
      resolution,
      providerId: resolution.providerId,
      styleUrl: environment.VITE_MAP_STYLE_URL?.trim() ?? '',
      visualQualityEligible: false,
      declaredTerrainSupport: null,
      declaredBuildingsSupport: null,
    };
  }

  return {
    resolution,
    providerId: resolution.provider.id,
    styleUrl: resolution.provider.getStyleUrl(),
    visualQualityEligible: resolution.visualQualityEligible,
    declaredTerrainSupport: resolution.provider.supportsTerrain,
    declaredBuildingsSupport: resolution.provider.supportsBuildings,
  };
}

function activeFromState(state: string | null): boolean | null {
  if (!state || state === 'pending') return null;
  return state === 'active';
}

export function parseRuntimeCapabilityDiagnostics(
  attributes: RuntimeCapabilityAttributes,
): RuntimeCapabilityDiagnostics {
  const terrainActive = activeFromState(attributes.terrainState);
  const buildingsActive = activeFromState(attributes.buildingState);
  const terrainStyleSupport = attributes.terrainSupported === 'true'
    ? true
    : attributes.terrainSupported === 'false'
      ? false
      : null;
  const buildingLayerSupport = attributes.buildingLayer === null
    ? null
    : attributes.buildingLayer.trim().length > 0;

  return {
    terrain: {
      supported: terrainActive === true ? true : terrainStyleSupport,
      active: terrainActive,
    },
    buildings: {
      supported: buildingsActive === true ? true : buildingLayerSupport,
      active: buildingsActive,
    },
  };
}

function createCapabilityAudit(
  configuration: CapabilityConfiguration<unknown>,
  providerSupported: boolean | null,
  runtimeSupported: boolean | null = null,
  active: boolean | null = null,
): CapabilityAudit {
  return {
    requested: configuration.requested,
    configured: configuration.configured,
    providerSupported,
    runtimeSupported,
    active,
    issues: configuration.issues,
  };
}

function safeStyleProvider(styleUrl: string) {
  if (!styleUrl) return 'not configured';
  try {
    const url = new URL(styleUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return styleUrl.startsWith('pmtiles://') ? 'PMTiles protocol' : 'configured non-URL style';
  }
}

async function readCatalog() {
  const manifestPath = resolve(projectRoot, 'public/geodata/manifest.json');
  const manifest = GeoDataManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  const features: GeoFeature[] = [];
  for (const shard of manifest.shards) {
    const relativePath = shard.path.replace(/^\/?geodata\//, '');
    const payload = await readFile(resolve(projectRoot, 'public/geodata', relativePath), 'utf8');
    const collection = GeoFeatureCollectionSchema.parse(JSON.parse(payload)) as GeoFeatureCollection;
    features.push(...collection.features);
  }
  return { manifest, features };
}

function countCatalog(features: readonly GeoFeature[]) {
  return {
    countries: features.filter((feature) => feature.featureType === 'country').length,
    admin: features.filter((feature) => feature.featureType === 'admin1' || feature.featureType === 'admin2').length,
    populatedPlaces: features.filter((feature) => ['city', 'town', 'village'].includes(feature.featureType)).length,
    poi: features.filter((feature) => feature.featureType === 'poi').length,
  };
}

async function writeReport(result: QualityResult) {
  const { manifest, features } = await readCatalog();
  const counts = countCatalog(features);
  const screenshots = result.screenshots.length > 0
    ? result.screenshots.map((name) => `- \`docs/screenshots/map-quality/${name}\``).join('\n')
    : '- 생성하지 않음 (실제 provider 전제조건 미충족)';
  const errors = result.consoleErrors.length > 0
    ? result.consoleErrors.map((error) => `- ${error.replaceAll('\n', ' ')}`).join('\n')
    : '- 없음';
  const criteria = result.status === 'PASSED'
    ? '자동 검사와 아래의 모든 개별 시각 검토 항목이 PASS입니다.'
    : result.status === 'REVIEW REQUIRED'
      ? '자동 캡처는 완료했지만 아래 시각 검토 항목 중 명시되지 않은 결과가 있습니다.'
      : '자동 전제조건 또는 아래 시각 검토 항목 중 하나 이상을 통과하지 못했습니다.';
  const criterionRows = result.reviewCriteria
    .map((criterion) => `- **${criterion.status}** — ${criterion.label} (\`${criterion.environmentKey}\`)`)
    .join('\n');
  const capabilityRows = (name: string, audit: CapabilityAudit) => `### ${name}

- 요청됨: ${audit.requested ? '예' : '아니요'}
- 설정 유효: ${audit.requested ? audit.configured ? '예' : '아니요' : '해당 없음 (요청하지 않음)'}
- provider 지원: ${audit.providerSupported === null ? '확인하지 못함' : audit.providerSupported ? '예' : '아니요'}
- 로드된 style/runtime 지원: ${audit.runtimeSupported === null ? '확인하지 못함' : audit.runtimeSupported ? '예' : '아니요'}
- MapLibre 활성화: ${audit.active === null ? '확인하지 못함' : audit.active ? '예' : '아니요'}
- 설정 오류: ${audit.issues.length > 0 ? audit.issues.join(' ') : '없음'}`;

  const report = `# GeoType 지도 품질 보고서

> 결과: **${result.status}** — ${result.reason}

## 실행 환경

- 지도 provider: \`${result.providerId}\`
- style provider: ${result.styleProvider}
- WebGL context: ${result.webglAvailable === null ? '검사하지 못함' : result.webglAvailable ? '사용 가능' : '사용 불가'}
- 지도 style/tile 응답 수: ${result.mapResponses}
- 품질 판정: ${criteria}

## 지도 기능 설정 및 활성화

${capabilityRows('DEM terrain', result.capabilities.terrain)}

${capabilityRows('3D buildings', result.capabilities.buildings)}

## 개별 시각 검토 결과

${criterionRows}

\`MAP_QUALITY_APPROVED=true\` 하나만으로는 이 게이트를 통과할 수 없습니다. 각 항목의 환경 변수에 \`pass\` 또는 \`fail\`을 명시해야 합니다.

## 동기화 데이터 감사

- 동기화 국가: ${counts.countries}개 (KR)
- admin feature: ${counts.admin}개
- populated place: ${counts.populatedPlaces}개
- POI featureType: ${counts.poi}개
- 전체 feature: ${manifest.totals.featureCount}개 / ${manifest.totals.shardCount} shards
- 전체 데이터 크기: ${manifest.totals.byteSize.toLocaleString('en-US')} bytes
- catalog version: \`${manifest.catalogVersion}\`
- source version: \`${Object.values(manifest.sourceVersions).join(', ')}\`
- 범위 완료 여부: **${manifest.scopeComplete ? '완료' : '미완료'}**
- 범위: ${manifest.scopeLabel}

## 스크린샷

${screenshots}

## 콘솔 / WebGL 오류

${errors}

## 아직 검증하지 못한 범위

- 전 세계 국가·행정구역·도시·마을·POI catalog
- 실제 vector style의 확대별 도로·수계·건물·라벨 밀도
- DEM terrain 및 3D building extrusion 중 위에서 활성화·검토되지 않은 기능
- 서울 25개 자치구 전체의 권위 있는 경계
- 실제 provider 화면의 1440×900 및 390×844 수동 시각 승인

개발용 \`TestMapProvider\`와 custom fixture는 기능 테스트 전용이며 품질 통과 증거가 아닙니다.
`;
  await mkdir(resolve(projectRoot, 'docs'), { recursive: true });
  await writeFile(reportPath, report, 'utf8');
}

function featureButton(page: Page, featureId: string) {
  return page.locator(`[data-feature-id="${featureId}"]`);
}

async function drillToSeoul(page: Page) {
  await featureButton(page, 'custom:continent:asia').click();
  await featureButton(page, 'custom:country:KR').click();
  await featureButton(page, 'custom:admin1:KR-11').click();
  await page.getByRole('heading', { name: '서울특별시', exact: true }).waitFor({ state: 'visible' });
}

async function chooseOnlyType(page: Page, label: string) {
  const group = page.getByRole('group', { name: '지명 종류', exact: true });
  const typeLabels = [
    '국가',
    '시·도 / 광역자치단체',
    '시·군·구',
    '도시',
    '읍·면',
    '마을',
    '동네',
    '역',
    '랜드마크',
    '산',
    '강·하천',
    '호수',
    '도로',
    '기타 POI',
  ];
  for (const typeLabel of typeLabels) {
    const checkbox = group.getByLabel(typeLabel, { exact: true });
    if (await checkbox.count() === 1) await checkbox.setChecked(typeLabel === label);
  }
}

async function waitForQuestionReady(page: Page) {
  const input = page.getByRole('textbox', { name: '목표 지명 입력' });
  // Enabled + focused is the product readiness gate: camera idle, target
  // source/layers, rendered geometry, and input focus have all completed.
  await expect(input).toBeEnabled({ timeout: 20_000 });
  await expect(input).toBeFocused({ timeout: 5_000 });
}

async function screenshot(page: Page, name: string, screenshots: string[]) {
  await page.screenshot({ path: resolve(screenshotDirectory, name), animations: 'disabled' });
  screenshots.push(name);
}

async function waitForMap(page: Page) {
  await page.locator('.maplibre-stage').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.maplibregl-canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const runtime = globalThis as typeof globalThis & {
      document?: {
        querySelector(selector: string): { getAttribute(name: string): string | null } | null;
      };
    };
    const stage = runtime.document?.querySelector('.maplibre-stage');
    return stage?.getAttribute('data-map-terrain-state') !== 'pending' &&
      stage?.getAttribute('data-map-buildings-state') !== 'pending';
  }, undefined, { timeout: 30_000 });
  await page.waitForTimeout(2_500);
}

async function openFreshPage(
  context: BrowserContext,
  consoleErrors: string[],
  responseCounter: { value: number },
) {
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => {
    const url = response.url();
    if (/\.(?:pbf|mvt|pmtiles)(?:\?|$)|\/(?:tiles?|styles?)\//i.test(url)) responseCounter.value += 1;
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForMap(page);
  return page;
}

async function captureDesktop(
  context: BrowserContext,
  consoleErrors: string[],
  responseCounter: { value: number },
  screenshots: string[],
) {
  let page = await openFreshPage(context, consoleErrors, responseCounter);
  await screenshot(page, desktopScreenshotNames[0], screenshots);
  await featureButton(page, 'custom:continent:asia').click();
  await featureButton(page, 'custom:country:KR').click();
  await page.getByRole('heading', { name: '대한민국', exact: true }).waitFor({ state: 'visible' });
  await page.waitForTimeout(900);
  await screenshot(page, desktopScreenshotNames[1], screenshots);
  await featureButton(page, 'custom:admin1:KR-11').click();
  await page.getByRole('heading', { name: '서울특별시', exact: true }).waitFor({ state: 'visible' });
  await page.waitForTimeout(900);
  await screenshot(page, desktopScreenshotNames[2], screenshots);
  await chooseOnlyType(page, '시·군·구');
  await page.getByLabel('문제 수').selectOption('2');
  await page.getByRole('button', { name: /이 지역으로 시작/ }).click();
  await waitForQuestionReady(page);
  await screenshot(page, desktopScreenshotNames[3], screenshots);
  await page.close();

  page = await openFreshPage(context, consoleErrors, responseCounter);
  await drillToSeoul(page);
  await chooseOnlyType(page, '역');
  await page.getByRole('button', { name: /이 지역으로 시작/ }).click();
  await waitForQuestionReady(page);
  await screenshot(page, desktopScreenshotNames[4], screenshots);
  await page.close();

  page = await openFreshPage(context, consoleErrors, responseCounter);
  await featureButton(page, 'custom:continent:asia').click();
  await featureButton(page, 'custom:country:KR').click();
  await featureButton(page, 'custom:admin1:KR-51').click();
  await chooseOnlyType(page, '읍·면');
  await page.getByRole('button', { name: /이 지역으로 시작/ }).click();
  await waitForQuestionReady(page);
  await screenshot(page, desktopScreenshotNames[5], screenshots);
  return page;
}

async function captureMobile(
  context: BrowserContext,
  consoleErrors: string[],
  responseCounter: { value: number },
  screenshots: string[],
) {
  const page = await openFreshPage(context, consoleErrors, responseCounter);
  await screenshot(page, mobileScreenshotNames[0], screenshots);
  await featureButton(page, 'custom:continent:asia').click();
  await featureButton(page, 'custom:country:KR').click();
  await page.waitForTimeout(900);
  await screenshot(page, mobileScreenshotNames[1], screenshots);
  await featureButton(page, 'custom:admin1:KR-11').click();
  await chooseOnlyType(page, '시·군·구');
  await page.getByRole('button', { name: /이 지역으로 시작/ }).click();
  await waitForQuestionReady(page);
  await screenshot(page, mobileScreenshotNames[2], screenshots);
  return page;
}

async function waitForServer(server: ChildProcess) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error('Timed out waiting for the GeoType quality server.');
}

async function run() {
  const fileEnvironment = loadEnv('production', projectRoot, '');
  const environment = {
    ...fileEnvironment,
    ...process.env,
  } as Record<string, string | undefined> & MapCapabilityEnvironment & MapEnvironment;
  const capabilityConfiguration = resolveMapCapabilityConfiguration(environment);
  const providerBootstrap = resolveMapQualityProvider(environment);
  const {
    resolution: providerResolution,
    providerId,
    styleUrl,
    visualQualityEligible: providerConfigured,
    declaredTerrainSupport: providerSupportsTerrain,
    declaredBuildingsSupport: providerSupportsBuildings,
  } = providerBootstrap;
  const review = evaluateMapQualityReview(environment, {
    terrainRequired: capabilityConfiguration.terrain.requested,
    buildingsRequired: capabilityConfiguration.buildings.requested,
  });
  let capabilities = {
    terrain: createCapabilityAudit(
      capabilityConfiguration.terrain,
      providerSupportsTerrain,
    ),
    buildings: createCapabilityAudit(
      capabilityConfiguration.buildings,
      providerSupportsBuildings,
    ),
  };

  if (!providerConfigured) {
    const reason = providerResolution.ok
      ? 'TestMapProvider는 실제 지도 품질 판정에 사용할 수 없습니다.'
      : `${providerResolution.message} 누락: ${providerResolution.missingVariables.join(', ')}`;
    await writeReport({
      status: 'NOT PASSED',
      reason,
      providerId,
      styleProvider: safeStyleProvider(styleUrl),
      capabilities,
      reviewCriteria: review.criteria,
      webglAvailable: null,
      mapResponses: 0,
      consoleErrors: [],
      screenshots: [],
    });
    console.error(`Map quality gate NOT PASSED: ${reason}`);
    process.exitCode = 1;
    return;
  }

  const capabilityBlockers = [
    ...capabilityConfiguration.issues,
  ];
  if (capabilityBlockers.length > 0) {
    const reason = `지도 기능 설정을 활성화할 수 없습니다: ${capabilityBlockers.join(' ')}`;
    await writeReport({
      status: 'NOT PASSED',
      reason,
      providerId,
      styleProvider: safeStyleProvider(styleUrl),
      capabilities,
      reviewCriteria: review.criteria,
      webglAvailable: null,
      mapResponses: 0,
      consoleErrors: [],
      screenshots: [],
    });
    console.error(`Map quality gate NOT PASSED: ${reason}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(screenshotDirectory, { recursive: true });
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const server = spawn(
    npmCommand,
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: projectRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  const consoleErrors: string[] = [];
  const screenshots: string[] = [];
  const responseCounter = { value: 0 };
  let webglAvailable: boolean | null = null;

  try {
    await waitForServer(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', colorScheme: 'dark' });
      const desktopPage = await captureDesktop(desktop, consoleErrors, responseCounter, screenshots);
      // MapLibre removes/replaces its canvas when WebGL initialization fails;
      // console/page errors are collected separately for context-loss details.
      webglAvailable = await desktopPage.locator('.maplibregl-canvas').isVisible();
      const stage = desktopPage.locator('.maplibre-stage');
      const runtimeDiagnostics = parseRuntimeCapabilityDiagnostics({
        terrainSupported: await stage.getAttribute('data-map-terrain-supported'),
        terrainState: await stage.getAttribute('data-map-terrain-state'),
        buildingLayer: await stage.getAttribute('data-map-building-layer'),
        buildingState: await stage.getAttribute('data-map-buildings-state'),
      });
      capabilities = {
        terrain: createCapabilityAudit(
          capabilityConfiguration.terrain,
          providerSupportsTerrain,
          runtimeDiagnostics.terrain.supported,
          runtimeDiagnostics.terrain.active,
        ),
        buildings: createCapabilityAudit(
          capabilityConfiguration.buildings,
          providerSupportsBuildings,
          runtimeDiagnostics.buildings.supported,
          runtimeDiagnostics.buildings.active,
        ),
      };
      await desktop.close();

      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', colorScheme: 'dark', isMobile: true, hasTouch: true });
      await captureMobile(mobile, consoleErrors, responseCounter, screenshots);
      await mobile.close();
    } finally {
      await browser.close();
    }

    const automatedReady = webglAvailable && responseCounter.value > 0 && consoleErrors.length === 0;
    const capabilitiesReady =
      (!capabilityConfiguration.terrain.requested || capabilities.terrain.active === true) &&
      (!capabilityConfiguration.buildings.requested || capabilities.buildings.active === true);
    const status: QualityStatus = !automatedReady || !capabilitiesReady || review.anyFailed
      ? 'NOT PASSED'
      : review.allPassed
        ? 'PASSED'
        : 'REVIEW REQUIRED';
    const reason = !automatedReady
      ? 'WebGL, 지도 응답 또는 콘솔 오류 자동 검사에 실패했습니다.'
      : !capabilitiesReady
        ? '요청한 terrain 또는 3D building 기능이 MapLibre에서 활성화되지 않았습니다.'
        : review.anyFailed
          ? '하나 이상의 개별 시각 검토 항목이 FAIL입니다.'
          : review.allPassed
            ? '자동 검사와 모든 개별 시각 검토 항목이 PASS입니다.'
            : `실제 지도 캡처를 생성했지만 개별 시각 검토가 남았습니다: ${review.pending.join(', ')}`;
    await writeReport({
      status,
      reason,
      providerId,
      styleProvider: safeStyleProvider(styleUrl),
      capabilities,
      reviewCriteria: review.criteria,
      webglAvailable,
      mapResponses: responseCounter.value,
      consoleErrors,
      screenshots,
    });
    console.log(`Map quality report written: ${reportPath}`);
    if (status !== 'PASSED') process.exitCode = status === 'REVIEW REQUIRED' ? 2 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    consoleErrors.push(message);
    await writeReport({
      status: 'NOT PASSED',
      reason: message,
      providerId,
      styleProvider: safeStyleProvider(styleUrl),
      capabilities,
      reviewCriteria: review.criteria,
      webglAvailable,
      mapResponses: responseCounter.value,
      consoleErrors,
      screenshots,
    });
    console.error(`Map quality gate NOT PASSED: ${message}`);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
}

const invokedScript = process.argv[1];
if (invokedScript && import.meta.url === pathToFileURL(resolve(invokedScript)).href) {
  await run();
}
