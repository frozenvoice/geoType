import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BrowseScreen } from '../components/browse/BrowseScreen';
import { ResourceLoadErrorScreen } from '../components/browse/ResourceLoadErrorScreen';
import { GameScreen } from '../components/game/GameScreen';
import { ResultScreen } from '../components/result/ResultScreen';
import {
  getBreadcrumb,
  getDescendants,
  buildHierarchyIndex,
  createGeoCatalogProvider,
  createProductionGeoCatalogProvider,
  resolveGeoCatalogMode,
  resolveWorldCountryBaseUrl,
  GeoDataResourceError,
  WorldCountryDataError,
  WorldPopulatedPlacesDataError,
  type GeoCatalog,
  type GeoFeature,
} from '../geodata';
import { selectCurrentFeature, useGameStore } from '../game/store/gameStore';
import type { GameSession } from '../game/session';
import {
  resolveMapCapabilityConfiguration,
  type MapCapabilityEnvironment,
} from '../map/capabilities';
import { resolveMapProvider, type MapEnvironment } from '../map/providers';
import { MapResourceLoadError } from '../map/resourceErrors';
import type { MapReadiness } from '../map/types';
import { migrateLegacyFeatureNames } from '../language';
import { useSelectionStore } from '../selection';
import { gameAudio, leaderboardRepository } from './dependencies';
import { SimpleMapRenderer } from '../map/SimpleMapRenderer';

const MapLibreRenderer = lazy(async () => {
  const module = await import('../map/MapLibreRenderer');
  return { default: module.MapLibreRenderer };
});

type GeoCatalogEnvironment = {
  VITE_GEO_CATALOG_BASE_URL?: string;
  VITE_GEO_FIXTURE_BASE_URL?: string;
  VITE_GEO_FIXTURE_ENABLED?: string;
};

type ApplicationMapEnvironment = MapEnvironment & MapCapabilityEnvironment & GeoCatalogEnvironment;

function getMapEnvironment(): ApplicationMapEnvironment {
  const environment: ApplicationMapEnvironment = {
    ...(import.meta.env as ApplicationMapEnvironment),
  };
  const requested = new URLSearchParams(window.location.search).get('mapProvider');
  if (requested === 'test') environment.VITE_MAP_PROVIDER = 'test';
  return environment;
}

function statusCodeFromMessage(message: string): number | null {
  const match = /\bHTTP\s+(\d{3})\b/i.exec(message);
  return match ? Number(match[1]) : null;
}

function catalogResourceType(message: string): string {
  if (/manifest/i.test(message)) return 'Geo Catalog manifest';
  if (/shard/i.test(message)) return 'Geo Catalog shard';
  return 'Geo Catalog';
}

function isCatalogResourceError(error: Error): error is GeoDataResourceError | WorldCountryDataError | WorldPopulatedPlacesDataError {
  return error instanceof GeoDataResourceError || error instanceof WorldCountryDataError || error instanceof WorldPopulatedPlacesDataError;
}

function materializeLanguageNames(catalog: GeoCatalog): GeoCatalog {
  if (catalog.features.every((feature) => (feature.names?.length ?? 0) > 0)) return catalog;
  const features = catalog.features.map((feature) => (
    (feature.names?.length ?? 0) > 0
      ? feature
      : { ...feature, names: migrateLegacyFeatureNames(feature) }
  ));
  return { ...catalog, features, hierarchy: buildHierarchyIndex(features) };
}

export function App() {
  const mapEnvironment = useMemo(getMapEnvironment, []);
  const queryParameters = useMemo(() => new URLSearchParams(window.location.search), []);
  const debug = queryParameters.get('debug') === '1';
  const catalogMode = useMemo(() => resolveGeoCatalogMode({
    searchParams: queryParameters,
    ...(mapEnvironment.VITE_GEO_FIXTURE_ENABLED
      ? { fixtureEnvironmentValue: mapEnvironment.VITE_GEO_FIXTURE_ENABLED }
      : {}),
    isDevelopment: import.meta.env.DEV,
    isTest: import.meta.env.MODE === 'test',
  }), [mapEnvironment.VITE_GEO_FIXTURE_ENABLED, queryParameters]);
  const providerResolution = useMemo(() => resolveMapProvider(mapEnvironment), [mapEnvironment]);
  const mapCapabilities = useMemo(
    () => resolveMapCapabilityConfiguration(mapEnvironment),
    [mapEnvironment],
  );
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [simpleMap, setSimpleMap] = useState(queryParameters.get('renderer') === 'dom');
  const [mapAttempt, setMapAttempt] = useState(0);
  const catalogProvider = useMemo(
    () => {
      // A retry needs a fresh provider because its loader intentionally caches
      // in-flight/rejected requests for each catalog generation.
      void catalogAttempt;
      if (catalogMode === 'fixture') {
        return createGeoCatalogProvider({
          ...(mapEnvironment.VITE_GEO_FIXTURE_BASE_URL
            ? { baseUrl: mapEnvironment.VITE_GEO_FIXTURE_BASE_URL }
            : {}),
        });
      }
      return createProductionGeoCatalogProvider({
        baseUrl: resolveWorldCountryBaseUrl(mapEnvironment.VITE_GEO_CATALOG_BASE_URL),
      });
    },
    [catalogAttempt, catalogMode, mapEnvironment],
  );
  const [catalog, setCatalog] = useState<GeoCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<Error | null>(null);
  const [mapStyleReady, setMapStyleReady] = useState(queryParameters.get('renderer') === 'dom');
  const [mapError, setMapError] = useState<MapResourceLoadError | null>(null);
  const [mapWarning, setMapWarning] = useState<string | null>(null);
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  const phase = useGameStore((state) => state.phase);
  const current = useGameStore(selectCurrentFeature);
  const difficulty = useGameStore((state) => state.difficulty);
  const reducedMotion = useGameStore((state) => state.reducedMotion);
  const cameraArrived = useGameStore((state) => state.cameraArrived);
  const startGame = useGameStore((state) => state.startGame);
  const activeSession = useGameStore((state) => state.activeSession);
  const visited = useGameStore((state) => state.visited);
  const runId = useGameStore((state) => state.runId);
  const currentIndex = useGameStore((state) => state.currentIndex);
  const selected = useSelectionStore((state) => state.selectedFeature);
  const replaceNavigationPath = useSelectionStore((state) => state.replaceNavigationPath);
  // Depends on the menu flag, not the phase: a new object on every in-game phase
  // change makes the map renderer rebuild its target layers for nothing.
  const isMenu = phase === 'menu';
  const hudPadding = useMemo(() => viewport.width <= 880
    ? { top: isMenu ? 78 : 140, right: 22, bottom: isMenu ? Math.round(viewport.height * 0.58) : 320, left: 22 }
    : isMenu
      ? { top: 96, right: 510, bottom: 90, left: 56 }
      : { top: 80, right: 72, bottom: 340, left: 72 }, [isMenu, viewport]);

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => () => gameAudio.dispose(), []);

  useEffect(() => {
    if (!selectionFeedback) return;
    const timeout = window.setTimeout(() => setSelectionFeedback(null), 2_400);
    return () => window.clearTimeout(timeout);
  }, [selectionFeedback]);

  useEffect(() => {
    if (mapCapabilities.issues.length === 0) return;
    setMapWarning(`지도 기능 설정 오류: ${mapCapabilities.issues.join(' ')}`);
  }, [mapCapabilities]);

  useEffect(() => {
    let active = true;
    setCatalog(null);
    setCatalogError(null);
    catalogProvider.loadInitialCatalog()
      .then((loaded) => {
        if (!active) return;
        setCatalog(materializeLanguageNames(loaded));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(error instanceof Error ? error : new Error('지리 catalog를 불러오지 못했습니다.'));
      });
    return () => { active = false; };
  }, [catalogProvider]);

  useEffect(() => {
    if (phase !== 'menu' || !selected) return;
    let active = true;
    const selectedId = selected.id;
    catalogProvider.expandForSelection(selected)
      .then((expanded) => {
        if (!active) return;
        const migrated = materializeLanguageNames(expanded);
        setCatalog(migrated);
        const currentSelection = useSelectionStore.getState().selectedFeature;
        if (currentSelection?.id === selectedId) {
          replaceNavigationPath(getBreadcrumb(migrated.hierarchy, selectedId));
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(error instanceof Error ? error : new Error('선택 지역 데이터를 불러오지 못했습니다.'));
      });
    return () => { active = false; };
  }, [catalogProvider, phase, replaceNavigationPath, selected]);

  useEffect(() => {
    if (!providerResolution.ok || simpleMap || mapStyleReady || mapError) return;
    const timeout = window.setTimeout(() => {
      setMapError(new MapResourceLoadError({
        message: '지도 스타일 로딩이 제한 시간 안에 완료되지 않았습니다.',
        resourceType: '지도 스타일',
        statusCode: null,
        resourceUrl: providerResolution.provider.getStyleUrl(),
      }));
    }, 25_000);
    return () => window.clearTimeout(timeout);
  }, [mapAttempt, mapError, mapStyleReady, providerResolution, simpleMap]);

  const handleFeatureSelect = useCallback((feature: GeoFeature | null) => {
    if (!catalog || !feature) return;
    replaceNavigationPath(getBreadcrumb(catalog.hierarchy, feature.id));
  }, [catalog, replaceNavigationPath]);

  const handleStart = useCallback((session: GameSession, features: GeoFeature[]) => {
    const e2e = import.meta.env.DEV && (simpleMap || !providerResolution.visualQualityEligible)
      && new URLSearchParams(window.location.search).get('e2e') === '1';
    startGame(session, features, { deterministic: e2e, timeScale: e2e ? 0.5 : 1 });
  }, [providerResolution.visualQualityEligible, simpleMap, startGame]);

  const handleQuestionReady = useCallback((readiness: MapReadiness) => {
    const state = useGameStore.getState();
    const target = selectCurrentFeature(state);
    if (
      (state.phase === 'flying' || (state.phase === 'paused' && state.phaseBeforePause === 'flying')) &&
      readiness.questionKey === `${state.runId}:${state.currentIndex}` &&
      target?.id === readiness.featureId &&
      readiness.mapIdle &&
      readiness.sourceReady &&
      readiness.layersReady &&
      readiness.targetRendered
    ) {
      cameraArrived();
    }
  }, [cameraArrived]);

  const handleStyleLoad = useCallback(() => {
    setMapStyleReady(true);
    setMapError(null);
  }, []);

  const handleMapError = useCallback((error: MapResourceLoadError) => {
    console.error('GeoType map rendering error', error.stack ?? error.message);
    // Style, source, tile, glyph and sprite failures carry the failed request
    // URL and must remain recoverable even if the style's initial load event
    // already fired. Optional capability activation errors have no URL and can
    // stay as non-blocking warnings after the base map is usable.
    if (!mapStyleReady || error.resourceUrl) {
      useGameStore.getState().pause(true);
      setMapError(error);
      return;
    }
    setMapWarning(
      `${error.resourceType} 오류 · 상태 ${error.statusCode ?? '응답 없음'} · ${error.message}`,
    );
  }, [mapStyleReady]);

  const retryMap = useCallback(() => {
    // Reconnecting from the simple map must not spend the player's time
    // behind the style-loading overlay. Resume remains an explicit action.
    useGameStore.getState().pause();
    setSimpleMap(false);
    setMapError(null);
    setMapWarning(null);
    setMapStyleReady(false);
    setMapAttempt((attempt) => attempt + 1);
  }, []);

  const retryCatalog = useCallback(() => {
    setCatalogError(null);
    setCatalogAttempt((attempt) => attempt + 1);
  }, []);

  const isBrowsing = phase === 'menu';
  const catalogScopeRoot = isBrowsing ? selected : activeSession?.root ?? null;
  const mapCatalogFeatures = useMemo(() => {
    if (!catalog) return [];
    if (isBrowsing || !catalogScopeRoot) return catalog.features;
    return getDescendants(catalog.hierarchy, catalogScopeRoot.id, { includeSelf: true });
  }, [catalog, catalogScopeRoot, isBrowsing]);

  if (!providerResolution.ok) {
    return (
      <ResourceLoadErrorScreen
        eyebrow="MAP PROVIDER CONFIGURATION"
        title={providerResolution.title}
        message={providerResolution.message}
        resourceType="지도 공급자 설정"
        statusCode={null}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (catalogError) {
    return (
      <ResourceLoadErrorScreen
        eyebrow="GEODATA CATALOG ERROR"
        title="지리 데이터를 불러오지 못했습니다"
        message={catalogError.message}
        resourceType={isCatalogResourceError(catalogError)
          ? catalogError.resourceType
          : catalogResourceType(catalogError.message)}
        statusCode={isCatalogResourceError(catalogError)
          ? catalogError.statusCode
          : statusCodeFromMessage(catalogError.message)}
        resourceUrl={isCatalogResourceError(catalogError)
          ? catalogError.resourceUrl
          : catalogProvider.manifestUrl}
        onRetry={retryCatalog}
      />
    );
  }

  const mapMode = phase === 'menu'
    ? 'browse'
    : phase === 'resolving-correct' || phase === 'resolving-miss' || phase === 'finished'
      ? 'reveal'
      : 'question';
  const currentAnswer = current && activeSession
    ? activeSession.resolvedAnswers[current.id] ?? null
    : null;
  const targetFeature = phase === 'menu'
    ? selected
    : phase === 'finished'
      ? activeSession?.root ?? null
      : current;

  return (
    <div className={`app-shell app-phase-${phase}${reducedMotion ? ' is-reduced-motion' : ''}`}>
      <div className="map-layer">
        {simpleMap && catalog ? <SimpleMapRenderer
          features={catalog.features}
          target={targetFeature}
          {...(phase !== 'menu' && phase !== 'finished' && currentAnswer ? { targetName: currentAnswer.target } : {})}
          mode={mapMode}
          visited={visited}
          questionKey={`${runId}:${currentIndex}`}
          onSelect={(feature) => handleFeatureSelect(feature)}
          onReady={handleQuestionReady}
          onRetry={retryMap}
        /> : !simpleMap && (
        <Suspense fallback={<div className="map-loading" role="status">MapLibre 지도 엔진을 불러오는 중…</div>}>
          <MapLibreRenderer
            key={`${providerResolution.provider.id}:${mapAttempt}`}
            provider={providerResolution.provider}
            {...(mapCapabilities.terrain.options
              ? { terrain: mapCapabilities.terrain.options }
              : {})}
            {...(mapCapabilities.buildings.options
              ? { buildings: mapCapabilities.buildings.options }
              : {})}
            mode={mapMode}
            targetFeature={targetFeature}
            visited={visited}
            questionKey={`${runId}:${currentIndex}`}
            {...(phase !== 'menu' && phase !== 'finished' && currentAnswer
              ? {
                  targetDisplayName: currentAnswer.target,
                  answerNames: currentAnswer.acceptedAnswers,
                }
              : {})}
            catalogFeatures={mapCatalogFeatures}
            difficulty={difficulty}
            reducedMotion={reducedMotion}
            hudPadding={hudPadding}
            syncSelectionStore
            resolveRenderedFeature={(event) => catalog?.hierarchy.featuresById.get(event.id) ?? null}
            onFeatureSelect={(_event, feature) => handleFeatureSelect(feature)}
            onSelectionFeedback={setSelectionFeedback}
            onQuestionReady={handleQuestionReady}
            onStyleLoad={handleStyleLoad}
            onError={handleMapError}
          />
        </Suspense>
        )}
      </div>

      {phase === 'menu' && catalog && mapStyleReady && !mapError && (
        <BrowseScreen
          catalog={catalog}
          debug={debug}
          providerId={simpleMap ? 'simple' : providerResolution.provider.id}
          visualQualityEligible={!simpleMap && providerResolution.visualQualityEligible}
          onStart={handleStart}
        />
      )}
      {phase !== 'menu' && phase !== 'finished' && <GameScreen audio={gameAudio} />}
      {phase === 'finished' && <ResultScreen repository={leaderboardRepository} />}

      {(!catalog || !mapStyleReady) && !mapError && (
        <div className="app-loading-overlay" role="status" aria-live="polite">
          <span className="loading-orbit" aria-hidden="true" />
          <strong>{!mapStyleReady ? '세계를 펼치는 중' : '여행할 지역을 준비하는 중'}</strong>
          <small>{!mapStyleReady ? '처음 방문하면 지도 준비에 잠시 시간이 걸립니다.' : '나라와 도시의 지명을 불러오고 있습니다.'}</small>
        </div>
      )}

      {mapError && (
        <ResourceLoadErrorScreen
          eyebrow="MAP RESOURCE ERROR"
          title="지도를 불러오지 못했습니다"
          message={mapError.message}
          resourceType={mapError.resourceType}
          statusCode={mapError.statusCode}
          resourceUrl={mapError.resourceUrl}
          onRetry={retryMap}
          {...(catalog ? { onContinueWithSimpleMap: () => {
            setSimpleMap(true);
            setMapError(null);
            setMapStyleReady(true);
          } } : {})}
        />
      )}

      {mapWarning && !mapError && (
        <div className="map-error" role="alert">
          <strong>지도 렌더링 경고</strong><span>{mapWarning}</span>
          <button type="button" onClick={() => setMapWarning(null)} aria-label="경고 닫기">×</button>
        </div>
      )}

      {phase === 'menu' && selectionFeedback && !mapError && (
        <div className="map-selection-feedback" role="status" aria-live="polite">
          {selectionFeedback}
        </div>
      )}

      {debug && !providerResolution.visualQualityEligible && (
        <div className="dev-watermark" aria-label="개발 테스트 지도">DEV TEST · MAP QUALITY NOT PASSED</div>
      )}
    </div>
  );
}
