import type { ZodIssue } from 'zod';

import { validateHierarchy } from './hierarchy';
import { GeoFeatureSchema } from './schemas';
import type { GeoFeature } from './types';

export type GeoCatalogIssue = {
  code: 'invalid-feature' | 'duplicate-id' | 'missing-parent' | 'cycle';
  featureId: string;
  message: string;
  path?: string;
};

function zodIssuePath(issue: ZodIssue): string | undefined {
  return issue.path.length > 0 ? issue.path.join('.') : undefined;
}

export function validateGeoCatalog(features: readonly GeoFeature[]): GeoCatalogIssue[] {
  const issues: GeoCatalogIssue[] = [];

  for (const feature of features) {
    const result = GeoFeatureSchema.safeParse(feature);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = zodIssuePath(issue);
        issues.push({
          code: 'invalid-feature',
          featureId: feature.id,
          message: issue.message,
          ...(path ? { path } : {}),
        });
      }
    }
  }

  issues.push(...validateHierarchy(features));
  return issues;
}

export function assertValidGeoCatalog(features: readonly GeoFeature[]): void {
  const issues = validateGeoCatalog(features);
  if (issues.length === 0) return;

  const detail = issues
    .map((issue) => `${issue.featureId}${issue.path ? `.${issue.path}` : ''}: ${issue.message}`)
    .join('\n');
  throw new Error(`Geo catalog validation failed:\n${detail}`);
}
