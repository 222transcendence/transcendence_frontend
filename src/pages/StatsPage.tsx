import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
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
      <LoadingPage>
        <LoadingText>불러오는 중…</LoadingText>
      </LoadingPage>
    );
  }

  const winPct = stats ? Math.round(stats.winRate * 100) : 0;

  return (
    <PageLayout title={`${nickname}의 전적`} actions={<NavLink to="/leaderboard">리더보드 →</NavLink>}>
      {/* Profile */}
      <ProfileRow>
        <Avatar style={{ backgroundImage: avatar ? `url(${avatar})` : 'none', backgroundColor: '#1a2040' }} />
        <div>
          <ProfileName>{nickname}</ProfileName>
          {stats && (
            <WinRateRow>
              <WinRateTrack>
                <WinRateFill style={{ width: `${winPct}%` }} />
              </WinRateTrack>
              <WinRatePct>{winPct}% 승률</WinRatePct>
            </WinRateRow>
          )}
        </div>
      </ProfileRow>

      {/* Stat cards */}
      {stats && (
        <StatGrid>
          {[
            { label: '승리', value: stats.wins, color: '#12c8a8' },
            { label: '패배', value: stats.losses, color: '#ef4a63' },
            { label: '총 게임', value: stats.totalGames, color: '#8b5cf6' },
            { label: '승률', value: `${winPct}%`, color: '#eab308' },
          ].map(item => (
            <StatCard key={item.label}>
              <StatLabel>{item.label}</StatLabel>
              <StatValue style={{ color: item.color }}>{item.value}</StatValue>
            </StatCard>
          ))}
        </StatGrid>
      )}

      {/* Match history */}
      <div style={{ marginTop: 28 }}>
        <SectionTitle>전적 기록</SectionTitle>
        {history.length === 0 ? (
          <Empty>전적 기록이 없습니다.</Empty>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(m => {
                // N인 매치(backend#157)는 participants[]에 전원이 들어있다 — hostUser/
                // guestUser만 보면 3~4인 매치에서 상대가 한 명만(그것도 방장) 보인다.
                const otherParticipants = m.participants
                  .filter(p => p.user && p.user.id !== resolvedUserId)
                  .map(p => p.user!);
                const opponents = otherParticipants.length > 0
                  ? otherParticipants
                  : [m.hostUser?.id === resolvedUserId ? m.guestUser : m.hostUser].filter(
                      (u): u is { id: string; nickname: string; avatar: string } => u != null,
                    );
                const won = m.winner?.id === resolvedUserId;
                const result: 'WIN' | 'LOSS' | 'DRAW' = !m.winner ? 'DRAW' : won ? 'WIN' : 'LOSS';
                const resultStyle =
                  result === 'WIN'
                    ? { background: 'rgba(18,200,168,.12)', color: '#12c8a8' }
                    : result === 'LOSS'
                      ? { background: 'rgba(239,74,99,.12)', color: '#ef4a63' }
                      : { background: 'rgba(139,92,246,.12)', color: '#8b5cf6' };
                return (
                  <MatchRow key={m.id} style={{ borderColor: won ? 'rgba(18,200,168,.15)' : 'rgba(239,74,99,.12)' }}>
                    <MatchBadge style={resultStyle}>
                      {result}
                    </MatchBadge>
                    <span style={{ flex: 1, fontSize: 13, color: '#c7cede' }}>
                      vs{' '}
                      {opponents.length > 0 ? (
                        opponents.map((opponent, index) => (
                          <span key={opponent.id}>
                            {index > 0 && ', '}
                            <OpponentLink to={`/stats/${opponent.id}`}>{opponent.nickname}</OpponentLink>
                          </span>
                        ))
                      ) : (
                        <span style={{ color: '#8a93a8' }}>AI</span>
                      )}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3a4256' }}>
                      {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </MatchRow>
                );
              })}
            </div>
            {history.length < total && (
              <LoadMoreBtn onClick={loadMore} disabled={isLoadingMore} style={{ marginTop: 12 }}>
                {isLoadingMore ? '불러오는 중…' : `더 보기 (${total - history.length}개 남음)`}
              </LoadMoreBtn>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

const LoadingPage = styled.div`
  min-height: 100dvh;
  background: #05070c;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingText = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #5c6a8a;
`;

const ProfileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
`;

const Avatar = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid rgba(18, 200, 168, 0.4);
  background-size: cover;
  background-position: center;
  flex: none;
`;

const ProfileName = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 20px;
  color: #e2e8f5;
  margin-bottom: 8px;
`;

const WinRateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const WinRateTrack = styled.div`
  width: 140px;
  height: 6px;
  border-radius: 3px;
  background: #182236;
  overflow: hidden;
`;

const WinRateFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #12c8a8);
  border-radius: 3px;
  transition: width 0.5s;
`;

const WinRatePct = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #8a93a8;
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
`;

const StatCard = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 16px 12px;
  text-align: center;
`;

const StatLabel = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #5c6a8a;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 30px;
`;

const SectionTitle = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: #c7cede;
  margin-bottom: 12px;
`;

const MatchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid;
`;

const MatchBadge = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: 5px;
  min-width: 44px;
  text-align: center;
`;

const OpponentLink = styled(Link)`
  color: #12c8a8;
  text-decoration: none;
`;

const Empty = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #5c6a8a;
  padding: 20px 0;
`;

const LoadMoreBtn = styled.button`
  width: 100%;
  padding: 10px 0;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #8a93a8;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
`;
