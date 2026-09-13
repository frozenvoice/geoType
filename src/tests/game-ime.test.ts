import { describe, expect, it } from 'vitest';

import {
  createTypingInputState,
  reduceTypingInput,
} from '../game/engine/imeInput';

const target = { nameKo: '서울', aliases: ['서울특별시'] } as const;

describe('Korean IME input decisions', () => {
  it('does not judge intermediate input or Enter during composition', () => {
    let reduction = reduceTypingInput(
      createTypingInputState(),
      { type: 'composition-start' },
      target,
    );
    reduction = reduceTypingInput(
      reduction.state,
      { type: 'composition-update', value: '서' },
      target,
    );
    expect(reduction.judgment).toBeNull();

    reduction = reduceTypingInput(
      reduction.state,
      { type: 'input', value: '서울' },
      target,
    );
    expect(reduction.judgment).toBeNull();

    reduction = reduceTypingInput(
      reduction.state,
      { type: 'submit' },
      target,
    );
    expect(reduction.judgment).toBeNull();
  });

  it('checks an exact answer only after compositionend', () => {
    const composing = reduceTypingInput(
      createTypingInputState(),
      { type: 'composition-start' },
      target,
    ).state;
    const reduction = reduceTypingInput(
      composing,
      { type: 'composition-end', value: '서울' },
      target,
    );

    expect(reduction.state.isComposing).toBe(false);
    expect(reduction.judgment).toEqual({
      outcome: 'correct',
      submittedValue: '서울',
    });
  });

  it('auto-accepts aliases but marks only an explicit wrong submit as miss', () => {
    let reduction = reduceTypingInput(
      createTypingInputState(),
      { type: 'input', value: '서울특별시' },
      target,
    );
    expect(reduction.judgment?.outcome).toBe('correct');

    reduction = reduceTypingInput(
      createTypingInputState(),
      { type: 'input', value: '부산' },
      target,
    );
    expect(reduction.judgment).toBeNull();
    reduction = reduceTypingInput(reduction.state, { type: 'submit' }, target);
    expect(reduction.judgment).toEqual({
      outcome: 'miss',
      submittedValue: '부산',
    });
  });
});
