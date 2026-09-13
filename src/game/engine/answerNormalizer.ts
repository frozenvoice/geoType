import {
  isResolvedAnswerAccepted,
  type ResolvedAnswer,
} from '../../language';

const WHITESPACE_PATTERN = /\s+/gu;

export interface LegacyAnswerTarget {
  readonly nameKo?: string;
  readonly name?: string;
  readonly localizedNames?: Readonly<Record<string, string>>;
  readonly aliases?: readonly string[];
}

export type AnswerTarget = LegacyAnswerTarget | ResolvedAnswer;

function isResolvedAnswer(target: AnswerTarget): target is ResolvedAnswer {
  return 'target' in target && 'acceptedAnswers' in target && 'typingLanguage' in target;
}

export function getAnswerName(target: AnswerTarget): string {
  if (isResolvedAnswer(target)) return target.target;
  return target.nameKo ?? target.localizedNames?.ko ?? target.name ?? '';
}

/**
 * Produces the comparison form used by the game without changing the value
 * displayed to the player.
 */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(WHITESPACE_PATTERN, ' ')
    .toLocaleLowerCase('en-US');
}

export function getAcceptedAnswers(
  nameKo: string,
  aliases: readonly string[] = [],
): ReadonlySet<string> {
  return new Set(
    [nameKo, ...aliases]
      .map(normalizeAnswer)
      .filter((answer) => answer.length > 0),
  );
}

export function isAcceptedAnswer(
  input: string,
  nameKo: string,
  aliases?: readonly string[],
): boolean;
export function isAcceptedAnswer(input: string, target: AnswerTarget): boolean;
export function isAcceptedAnswer(
  input: string,
  targetOrName: string | AnswerTarget,
  aliases: readonly string[] = [],
): boolean {
  const target =
    typeof targetOrName === 'string'
      ? { nameKo: targetOrName, aliases }
      : targetOrName;
  if (isResolvedAnswer(target)) {
    return isResolvedAnswerAccepted(input, target);
  }
  const normalizedInput = normalizeAnswer(input);

  if (normalizedInput.length === 0) {
    return false;
  }

  return getAcceptedAnswers(getAnswerName(target), target.aliases).has(normalizedInput);
}
