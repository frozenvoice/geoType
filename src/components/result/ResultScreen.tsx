import { useMemo, useState, type FormEvent } from 'react';
import type { LeaderboardEntry, LeaderboardRepository } from '../../leaderboard';
import { getAnswerPolicyLabel, getTypingLanguageLabel, type UiLocale } from '../../language';
import { useGameStore } from '../../game/store/gameStore';
import { LeaderboardTable } from '../common/LeaderboardTable';
import '../../styles/result.css';

type ResultScreenProps = {
  repository: LeaderboardRepository;
};

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatSeconds(milliseconds: number, locale: UiLocale) {
  const seconds = (Math.max(0, milliseconds) / 1000).toFixed(1);
  return locale === 'ko' ? `${seconds}초` : `${seconds}s`;
}

function resultTitle(accuracy: number, locale: UiLocale) {
  if (locale === 'en') {
    if (accuracy >= 95) return ['A perfect orbit.', 'MASTER CARTOGRAPHER'];
    if (accuracy >= 80) return ['A great expedition.', 'ORBIT COMPLETE'];
    if (accuracy >= 60) return ['A new map is taking shape.', 'MISSION COMPLETE'];
    return ['Another orbit awaits.', 'ROUTE RECORDED'];
  }
  if (accuracy >= 95) return ['완벽한 궤도입니다.', '최고의 지도 제작자'];
  if (accuracy >= 80) return ['훌륭한 항해였습니다.', '궤도 완주'];
  if (accuracy >= 60) return ['새로운 지도를 만들었습니다.', '임무 완료'];
  return ['다음 궤도가 기다립니다.', '경로 기록'];
}

type ResultCopy = {
  backToMenu: string;
  expeditionLog: string;
  completed: string;
  finalScore: string;
  points: string;
  analysisEyebrow: string;
  analysis: string;
  accuracy: string;
  correct: string;
  miss: string;
  stable: string;
  nextAttempt: string;
  bestStreak: string;
  hintsUsed: string;
  averageResponse: string;
  totalTime: string;
  questionReview: string;
  reviewDescription: string;
  question: string;
  answer: string;
  result: string;
  timeLeft: string;
  response: string;
  hintCount: string;
  correctMark: string;
  missMark: string;
  timeoutMark: string;
  rankingEyebrow: string;
  ranking: string;
  topTwenty: string;
  saveName: string;
  nicknameHint: string;
  nicknamePlaceholder: string;
  saving: string;
  save: string;
  saveHelp: string;
  saved: string;
  savedHelp: string;
  newRoute: string;
  retry: string;
  otherMission: string;
};

const RESULT_COPY: Record<UiLocale, ResultCopy> = {
  ko: {
    backToMenu: '메뉴로 돌아가기 ×', expeditionLog: '항해 기록', completed: '에서 선택한 지명을 모두 확인했습니다.', finalScore: '최종 점수', points: '점', analysisEyebrow: '플레이 분석', analysis: '항해 분석', accuracy: '정확도', correct: '정답', miss: '오답', stable: '안정적인 지명 추적입니다.', nextAttempt: '다음 도전에서는 힌트 신호를 활용해 보세요.', bestStreak: '최고 연속 정답', hintsUsed: '사용한 힌트', averageResponse: '평균 응답', totalTime: '총 항해 시간', questionReview: '문제별 복습', reviewDescription: '각 문제에서 정답 여부와 남은 시간을 확인하세요.', question: '문제', answer: '정답', result: '결과', timeLeft: '남은 시간', response: '응답 시간', hintCount: '힌트', correctMark: '정답', missMark: '오답', timeoutMark: '시간 종료', rankingEyebrow: '로컬 랭킹', ranking: '이번 궤도의 순위', topTwenty: '상위 20', saveName: '항해 기록에 이름 남기기', nicknameHint: '1–12자', nicknamePlaceholder: '닉네임', saving: '저장 중…', save: '기록 저장', saveHelp: '기록은 이 브라우저에만 안전하게 저장됩니다.', saved: '항해 기록이 저장되었습니다.', savedHelp: '현재 플레이어 행을 강조해 표시합니다.', newRoute: '새 경로로 다시 플레이', retry: '같은 설정으로 재도전', otherMission: '다른 임무 선택',
  },
  en: {
    backToMenu: 'Back to menu ×', expeditionLog: 'EXPEDITION LOG', completed: ' — all selected places completed.', finalScore: 'Final score', points: 'pts', analysisEyebrow: 'PLAY ANALYSIS', analysis: 'Run analysis', accuracy: 'Accuracy', correct: 'Correct', miss: 'Misses', stable: 'A steady place-name run.', nextAttempt: 'Use the hint signal on your next attempt.', bestStreak: 'Best streak', hintsUsed: 'Hints used', averageResponse: 'Average response', totalTime: 'Total time', questionReview: 'Question review', reviewDescription: 'Review each answer, result, and time remaining.', question: 'Question', answer: 'Answer', result: 'Result', timeLeft: 'Time left', response: 'Response', hintCount: 'Hints', correctMark: 'Correct', missMark: 'Incorrect', timeoutMark: 'Time expired', rankingEyebrow: 'LOCAL RANKING', ranking: 'Run ranking', topTwenty: 'TOP 20', saveName: 'Add your name to the log', nicknameHint: '1–12 chars', nicknamePlaceholder: 'Nickname', saving: 'Saving…', save: 'Save score', saveHelp: 'Your score is stored safely in this browser.', saved: 'Run saved.', savedHelp: 'Your row is highlighted below.', newRoute: 'Play a new route', retry: 'Retry same settings', otherMission: 'Choose another mission',
  },
};

export function ResultScreen({ repository }: ResultScreenProps) {
  const session = useGameStore((state) => state.activeSession);
  const difficulty = useGameStore((state) => state.difficulty);
  const score = useGameStore((state) => state.score);
  const correctCount = useGameStore((state) => state.correctCount);
  const missCount = useGameStore((state) => state.missCount);
  const totalHints = useGameStore((state) => state.totalHints);
  const maxStreak = useGameStore((state) => state.maxStreak);
  const results = useGameStore((state) => state.questionResults);
  const features = useGameStore((state) => state.features);
  const startedAt = useGameStore((state) => state.startedAt);
  const finishedAt = useGameStore((state) => state.finishedAt);
  const totalPausedMs = useGameStore((state) => state.totalPausedMs);
  const replay = useGameStore((state) => state.replay);
  const retrySameOrder = useGameStore((state) => state.retrySameOrder);
  const backToMenu = useGameStore((state) => state.backToMenu);
  const [nickname, setNickname] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const uiLocale = session?.languageSettings.uiLocale ?? 'ko';
  const copy = RESULT_COPY[uiLocale];
  const total = correctCount + missCount;
  const accuracy = total ? (correctCount / total) * 100 : 0;
  const elapsedMs = Math.max(0, finishedAt - startedAt - totalPausedMs);
  const averageResponseMs = results.length ? results.reduce((sum, result) => sum + result.responseMs, 0) / results.length : 0;
  const [headline, eyebrow] = resultTitle(accuracy, uiLocale);
  const missionTitle = uiLocale === 'ko'
    ? session?.titleKo
    : `${session?.root.localizedNames.en ?? session?.root.name ?? ''} · mission`;
  const query = useMemo(() => session ? ({
    topicId: session.id,
    difficulty,
    dataVersion: session.dataVersion,
    typingLanguage: session.languageSettings.typingLanguage,
    answerPolicy: session.languageSettings.answerPolicy,
    languageDataVersion: session.languageDataVersion,
    ...(session.answerLocale ? { answerLocale: session.answerLocale } : {}),
  }) : null, [difficulty, session]);
  const reviewRows = useMemo(() => results.map((result, index) => {
    const feature = features.find((item) => item.id === result.featureId);
    const answer = session?.resolvedAnswers[result.featureId]?.target ?? feature?.localizedNames.ko ?? feature?.name ?? '—';
    return { result, index, answer, featureName: feature?.localizedNames[uiLocale] ?? feature?.name ?? answer };
  }), [features, results, session, uiLocale]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || savedId) return;
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 12) {
      setSaveError(uiLocale === 'ko' ? '닉네임은 1자 이상 12자 이하로 입력해 주세요.' : 'Nickname must be 1–12 characters.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const id = crypto.randomUUID();
    const entry: LeaderboardEntry = {
      id,
      nickname: trimmed,
      topicId: session.id,
      topicTitle: session.titleKo,
      difficulty,
      dataVersion: session.dataVersion,
      typingLanguage: session.languageSettings.typingLanguage,
      answerPolicy: session.languageSettings.answerPolicy,
      languageDataVersion: session.languageDataVersion,
      ...(session.answerLocale ? { answerLocale: session.answerLocale } : {}),
      score,
      correctCount,
      missCount,
      accuracy,
      totalHints,
      maxStreak,
      elapsedMs: Math.round(elapsedMs),
      createdAt: new Date().toISOString(),
    };
    try {
      await repository.saveEntry(entry);
      setSavedId(id);
      setRefreshToken((value) => value + 1);
    } catch {
      setSaveError(uiLocale === 'ko' ? '기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' : 'Could not save the score. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!session || !query) return null;

  return (
    <main className="result-screen screen-layer">
      <header className="result-header">
        <div className="game-brand"><span className="brand-mark small" aria-hidden="true"><i /></span><strong>GeoType</strong><small>{copy.expeditionLog}</small></div>
        <button type="button" className="text-button" onClick={backToMenu}>{copy.backToMenu}</button>
      </header>

      <div className="result-scroll">
        <section className="result-hero" aria-labelledby="result-title">
          <div className="result-seal" aria-hidden="true"><span>✓</span><i /></div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="result-title">{headline}</h1>
          <p>{`${missionTitle}${copy.completed}`}</p>
          <div className="result-score"><span>{copy.finalScore}</span><strong>{score.toLocaleString(uiLocale === 'ko' ? 'ko-KR' : 'en-US')}</strong><small>{copy.points}</small></div>
        </section>

        <section className="result-content">
          <div className="result-stats hud-panel">
            <header className="section-heading"><div><p className="eyebrow">{copy.analysisEyebrow}</p><h2>{copy.analysis}</h2></div><span>{total}{uiLocale === 'ko' ? '문제' : ' questions'}</span></header>
            <div className="accuracy-block">
              <div className="accuracy-ring" style={{ '--accuracy': `${accuracy * 3.6}deg` } as React.CSSProperties}><span><strong>{Math.round(accuracy)}</strong>%</span></div>
              <div><span>{copy.accuracy}</span><strong>{correctCount}<small> {copy.correct}</small> · {missCount}<small> {copy.miss}</small></strong><p>{accuracy >= 80 ? copy.stable : copy.nextAttempt}</p></div>
            </div>
            <div className="stat-grid">
              <div><span>{copy.bestStreak}</span><strong>×{maxStreak}</strong><small>{uiLocale === 'ko' ? '최고 기록' : 'BEST STREAK'}</small></div>
              <div><span>{copy.hintsUsed}</span><strong>{totalHints}</strong><small>{uiLocale === 'ko' ? '전체 힌트' : 'TOTAL HINTS'}</small></div>
              <div><span>{copy.averageResponse}</span><strong>{(averageResponseMs / 1000).toFixed(1)}s</strong><small>{uiLocale === 'ko' ? '평균' : 'AVG RESPONSE'}</small></div>
              <div><span>{copy.totalTime}</span><strong>{formatDuration(elapsedMs)}</strong><small>{uiLocale === 'ko' ? '플레이 시간' : 'FLIGHT TIME'}</small></div>
            </div>
            <div className="answer-route" aria-label={copy.questionReview}>
              {results.map((result, index) => <i key={result.featureId} className={result.result === 'correct' ? 'is-correct' : 'is-miss'} title={`${index + 1}${uiLocale === 'ko' ? '번 ' : ': '}${result.result === 'correct' ? copy.correctMark : result.missReason === 'timeout' ? copy.timeoutMark : copy.missMark}`} />)}
            </div>
          </div>

          <div className="result-ranking hud-panel">
            <header className="section-heading"><div><p className="eyebrow">{copy.rankingEyebrow}</p><h2>{copy.ranking}</h2></div><span>{copy.topTwenty}</span></header>
            <div className="ranking-language-filter" data-testid="ranking-language-filter">
              <span>{getTypingLanguageLabel(session.languageSettings.typingLanguage, session.languageSettings.uiLocale)}</span>
              <span>{getAnswerPolicyLabel(session.languageSettings.answerPolicy, session.languageSettings.uiLocale)}</span>
              <small>{uiLocale === 'ko' ? '같은 조건의 기록' : 'Matching run settings'}</small>
            </div>

            {!savedId ? (
              <form className="save-score" onSubmit={(event) => void save(event)}>
                <label htmlFor="nickname"><span>{copy.saveName}</span><small>{copy.nicknameHint}</small></label>
                <div><input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={12} autoComplete="nickname" placeholder={copy.nicknamePlaceholder} aria-invalid={saveError ? 'true' : undefined} /><button className="button primary" type="submit" disabled={saving}>{saving ? copy.saving : saveError ? (uiLocale === 'ko' ? '다시 저장' : 'Try again') : copy.save}</button></div>
                {saveError && <p className="field-error" role="alert">{saveError}</p>}
                <p>{copy.saveHelp}</p>
              </form>
            ) : (
              <div className="saved-banner" role="status"><span>✓</span><div><strong>{copy.saved}</strong><small>{copy.savedHelp}</small></div></div>
            )}

            <LeaderboardTable repository={repository} query={query} highlightId={savedId} refreshToken={refreshToken} uiLocale={uiLocale} />
          </div>
        </section>

        <section className="question-review hud-panel" aria-labelledby="question-review-title" data-testid="question-review">
          <header className="section-heading">
            <div>
              <p className="eyebrow">{copy.questionReview}</p>
              <h2 id="question-review-title">{copy.questionReview}</h2>
            </div>
            <span>{correctCount}/{total}</span>
          </header>
          <p className="review-description">{copy.reviewDescription}</p>
          {reviewRows.length > 0 ? (
            <ol className="review-list">
              {reviewRows.map(({ result, index, answer, featureName }) => {
                const resultLabel = result.result === 'correct'
                  ? copy.correctMark
                  : result.missReason === 'timeout' ? copy.timeoutMark : copy.missMark;
                return (
                  <li key={result.featureId} className={`review-row review-${result.result}`}>
                    <span className="review-index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="review-place">
                      <strong>{featureName}</strong>
                      <span><em>{copy.answer}</em> {answer}</span>
                    </div>
                    <div className="review-metrics">
                      <span className="review-outcome">{result.result === 'correct' ? '✓' : '!' } {resultLabel}</span>
                      <small>{copy.timeLeft} {formatSeconds(result.remainingMs, uiLocale)} · {copy.response} {formatSeconds(result.responseMs, uiLocale)} · {copy.hintCount} {result.hintCount}</small>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="review-empty">{uiLocale === 'ko' ? '기록된 문제가 없습니다.' : 'No questions were recorded.'}</p>
          )}
        </section>

        <section className="result-actions" aria-label={uiLocale === 'ko' ? '다음 행동' : 'Next actions'}>
          <button type="button" className="button secondary" onClick={replay}><span>{copy.newRoute}</span><b aria-hidden="true">↻</b></button>
          <button type="button" className="button primary" onClick={retrySameOrder}><span>{copy.retry}</span><b aria-hidden="true">↗</b></button>
          <button type="button" className="text-button" onClick={backToMenu}>{copy.otherMission}</button>
        </section>
      </div>
    </main>
  );
}
