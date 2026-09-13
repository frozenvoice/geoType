import { z } from 'zod';

import type { GeoFeature, GeoFeatureType } from '../../geodata/types';

export const GAME_SCOPE_FEATURE_TYPES = [
  'continent',
  'country',
  'admin1',
  'admin2',
  'city',
  'town',
  'village',
  'neighborhood',
  'station',
  'landmark',
  'mountain',
  'river',
  'lake',
  'road',
  'poi',
] as const satisfies readonly GeoFeatureType[];

export const NATURAL_FEATURE_TYPES = [
  'mountain',
  'river',
  'lake',
] as const satisfies readonly GeoFeatureType[];

export const LANDMARK_FEATURE_TYPES = [
  'station',
  'landmark',
  'poi',
] as const satisfies readonly GeoFeatureType[];

const POPULATED_FEATURE_TYPES = new Set<GeoFeatureType>([
  'country',
  'admin1',
  'admin2',
  'city',
  'town',
  'village',
  'neighborhood',
]);

const naturalFeatureTypes = new Set<GeoFeatureType>(NATURAL_FEATURE_TYPES);
const landmarkFeatureTypes = new Set<GeoFeatureType>(LANDMARK_FEATURE_TYPES);

export const gameScopeSchema = z
  .object({
    rootFeatureId: z.string().trim().min(1).max(240),
    includedFeatureTypes: z.array(z.enum(GAME_SCOPE_FEATURE_TYPES)).min(1),
    includeDescendants: z.boolean().default(true),
    questionCount: z.union([
      z.literal('all'),
      z.number().int().positive().max(10_000),
    ]),
    seed: z.string().trim().min(1).max(240).optional(),
    minPopulation: z.number().int().nonnegative().optional(),
    minImportance: z.number().finite().min(0).max(1).optional(),
    includeNaturalFeatures: z.boolean().default(true),
    includeLandmarks: z.boolean().default(true),
  })
  .strict();

export type GameScope = z.infer<typeof gameScopeSchema>;
export type GameScopeInput = z.input<typeof gameScopeSchema>;

function normalizeScopeInput(input: GameScopeInput): GameScopeInput {
  const normalized: GameScopeInput = {
    ...input,
    rootFeatureId: input.rootFeatureId.normalize('NFC').trim(),
    includedFeatureTypes: [...new Set(input.includedFeatureTypes)],
  };

  if (input.seed !== undefined) {
    normalized.seed = input.seed.normalize('NFC').trim();
  }
  return normalized;
}

export function buildGameScope(input: GameScopeInput): GameScope {
  return gameScopeSchema.parse(normalizeScopeInput(input));
}

type MutableScopeInput = {
  rootFeatureId: string;
  includedFeatureTypes: GeoFeatureType[];
  includeDescendants?: boolean | undefined;
  questionCount: number | 'all';
  seed?: string | undefined;
  minPopulation?: number | undefined;
  minImportance?: number | undefined;
  includeNaturalFeatures?: boolean | undefined;
  includeLandmarks?: boolean | undefined;
};

export class GameScopeBuilder {
  readonly #input: MutableScopeInput;

  constructor(rootFeatureId: string) {
    this.#input = {
      rootFeatureId,
      includedFeatureTypes: ['country'],
      questionCount: 'all',
    };
  }

  includeTypes(...featureTypes: GeoFeatureType[]): this {
    this.#input.includedFeatureTypes = [...new Set(featureTypes)];
    return this;
  }

  includeDescendants(include = true): this {
    this.#input.includeDescendants = include;
    return this;
  }

  questions(count: number | 'all'): this {
    this.#input.questionCount = count;
    return this;
  }

  seededBy(seed: string | undefined): this {
    if (seed === undefined) delete this.#input.seed;
    else this.#input.seed = seed;
    return this;
  }

  withMinimumPopulation(population: number | undefined): this {
    if (population === undefined) delete this.#input.minPopulation;
    else this.#input.minPopulation = population;
    return this;
  }

  withMinimumImportance(importance: number | undefined): this {
    if (importance === undefined) delete this.#input.minImportance;
    else this.#input.minImportance = importance;
    return this;
  }

  withNaturalFeatures(include = true): this {
    this.#input.includeNaturalFeatures = include;
    return this;
  }

  withLandmarks(include = true): this {
    this.#input.includeLandmarks = include;
    return this;
  }

  build(): GameScope {
    return buildGameScope(this.#input);
  }
}

function uniqueFeatures(features: readonly GeoFeature[]): GeoFeature[] {
  const seenIds = new Set<string>();
  const unique: GeoFeature[] = [];
  for (const feature of features) {
    if (seenIds.has(feature.id)) continue;
    seenIds.add(feature.id);
    unique.push(feature);
  }
  return unique;
}

function collectDescendantIds(
  features: readonly GeoFeature[],
  rootFeatureId: string,
): Set<string> {
  const includedIds = new Set<string>([rootFeatureId]);
  const childrenByParentId = new Map<string, GeoFeature[]>();
  for (const feature of features) {
    for (const parentId of feature.parentIds) {
      const children = childrenByParentId.get(parentId) ?? [];
      children.push(feature);
      childrenByParentId.set(parentId, children);
    }
  }

  // parentIds can contain either a direct parent or the complete ancestry.
  // An adjacency walk supports both forms while remaining linear in catalog size.
  const pendingParentIds = [rootFeatureId];
  for (let index = 0; index < pendingParentIds.length; index += 1) {
    const parentId = pendingParentIds[index];
    if (parentId === undefined) continue;
    for (const child of childrenByParentId.get(parentId) ?? []) {
      if (includedIds.has(child.id)) continue;
      includedIds.add(child.id);
      pendingParentIds.push(child.id);
    }
  }

  return includedIds;
}

export function isFeatureAllowedByScopeFilters(
  feature: GeoFeature,
  scope: GameScope,
): boolean {
  if (!scope.includedFeatureTypes.includes(feature.featureType)) return false;
  if (!scope.includeNaturalFeatures && naturalFeatureTypes.has(feature.featureType)) {
    return false;
  }
  if (!scope.includeLandmarks && landmarkFeatureTypes.has(feature.featureType)) {
    return false;
  }
  if (
    scope.minPopulation !== undefined &&
    POPULATED_FEATURE_TYPES.has(feature.featureType) &&
    (feature.population ?? 0) < scope.minPopulation
  ) {
    return false;
  }
  if (
    scope.minImportance !== undefined &&
    (feature.importance ?? 0) < scope.minImportance
  ) {
    return false;
  }
  return true;
}

export function filterFeaturesForScope(
  features: readonly GeoFeature[],
  scopeInput: GameScope | GameScopeInput,
): GeoFeature[] {
  const scope = buildGameScope(scopeInput);
  const deduplicated = uniqueFeatures(features);
  const allowedIds = scope.includeDescendants
    ? collectDescendantIds(deduplicated, scope.rootFeatureId)
    : new Set([scope.rootFeatureId]);

  return deduplicated.filter(
    (feature) =>
      allowedIds.has(feature.id) && isFeatureAllowedByScopeFilters(feature, scope),
  );
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed.normalize('NFC'));
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const result = [...values];
  const random = createSeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

export function selectGameScopeFeatures(
  features: readonly GeoFeature[],
  scopeInput: GameScope | GameScopeInput,
): GeoFeature[] {
  const scope = buildGameScope(scopeInput);
  const candidates = filterFeaturesForScope(features, scope).sort((left, right) => {
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });
  const ordered = scope.seed === undefined
    ? candidates
    : seededShuffle(candidates, scope.seed);

  return scope.questionCount === 'all'
    ? ordered
    : ordered.slice(0, scope.questionCount);
}
