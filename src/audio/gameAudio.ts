export type GameAudioCue = 'game-start' | 'correct' | 'miss' | 'ui-click';

/**
 * Playback boundary for a future file-backed sound pack. The stabilization
 * build deliberately ships with the silent backend below.
 */
export interface GameAudioBackend {
  play(cue: GameAudioCue): void;
  dispose(): void;
}

export class SilentGameAudioBackend implements GameAudioBackend {
  play(): void {
    // Intentionally silent. Synthesized Web Audio effects were removed.
  }

  dispose(): void {
    // Nothing to release.
  }
}

export class GameAudio {
  private muted = true;

  constructor(private readonly backend: GameAudioBackend = new SilentGameAudioBackend()) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  playStart(): void {
    this.play('game-start');
  }

  playCorrect(): void {
    this.play('correct');
  }

  playMiss(): void {
    this.play('miss');
  }

  playUiClick(): void {
    this.play('ui-click');
  }

  private play(cue: GameAudioCue): void {
    if (!this.muted) this.backend.play(cue);
  }

  dispose(): void {
    this.backend.dispose();
  }
}
