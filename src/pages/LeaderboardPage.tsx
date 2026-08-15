import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { fetchLeaderboard } from '../api/gameStats';
import type { LeaderboardEntry } from '../types/gameStats';
import PageLayout from '../components/PageLayout';

const RANK_META = [
  { medal: '🥇', borderColor: 'rgba(255,215,0,.25)', bg: 'rgba(255,215,0,.04)', glowColor: '#ffd700' },
  { medal: '🥈', borderColor: 'rgba(192,192,192,.2)',  bg: 'rgba(192,192,192,.03)', glowColor: '#c0c0c0' },
  { medal: '🥉', borderColor: 'rgba(205,127,50,.2)',   bg: 'rgba(205,127,50,.04)', glowColor: '#cd7f32' },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank < 3) {
    return (
      <RankBox style={{ fontSize: 20, lineHeight: 1 }}>
        {RANK_META[rank].medal}
      </RankBox>
    );
  }
  return (
    <RankBox>
      <RankNum>#{rank + 1}</RankNum>
    </RankBox>
  );
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard()
      .then(setEntries)
      .catch(() => setError('리더보드를 불러오지 못했습니다.'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <PageLayout title="리더보드"><Empty>불러오는 중…</Empty></PageLayout>;
  }

  if (error) {
    return <PageLayout title="리더보드"><ErrorBox>{error}</ErrorBox></PageLayout>;
  }

  return (
    <PageLayout title="🏆 리더보드">
      {entries.length === 0 ? (
        <Empty>아직 랭킹 데이터가 없습니다.<br /><span style={{ fontSize: 10, opacity: .5 }}>게임을 완료하면 순위가 등록됩니다.</span></Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((entry, i) => {
            const winPct = Math.round(entry.winRate * 100);
            const meta = RANK_META[i];
            return (
              <Row
                key={entry.id}
                style={{
                  borderColor: meta?.borderColor ?? 'rgba(255,255,255,.06)',
                  background: meta?.bg ?? 'rgba(255,255,255,.015)',
                  boxShadow: i === 0 ? `0 0 18px rgba(255,215,0,.06)` : undefined,
                }}
              >
                <RankBadge rank={i} />
                <AvatarCircle
                  style={{
                    backgroundImage: entry.avatar ? `url(${entry.avatar})` : 'none',
                    borderColor: meta?.glowColor ?? 'rgba(255,255,255,.1)',
                  }}
                >
                  {!entry.avatar && (
                    <AvatarInitial>{entry.nickname[0].toUpperCase()}</AvatarInitial>
                  )}
                </AvatarCircle>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Nickname to={`/stats/${entry.id}`}>{entry.nickname}</Nickname>
                  <WinRateRow>
                    <WinRateBar>
                      <WinRateFill style={{ width: `${winPct}%` }} />
                    </WinRateBar>
                    <Pct>{winPct}%</Pct>
                  </WinRateRow>
                </div>
                <WlCol>
                  <WLabel>승</WLabel>
                  <WNum style={{ color: '#12c8a8' }}>{entry.wins}</WNum>
                </WlCol>
                <WlCol>
                  <WLabel>패</WLabel>
                  <WNum style={{ color: '#ef4a63' }}>{entry.losses}</WNum>
                </WlCol>
              </Row>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}

const ErrorBox = styled.div`
  background: rgba(239, 74, 99, 0.1);
  border: 1px solid rgba(239, 74, 99, 0.3);
  border-radius: 10px;
  padding: 10px 14px;
  color: #ef4a63;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
`;

const Empty = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #5c6a8a;
  padding: 32px 0;
  text-align: center;
  line-height: 2;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid;
  transition: background 0.15s;
`;

const RankBox = styled.div`
  width: 36px;
  text-align: center;
  flex: none;
`;

const RankNum = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #3a4a6a;
  font-weight: 700;
`;

const AvatarCircle = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  flex: none;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #111827;
`;

const AvatarInitial = styled.span`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: #5c6a8a;
`;

const Nickname = styled(Link)`
  display: block;
  color: #c7cede;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const WinRateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const WinRateBar = styled.div`
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: #182236;
  overflow: hidden;
  max-width: 120px;
`;

const WinRateFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #12c8a8);
  border-radius: 2px;
`;

const Pct = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #5c6a8a;
  min-width: 32px;
`;

const WlCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 28px;
  gap: 1px;
`;

const WLabel = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #3a4a6a;
  letter-spacing: 0.05em;
`;

const WNum = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
`;
