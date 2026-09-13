import { describe, expect, it } from 'vitest';

import {
  gameMachineReducer,
  initialGameMachineState,
  type GameMachineState,
} from '../game/engine/gameMachine';

function enterPlaying(questionIds = ['seoul', 'busan']): GameMachineState {
  let state = gameMachineReducer(initialGameMachineState, {
    type: 'START_GAME',
    questionIds,
  });
  state = gameMachineReducer(state, { type: 'LOAD_COMPLETE' });
  state = gameMachineReducer(state, {
    type: 'CAMERA_ARRIVED',
    transitionId: state.transitionId,
  });
  return gameMachineReducer(state, {
    type: 'INPUT_READY',
    transitionId: state.transitionId,
  });
}

describe('game state machine', () => {
  it('moves through loading, flying, ready, and playing in order', () => {
    const loading = gameMachineReducer(initialGameMachineState, {
      type: 'START_GAME',
      questionIds: ['seoul'],
    });
    expect(loading.phase).toBe('loading');

    const flying = gameMachineReducer(loading, { type: 'LOAD_COMPLETE' });
    expect(flying.phase).toBe('flying');
    expect(flying.activeQuestionId).toBe('seoul');

    const stale = gameMachineReducer(flying, {
      type: 'CAMERA_ARRIVED',
      transitionId: flying.transitionId - 1,
    });
    expect(stale).toBe(flying);

    const ready = gameMachineReducer(flying, {
      type: 'CAMERA_ARRIVED',
      transitionId: flying.transitionId,
    });
    expect(ready.phase).toBe('ready');

    const playing = gameMachineReducer(ready, {
      type: 'INPUT_READY',
      transitionId: ready.transitionId,
    });
    expect(playing.phase).toBe('playing');
  });

  it('accepts exactly one judgment for the active question', () => {
    const playing = enterPlaying();
    const resolved = gameMachineReducer(playing, {
      type: 'JUDGE',
      questionId: 'seoul',
      outcome: 'correct',
    });
    expect(resolved.phase).toBe('resolving-correct');
    expect(resolved.judgedQuestionId).toBe('seoul');

    const duplicate = gameMachineReducer(resolved, {
      type: 'JUDGE',
      questionId: 'seoul',
      outcome: 'timeout',
    });
    expect(duplicate).toBe(resolved);

    const wrongQuestion = gameMachineReducer(playing, {
      type: 'JUDGE',
      questionId: 'busan',
      outcome: 'miss',
    });
    expect(wrongQuestion).toBe(playing);
  });

  it('advances once after resolution and finishes after the final question', () => {
    let state = enterPlaying();
    state = gameMachineReducer(state, {
      type: 'JUDGE',
      questionId: 'seoul',
      outcome: 'miss',
    });
    expect(state.phase).toBe('resolving-miss');
    state = gameMachineReducer(state, {
      type: 'RESOLUTION_COMPLETE',
      questionId: 'seoul',
    });
    expect(state.phase).toBe('flying');
    expect(state.activeQuestionId).toBe('busan');
    expect(state.currentQuestionIndex).toBe(1);

    state = gameMachineReducer(state, {
      type: 'CAMERA_ARRIVED',
      transitionId: state.transitionId,
    });
    state = gameMachineReducer(state, {
      type: 'INPUT_READY',
      transitionId: state.transitionId,
    });
    state = gameMachineReducer(state, {
      type: 'JUDGE',
      questionId: 'busan',
      outcome: 'timeout',
    });
    state = gameMachineReducer(state, {
      type: 'RESOLUTION_COMPLETE',
      questionId: 'busan',
    });
    expect(state.phase).toBe('finished');
    expect(state.activeQuestionId).toBeNull();
  });

  it('pauses and returns to the exact resumable phase', () => {
    const playing = enterPlaying(['seoul']);
    const paused = gameMachineReducer(playing, { type: 'PAUSE' });
    expect(paused).toMatchObject({ phase: 'paused', pausedFrom: 'playing' });
    const resumed = gameMachineReducer(paused, { type: 'RESUME' });
    expect(resumed).toMatchObject({ phase: 'playing', pausedFrom: null });
  });
});
