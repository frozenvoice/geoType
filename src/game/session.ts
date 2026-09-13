import type { GeoFeature } from '../geodata/types';
import {
  DEFAULT_LANGUAGE_SETTINGS as DEFAULT_SETTINGS,
  LANGUAGE_DATA_VERSION as CURRENT_LANGUAGE_DATA_VERSION,
  type LanguageSettings,
  type ResolvedAnswer,
} from '../language';
import type { GameScope } from './scope';

export const LANGUAGE_DATA_VERSION = CURRENT_LANGUAGE_DATA_VERSION;
export const DEFAULT_LANGUAGE_SETTINGS: Readonly<LanguageSettings> = DEFAULT_SETTINGS;

/** A leaderboard-compatible description generated from the user's map scope. */
export type GameSession = {
  id: string;
  titleKo: string;
  dataVersion: string;
  root: GeoFeature;
  scope: GameScope;
  languageSettings: LanguageSettings;
  resolvedAnswers: Readonly<Record<string, ResolvedAnswer>>;
  languageDataVersion: string;
  answerLocale?: string;
};

export type CreateGameSessionOptions = {
  languageSettings?: LanguageSettings;
  resolvedAnswers?: Readonly<Record<string, ResolvedAnswer>>;
  languageDataVersion?: string;
  answerLocale?: string;
};

export function createGameSession(
  root: GeoFeature,
  scope: GameScope,
  dataVersion: string,
  options: CreateGameSessionOptions = {},
): GameSession {
  const types = [...scope.includedFeatureTypes].sort().join(',');
  const filters = [
    scope.includeDescendants ? 'desc' : 'self',
    scope.questionCount,
    scope.minPopulation ?? 0,
    scope.minImportance ?? 0,
    scope.includeLandmarks ? 'landmarks' : 'no-landmarks',
    scope.includeNaturalFeatures ? 'natural' : 'no-natural',
  ].join(':');

  const session: GameSession = {
    id: `scope:${root.id}:${types}:${filters}`,
    titleKo: `${root.localizedNames.ko ?? root.name} · 맞춤 범위`,
    dataVersion,
    root,
    scope,
    languageSettings: options.languageSettings ?? DEFAULT_LANGUAGE_SETTINGS,
    resolvedAnswers: options.resolvedAnswers ?? {},
    languageDataVersion: options.languageDataVersion ?? LANGUAGE_DATA_VERSION,
  };
  if (options.answerLocale) session.answerLocale = options.answerLocale;
  return session;
}
