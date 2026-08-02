import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
      <div style={{ ...S.rankBox, fontSize: 20, lineHeight: 1 }}>
        {RANK_META[rank].medal}
      </div>
    );
  }
  return (
    <div style={S.rankBox}>
      <span style={S.rankNum}>#{rank + 1}</span>
    </div>
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
    return <PageLayout title="리더보드"><div style={S.empty}>불러오는 중…</div></PageLayout>;
  }

  if (error) {
    return <PageLayout title="리더보드"><div style={S.errorBox}>{error}</div></PageLayout>;
  }

  return (
    <PageLayout title="🏆 리더보드">
      {entries.length === 0 ? (
        <div style={S.empty}>아직 랭킹 데이터가 없습니다.<br /><span style={{ fontSize: 10, opacity: .5 }}>게임을 완료하면 순위가 등록됩니다.</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((entry, i) => {
            const winPct = Math.round(entry.winRate * 100);
            const meta = RANK_META[i];
            return (
              <div
                key={entry.id}
                style={{
                  ...S.row,
                  borderColor: meta?.borderColor ?? 'rgba(255,255,255,.06)',
                  background: meta?.bg ?? 'rgba(255,255,255,.015)',
                  boxShadow: i === 0 ? `0 0 18px rgba(255,215,0,.06)` : undefined,
                }}
              >
                <RankBadge rank={i} />
                <div
                  style={{
                    ...S.avatarCircle,
                    backgroundImage: entry.avatar ? `url(${entry.avatar})` : 'none',
                    borderColor: meta?.glowColor ?? 'rgba(255,255,255,.1)',
                  }}
                >
                  {!entry.avatar && (
                    <span style={S.avatarInitial}>{entry.nickname[0].toUpperCase()}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/stats/${entry.id}`} style={S.nickname}>{entry.nickname}</Link>
                  <div style={S.winRateRow}>
                    <div style={S.winRateBar}>
                      <div style={{ ...S.winRateFill, width: `${winPct}%` }} />
                    </div>
                    <span style={S.pct}>{winPct}%</span>
                  </div>
                </div>
                <div style={S.wlCol}>
                  <span style={S.wLabel}>승</span>
                  <span style={{ ...S.wNum, color: '#12c8a8' }}>{entry.wins}</span>
                </div>
                <div style={S.wlCol}>
                  <span style={S.wLabel}>패</span>
                  <span style={{ ...S.wNum, color: '#ef4a63' }}>{entry.losses}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}

const S = {
  errorBox: { background: 'rgba(239,74,99,.1)', border: '1px solid rgba(239,74,99,.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 },
  empty: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a', padding: '32px 0', textAlign: 'center' as const, lineHeight: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: '1px solid', transition: 'background .15s' },
  rankBox: { width: 36, textAlign: 'center' as const, flex: 'none' as const },
  rankNum: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#3a4a6a', fontWeight: 700 as const },
  avatarCircle: { width: 36, height: 36, borderRadius: '50%', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const, border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  avatarInitial: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 15, color: '#5c6a8a' },
  nickname: { display: 'block', color: '#c7cede', textDecoration: 'none', fontWeight: 600 as const, fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  winRateRow: { display: 'flex', alignItems: 'center', gap: 8 },
  winRateBar: { flex: 1, height: 4, borderRadius: 2, background: '#182236', overflow: 'hidden', maxWidth: 120 },
  winRateFill: { height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#12c8a8)', borderRadius: 2 },
  pct: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#5c6a8a', minWidth: 32 },
  wlCol: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', minWidth: 28, gap: 1 },
  wLabel: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#3a4a6a', letterSpacing: '.05em' },
  wNum: { fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700 as const },
} as const;
