import {
  isAcceptedAnswer,
  type AnswerTarget,
} from './answerNormalizer';

export interface TypingInputState {
  readonly value: string;
  readonly compositionValue: string;
  readonly isComposing: boolean;
}

export type TypingInputEvent =
  | { readonly type: 'input'; readonly value: string }
  | { readonly type: 'composition-start' }
  | { readonly type: 'composition-update'; readonly value: string }
  | { readonly type: 'composition-end'; readonly value: string }
  | { readonly type: 'submit' }
  | { readonly type: 'reset' };

export type InputJudgment =
  | { readonly outcome: 'correct'; readonly submittedValue: string }
  | { readonly outcome: 'miss'; readonly submittedValue: string };

export interface TypingInputReduction {
  readonly state: TypingInputState;
  readonly judgment: InputJudgment | null;
}

export function createTypingInputState(): TypingInputState {
  return {
    value: '',
    compositionValue: '',
    isComposing: false,
  };
}

function automaticJudgment(
  state: TypingInputState,
  target: AnswerTarget,
): InputJudgment | null {
  return isAcceptedAnswer(state.value, target)
    ? { outcome: 'correct', submittedValue: state.value }
    : null;
}

export function reduceTypingInput(
  state: TypingInputState,
  event: TypingInputEvent,
  target: AnswerTarget,
): TypingInputReduction {
  switch (event.type) {
    case 'reset':
      return { state: createTypingInputState(), judgment: null };
    case 'composition-start':
      return {
        state: { ...state, isComposing: true },
        judgment: null,
      };
    case 'composition-update':
      return {
        state: {
          ...state,
          value: event.value,
          compositionValue: event.value,
          isComposing: true,
        },
        judgment: null,
      };
    case 'composition-end': {
      const nextState: TypingInputState = {
        value: event.value,
        compositionValue: '',
        isComposing: false,
      };
      return {
        state: nextState,
        judgment: automaticJudgment(nextState, target),
      };
    }
    case 'input': {
      const nextState: TypingInputState = {
        ...state,
        value: event.value,
      };
      return {
        state: nextState,
        judgment: state.isComposing
          ? null
          : automaticJudgment(nextState, target),
      };
    }
    case 'submit':
      if (state.isComposing) {
        return { state, judgment: null };
      }
      return {
        state,
        judgment: {
          outcome: isAcceptedAnswer(state.value, target) ? 'correct' : 'miss',
          submittedValue: state.value,
        },
      };
  }
}
