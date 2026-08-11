import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchUserStats, fetchUserMatches } from '../api/gameStats';
import { fetchMyProfile, fetchUserProfile } from '../api/client';
import type { UserStats, MatchHistoryItem, MatchHistoryResponse } from '../types/gameStats';
import PageLayout, { NavLink } from '../components/PageLayout';

const PAGE_SIZE = 10;

export default function StatsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState('');
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
        let av = '';
        if (!uid) {
          const me = await fetchMyProfile();
          uid = me.id; name = me.nickname; av = me.avatar ?? '';
        } else {
          const profile = await fetchUserProfile(uid);
          name = profile.nickname; av = profile.avatar ?? '';
        }
        setResolvedUserId(uid); setNickname(name); setAvatar(av);
        const [statsData, matchData] = await Promise.all([
          fetchUserStats(uid),
          fetchUserMatches(uid, 1, PAGE_SIZE),
        ]);
        setStats(statsData); setHistory(matchData.matches); setTotal(matchData.total); setPage(1);
      } catch { navigate('/login', { replace: true }); }
      finally { setIsLoading(false); }
    };
    init();
  }, [userId, navigate]);

  const loadMore = useCallback(async () => {
    if (!resolvedUserId || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data: MatchHistoryResponse = await fetchUserMatches(resolvedUserId, page + 1, PAGE_SIZE);
      setHistory(prev => [...prev, ...data.matches]);
      setPage(p => p + 1);
    } finally { setIsLoadingMore(false); }
  }, [resolvedUserId, page, isLoadingMore]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#05070c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a' }}>불러오는 중…</span>
      </div>
    );
  }

  const winPct = stats ? Math.round(stats.winRate * 100) : 0;

  return (
    <PageLayout title={`${nickname}의 전적`} actions={<NavLink to="/leaderboard">리더보드 →</NavLink>}>
      {/* Profile */}
      <div style={S.profileRow}>
        <div style={{ ...S.avatar, backgroundImage: avatar ? `url(${avatar})` : 'none', backgroundColor: '#1a2040' }} />
        <div>
          <div style={S.profileName}>{nickname}</div>
          {stats && (
            <div style={S.winRateRow}>
              <div style={S.winRateTrack}>
                <div style={{ ...S.winRateFill, width: `${winPct}%` }} />
              </div>
              <span style={S.winRatePct}>{winPct}% 승률</span>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div style={S.statGrid}>
          {[
            { label: '승리', value: stats.wins, color: '#12c8a8' },
            { label: '패배', value: stats.losses, color: '#ef4a63' },
            { label: '총 게임', value: stats.totalGames, color: '#8b5cf6' },
            { label: '승률', value: `${winPct}%`, color: '#eab308' },
          ].map(item => (
            <div key={item.label} style={S.statCard}>
              <div style={S.statLabel}>{item.label}</div>
              <div style={{ ...S.statValue, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Match history */}
      <div style={{ marginTop: 28 }}>
        <div style={S.sectionTitle}>전적 기록</div>
        {history.length === 0 ? (
          <div style={S.empty}>전적 기록이 없습니다.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(m => {
                const isHost = m.hostUser.id === resolvedUserId;
                const opponent = isHost ? m.guestUser : m.hostUser;
                const won = m.winner?.id === resolvedUserId;
                const result: 'WIN' | 'LOSS' | 'DRAW' = !m.winner ? 'DRAW' : won ? 'WIN' : 'LOSS';
                const resultStyle =
                  result === 'WIN'
                    ? { background: 'rgba(18,200,168,.12)', color: '#12c8a8' }
                    : result === 'LOSS'
                      ? { background: 'rgba(239,74,99,.12)', color: '#ef4a63' }
                      : { background: 'rgba(139,92,246,.12)', color: '#8b5cf6' };
                return (
                  <div key={m.id} style={{ ...S.matchRow, borderColor: won ? 'rgba(18,200,168,.15)' : 'rgba(239,74,99,.12)' }}>
                    <span style={{ ...S.matchBadge, ...resultStyle }}>
                      {result}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: '#c7cede' }}>
                      vs{' '}
                      <Link to={`/stats/${opponent.id}`} style={{ color: '#12c8a8', textDecoration: 'none' }}>{opponent.nickname}</Link>
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3a4256' }}>
                      {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                );
              })}
            </div>
            {history.length < total && (
              <button onClick={loadMore} disabled={isLoadingMore} style={{ ...S.loadMoreBtn, marginTop: 12 }}>
                {isLoadingMore ? '불러오는 중…' : `더 보기 (${total - history.length}개 남음)`}
              </button>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

const S = {
  profileRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatar: { width: 56, height: 56, borderRadius: '50%', border: '2px solid rgba(18,200,168,.4)', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const },
  profileName: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 20, color: '#e2e8f5', marginBottom: 8 },
  winRateRow: { display: 'flex', alignItems: 'center', gap: 10 },
  winRateTrack: { width: 140, height: 6, borderRadius: 3, background: '#182236', overflow: 'hidden' },
  winRateFill: { height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#12c8a8)', borderRadius: 3, transition: 'width .5s' },
  winRatePct: { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#8a93a8' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 },
  statCard: { background: '#0d1220', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: '16px 12px', textAlign: 'center' as const },
  statLabel: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5c6a8a', letterSpacing: '.1em', marginBottom: 8 },
  statValue: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 30 },
  sectionTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 16, color: '#c7cede', marginBottom: 12 },
  matchRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,.02)', border: '1px solid' },
  matchBadge: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 as const, fontSize: 10, letterSpacing: '.08em', padding: '3px 8px', borderRadius: 5, minWidth: 44, textAlign: 'center' as const },
  empty: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a', padding: '20px 0' },
  loadMoreBtn: { width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#8a93a8', fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: 'pointer' },
} as const;
