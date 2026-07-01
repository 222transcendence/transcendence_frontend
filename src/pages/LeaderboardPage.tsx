import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchLeaderboard } from '../api/gameStats';
import type { LeaderboardEntry } from '../types/gameStats';

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard()
      .then(setEntries)
      .catch(() => setError('Failed to load leaderboard.'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="auth-container">
        <h2>Loading Leaderboard...</h2>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Leaderboard</h2>
        <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="leaderboard-list">
        {entries.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No ranked players yet.</p>
        ) : (
          entries.map((entry, index) => (
            <div key={entry.id} className="leaderboard-row">
              <span className={`leaderboard-rank rank-${index + 1}`}>#{index + 1}</span>
              <img
                src={entry.avatar}
                alt={entry.nickname}
                className="avatar-small"
                onError={(e) => {
                  e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${entry.nickname}`;
                }}
              />
              <Link to={`/stats/${entry.id}`} className="leaderboard-nickname">
                {entry.nickname}
              </Link>
              <div className="leaderboard-stats">
                <span className="glow-cyan">{entry.wins}W</span>
                <span style={{ color: 'var(--text-muted)' }}>/</span>
                <span style={{ color: 'var(--accent-neon)' }}>{entry.losses}L</span>
              </div>
              <div className="winrate-bar-bg" style={{ flex: 1, maxWidth: 120 }}>
                <div
                  className="winrate-bar-fill"
                  style={{ width: `${Math.round(entry.winRate * 100)}%` }}
                />
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>
                {Math.round(entry.winRate * 100)}%
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
