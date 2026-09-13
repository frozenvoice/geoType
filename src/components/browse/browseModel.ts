import type { GeoFeature, GeoFeatureType } from '../../geodata';

type FeatureWithMetadata = GeoFeature & {
  categories?: string[];
  isCapital?: boolean;
  capital?: boolean;
};

export type BrowseCatalogSummary = {
  countryCount: number;
  cityCount: number;
  capitalCount: number;
  featureTypeCounts: Readonly<Partial<Record<GeoFeatureType, number>>>;
};

export type IncludedTypesContext = {
  rootId: string | null;
  availableTypesSignature: string;
};

export type IncludedTypesReconciliation =
  | { kind: 'skip' }
  | { kind: 'preserve'; types: GeoFeatureType[] }
  | { kind: 'derive' };

/**
 * A catalog can be expanded asynchronously and React can receive a fresh
 * object for the same selected feature. Keep those updates distinct from a
 * genuine scope change so a user's type checkboxes are not silently reset.
 */
export function getAvailableTypesSignature(types: readonly GeoFeatureType[]): string {
  return [...new Set(types)].sort().join('|');
}

export function reconcileIncludedTypes(
  currentTypes: readonly GeoFeatureType[],
  availableTypes: readonly GeoFeatureType[],
  previousContext: IncludedTypesContext | null,
  nextContext: IncludedTypesContext,
): IncludedTypesReconciliation {
  if (
    previousContext
    && previousContext.rootId === nextContext.rootId
    && previousContext.availableTypesSignature === nextContext.availableTypesSignature
  ) {
    return { kind: 'skip' };
  }

  // A catalog update for the same root should only prune selections that are
  // no longer available. It must never replace a valid manual selection with
  // the scope's default list.
  if (previousContext?.rootId === nextContext.rootId) {
    const available = new Set(availableTypes);
    const preserved = currentTypes.filter((type) => available.has(type));
    if (preserved.length > 0) return { kind: 'preserve', types: preserved };
  }

  return { kind: 'derive' };
}

export function deriveDefaultIncludedTypes(options: {
  preset: 'cities' | 'capitals' | null;
  scopeKind: 'world' | 'continent' | 'country' | 'subnational';
  selectedCountry: boolean;
  selectedRootType: GeoFeatureType;
  availableTypes: readonly GeoFeatureType[];
  capitalFeatureTypes: readonly GeoFeatureType[];
}): GeoFeatureType[] {
  const {
    preset,
    scopeKind,
    selectedCountry,
    selectedRootType,
    availableTypes,
    capitalFeatureTypes,
  } = options;

  if (preset === 'cities' && selectedCountry) {
    const cityTypes = availableTypes.filter((type) =>
      type === 'city' || type === 'town' || type === 'village',
    );
    return cityTypes.length > 0 ? cityTypes : ['country'];
  }
  if (preset === 'capitals') {
    const availableCapitalTypes = availableTypes.filter((type) => capitalFeatureTypes.includes(type));
    return availableCapitalTypes.length > 0 ? availableCapitalTypes : ['country'];
  }
  if (scopeKind === 'world' || scopeKind === 'continent') return ['country'];

  const preferredTypes: GeoFeatureType[] = [
    'admin1', 'admin2', 'city', 'town', 'village', 'neighborhood',
    'station', 'landmark', 'mountain', 'river', 'lake', 'road', 'poi',
  ];
  const childTypes = availableTypes.filter((type) => type !== selectedRootType);
  const preferred = childTypes.filter((type) => preferredTypes.includes(type));
  const next = (preferred.length > 0 ? preferred : childTypes).slice(0, 6);
  return next.length > 0 ? next : ['country'];
}

export function hasCapitalMetadata(feature: GeoFeature): boolean {
  const candidate = feature as FeatureWithMetadata;
  return candidate.isCapital === true
    || candidate.capital === true
    || candidate.categories?.includes('capital') === true;
}

/** Counts are derived from the loaded catalog so presets never advertise
 * content that is not actually available to the game. */
export function getBrowseCatalogSummary(features: readonly GeoFeature[]): BrowseCatalogSummary {
  const featureTypeCounts: Partial<Record<GeoFeatureType, number>> = {};
  for (const feature of features) {
    featureTypeCounts[feature.featureType] = (featureTypeCounts[feature.featureType] ?? 0) + 1;
  }
  return {
    countryCount: featureTypeCounts.country ?? 0,
    cityCount: (featureTypeCounts.city ?? 0) + (featureTypeCounts.town ?? 0) + (featureTypeCounts.village ?? 0),
    capitalCount: features.filter(hasCapitalMetadata).length,
    featureTypeCounts,
  };
}

/** Map hit-testing can select a city or natural feature. Resolve that hit to
 * the nearest playable country/continent while preserving the clicked place
 * for the route planner copy. */
export function findScopeRoot(
  selected: GeoFeature | null,
  navigationPath: readonly GeoFeature[],
): GeoFeature | null {
  if (selected?.featureType === 'country' || selected?.featureType === 'continent') {
    return selected;
  }
  return [...navigationPath].reverse().find((feature) =>
    feature.featureType === 'country' || feature.featureType === 'continent',
  ) ?? null;
}
