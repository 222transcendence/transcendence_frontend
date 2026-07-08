import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLeaderboard } from '../api/gameStats';
import type { LeaderboardEntry } from '../types/gameStats';
import PageLayout from '../components/PageLayout';

const MEDAL = ['🥇', '🥈', '🥉'];

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

  return (
    <PageLayout title="리더보드">
      {error && <div style={S.errorBox}>{error}</div>}
      {isLoading ? (
        <div style={S.empty}>불러오는 중…</div>
      ) : entries.length === 0 ? (
        <div style={S.empty}>아직 랭킹 데이터가 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((entry, i) => {
            const winPct = Math.round(entry.winRate * 100);
            return (
              <div key={entry.id} style={{ ...S.row, borderColor: i === 0 ? 'rgba(255,215,0,.2)' : i === 1 ? 'rgba(192,192,192,.15)' : i === 2 ? 'rgba(205,127,50,.15)' : 'rgba(255,255,255,.05)' }}>
                <div style={S.rank}>
                  {i < 3 ? MEDAL[i] : <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: '#5c6a8a' }}>#{i + 1}</span>}
                </div>
                <div style={{ ...S.avatarCircle, backgroundImage: entry.avatar ? `url(${entry.avatar})` : 'none', backgroundColor: '#1a2040' }} />
                <Link to={`/stats/${entry.id}`} style={S.nickname}>{entry.nickname}</Link>
                <div style={S.winRateBar}>
                  <div style={{ ...S.winRateFill, width: `${winPct}%` }} />
                </div>
                <span style={S.pct}>{winPct}%</span>
                <div style={S.wlRow}>
                  <span style={{ color: '#12c8a8', fontWeight: 700 }}>{entry.wins}W</span>
                  <span style={{ color: '#3a4256', margin: '0 4px' }}>/</span>
                  <span style={{ color: '#ef4a63', fontWeight: 700 }}>{entry.losses}L</span>
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
  errorBox: { background: 'rgba(239,74,99,.1)', border: '1px solid rgba(239,74,99,.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, marginBottom: 16 },
  empty: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a', padding: '24px 0' },
  row: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,.02)', border: '1px solid' },
  rank: { width: 32, textAlign: 'center' as const, flex: 'none' as const },
  avatarCircle: { width: 34, height: 34, borderRadius: '50%', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const },
  nickname: { flex: 1, color: '#c7cede', textDecoration: 'none', fontWeight: 600 as const, fontSize: 14 },
  winRateBar: { width: 80, height: 5, borderRadius: 3, background: '#182236', overflow: 'hidden', flex: 'none' as const },
  winRateFill: { height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#12c8a8)', borderRadius: 3 },
  pct: { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#8a93a8', minWidth: 38, textAlign: 'right' as const },
  wlRow: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, display: 'flex', alignItems: 'center', minWidth: 72 },
} as const;
