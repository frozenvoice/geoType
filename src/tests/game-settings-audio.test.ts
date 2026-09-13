import { afterEach, describe, expect, it, vi } from 'vitest';

import { GameAudio, type GameAudioBackend } from '../audio/gameAudio';
import {
  LEGACY_SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
} from '../game/store/settings';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('sound preference stabilization', () => {
  it('defaults sound to OFF while honoring reduced-motion preference', () => {
    const settings = loadSettings(new MemoryStorage(), true);

    expect(settings).toEqual({ muted: true, reducedMotion: true });
  });

  it('migrates a legacy sound-ON value to v2 with sound OFF', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SETTINGS_STORAGE_KEY, JSON.stringify({
      muted: false,
      reducedMotion: true,
    }));

    expect(loadSettings(storage)).toEqual({ muted: true, reducedMotion: true });
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '')).toEqual({
      muted: true,
      reducedMotion: true,
      soundVersion: 2,
    });
  });

  it('preserves an explicit v2 choice and writes only the current sound version', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { muted: false, reducedMotion: false });

    expect(loadSettings(storage)).toEqual({ muted: false, reducedMotion: false });
    expect(storage.getItem(LEGACY_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '')).toMatchObject({
      muted: false,
      soundVersion: 2,
    });
  });

  it('falls back to sound OFF when stored settings are damaged', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, '{not-json');

    expect(loadSettings(storage)).toEqual({ muted: true, reducedMotion: false });
  });
});

describe('game audio boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is muted by default and delegates named cues only after opt-in', () => {
    const play = vi.fn();
    const dispose = vi.fn();
    const backend: GameAudioBackend = {
      play,
      dispose,
    };
    const audio = new GameAudio(backend);

    audio.playStart();
    audio.playCorrect();
    audio.playMiss();
    expect(play).not.toHaveBeenCalled();

    audio.setMuted(false);
    audio.playStart();
    audio.playCorrect();
    audio.playMiss();
    audio.playUiClick();
    expect(play).toHaveBeenNthCalledWith(1, 'game-start');
    expect(play).toHaveBeenNthCalledWith(2, 'correct');
    expect(play).toHaveBeenNthCalledWith(3, 'miss');
    expect(play).toHaveBeenNthCalledWith(4, 'ui-click');

    audio.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('uses no Web Audio oscillator even when the current setting is ON', () => {
    const audioContext = vi.fn();
    vi.stubGlobal('AudioContext', audioContext);
    const audio = new GameAudio();

    audio.setMuted(false);
    audio.playStart();
    audio.playCorrect();
    audio.playMiss();

    expect(audioContext).not.toHaveBeenCalled();
  });
});
