import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { GameAudio } from '../../audio/gameAudio';
import { DIFFICULTIES } from '../../game/config/difficulties';
import {
  getCorrectPrefixRevealableCount,
  getNextHintRevealCount,
  getRevealableGraphemeCount,
  isAutoRevealedGrapheme,
  segmentGraphemes,
} from '../../game/engine/hints';
import { createTypingInputState, reduceTypingInput, type InputJudgment, type TypingInputEvent } from '../../game/engine/imeInput';
import { selectCurrentFeature, useGameStore } from '../../game/store/gameStore';
import type { TypingLanguage, UiLocale } from '../../language';
import { getFeatureTypeLabel } from '../../selection';
import { Modal } from '../common/Modal';
import '../../styles/game.css';

type GameScreenProps = {
  audio: GameAudio;
};

const MAX_INPUT_FOCUS_ATTEMPTS = 6;

function formatTimer(milliseconds: number) {
  return (Math.max(0, milliseconds) / 1000).toFixed(1);
}

function typingLanguageHudLabel(language: TypingLanguage, locale: UiLocale) {
  const labels: Record<UiLocale, Record<TypingLanguage, string>> = {
    ko: {
      ko: '한국어 입력',
      en: 'English 입력',
      native: '현지어 입력',
      romanized: '로마자 입력',
      'ja-kanji': '日本語・漢字',
      'ja-reading': '日本語・読み',
    },
    en: {
      ko: 'Korean input',
      en: 'English input',
      native: 'Native language',
      romanized: 'Romanized input',
      'ja-kanji': 'Japanese · Kanji',
      'ja-reading': 'Japanese · Reading',
    },
  };
  return labels[locale][language];
}

type GameCopy = {
  mission: string;
  progress: string;
  score: string;
  streak: string;
  soundOn: string;
  mute: string;
  pause: string;
  paused: string;
  manualHint: string;
  manualHintHelp: string;
  expertHintHelp: string;
  skip: string;
  moving: string;
  ready: string;
  typing: string;
  correct: string;
  timeout: string;
  wrong: string;
  targetHint: string;
  hintAria: string;
  targetInput: string;
  movingPlaceholder: string;
  readyPlaceholder: string;
  typingPlaceholder: string;
  enter: string;
  instruction: string;
  correctVerdict: string;
  timeoutVerdict: string;
  wrongVerdict: string;
  correctAnnouncement: string;
  timeoutAnnouncement: string;
  wrongAnnouncement: string;
  paste: string;
  pauseTitle: string;
  pauseEyebrow: string;
  welcomeBack: string;
  pausedVisibility: string;
  pausedManual: string;
  continue: string;
  abandon: string;
  missingTitle: string;
  missingMessage: string;
  backToMenu: string;
};

const GAME_COPY: Record<UiLocale, GameCopy> = {
  ko: {
    mission: '현재 임무', progress: '진행 상황', score: '점수', streak: '연속 정답', soundOn: '사운드 켜기', mute: '음소거', pause: '일시 정지', paused: '일시 정지', manualHint: '힌트 한 글자 · −150점', manualHintHelp: '힌트 한 글자를 공개하면 150점이 차감됩니다.', expertHintHelp: '전문가 난이도는 자동 힌트가 없으며, 필요할 때만 수동 힌트를 사용할 수 있습니다.', skip: '정답 보고 넘기기',
    moving: '위치 이동 중', ready: '입력 준비', typing: '입력 중', correct: '정답 확인', timeout: '시간 종료', wrong: '오답 확인', targetHint: '목표 지명 · 힌트', hintAria: '힌트', targetInput: '목표 지명 입력', movingPlaceholder: '목표 위치로 이동 중…', readyPlaceholder: '입력 준비 중…', typingPlaceholder: '지명을 입력하세요', enter: 'ENTER ↵', instruction: '정답은 자동으로 판정됩니다. 틀린 답을 제출하려면 Enter를 누르세요.', correctVerdict: '정답입니다', timeoutVerdict: '시간이 끝났습니다', wrongVerdict: '오답입니다', correctAnnouncement: '정답입니다.', timeoutAnnouncement: '시간이 종료되었습니다.', wrongAnnouncement: '오답입니다.', paste: '붙여넣기는 사용할 수 없습니다. 직접 입력해 주세요.', pauseTitle: '항해 일시 정지', pauseEyebrow: '잠시 멈춤', welcomeBack: '돌아오셨군요', pausedVisibility: '탭을 벗어난 동안 타이머를 안전하게 멈췄습니다.', pausedManual: '타이머와 지도 이동을 잠시 멈췄습니다.', continue: '항해 계속하기', abandon: '임무 포기하고 메뉴로', missingTitle: '이 지명의 언어 데이터를 확인할 수 없습니다.', missingMessage: '지원되는 타이핑 언어를 다시 선택해 주세요.', backToMenu: '메뉴로 돌아가기',
  },
  en: {
    mission: 'Current mission', progress: 'Mission progress', score: 'Score', streak: 'Streak', soundOn: 'Turn sound on', mute: 'Mute sound', pause: 'Pause', paused: 'Paused', manualHint: 'Reveal one letter · −150 pts', manualHintHelp: 'Revealing one letter removes 150 points.', expertHintHelp: 'Expert has no automatic hints; use a manual hint only when you choose to spend the points.', skip: 'Show answer and continue', moving: 'Moving to location', ready: 'Ready to type', typing: 'Typing', correct: 'Correct', timeout: 'Time expired', wrong: 'Incorrect', targetHint: 'Target place · hints', hintAria: 'Hints', targetInput: 'Target place input', movingPlaceholder: 'Moving to the target…', readyPlaceholder: 'Preparing input…', typingPlaceholder: 'Type the place name', enter: 'ENTER ↵', instruction: 'Correct answers are scored automatically. Press Enter to submit an incorrect answer.', correctVerdict: 'Correct answer', timeoutVerdict: 'Time expired', wrongVerdict: 'Incorrect answer', correctAnnouncement: 'Correct answer.', timeoutAnnouncement: 'Time expired.', wrongAnnouncement: 'Incorrect answer.', paste: 'Pasting is disabled. Please type the answer.', pauseTitle: 'Expedition paused', pauseEyebrow: 'Paused', welcomeBack: 'Welcome back', pausedVisibility: 'The timer was safely paused while you were away.', pausedManual: 'The timer and map movement are paused.', continue: 'Continue expedition', abandon: 'Leave expedition for menu', missingTitle: 'Language data is unavailable for this place.', missingMessage: 'Choose another typing language to continue.', backToMenu: 'Back to menu',
  },
};

export function GameScreen({ audio }: GameScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const typingStateRef = useRef(createTypingInputState());
  const resolutionKeyRef = useRef('');
  const [input, setInput] = useState('');
  const [revealedCount, setRevealedCount] = useState(0);
  const [activityTick, setActivityTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const phase = useGameStore((state) => state.phase);
  const activeSession = useGameStore((state) => state.activeSession);
  const currentIndex = useGameStore((state) => state.currentIndex);
  const total = useGameStore((state) => state.features.length);
  const current = useGameStore(selectCurrentFeature);
  const difficultyId = useGameStore((state) => state.difficulty);
  const remainingMs = useGameStore((state) => state.remainingMs);
  const score = useGameStore((state) => state.score);
  const streak = useGameStore((state) => state.streak);
  const currentHints = useGameStore((state) => state.currentHints);
  const muted = useGameStore((state) => state.muted);
  const reducedMotion = useGameStore((state) => state.reducedMotion);
  const timeScale = useGameStore((state) => state.timeScale);
  const resumeNotice = useGameStore((state) => state.resumeNotice);
  const lastMissReason = useGameStore((state) => state.lastMissReason);
  const startQuestion = useGameStore((state) => state.startQuestion);
  const tick = useGameStore((state) => state.tick);
  const registerHint = useGameStore((state) => state.useHint);
  const resolveQuestion = useGameStore((state) => state.resolveQuestion);
  const advanceQuestion = useGameStore((state) => state.advanceQuestion);
  const pause = useGameStore((state) => state.pause);
  const resume = useGameStore((state) => state.resume);
  const backToMenu = useGameStore((state) => state.backToMenu);

  const difficulty = DIFFICULTIES[difficultyId];
  const uiLocale = activeSession?.languageSettings.uiLocale ?? 'ko';
  const copy = GAME_COPY[uiLocale];
  const missionTitle = activeSession
    ? uiLocale === 'ko'
      ? activeSession.titleKo
      : `${activeSession.root.localizedNames.en ?? activeSession.root.name} · mission`
    : '';
  const resolvedAnswer = current ? activeSession?.resolvedAnswers[current.id] ?? null : null;
  const answerName = resolvedAnswer?.target ?? '';
  const isResolving = phase === 'resolving-correct' || phase === 'resolving-miss';
  const deviceMemory = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowVisualQuality = typeof window !== 'undefined' && (window.innerWidth < 720 || navigator.hardwareConcurrency <= 4 || (deviceMemory !== undefined && deviceMemory <= 4));
  const particleCount = lowVisualQuality ? 5 : 10;
  const timerRatio = Math.min(1, remainingMs / Math.max(1, difficulty.timeLimitMs * timeScale));
  const answerLength = getRevealableGraphemeCount(answerName);
  const manualHintHelp = difficultyId === 'expert' ? copy.expertHintHelp : copy.manualHintHelp;
  const mask = useMemo(() => {
    if (!current) return [];
    const visibleCount = Math.max(revealedCount, getCorrectPrefixRevealableCount(answerName, input));
    let revealableIndex = 0;
    return segmentGraphemes(answerName).map((segment) => {
      if (isAutoRevealedGrapheme(segment)) return { segment, visible: true };
      const visible = revealableIndex < visibleCount;
      revealableIndex += 1;
      return { segment, visible };
    });
  }, [answerName, current, input, revealedCount]);

  const recordActivity = useCallback(() => setActivityTick((value) => value + 1), []);

  const applyTypingEvent = useCallback((event: TypingInputEvent) => {
    if (!resolvedAnswer) return null;
    const reduction = reduceTypingInput(typingStateRef.current, event, resolvedAnswer);
    typingStateRef.current = reduction.state;
    setInput(reduction.state.value);
    return reduction.judgment;
  }, [resolvedAnswer]);

  const applyJudgment = useCallback((judgment: InputJudgment | null) => {
    if (!judgment || phase !== 'playing') return false;
    return resolveQuestion(judgment.outcome);
  }, [phase, resolveQuestion]);

  const revealManualHint = useCallback(() => {
    if (!answerName || useGameStore.getState().phase !== 'playing') return;
    const next = getNextHintRevealCount(answerName, input, revealedCount);
    if (next <= revealedCount) return;
    setRevealedCount(next);
    registerHint();
    recordActivity();
  }, [answerName, input, recordActivity, registerHint, revealedCount]);

  const skipQuestion = useCallback(() => {
    if (useGameStore.getState().phase !== 'playing') return;
    resolveQuestion('miss');
  }, [resolveQuestion]);

  const startIfInputFocused = useCallback(() => {
    if (useGameStore.getState().phase !== 'ready') return false;
    if (!inputRef.current || document.activeElement !== inputRef.current) return false;
    startQuestion();
    return true;
  }, [startQuestion]);

  useEffect(() => {
    setInput('');
    setRevealedCount(0);
    setActivityTick((value) => value + 1);
    typingStateRef.current = createTypingInputState();
  }, [current?.id]);

  useEffect(() => {
    if (phase !== 'ready') return;
    let frame: number | null = null;
    let attempts = 0;
    let cancelled = false;

    const focusAndStart = () => {
      frame = null;
      if (cancelled || useGameStore.getState().phase !== 'ready') return;

      const input = inputRef.current;
      if (input && !input.disabled) {
        try {
          input.focus({ preventScroll: true });
        } catch {
          // Some embedded browsers can reject programmatic focus; retry on a later frame.
        }
        if (useGameStore.getState().phase !== 'ready' || startIfInputFocused()) return;
      }

      attempts += 1;
      if (attempts < MAX_INPUT_FOCUS_ATTEMPTS) {
        frame = window.requestAnimationFrame(focusAndStart);
      }
    };

    frame = window.requestAnimationFrame(focusAndStart);
    return () => {
      cancelled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [phase, startIfInputFocused]);

  useEffect(() => {
    if (phase !== 'playing' || !resolvedAnswer || !typingStateRef.current.value) return;
    const reduction = reduceTypingInput(
      typingStateRef.current,
      { type: 'input', value: typingStateRef.current.value },
      resolvedAnswer,
    );
    typingStateRef.current = reduction.state;
    if (reduction.judgment?.outcome === 'correct') resolveQuestion('correct');
  }, [phase, resolveQuestion, resolvedAnswer]);

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    const update = (now: number) => {
      const next = tick(now);
      if (next <= 0) {
        resolveQuestion('timeout', now);
        return;
      }
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [phase, resolveQuestion, tick]);

  useEffect(() => {
    if (phase !== 'playing' || !current || difficulty.firstHintMs === null || difficulty.hintIntervalMs === null) return;
    if (revealedCount >= answerLength) return;
    const baseDelay = currentHints === 0 ? difficulty.firstHintMs : difficulty.hintIntervalMs;
    const delay = Math.max(120, baseDelay * timeScale);
    const timeout = window.setTimeout(() => {
      const next = getNextHintRevealCount(answerName, input, revealedCount);
      if (next > revealedCount) {
        setRevealedCount(next);
        registerHint();
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [activityTick, answerLength, answerName, current, currentHints, difficulty.firstHintMs, difficulty.hintIntervalMs, input, phase, registerHint, revealedCount, timeScale]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateViewport = () => {
      document.documentElement.style.setProperty('--visual-viewport-height', `${viewport.height}px`);
    };
    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    return () => {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
      document.documentElement.style.removeProperty('--visual-viewport-height');
    };
  }, []);

  useEffect(() => {
    audio.setMuted(muted);
  }, [audio, muted]);

  useEffect(() => {
    if (!isResolving || !current) return;
    const key = `${current.id}:${phase}`;
    if (resolutionKeyRef.current !== key) {
      resolutionKeyRef.current = key;
      if (phase === 'resolving-correct') audio.playCorrect();
      else audio.playMiss();
    }
    const timeout = window.setTimeout(() => advanceQuestion(), reducedMotion ? 360 : phase === 'resolving-correct' ? 920 : 820);
    return () => window.clearTimeout(timeout);
  }, [advanceQuestion, audio, current, isResolving, phase, reducedMotion]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) pause(true);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      if (useGameStore.getState().phase === 'paused') resume();
      else pause(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('keydown', handleKey);
    };
  }, [pause, resume]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const onInput = (event: FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    recordActivity();
    applyJudgment(applyTypingEvent({ type: 'input', value }));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const native = event.nativeEvent;
    if (typingStateRef.current.isComposing || native.isComposing || native.keyCode === 229) return;
    event.preventDefault();
    applyJudgment(applyTypingEvent({ type: 'submit' }));
  };

  if (!current || !activeSession) return null;
  if (!resolvedAnswer) {
    return (
      <main className="game-screen screen-layer language-answer-error" role="alert">
        <section className="hud-panel">
          <h1>{copy.missingTitle}</h1>
          <p>{copy.missingMessage}</p>
          <button type="button" className="button primary" onClick={backToMenu}>{copy.backToMenu}</button>
        </section>
      </main>
    );
  }

  return (
    <main className={`game-screen screen-layer phase-${phase}`}>
      <header className="game-topbar">
        <div className="game-brand"><span className="brand-mark small" aria-hidden="true"><i /></span><strong>GeoType</strong><small>{uiLocale === 'ko' ? '진행 중' : 'IN PROGRESS'}</small></div>
        <div className="mission-readout">
          <span className="eyebrow">{copy.mission}</span>
          <strong>{missionTitle}</strong>
          <small className="typing-language-chip" data-testid="typing-language-hud">
            {typingLanguageHudLabel(activeSession.languageSettings.typingLanguage, uiLocale)}
          </small>
        </div>
        <div className="hud-actions">
          <button className="icon-button" type="button" onClick={() => pause(false)} aria-label={copy.pause}>Ⅱ</button>
        </div>
      </header>

      <section className="game-progress" aria-label={copy.progress}>
        <div className="game-progress-heading">
          <span>{copy.progress}</span>
          <small className="mobile-typing-language-chip" data-testid="typing-language-hud-mobile">
            {typingLanguageHudLabel(activeSession.languageSettings.typingLanguage, uiLocale)}
          </small>
        </div>
        <div className="progress-track"><i style={{ width: `${((currentIndex + (isResolving ? 1 : 0)) / total) * 100}%` }} /></div>
        <b>{String(currentIndex + 1).padStart(2, '0')} <small>/ {String(total).padStart(2, '0')}</small></b>
      </section>

      <aside className="score-stack" aria-label={copy.score}>
        <div className="score-card hud-panel"><span>{copy.score}</span><strong>{score.toLocaleString(uiLocale === 'ko' ? 'ko-KR' : 'en-US')}</strong></div>
        <div className={`streak-card ${streak >= 2 ? 'is-hot' : ''}`}><span>{copy.streak}</span><strong>×{streak}</strong></div>
      </aside>

      <section className={`typing-console hud-panel ${isResolving ? 'is-resolving' : ''}`} aria-labelledby="typing-title">
        <div className="console-status">
          <span className={`phase-chip ${phase}`}>{phase === 'flying' ? copy.moving : phase === 'ready' ? copy.ready : phase === 'playing' ? copy.typing : phase === 'resolving-correct' ? copy.correct : phase === 'paused' ? copy.paused : lastMissReason === 'timeout' ? copy.timeout : copy.wrong}</span>
          <span className="coordinates">
            {getFeatureTypeLabel(current.featureType, current.countryCode)} · {Math.abs(current.centroid[1]).toFixed(2)}°{current.centroid[1] >= 0 ? 'N' : 'S'} · {Math.abs(current.centroid[0]).toFixed(2)}°{current.centroid[0] >= 0 ? 'E' : 'W'}
          </span>
        </div>

        <div className="timer-row">
          <div className={`timer-dial ${timerRatio < .28 ? 'is-critical' : ''}`} style={{ '--timer-progress': `${timerRatio * 360}deg` } as React.CSSProperties}>
            <div><strong>{formatTimer(remainingMs)}</strong><small>SEC</small></div>
          </div>
          <div className="hint-block">
            <span className="eyebrow" id="typing-title">{copy.targetHint} {currentHints}</span>
            <div className="hint-mask" data-testid="hint-mask" aria-label={`${copy.hintAria} ${mask.map((item) => item.visible ? item.segment : uiLocale === 'ko' ? '빈칸' : 'blank').join(' ')}`}>
              {mask.map((item, index) => (
                <span key={`${item.segment}-${index}`} className={item.visible ? 'is-visible' : ''}>{item.visible ? item.segment : '_'}</span>
              ))}
            </div>
          </div>
        </div>

        <label className="answer-field">
          <span className="sr-only">{copy.targetInput}</span>
          <input
            ref={inputRef}
            value={input}
            disabled={phase !== 'ready' && phase !== 'playing'}
            onInput={onInput}
            onFocus={() => { startIfInputFocused(); }}
            onKeyDown={onKeyDown}
            onCompositionStart={() => { applyTypingEvent({ type: 'composition-start' }); recordActivity(); }}
            onCompositionUpdate={(event) => { applyTypingEvent({ type: 'composition-update', value: event.currentTarget.value }); recordActivity(); }}
            onCompositionEnd={(event) => {
              recordActivity();
              const value = event.currentTarget.value;
              const judgment = applyTypingEvent({ type: 'composition-end', value });
              window.queueMicrotask(() => applyJudgment(judgment));
            }}
            onPaste={(event) => { event.preventDefault(); setToast(copy.paste); }}
            placeholder={phase === 'flying' ? copy.movingPlaceholder : phase === 'ready' ? copy.readyPlaceholder : copy.typingPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            lang={resolvedAnswer.locale}
            enterKeyHint="done"
            aria-describedby="input-instruction"
          />
          <span className="input-enter" aria-hidden="true">{copy.enter}</span>
        </label>
        <p id="input-instruction" className="console-instruction">{copy.instruction}</p>
        <div className="typing-actions" aria-label={uiLocale === 'ko' ? '문제 도움말' : 'Question actions'}>
          <button
            type="button"
            className="typing-action hint-action"
            onClick={revealManualHint}
            disabled={phase !== 'playing' || revealedCount >= answerLength}
            aria-label={copy.manualHint}
            title={manualHintHelp}
            data-testid="manual-hint"
          >
            <span aria-hidden="true">✦</span>{copy.manualHint}
          </button>
          <button
            type="button"
            className="typing-action skip-action"
            onClick={skipQuestion}
            disabled={phase !== 'playing'}
            aria-label={copy.skip}
            title={copy.skip}
            data-testid="skip-question"
          >
            <span aria-hidden="true">→</span>{copy.skip}
          </button>
        </div>
        <p className="typing-action-help">{manualHintHelp}</p>

        {isResolving && (
          <div className={`verdict verdict-${phase === 'resolving-correct' ? 'correct' : 'miss'}`} role="status">
            <span aria-hidden="true">{phase === 'resolving-correct' ? '✓' : '!'}</span>
            <div><small>{phase === 'resolving-correct' ? copy.correctVerdict : lastMissReason === 'timeout' ? copy.timeoutVerdict : copy.wrongVerdict} <span className="verdict-code">{phase === 'resolving-correct' ? 'SIGNAL LOCKED' : lastMissReason === 'timeout' ? 'TIME EXPIRED' : 'SIGNAL LOST'}</span></small><strong>{answerName}</strong></div>
          </div>
        )}

        {phase === 'resolving-correct' && !reducedMotion && <div className="success-burst" aria-hidden="true">{Array.from({ length: particleCount }, (_, index) => <i key={index} />)}</div>}
      </section>

      <div className="aria-announcer" aria-live="assertive" aria-atomic="true">
        {phase === 'resolving-correct' ? `${copy.correctAnnouncement} ${answerName}` : phase === 'resolving-miss' ? `${lastMissReason === 'timeout' ? copy.timeoutAnnouncement : copy.wrongAnnouncement} ${uiLocale === 'ko' ? '정답은' : 'The answer is'} ${answerName}.` : ''}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}

      {phase === 'paused' && (
        <Modal title={copy.pauseTitle} eyebrow={resumeNotice ? copy.welcomeBack : copy.pauseEyebrow} onClose={() => resume()} footer={<button className="button primary wide" type="button" onClick={() => resume()}>{copy.continue}</button>}>
          <div className="pause-copy">
            <span className="pause-icon" aria-hidden="true">Ⅱ</span>
            <p>{resumeNotice ? copy.pausedVisibility : copy.pausedManual}</p>
            <button type="button" className="text-button" onClick={backToMenu}>{copy.abandon}</button>
          </div>
        </Modal>
      )}
    </main>
  );
}
