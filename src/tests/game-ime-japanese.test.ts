import { describe, expect, it } from 'vitest';

import {
  createTypingInputState,
  reduceTypingInput,
} from '../game/engine/imeInput';
import {
  resolveAnswer,
  type LanguageNamedFeature,
  type LanguageSettings,
  type ResolvedAnswer,
} from '../language';

const japan: LanguageNamedFeature = {
  countryCode: 'JP',
  names: [
    {
      locale: 'ja',
      script: 'Hani',
      value: '日本',
      kind: 'official',
      isPreferred: true,
    },
    {
      locale: 'ja',
      script: 'Hira',
      value: 'にほん',
      kind: 'reading',
      isPreferred: true,
    },
  ],
};

function answerFor(typingLanguage: 'ja-kanji' | 'ja-reading'): ResolvedAnswer {
  const settings: LanguageSettings = {
    uiLocale: 'ko',
    typingLanguage,
    answerPolicy: 'strict',
  };
  const answer = resolveAnswer(japan, settings);
  if (!answer) throw new Error(`Expected a ${typingLanguage} answer fixture`);
  return answer;
}

describe('Japanese IME input decisions', () => {
  it('ignores exact intermediate text and Enter until kanji composition ends', () => {
    const answer = answerFor('ja-kanji');
    let reduction = reduceTypingInput(
      createTypingInputState(),
      { type: 'composition-start' },
      answer,
    );

    reduction = reduceTypingInput(
      reduction.state,
      { type: 'composition-update', value: 'にほん' },
      answer,
    );
    expect(reduction.judgment).toBeNull();

    // Browsers can emit input with the converted value before compositionend.
    reduction = reduceTypingInput(
      reduction.state,
      { type: 'input', value: '日本' },
      answer,
    );
    expect(reduction.state.isComposing).toBe(true);
    expect(reduction.judgment).toBeNull();

    reduction = reduceTypingInput(reduction.state, { type: 'submit' }, answer);
    expect(reduction.judgment).toBeNull();

    reduction = reduceTypingInput(
      reduction.state,
      { type: 'composition-end', value: '日本' },
      answer,
    );
    expect(reduction.state.isComposing).toBe(false);
    expect(reduction.judgment).toEqual({
      outcome: 'correct',
      submittedValue: '日本',
    });
  });

  it('accepts a katakana reading for a hiragana target only after compositionend', () => {
    const answer = answerFor('ja-reading');
    expect(answer.target).toBe('にほん');
    expect(answer.acceptedAnswers).toEqual(['にほん']);

    let reduction = reduceTypingInput(
      createTypingInputState(),
      { type: 'composition-start' },
      answer,
    );
    reduction = reduceTypingInput(
      reduction.state,
      { type: 'composition-update', value: 'ニホン' },
      answer,
    );
    expect(reduction.judgment).toBeNull();

    reduction = reduceTypingInput(reduction.state, { type: 'submit' }, answer);
    expect(reduction.judgment).toBeNull();

    reduction = reduceTypingInput(
      reduction.state,
      { type: 'composition-end', value: 'ニホン' },
      answer,
    );
    expect(reduction.judgment).toEqual({
      outcome: 'correct',
      submittedValue: 'ニホン',
    });
  });
});
