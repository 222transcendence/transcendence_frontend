import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { logout as apiLogout, fetchMyProfile } from '../api/client';
import type { UserProfile } from '../types/user';
import { FriendSidebar } from '../components/FriendSidebar';
import ChatPanel from '../components/ChatPanel';

export default function HomePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await apiLogout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await fetchMyProfile();
        setUser(profile);
      } catch {
        await apiLogout();
        navigate('/login', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  if (isLoading) {
    return (
      <div className="auth-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
        <h2 style={{ marginBottom: '16px' }}>Loading Terminal...</h2>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid rgba(0, 242, 254, 0.1)',
          borderTopColor: '#00f2fe',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="dashboard-container">
          <div className="dashboard-header">
            <div className="dashboard-user-info">
              <img
                src={user?.avatar}
                onError={(e) => {
                  // Fallback image if avatar endpoint isn't fully set up or image doesn't load
                  e.currentTarget.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=' + (user?.nickname || 'transcendence');
                }}
                alt="User Avatar"
                className="avatar-large"
              />
              <div className="user-details">
                <h2>{user?.nickname}</h2>
                <p>{user?.email}</p>
                <span className="badge-status">{user?.status || 'ONLINE'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link to="/profile" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                My Profile
              </Link>
              <Link to="/lobby" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Game Lobby
              </Link>
              <button className="btn-secondary" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="stat-card">
              <h3>Total Wins</h3>
              <div className="stat-value glow-cyan">{user?.wins || 0}</div>
            </div>
            <div className="stat-card">
              <h3>Total Losses</h3>
              <div className="stat-value glow-purple">{user?.losses || 0}</div>
            </div>
            <div className="stat-card">
              <h3>Win Rate</h3>
              <div className="stat-value">
                {user ? (user.wins + user.losses > 0 ? Math.round((user.wins / (user.wins + user.losses)) * 100) : 0) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <FriendSidebar currentUserId={user?.id || ''} />
      <ChatPanel currentUserId={user?.id || ''} />
    </div>
  );
}
