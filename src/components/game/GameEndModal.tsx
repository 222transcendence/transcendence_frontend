import type { MatchSummary } from '../../types/gameAnimation';

interface GameEndModalProps {
  summary: MatchSummary;
  isWinner: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
}

export default function GameEndModal({ summary, isWinner, onRematch, onBackToLobby }: GameEndModalProps) {
  return (
    <div className="game-end-modal-backdrop">
      <div className="game-end-modal">
        <h2 className={isWinner ? 'glow-cyan' : 'glow-purple'}>
          {isWinner ? 'Victory' : 'Defeat'}
        </h2>
        <p>{summary.winnerNickname} vs {summary.loserNickname}</p>
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>Turns Played</h3>
            <div className="stat-value">{summary.turnsPlayed}</div>
          </div>
          <div className="stat-card">
            <h3>Host HP</h3>
            <div className="stat-value">{summary.finalHostHp}</div>
          </div>
          <div className="stat-card">
            <h3>Guest HP</h3>
            <div className="stat-value">{summary.finalGuestHp}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button type="button" className="btn-primary" onClick={onRematch}>
            다시하기
          </button>
          <button type="button" className="btn-secondary" onClick={onBackToLobby}>
            로비로
          </button>
        </div>
      </div>
    </div>
  );
}
