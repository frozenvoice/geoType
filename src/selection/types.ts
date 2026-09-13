import type { GeoFeature, GeoFeatureType } from '../geodata/types';

export type SelectionBreadcrumb = {
  id: string;
  label: string;
  featureType: GeoFeatureType;
  countryCode?: string | undefined;
};

export type SelectionPath = {
  features: readonly GeoFeature[];
  breadcrumbs: readonly SelectionBreadcrumb[];
};

export type FeatureEligibilityContext = {
  zoom: number;
  parentFeatureType?: GeoFeatureType | undefined;
  minImportance?: number | undefined;
};

export type FeatureEligibilityCollectionContext = FeatureEligibilityContext & {
  features?: readonly GeoFeature[] | undefined;
};
