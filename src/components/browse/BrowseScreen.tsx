import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoCatalog, GeoFeature, GeoFeatureType } from '../../geodata';
import { getBreadcrumb, getDescendants, WORLD_SCOPE_FEATURE_ID } from '../../geodata';
import {
  DIFFICULTIES,
  getDifficultyMenuLabel,
  type DifficultyId,
} from '../../game/config/difficulties';
import {
  buildGameScope,
  filterFeaturesForScope,
  seededShuffle,
} from '../../game/scope';
import { createGameSession, type GameSession } from '../../game/session';
import { useGameStore } from '../../game/store/gameStore';
import {
  getAnswerPolicyLabel,
  getTypingLanguageAvailability,
  getTypingLanguageLabel,
  LANGUAGE_DATA_VERSION,
  loadBrowserLanguageSettings,
  resolveEligibleFeatures,
  saveBrowserLanguageSettings,
  type AnswerPolicy,
  type LanguageScopeKind,
  type LanguageSettings,
  type TypingLanguage,
  type TypingLanguageAvailability,
  type UiLocale,
} from '../../language';
import {
  getFeatureDisplayName,
  getFeatureTypeLabel,
  useSelectionStore,
} from '../../selection';
import './browse.css';
import {
  deriveDefaultIncludedTypes,
  findScopeRoot,
  getAvailableTypesSignature,
  getBrowseCatalogSummary,
  hasCapitalMetadata,
  reconcileIncludedTypes,
  type IncludedTypesContext,
} from './browseModel';

type BrowseScreenProps = {
  catalog: GeoCatalog;
  debug?: boolean;
  providerId?: string;
  visualQualityEligible?: boolean;
  onStart: (session: GameSession, features: GeoFeature[]) => void;
};

type SearchableCountry = GeoFeature & {
  isoAlpha2?: string | null;
  isoAlpha3?: string | null;
};

type BrowsePreset = 'world-10' | 'cities' | 'capitals' | null;

function sortFeatures(features: readonly GeoFeature[], locale: UiLocale = 'ko') {
  return [...features].sort((left, right) =>
    getFeatureDisplayName(left, locale).localeCompare(getFeatureDisplayName(right, locale), locale),
  );
}

function normalizeSearch(value: string) {
  return value.normalize('NFC').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
}

function countryMatchesSearch(feature: SearchableCountry, query: string): boolean {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const candidates = [
    feature.name,
    feature.nameLocal,
    feature.localizedNames.ko,
    feature.localizedNames.en,
    ...(feature.names ?? []).map((name) => name.value),
    ...Object.values(feature.localizedNames),
    ...feature.aliases,
    feature.countryCode,
    feature.countryCodeAlpha3,
    feature.isoAlpha2,
    feature.isoAlpha3,
    ...(feature.adminCodes ?? []),
  ];
  return candidates.some((candidate) =>
    typeof candidate === 'string' && normalizeSearch(candidate).includes(normalizedQuery),
  );
}

function countryIsoLabel(feature: SearchableCountry) {
  return feature.isoAlpha2
    ?? feature.countryCode
    ?? feature.isoAlpha3
    ?? feature.countryCodeAlpha3
    ?? '';
}

function scopeKindFor(feature: GeoFeature): LanguageScopeKind {
  if (feature.id === WORLD_SCOPE_FEATURE_ID) return 'world';
  if (feature.featureType === 'continent') return 'continent';
  if (feature.featureType === 'country') return 'country';
  return 'subnational';
}

function visibleLanguageOptions(
  scopeKind: LanguageScopeKind,
  countryCode: string | undefined,
  availability: TypingLanguageAvailability[],
) {
  const allowed = scopeKind === 'world' || scopeKind === 'continent'
    ? new Set<TypingLanguage>(['ko', 'en', 'native', 'romanized'])
    : countryCode === 'JP'
      ? new Set<TypingLanguage>(['ko', 'en', 'ja-kanji', 'ja-reading', 'romanized'])
      : new Set<TypingLanguage>(['ko', 'en', 'native', 'romanized']);
  return availability.filter((option) => allowed.has(option.typingLanguage));
}

function answerPolicyDescription(policy: AnswerPolicy) {
  return policy === 'strict'
    ? '표시한 언어의 대표 지명만 정답으로 인정합니다.'
    : '등록된 다른 표기와 별칭까지 인정합니다. 캐주얼 기록으로 저장됩니다.';
}

function formatCount(count: number) {
  return new Intl.NumberFormat('ko-KR').format(count);
}

function mapProviderLabel(providerId: string) {
  if (providerId === 'simple') return '간단 지도';
  if (providerId === 'test') return '테스트 지도';
  return '3D 지도';
}

function createSessionSeed() {
  const isE2e = new URLSearchParams(window.location.search).get('e2e') === '1';
  if (isE2e) return 'geotype-session';
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function BrowseScreen({
  catalog,
  debug = false,
  providerId = '',
  visualQualityEligible = true,
  onStart,
}: BrowseScreenProps) {
  const selected = useSelectionStore((state) => state.selectedFeature);
  const navigationPath = useSelectionStore((state) => state.navigationPath);
  const breadcrumbs = useSelectionStore((state) => state.breadcrumbs);
  const replaceNavigationPath = useSelectionStore((state) => state.replaceNavigationPath);
  const navigateToBreadcrumb = useSelectionStore((state) => state.navigateToBreadcrumb);
  const goBack = useSelectionStore((state) => state.goBack);
  const resetSelection = useSelectionStore((state) => state.resetSelection);
  const setHoveredFeature = useSelectionStore((state) => state.setHoveredFeature);
  const difficulty = useGameStore((state) => state.difficulty);
  const setDifficulty = useGameStore((state) => state.setDifficulty);
  const reducedMotion = useGameStore((state) => state.reducedMotion);
  const toggleReducedMotion = useGameStore((state) => state.toggleReducedMotion);

  const [searchQuery, setSearchQuery] = useState('');
  const [includedTypes, setIncludedTypes] = useState<GeoFeatureType[]>([]);
  const [questionCount, setQuestionCount] = useState<number | 'all'>(10);
  const [preset, setPreset] = useState<BrowsePreset>(null);
  const [sessionSeed] = useState(createSessionSeed);
  const includedTypesContextRef = useRef<IncludedTypesContext | null>(null);
  const [languageSettings, setLanguageSettings] = useState<LanguageSettings>(
    loadBrowserLanguageSettings,
  );

  const worldFeature = useMemo(
    () => catalog.hierarchy.featuresById.get(WORLD_SCOPE_FEATURE_ID) ?? null,
    [catalog.hierarchy.featuresById],
  );
  const continents = useMemo(
    () => sortFeatures(
      catalog.features.filter(
        (feature) => feature.featureType === 'continent' && feature.id !== WORLD_SCOPE_FEATURE_ID,
      ),
      languageSettings.uiLocale,
    ),
    [catalog.features, languageSettings.uiLocale],
  );
  const countries = useMemo(
    () => sortFeatures(
      catalog.features.filter((feature) => feature.featureType === 'country'),
      languageSettings.uiLocale,
    ),
    [catalog.features, languageSettings.uiLocale],
  );
  const catalogSummary = useMemo(
    () => getBrowseCatalogSummary(catalog.features),
    [catalog.features],
  );
  const recommendedCountries = useMemo(() => {
    const withCityCount = countries.map((country) => ({
      country,
      cityCount: getDescendants(catalog.hierarchy, country.id).filter((feature) =>
        feature.featureType === 'city' || feature.featureType === 'town' || feature.featureType === 'village').length,
    }));
    return withCityCount
      .sort((left, right) => right.cityCount - left.cityCount
        || (right.country.population ?? 0) - (left.country.population ?? 0))
      .slice(0, 6)
      .map(({ country }) => country);
  }, [catalog.hierarchy, countries]);
  const capitalFeatures = useMemo(
    () => catalog.features.filter((feature) => hasCapitalMetadata(feature)),
    [catalog.features],
  );
  const capitalFeatureTypes = useMemo(
    () => [...new Set(capitalFeatures.map((feature) => feature.featureType))],
    [capitalFeatures],
  );
  const selectedPlace = selected && selected.featureType !== 'country' && selected.featureType !== 'continent'
    ? selected
    : null;
  // A map click can land on a real city, river, station, or other catalog
  // feature. Keep its canonical country/continent as the playable scope so a
  // selection never looks like it vanished from the route planner.
  const selectedRoot = findScopeRoot(selected, navigationPath);
  const selectedCountry = selectedRoot?.featureType === 'country' ? selectedRoot : null;
  const hasSelectedCountry = selectedCountry !== null;
  const scopeKind = selectedRoot ? scopeKindFor(selectedRoot) : 'world';
  const activeContinent = useMemo(() => {
    if (selectedRoot?.featureType === 'continent' && selectedRoot.id !== WORLD_SCOPE_FEATURE_ID) {
      return selectedRoot;
    }
    if (!selectedCountry) return null;
    const ancestorIds = new Set(selectedCountry.parentIds);
    return continents.find((continent) => ancestorIds.has(continent.id)) ?? null;
  }, [continents, selectedCountry, selectedRoot]);
  const descendants = useMemo(
    () => selectedRoot
      ? getDescendants(catalog.hierarchy, selectedRoot.id, { includeSelf: true })
      : [],
    [catalog.hierarchy, selectedRoot],
  );
  const availableTypes = useMemo(() => {
    const values: GeoFeatureType[] = [...new Set(
      descendants.map((feature) => feature.featureType),
    )];
    return values
      .filter((type) => type !== 'continent')
      .sort((left, right) =>
        getFeatureTypeLabel(left, selectedCountry?.countryCode).localeCompare(
          getFeatureTypeLabel(right, selectedCountry?.countryCode),
          'ko',
        ),
      );
  }, [descendants, selectedCountry?.countryCode]);
  const visibleCountries = useMemo(() => {
    if (searchQuery.trim()) {
      return countries.filter((feature) => countryMatchesSearch(feature, searchQuery));
    }
    if (!activeContinent) return [];
    return countries.filter((country) => country.parentIds.includes(activeContinent.id));
  }, [activeContinent, countries, searchQuery]);

  const selectedRootId = selectedRoot?.id ?? null;
  const selectedRootType = selectedRoot?.featureType ?? null;
  const availableTypesSignature = useMemo(
    () => getAvailableTypesSignature(availableTypes),
    [availableTypes],
  );

  useEffect(() => {
    const nextContext: IncludedTypesContext = {
      rootId: selectedRootId,
      availableTypesSignature,
    };
    const reconciliation = reconcileIncludedTypes(
      includedTypes,
      availableTypes,
      includedTypesContextRef.current,
      nextContext,
    );

    // Record the context even on the initial empty render. This gives the
    // next real selection a stable previous root to compare against.
    if (reconciliation.kind === 'skip') {
      if (!includedTypesContextRef.current) includedTypesContextRef.current = nextContext;
      return;
    }

    if (!selectedRootId || !selectedRootType) {
      if (includedTypes.length > 0) setIncludedTypes([]);
      if (preset !== null) setPreset(null);
      includedTypesContextRef.current = nextContext;
      return;
    }

    if (reconciliation.kind === 'preserve') {
      if (reconciliation.types.length !== includedTypes.length
        || reconciliation.types.some((type, index) => type !== includedTypes[index])) {
        setIncludedTypes(reconciliation.types);
      }
      includedTypesContextRef.current = nextContext;
      return;
    }

    setIncludedTypes(deriveDefaultIncludedTypes({
      preset: preset === 'cities' || preset === 'capitals' ? preset : null,
      scopeKind,
      selectedCountry: hasSelectedCountry,
      selectedRootType,
      availableTypes,
      capitalFeatureTypes,
    }));
    includedTypesContextRef.current = nextContext;
  }, [
    availableTypes,
    availableTypesSignature,
    capitalFeatureTypes,
    includedTypes,
    preset,
    scopeKind,
    hasSelectedCountry,
    selectedRootId,
    selectedRootType,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      goBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goBack]);

  const languageAvailability = useMemo(
    () => getTypingLanguageAvailability(
      scopeKind,
      selectedCountry?.countryCode,
      languageSettings.uiLocale,
    ),
    [languageSettings.uiLocale, scopeKind, selectedCountry?.countryCode],
  );
  const languageOptions = useMemo(
    () => visibleLanguageOptions(scopeKind, selectedCountry?.countryCode, languageAvailability),
    [languageAvailability, scopeKind, selectedCountry?.countryCode],
  );

  useEffect(() => {
    const current = languageOptions.find(
      (option) => option.typingLanguage === languageSettings.typingLanguage,
    );
    if (current?.enabled) return;
    const next = { ...languageSettings, typingLanguage: 'ko' as const };
    setLanguageSettings(next);
    saveBrowserLanguageSettings(next);
  }, [languageOptions, languageSettings]);

  const scope = useMemo(() => {
    if (!selectedRoot || includedTypes.length === 0) return null;
    return buildGameScope({
      rootFeatureId: selectedRoot.id,
      includedFeatureTypes: includedTypes,
      includeDescendants: true,
      questionCount,
      seed: sessionSeed,
      includeLandmarks: true,
      includeNaturalFeatures: true,
    });
  }, [includedTypes, questionCount, selectedRoot, sessionSeed]);
  const scopeFeatures = useMemo(() => {
    if (!scope) return [];
    const scoped = filterFeaturesForScope(catalog.features, { ...scope, questionCount: 'all' });
    if (preset === 'capitals' && capitalFeatures.length > 0) {
      const capitalIds = new Set(capitalFeatures.map((feature) => feature.id));
      return scoped.filter((feature) => capitalIds.has(feature.id));
    }
    return scoped;
  }, [capitalFeatures, catalog.features, preset, scope]);
  const languageEligibility = useMemo(
    () => resolveEligibleFeatures(scopeFeatures, languageSettings),
    [languageSettings, scopeFeatures],
  );
  const selectedPairs = useMemo(() => {
    const sorted = [...languageEligibility.eligible].sort((left, right) =>
      left.feature.id.localeCompare(right.feature.id),
    );
    const ordered = scope?.seed ? seededShuffle(sorted, scope.seed) : sorted;
    return scope?.questionCount === 'all'
      ? ordered
      : ordered.slice(0, scope?.questionCount ?? 0);
  }, [languageEligibility.eligible, scope?.questionCount, scope?.seed]);
  const candidates = useMemo(
    () => selectedPairs.map((pair) => pair.feature),
    [selectedPairs],
  );
  const resolvedAnswers = useMemo(
    () => Object.fromEntries(selectedPairs.map((pair) => [pair.feature.id, pair.answer])),
    [selectedPairs],
  );

  const updateLanguageSettings = (patch: Partial<LanguageSettings>) => {
    const next = { ...languageSettings, ...patch };
    setLanguageSettings(next);
    saveBrowserLanguageSettings(next);
  };
  const chooseFeature = (feature: GeoFeature) => {
    replaceNavigationPath(getBreadcrumb(catalog.hierarchy, feature.id));
  };
  const chooseCountry = (country: GeoFeature) => {
    chooseFeature(country);
    setSearchQuery('');
    setPreset(null);
  };
  const choosePreset = (nextPreset: Exclude<BrowsePreset, null>) => {
    if (nextPreset === 'world-10' && worldFeature) {
      setPreset(nextPreset);
      setQuestionCount(10);
      setIncludedTypes(['country']);
      chooseFeature(worldFeature);
      return;
    }
    if (nextPreset === 'cities' && selectedCountry) {
      setPreset(nextPreset);
      setQuestionCount(10);
      const cityTypes = availableTypes.filter((type) =>
        type === 'city' || type === 'town' || type === 'village',
      );
      setIncludedTypes(cityTypes.length > 0 ? cityTypes : ['country']);
      return;
    }
    if (nextPreset === 'capitals' && worldFeature && capitalFeatures.length > 0) {
      setPreset(nextPreset);
      setQuestionCount(10);
      const availableCapitalTypes = capitalFeatureTypes.filter((type) => type !== 'continent');
      setIncludedTypes(availableCapitalTypes.length > 0 ? availableCapitalTypes : ['country']);
      chooseFeature(worldFeature);
    }
  };
  const toggleType = (featureType: GeoFeatureType) => {
    setPreset(null);
    setIncludedTypes((current) => current.includes(featureType)
      ? current.filter((type) => type !== featureType)
      : [...current, featureType]);
  };
  const start = () => {
    if (!selectedRoot || !scope || candidates.length === 0) return;
    const answerLocales = new Set(selectedPairs.map((pair) => pair.answer.locale));
    const answerLocale = answerLocales.size === 1 ? [...answerLocales][0] : undefined;
    const session = createGameSession(selectedRoot, scope, catalog.manifest.catalogVersion, {
      languageSettings: { ...languageSettings },
      resolvedAnswers,
      languageDataVersion: LANGUAGE_DATA_VERSION,
      ...(answerLocale ? { answerLocale } : {}),
    });
    if (preset === 'capitals') {
      // Capital runs share the same geographic root as city runs. Keep their
      // leaderboard partition and result title explicit.
      session.id = `${session.id}:capitals`;
      session.titleKo = `세계 수도 · ${formatCount(candidates.length)}문제`;
    }
    onStart(session, candidates);
  };

  const selectedName = selectedPlace
    ? getFeatureDisplayName(selectedPlace, languageSettings.uiLocale)
    : selectedRoot
      ? getFeatureDisplayName(selectedRoot, languageSettings.uiLocale)
    : languageSettings.uiLocale === 'ko' ? '출발 지역을 선택하세요' : 'Choose a starting region';
  const selectedSubtitle = selectedRoot
    ? selectedPlace
      ? `${getFeatureDisplayName(selectedRoot, languageSettings.uiLocale)} · ${getFeatureTypeLabel(selectedPlace.featureType, selectedCountry?.countryCode)} 선택됨`
      : scopeKind === 'world'
        ? '모든 대륙 · 국가 단위 출제'
        : selectedCountry
          ? `${activeContinent ? getFeatureDisplayName(activeContinent, languageSettings.uiLocale) : '대륙 정보 없음'} · 세부 지명 선택 가능`
          : `${getFeatureDisplayName(selectedRoot, languageSettings.uiLocale)} · 국가 단위 출제`
    : '지구본을 돌려 찾거나 아래에서 빠르게 시작하세요';
  const candidateSummary = selectedRoot
    ? `${formatCount(languageEligibility.totalEligible)}개 출제 가능 · ${formatCount(candidates.length)}문제 선택됨`
    : '아직 출발 지역을 고르지 않았습니다';
  const cityCountForSelection = selectedCountry
    ? descendants.filter((feature) =>
      feature.featureType === 'city' || feature.featureType === 'town' || feature.featureType === 'village').length
    : catalogSummary.cityCount;

  return (
    <main className="browse-screen screen-layer geo-browse">
      <header className="browse-header geo-browse-header">
        <div className="game-brand geo-browse-brand">
          <span className="brand-mark small" aria-hidden="true"><i /></span>
          <div><strong>GeoType</strong><small>TYPE THE WORLD</small></div>
        </div>
        <div className="geo-browse-header-status">
          <span className="geo-map-state"><i aria-hidden="true" /> {mapProviderLabel(providerId)}</span>
          {debug && (
            <span className="map-runtime-status" data-testid="map-debug-status">
              <span className={visualQualityEligible ? 'is-live' : 'is-test'}>{providerId}</span>
              <strong>{catalog.features.length} / {catalog.manifest.totals.featureCount} features</strong>
              <small>{catalog.manifest.catalogVersion}</small>
            </span>
          )}
        </div>
      </header>

      <nav className="map-breadcrumb geo-browse-breadcrumb" aria-label="현재 지리 계층">
        <button type="button" onClick={() => resetSelection()}>세계</button>
        {breadcrumbs.filter((item) => item.id !== WORLD_SCOPE_FEATURE_ID).map((item) => (
          <span key={item.id}>
            <i aria-hidden="true">›</i>
            <button type="button" onClick={() => navigateToBreadcrumb(item.id)}>{item.label}</button>
          </span>
        ))}
      </nav>

      <aside
        className={`scope-panel hud-panel geo-browse-panel${selectedRoot ? ' has-selection' : ''}`}
        aria-label="게임 출발지 및 타이핑 설정"
      >
        <header className="geo-browse-panel-head">
          <div className="geo-browse-kicker"><span>01</span> ROUTE PLANNER</div>
          <div className="geo-browse-title-row">
            <div>
              <p className="eyebrow">지구본 위에서 고르는 타이핑 게임</p>
              <h1 data-testid="selected-country-name">{selectedName}</h1>
            </div>
            <span className={`geo-selection-orb${selectedRoot ? ' is-ready' : ''}`} aria-hidden="true"><i /></span>
          </div>
          <p className="selected-continent-name">{selectedSubtitle}</p>
        </header>

        <section className="geo-quick-start" aria-labelledby="quick-start-title">
          <div className="geo-section-heading">
            <div><span className="geo-section-index">A</span><h2 id="quick-start-title">바로 출발</h2></div>
            <span className="geo-section-note">지금 플레이 가능</span>
          </div>
          <div className="geo-preset-grid">
            <button
              type="button"
              className={`geo-preset geo-preset-featured${preset === 'world-10' ? ' is-selected' : ''}`}
              onClick={() => choosePreset('world-10')}
              disabled={!worldFeature || countries.length === 0}
              data-testid="quick-start-world"
            >
              <span className="geo-preset-icon" aria-hidden="true">◎</span>
              <span className="geo-preset-copy"><strong>세계 10개국</strong><small>가볍게 세계 일주 · {formatCount(catalogSummary.countryCount)}개 국가 중 10개</small></span>
              <b aria-hidden="true">↗</b>
            </button>
            <button
              type="button"
              className={`geo-preset${preset === 'cities' ? ' is-selected' : ''}`}
              onClick={() => choosePreset('cities')}
              disabled={!selectedCountry || cityCountForSelection === 0}
              title={selectedCountry ? undefined : '먼저 국가를 선택하세요'}
              data-testid="quick-start-cities"
            >
              <span className="geo-preset-icon" aria-hidden="true">⌁</span>
              <span className="geo-preset-copy"><strong>도시 탐험</strong><small>{selectedCountry ? `${formatCount(cityCountForSelection)}개 도시·마을 중 10개` : '국가 선택 후 이용 가능'}</small></span>
              <b aria-hidden="true">↗</b>
            </button>
            {capitalFeatures.length > 0 && (
              <button
                type="button"
                className={`geo-preset${preset === 'capitals' ? ' is-selected' : ''}`}
                onClick={() => choosePreset('capitals')}
                disabled={!worldFeature}
                data-testid="quick-start-capitals"
              >
                <span className="geo-preset-icon" aria-hidden="true">✦</span>
                <span className="geo-preset-copy"><strong>세계 수도</strong><small>{formatCount(capitalFeatures.length)}개 수도 중 10개</small></span>
                <b aria-hidden="true">↗</b>
              </button>
            )}
          </div>
        </section>

        <section className="geo-region-section" aria-labelledby="region-title">
          <div className="geo-section-heading">
            <div><span className="geo-section-index">B</span><h2 id="region-title">지역 선택</h2></div>
            <span className="geo-section-note">지도를 클릭해도 됩니다</span>
          </div>
          <div className="continent-grid geo-continent-grid" role="list">
            {worldFeature && (
              <button
                type="button"
                className={selectedRoot?.id === WORLD_SCOPE_FEATURE_ID ? 'is-selected' : ''}
                onClick={() => { setPreset(null); chooseFeature(worldFeature); }}
                data-scope-kind="world"
              >
                <span>세계</span><small>{formatCount(catalogSummary.countryCount)}국</small>
              </button>
            )}
            {continents.map((continent) => {
              const continentCountryCount = countries.filter((country) => country.parentIds.includes(continent.id)).length;
              return (
                <button
                  type="button"
                  key={continent.id}
                  className={continent.id === activeContinent?.id && !selectedCountry ? 'is-selected' : ''}
                  onClick={() => { setPreset(null); chooseFeature(continent); }}
                  data-continent-id={continent.id}
                >
                  <span>{getFeatureDisplayName(continent, languageSettings.uiLocale)}</span><small>{formatCount(continentCountryCount)}국</small>
                </button>
              );
            })}
          </div>

          {!selectedRoot && !searchQuery.trim() && (
            <div className="geo-popular-countries">
              <div className="geo-mini-heading"><span>추천 출발지</span><small>도시 데이터와 인기도를 기준으로 선택</small></div>
              <div className="geo-popular-list">
                {recommendedCountries.map((country) => (
                  <button
                    key={country.id}
                    type="button"
                    onClick={() => chooseCountry(country)}
                    onPointerEnter={() => setHoveredFeature(country)}
                    onPointerLeave={() => setHoveredFeature(null)}
                    data-country-id={country.id}
                  >
                    <span>{getFeatureDisplayName(country, languageSettings.uiLocale)}</span><small>{countryIsoLabel(country)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="country-search geo-country-search">
            <span>국가 검색</span>
            <div><span aria-hidden="true">⌕</span><input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="한국어, English, ISO 코드"
              autoComplete="off"
              spellCheck={false}
            /></div>
          </label>

          <div className="panel-heading country-list-heading geo-country-heading">
            <h2>{searchQuery.trim() ? '검색 결과' : activeContinent ? `${getFeatureDisplayName(activeContinent, languageSettings.uiLocale)} 국가` : '국가 목록'}</h2>
            <span>{visibleCountries.length || (searchQuery.trim() ? 0 : countries.length)}</span>
          </div>
          <div className="feature-list country-list geo-country-list" data-testid="country-list">
            {!activeContinent && !searchQuery.trim() && (
              <p className="empty-message geo-empty-message">대륙을 고르거나 검색하면 해당 국가를 볼 수 있습니다.</p>
            )}
            {visibleCountries.length === 0 && searchQuery.trim() && (
              <p className="empty-message geo-empty-message">검색 결과가 없습니다.</p>
            )}
            {visibleCountries.map((country) => (
              <button
                type="button"
                key={country.id}
                className={country.id === selectedCountry?.id ? 'is-selected' : ''}
                onClick={() => chooseCountry(country)}
                onPointerEnter={() => setHoveredFeature(country)}
                onPointerLeave={() => setHoveredFeature(null)}
                data-country-id={country.id}
              >
                <span>{getFeatureDisplayName(country, languageSettings.uiLocale)}</span>
                <small>{countryIsoLabel(country)}</small>
                <i aria-hidden="true">›</i>
              </button>
            ))}
          </div>
        </section>

        {selectedRoot && (
          <section className="scope-controls language-scope-controls geo-settings-section" aria-labelledby="language-title">
            <div className="geo-section-heading">
              <div><span className="geo-section-index">C</span><h2 id="language-title">플레이 설정</h2></div>
              <span className="geo-section-note">출제 가능 {formatCount(languageEligibility.totalEligible)}개</span>
            </div>
            <div className="language-settings-heading geo-language-heading">
              <div className="panel-heading"><h3>타이핑 언어</h3><span>{getTypingLanguageLabel(languageSettings.typingLanguage, languageSettings.uiLocale)}</span></div>
              <label className="ui-locale-select">화면
                <select
                  value={languageSettings.uiLocale}
                  onChange={(event) => updateLanguageSettings({ uiLocale: event.target.value as UiLocale })}
                  aria-label="UI 언어"
                >
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>

            <div className="language-option-grid geo-language-grid" role="radiogroup" aria-label="타이핑 언어">
              {languageOptions.map((option) => (
                <label
                  key={option.typingLanguage}
                  className={!option.enabled ? 'is-disabled' : ''}
                  title={option.reason}
                >
                  <input
                    type="radio"
                    name="typing-language"
                    value={option.typingLanguage}
                    checked={languageSettings.typingLanguage === option.typingLanguage}
                    disabled={!option.enabled}
                    onChange={() => updateLanguageSettings({ typingLanguage: option.typingLanguage })}
                  />
                  <span>{getTypingLanguageLabel(option.typingLanguage, languageSettings.uiLocale)}</span>
                  {!option.enabled && option.reason && <small>{option.reason}</small>}
                </label>
              ))}
            </div>

            <fieldset className="answer-policy-fieldset geo-policy-fieldset">
              <legend>정답 판정</legend>
              {(['strict', 'casual'] as const).map((policy) => (
                <label key={policy}>
                  <input
                    type="radio"
                    name="answer-policy"
                    value={policy}
                    checked={languageSettings.answerPolicy === policy}
                    onChange={() => updateLanguageSettings({ answerPolicy: policy })}
                  />
                  <span>
                    <strong>{getAnswerPolicyLabel(policy, languageSettings.uiLocale)}</strong>
                    <small>{answerPolicyDescription(policy)}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className={`language-eligibility geo-eligibility${languageEligibility.totalEligible === 0 ? ' is-empty' : ''}`} role="status">
              <strong>{getTypingLanguageLabel(languageSettings.typingLanguage, languageSettings.uiLocale)}로 {formatCount(languageEligibility.totalEligible)}개 출제 가능</strong>
              <span>{candidateSummary} · 전체 {formatCount(languageEligibility.total)}개 중 {formatCount(languageEligibility.excluded)}개 제외</span>
              {languageEligibility.totalEligible === 0 && (
                <>
                  <p>선택한 언어의 검증된 지명이 이 지역에 없습니다.</p>
                  <button type="button" onClick={() => updateLanguageSettings({ typingLanguage: 'ko' })}>한국어로 변경</button>
                </>
              )}
            </div>

            {availableTypes.length > 1 && (
              <fieldset className="geo-type-fieldset">
                <legend>출제할 지명 종류</legend>
                <div className="type-chip-grid">
                  {availableTypes.map((type) => (
                    <label key={type}>
                      <input type="checkbox" checked={includedTypes.includes(type)} onChange={() => toggleType(type)} />
                      <span>{getFeatureTypeLabel(type, selectedCountry?.countryCode)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="scope-row geo-scope-row">
              <label>문제 수
                <select value={questionCount} onChange={(event) => setQuestionCount(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
                  <option value="3">3</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="all">전체</option>
                </select>
              </label>
              <label>난이도
                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyId)} data-testid="difficulty-select">
                  {Object.keys(DIFFICULTIES).map((id) => (
                    <option key={id} value={id}>{getDifficultyMenuLabel(id as DifficultyId)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="preference-row geo-preference-row">
              <span className="geo-silent-note" role="note"><i aria-hidden="true">♪</i><span><strong>사운드 없음</strong><small>현재 버전은 무음으로 플레이됩니다</small></span></span>
              <button type="button" className="preference-toggle" aria-pressed={reducedMotion} onClick={toggleReducedMotion}>모션 감소 {reducedMotion ? '켬' : '끔'}</button>
            </div>
          </section>
        )}

        <div className="start-settings-summary geo-start-summary" aria-live="polite">
          <span>언어 <strong>{getTypingLanguageLabel(languageSettings.typingLanguage, languageSettings.uiLocale)}</strong></span>
          <span>판정 <strong>{getAnswerPolicyLabel(languageSettings.answerPolicy, languageSettings.uiLocale)}</strong></span>
          <span>난이도 <strong>{getDifficultyMenuLabel(difficulty)}</strong></span>
        </div>

        <footer className="scope-actions geo-scope-actions">
          <button type="button" className="button ghost" disabled={!selectedRoot} onClick={goBack}>상위 단계</button>
          <button type="button" className="button ghost" disabled={!selectedRoot} onClick={() => resetSelection()}>선택 취소</button>
          <button type="button" className="button primary geo-start-button" disabled={!selectedRoot || candidates.length === 0} onClick={start} data-testid="start-game">
            <span>{selectedRoot ? `${formatCount(candidates.length)}문제 시작` : '출발 지역 선택'}</span><b aria-hidden="true">↗</b>
          </button>
        </footer>

        {debug && !visualQualityEligible && (
          <div className="test-provider-warning" role="status">
            <strong>DEV TEST RENDERER</strong>
            <span>기능 검사용 지도입니다. 실제 지도 품질 검수에는 사용할 수 없습니다.</span>
          </div>
        )}
      </aside>

      <div className="map-help geo-map-help" aria-label="지도 조작 안내">
        <span><b>드래그</b> 지구 회전</span>
        <span><b>휠/핀치</b> 확대</span>
        <span><b>클릭</b> 지역 선택</span>
        <span><b>ESC</b> 뒤로</span>
      </div>
      <div className="geo-map-caption" aria-hidden="true"><span>EARTH / DISCOVER</span><i /></div>
    </main>
  );
}
