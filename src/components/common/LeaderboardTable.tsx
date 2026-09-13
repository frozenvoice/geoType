import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeaderboardEntry, LeaderboardQuery, LeaderboardRepository } from '../../leaderboard';
import type { UiLocale } from '../../language';

type LeaderboardTableProps = {
  repository: LeaderboardRepository;
  query: LeaderboardQuery;
  highlightId?: string | null;
  allowClear?: boolean;
  refreshToken?: number;
  uiLocale?: UiLocale;
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function LeaderboardTable({ repository, query, highlightId = null, allowClear = false, refreshToken = 0, uiLocale = 'ko' }: LeaderboardTableProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [confirmClear, setConfirmClear] = useState(false);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setStatus('loading');
    try {
      const nextEntries = await repository.getTopEntries(query);
      if (generation !== requestGeneration.current) return;
      setEntries(nextEntries);
      setStatus('ready');
    } catch {
      if (generation !== requestGeneration.current) return;
      setStatus('error');
    }
  }, [query, repository]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const clear = async () => {
    if (!repository.clearLocalEntries) return;
    await repository.clearLocalEntries();
    setConfirmClear(false);
    await load();
  };

  if (status === 'loading') return <p className="empty-state" role="status">{uiLocale === 'ko' ? '랭킹을 불러오는 중…' : 'Loading ranking…'}</p>;
  if (status === 'error') return (
    <div className="empty-state is-error" role="alert">
      <strong>{uiLocale === 'ko' ? '랭킹을 불러오지 못했습니다.' : 'Could not load the ranking.'}</strong>
      <button type="button" className="text-button" onClick={() => void load()}>{uiLocale === 'ko' ? '다시 시도' : 'Try again'}</button>
    </div>
  );

  return (
    <div className="leaderboard-wrap">
      {entries.length ? (
        <div className="table-scroll">
          <table className="leaderboard-table">
            <thead>
              <tr><th scope="col">{uiLocale === 'ko' ? '순위' : 'Rank'}</th><th scope="col">{uiLocale === 'ko' ? '플레이어' : 'Player'}</th><th scope="col">{uiLocale === 'ko' ? '점수' : 'Score'}</th><th scope="col">{uiLocale === 'ko' ? '정확도' : 'Accuracy'}</th><th scope="col">{uiLocale === 'ko' ? '시간' : 'Time'}</th></tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.id} className={entry.id === highlightId ? 'is-current' : undefined}>
                  <td><span className={`rank-badge rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span></td>
                  <th scope="row">{entry.nickname}{entry.id === highlightId && <small>{uiLocale === 'ko' ? '나' : 'You'}</small>}</th>
                  <td>{entry.score.toLocaleString(uiLocale === 'ko' ? 'ko-KR' : 'en-US')}</td>
                  <td>{Math.round(entry.accuracy)}%</td>
                  <td>{formatTime(entry.elapsedMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-orbit" aria-hidden="true">◎</span>
          <strong>{uiLocale === 'ko' ? '아직 등록된 항해 기록이 없습니다.' : 'No expedition records yet.'}</strong>
          <p>{uiLocale === 'ko' ? '첫 번째 기록의 주인공이 되어 보세요.' : 'Be the first to record a run.'}</p>
        </div>
      )}

      {allowClear && repository.clearLocalEntries && (
        <div className="clear-records">
          {confirmClear ? (
            <div className="confirm-inline" role="alert">
              <span>이 기기의 모든 로컬 기록을 지울까요?</span>
              <button type="button" className="button danger" onClick={() => void clear()}>모두 지우기</button>
              <button type="button" className="text-button" onClick={() => setConfirmClear(false)}>취소</button>
            </div>
          ) : (
            <button type="button" className="text-button subtle" onClick={() => setConfirmClear(true)}>로컬 기록 초기화</button>
          )}
        </div>
      )}
    </div>
  );
}
