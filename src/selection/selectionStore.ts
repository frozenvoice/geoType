import { create } from 'zustand';

import type { GeoFeature } from '../geodata/types';
import { getFeatureDisplayName } from './featureLabels';
import type { SelectionBreadcrumb } from './types';

export type SelectionStore = {
  selectedFeature: GeoFeature | null;
  hoveredFeature: GeoFeature | null;
  navigationPath: readonly GeoFeature[];
  breadcrumbs: readonly SelectionBreadcrumb[];
  selectFeature: (feature: GeoFeature | null) => void;
  setHoveredFeature: (feature: GeoFeature | null) => void;
  drillDown: (feature: GeoFeature, ancestorPath?: readonly GeoFeature[]) => void;
  replaceNavigationPath: (features: readonly GeoFeature[]) => void;
  navigateToBreadcrumb: (featureId: string) => void;
  goBack: () => void;
  resetSelection: (rootFeature?: GeoFeature | null) => void;
};

function uniquePath(features: readonly GeoFeature[]): GeoFeature[] {
  const seen = new Set<string>();
  return features.filter((feature) => {
    if (seen.has(feature.id)) return false;
    seen.add(feature.id);
    return true;
  });
}

function createBreadcrumbs(features: readonly GeoFeature[]): SelectionBreadcrumb[] {
  return features.map((feature) => ({
    id: feature.id,
    label: getFeatureDisplayName(feature),
    featureType: feature.featureType,
    countryCode: feature.countryCode,
  }));
}

function pathState(features: readonly GeoFeature[]) {
  const navigationPath = uniquePath(features);
  return {
    navigationPath,
    breadcrumbs: createBreadcrumbs(navigationPath),
    selectedFeature: navigationPath.at(-1) ?? null,
  };
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedFeature: null,
  hoveredFeature: null,
  navigationPath: [],
  breadcrumbs: [],

  selectFeature: (feature) => {
    set({ selectedFeature: feature });
  },

  setHoveredFeature: (feature) => {
    set({ hoveredFeature: feature });
  },

  drillDown: (feature, ancestorPath) => {
    const currentPath = get().navigationPath;
    const existingIndex = currentPath.findIndex((item) => item.id === feature.id);
    if (existingIndex >= 0) {
      set(pathState(currentPath.slice(0, existingIndex + 1)));
      return;
    }

    const nextPath = ancestorPath === undefined
      ? [...currentPath, feature]
      : [...ancestorPath, feature];
    set(pathState(nextPath));
  },

  replaceNavigationPath: (features) => {
    set(pathState(features));
  },

  navigateToBreadcrumb: (featureId) => {
    const currentPath = get().navigationPath;
    const index = currentPath.findIndex((feature) => feature.id === featureId);
    if (index >= 0) set(pathState(currentPath.slice(0, index + 1)));
  },

  goBack: () => {
    set((state) => pathState(state.navigationPath.slice(0, -1)));
  },

  resetSelection: (rootFeature = null) => {
    set({
      ...pathState(rootFeature === null ? [] : [rootFeature]),
      hoveredFeature: null,
    });
  },
}));

// The hook also exposes getState/subscribe, so non-React map controllers and
// React tree controls can share exactly the same selection source of truth.
export const selectionStore = useSelectionStore;
