import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchUserStats, fetchUserMatches } from '../api/gameStats';
import { fetchMyProfile, fetchUserProfile } from '../api/client';
import type { UserStats, MatchHistoryItem, MatchHistoryResponse } from '../types/gameStats';

const PAGE_SIZE = 10;

export default function StatsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [nickname, setNickname] = useState('');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        let uid = userId ?? '';
        let name = '';
        if (!uid) {
          const me = await fetchMyProfile();
          uid = me.id;
          name = me.nickname;
        } else {
          const profile = await fetchUserProfile(uid);
          name = profile.nickname;
        }
        setResolvedUserId(uid);
        setNickname(name);
        const [statsData, matchData] = await Promise.all([
          fetchUserStats(uid),
          fetchUserMatches(uid, 1, PAGE_SIZE),
        ]);
        setStats(statsData);
        setHistory(matchData.matches);
        setTotal(matchData.total);
        setPage(1);
      } catch {
        navigate('/login', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [userId, navigate]);

  const loadMore = useCallback(async () => {
    if (!resolvedUserId || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data: MatchHistoryResponse = await fetchUserMatches(resolvedUserId, nextPage, PAGE_SIZE);
      setHistory((prev) => [...prev, ...data.matches]);
      setPage(nextPage);
    } finally {
      setIsLoadingMore(false);
    }
  }, [resolvedUserId, page, isLoadingMore]);

  if (isLoading) {
    return (
      <div className="auth-container">
        <h2>Loading Stats...</h2>
      </div>
    );
  }

  const winPct = stats ? Math.round(stats.winRate * 100) : 0;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>{nickname}&apos;s Stats</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/leaderboard" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Leaderboard
          </Link>
          <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>

      {stats && (
        <>
          <div className="dashboard-grid">
            <div className="stat-card">
              <h3>Total Games</h3>
              <div className="stat-value">{stats.totalGames}</div>
            </div>
            <div className="stat-card">
              <h3>Wins</h3>
              <div className="stat-value glow-cyan">{stats.wins}</div>
            </div>
            <div className="stat-card">
              <h3>Losses</h3>
              <div className="stat-value glow-purple">{stats.losses}</div>
            </div>
          </div>

          {/* Win rate bar */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span>Win Rate</span>
              <span>{winPct}%</span>
            </div>
            <div className="winrate-bar-bg">
              <div className="winrate-bar-fill" style={{ width: `${winPct}%` }} />
            </div>
          </div>
        </>
      )}

      <section style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 16 }}>Match History</h3>
        {history.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No matches yet.</p>
        ) : (
          <>
            <div className="match-history-list">
              {history.map((m) => {
                const isHost = m.hostUser.id === resolvedUserId;
                const opponent = isHost ? m.guestUser : m.hostUser;
                const won = m.winner?.id === resolvedUserId;
                const date = new Date(m.createdAt).toLocaleDateString();
                return (
                  <div key={m.id} className={`match-history-item ${won ? 'match-win' : 'match-loss'}`}>
                    <span className={`match-result-badge ${won ? 'badge-win' : 'badge-loss'}`}>
                      {m.winner ? (won ? 'WIN' : 'LOSS') : 'DRAW'}
                    </span>
                    <span className="match-opponent">
                      vs{' '}
                      <Link to={`/stats/${opponent.id}`} style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}>
                        {opponent.nickname}
                      </Link>
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{m.turnsPlayed} turns</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{date}</span>
                  </div>
                );
              })}
            </div>
            {history.length < total && (
              <button
                className="btn-secondary"
                style={{ marginTop: 16, width: '100%' }}
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading...' : `Load More (${total - history.length} remaining)`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
