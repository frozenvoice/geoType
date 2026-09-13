import type { GeoFeature } from './types';

export type HierarchyIndex = {
  readonly featuresById: ReadonlyMap<string, GeoFeature>;
  readonly childrenByParentId: ReadonlyMap<string, readonly GeoFeature[]>;
  readonly parentIdsByChildId: ReadonlyMap<string, readonly string[]>;
};

export type HierarchyIssue = {
  code: 'duplicate-id' | 'missing-parent' | 'cycle';
  featureId: string;
  relatedFeatureId?: string;
  message: string;
};

export function buildHierarchyIndex(features: readonly GeoFeature[]): HierarchyIndex {
  const featuresById = new Map<string, GeoFeature>();
  const childrenByParentId = new Map<string, GeoFeature[]>();
  const parentIdsByChildId = new Map<string, readonly string[]>();

  for (const feature of features) {
    featuresById.set(feature.id, feature);
    parentIdsByChildId.set(feature.id, feature.parentIds);

    for (const parentId of feature.parentIds) {
      const children = childrenByParentId.get(parentId) ?? [];
      children.push(feature);
      childrenByParentId.set(parentId, children);
    }
  }

  return { featuresById, childrenByParentId, parentIdsByChildId };
}

export function getChildren(index: HierarchyIndex, featureId: string): GeoFeature[] {
  return [...(index.childrenByParentId.get(featureId) ?? [])];
}

/** Returns unique ancestors breadth-first: immediate parents before grandparents. */
export function getAncestors(index: HierarchyIndex, featureId: string): GeoFeature[] {
  const result: GeoFeature[] = [];
  const visited = new Set<string>([featureId]);
  const queue = [...(index.parentIdsByChildId.get(featureId) ?? [])];

  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId || visited.has(parentId)) continue;
    visited.add(parentId);

    const parent = index.featuresById.get(parentId);
    if (!parent) continue;
    result.push(parent);
    queue.push(...parent.parentIds);
  }

  return result;
}

/**
 * Returns a deterministic canonical breadcrumb. Data can have multiple parents;
 * the first parent id is the catalog's canonical navigation parent.
 */
export function getBreadcrumb(index: HierarchyIndex, featureId: string): GeoFeature[] {
  const feature = index.featuresById.get(featureId);
  if (!feature) return [];

  const breadcrumb = [feature];
  const visited = new Set<string>([featureId]);
  let current = feature;

  while (current.parentIds[0]) {
    const parentId = current.parentIds[0];
    if (visited.has(parentId)) break;
    visited.add(parentId);

    const parent = index.featuresById.get(parentId);
    if (!parent) break;
    breadcrumb.unshift(parent);
    current = parent;
  }

  return breadcrumb;
}

export function getDescendants(
  index: HierarchyIndex,
  featureId: string,
  options: { includeSelf?: boolean } = {},
): GeoFeature[] {
  const result: GeoFeature[] = [];
  const visited = new Set<string>();
  const queue = options.includeSelf ? [featureId] : getChildren(index, featureId).map((item) => item.id);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);

    const current = index.featuresById.get(currentId);
    if (!current) continue;
    result.push(current);
    queue.push(...getChildren(index, currentId).map((child) => child.id));
  }

  return result;
}

export function validateHierarchy(features: readonly GeoFeature[]): HierarchyIssue[] {
  const issues: HierarchyIssue[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    if (seen.has(feature.id)) {
      issues.push({
        code: 'duplicate-id',
        featureId: feature.id,
        message: `Duplicate feature id: ${feature.id}`,
      });
    }
    seen.add(feature.id);
  }

  const index = buildHierarchyIndex(features);
  for (const feature of features) {
    for (const parentId of feature.parentIds) {
      if (!index.featuresById.has(parentId)) {
        issues.push({
          code: 'missing-parent',
          featureId: feature.id,
          relatedFeatureId: parentId,
          message: `${feature.id} references missing parent ${parentId}.`,
        });
      }
    }
  }

  const permanentlyVisited = new Set<string>();
  const activePath = new Set<string>();

  const visit = (featureId: string): void => {
    if (permanentlyVisited.has(featureId)) return;
    if (activePath.has(featureId)) return;

    activePath.add(featureId);
    const feature = index.featuresById.get(featureId);
    for (const parentId of feature?.parentIds ?? []) {
      if (activePath.has(parentId)) {
        issues.push({
          code: 'cycle',
          featureId,
          relatedFeatureId: parentId,
          message: `Hierarchy cycle connects ${featureId} to ${parentId}.`,
        });
        continue;
      }
      if (index.featuresById.has(parentId)) visit(parentId);
    }
    activePath.delete(featureId);
    permanentlyVisited.add(featureId);
  };

  for (const feature of features) visit(feature.id);
  return issues;
}
