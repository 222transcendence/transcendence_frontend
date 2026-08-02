import type { MatchSummary } from '../../types/gameAnimation';

interface GameEndModalProps {
  summary: MatchSummary;
  isWinner: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
}

export default function GameEndModal({ summary, isWinner, onRematch, onBackToLobby }: GameEndModalProps) {
  return (
    <div style={S.backdrop}>
      <div style={S.modal}>
        <div style={{ ...S.resultText, color: isWinner ? '#12c8a8' : '#ef4a63' }}>
          {isWinner ? 'VICTORY' : 'DEFEAT'}
        </div>
        <div style={S.matchup}>
          <span style={{ color: '#12c8a8', fontWeight: 700 }}>{summary.winnerNickname}</span>
          <span style={{ color: '#3a4256', margin: '0 10px' }}>vs</span>
          <span style={{ color: '#5c6a8a' }}>{summary.loserNickname}</span>
        </div>
        <div style={S.statsRow}>
          {[
            { label: '총 턴', value: summary.turnsPlayed },
            { label: '호스트 HP', value: summary.finalHostHp },
            { label: '게스트 HP', value: summary.finalGuestHp },
          ].map(item => (
            <div key={item.label} style={S.statBox}>
              <div style={S.statLabel}>{item.label}</div>
              <div style={S.statValue}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={S.actions}>
          <button onClick={onRematch} style={S.primaryBtn}>다시 플레이</button>
          <button onClick={onBackToLobby} style={S.ghostBtn}>로비로</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.7)',
    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 200,
  },
  modal: {
    background: '#0d1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20,
    padding: '36px 32px', width: '90%', maxWidth: 420, textAlign: 'center' as const,
    boxShadow: '0 24px 60px rgba(0,0,0,.6)',
  },
  resultText: {
    fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const,
    fontSize: 40, letterSpacing: '.15em', marginBottom: 8,
  },
  matchup: { fontFamily: "'Inter',sans-serif", fontSize: 14, marginBottom: 28, color: '#c7cede' },
  statsRow: { display: 'flex', gap: 10, marginBottom: 28 },
  statBox: {
    flex: 1, background: 'rgba(255,255,255,.03)',
    border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '12px 8px',
  },
  statLabel: {
    fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
    color: '#5c6a8a', letterSpacing: '.1em', marginBottom: 6,
  },
  statValue: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 26, color: '#e2e8f5' },
  actions: { display: 'flex', gap: 10 },
  primaryBtn: {
    flex: 1, padding: '11px 0', borderRadius: 9, border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.12)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const, fontSize: 14, cursor: 'pointer',
  },
  ghostBtn: {
    flex: 1, padding: '11px 0', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)',
    background: 'transparent', color: '#8a93a8', fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const, fontSize: 14, cursor: 'pointer',
  },
} as const;
