export type GamePhase =
  | 'menu'
  | 'loading'
  | 'flying'
  | 'ready'
  | 'playing'
  | 'resolving-correct'
  | 'resolving-miss'
  | 'paused'
  | 'finished';

export type JudgmentOutcome = 'correct' | 'miss' | 'timeout';
export type ResumableGamePhase = 'flying' | 'ready' | 'playing';

export interface QuestionResolution {
  readonly questionId: string;
  readonly outcome: JudgmentOutcome;
}

export interface GameMachineState {
  readonly phase: GamePhase;
  readonly questionIds: readonly string[];
  readonly currentQuestionIndex: number;
  readonly activeQuestionId: string | null;
  readonly transitionId: number;
  readonly judgedQuestionId: string | null;
  readonly resolution: QuestionResolution | null;
  readonly pausedFrom: ResumableGamePhase | null;
}

export type GameMachineAction =
  | { readonly type: 'START_GAME'; readonly questionIds: readonly string[] }
  | { readonly type: 'LOAD_COMPLETE' }
  | { readonly type: 'CAMERA_ARRIVED'; readonly transitionId: number }
  | { readonly type: 'INPUT_READY'; readonly transitionId: number }
  | {
      readonly type: 'JUDGE';
      readonly questionId: string;
      readonly outcome: JudgmentOutcome;
    }
  | { readonly type: 'RESOLUTION_COMPLETE'; readonly questionId: string }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'FINISH' }
  | { readonly type: 'RETURN_TO_MENU' };

export const initialGameMachineState: GameMachineState = {
  phase: 'menu',
  questionIds: [],
  currentQuestionIndex: -1,
  activeQuestionId: null,
  transitionId: 0,
  judgedQuestionId: null,
  resolution: null,
  pausedFrom: null,
};

export const ALLOWED_ACTIONS_BY_PHASE = {
  menu: ['START_GAME', 'RETURN_TO_MENU'],
  loading: ['LOAD_COMPLETE', 'FINISH', 'RETURN_TO_MENU'],
  flying: ['CAMERA_ARRIVED', 'PAUSE', 'FINISH', 'RETURN_TO_MENU'],
  ready: ['INPUT_READY', 'PAUSE', 'FINISH', 'RETURN_TO_MENU'],
  playing: ['JUDGE', 'PAUSE', 'FINISH', 'RETURN_TO_MENU'],
  'resolving-correct': [
    'RESOLUTION_COMPLETE',
    'FINISH',
    'RETURN_TO_MENU',
  ],
  'resolving-miss': [
    'RESOLUTION_COMPLETE',
    'FINISH',
    'RETURN_TO_MENU',
  ],
  paused: ['RESUME', 'FINISH', 'RETURN_TO_MENU'],
  finished: ['START_GAME', 'RETURN_TO_MENU'],
} as const satisfies Record<GamePhase, readonly GameMachineAction['type'][]>;

function canPause(phase: GamePhase): phase is ResumableGamePhase {
  return phase === 'flying' || phase === 'ready' || phase === 'playing';
}

function startNextQuestion(
  state: GameMachineState,
  nextQuestionIndex: number,
): GameMachineState {
  const questionId = state.questionIds[nextQuestionIndex];
  if (questionId === undefined) {
    return {
      ...state,
      phase: 'finished',
      activeQuestionId: null,
      judgedQuestionId: null,
      resolution: null,
      pausedFrom: null,
    };
  }

  return {
    ...state,
    phase: 'flying',
    currentQuestionIndex: nextQuestionIndex,
    activeQuestionId: questionId,
    transitionId: state.transitionId + 1,
    judgedQuestionId: null,
    resolution: null,
    pausedFrom: null,
  };
}

export function gameMachineReducer(
  state: GameMachineState,
  action: GameMachineAction,
): GameMachineState {
  if (action.type === 'RETURN_TO_MENU') {
    return {
      ...initialGameMachineState,
      transitionId: state.transitionId + 1,
    };
  }

  if (action.type === 'FINISH') {
    if (state.phase === 'menu' || state.phase === 'finished') {
      return state;
    }
    return {
      ...state,
      phase: 'finished',
      activeQuestionId: null,
      pausedFrom: null,
    };
  }

  switch (action.type) {
    case 'START_GAME':
      if (state.phase !== 'menu' && state.phase !== 'finished') {
        return state;
      }
      return {
        phase: 'loading',
        questionIds: [...action.questionIds],
        currentQuestionIndex: 0,
        activeQuestionId: action.questionIds[0] ?? null,
        transitionId: state.transitionId + 1,
        judgedQuestionId: null,
        resolution: null,
        pausedFrom: null,
      };
    case 'LOAD_COMPLETE':
      if (state.phase !== 'loading') {
        return state;
      }
      return startNextQuestion(state, 0);
    case 'CAMERA_ARRIVED':
      if (
        state.phase !== 'flying' ||
        action.transitionId !== state.transitionId
      ) {
        return state;
      }
      return { ...state, phase: 'ready' };
    case 'INPUT_READY':
      if (
        state.phase !== 'ready' ||
        action.transitionId !== state.transitionId
      ) {
        return state;
      }
      return { ...state, phase: 'playing' };
    case 'JUDGE':
      if (
        state.phase !== 'playing' ||
        state.activeQuestionId !== action.questionId ||
        state.judgedQuestionId !== null
      ) {
        return state;
      }
      return {
        ...state,
        phase:
          action.outcome === 'correct'
            ? 'resolving-correct'
            : 'resolving-miss',
        judgedQuestionId: action.questionId,
        resolution: {
          questionId: action.questionId,
          outcome: action.outcome,
        },
      };
    case 'RESOLUTION_COMPLETE':
      if (
        (state.phase !== 'resolving-correct' &&
          state.phase !== 'resolving-miss') ||
        state.judgedQuestionId !== action.questionId
      ) {
        return state;
      }
      return startNextQuestion(state, state.currentQuestionIndex + 1);
    case 'PAUSE':
      if (!canPause(state.phase)) {
        return state;
      }
      return { ...state, phase: 'paused', pausedFrom: state.phase };
    case 'RESUME':
      if (state.phase !== 'paused' || state.pausedFrom === null) {
        return state;
      }
      return { ...state, phase: state.pausedFrom, pausedFrom: null };
  }
}
