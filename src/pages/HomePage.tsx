import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FriendSidebar } from '../components/FriendSidebar';

interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatar: string;
  status: string;
  wins: number;
  losses: number;
}

export default function HomePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const handleLogout = async () => {
    const accessToken = localStorage.getItem('accessToken');
    
    try {
      if (accessToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
      }
    } catch (err) {
      console.error('Logout request failed', err);
    } finally {
      localStorage.clear();
      navigate('/login', { replace: true });
    }
  };

  const fetchProfile = async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (response.ok && !result.error) {
        setUser(result.data);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  };

  const tryTokenRefresh = async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      const result = await response.json();
      if (response.ok && !result.error && result.data?.accessToken) {
        const newAccessToken = result.data.accessToken;
        localStorage.setItem('accessToken', newAccessToken);
        return newAccessToken;
      }
    } catch (err) {
      console.error('Token refresh failed', err);
    }
    return null;
  };

  useEffect(() => {
    const loadProfile = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        handleLogout();
        return;
      }

      const success = await fetchProfile(token);
      if (!success) {
        // Try refreshing token
        const newAccessToken = await tryTokenRefresh();
        if (newAccessToken) {
          const secondSuccess = await fetchProfile(newAccessToken);
          if (secondSuccess) {
            setIsLoading(false);
            return;
          }
        }
        // If refresh fails
        handleLogout();
      } else {
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
    </div>
  );
}
