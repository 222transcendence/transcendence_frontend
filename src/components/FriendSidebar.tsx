import React, { useState, useEffect, useCallback } from 'react';
import { Friend, UserStatus } from '../types/friend';

interface FriendSidebarProps {
  currentUserId: string;
}

const API_BASE_URL = 'http://localhost:3000/api';

export const FriendSidebar: React.FC<FriendSidebarProps> = ({ currentUserId }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/friends`, {
        headers: {
          'x-user-id': currentUserId,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch friends');
      }
      const data = await response.json();
      setFriends(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const addFriend = async () => {
    if (!targetUserId) return;
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/friends/${targetUserId}`, {
        method: 'POST',
        headers: {
          'x-user-id': currentUserId,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add friend');
      }
      setTargetUserId('');
      fetchFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const removeFriend = async (friendId: string) => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/friends/${friendId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': currentUserId,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to remove friend');
      }
      fetchFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case UserStatus.ONLINE:
        return 'var(--status-online, #4caf50)';
      case UserStatus.IN_GAME:
        return 'var(--status-ingame, #ff9800)';
      case UserStatus.OFFLINE:
      default:
        return 'var(--status-offline, #9e9e9e)';
    }
  };

  return (
    <aside className="friend-sidebar">
      <h2>Friends</h2>

      <div className="friend-add-section">
        <h3>User ID로 친구 추가 (임시 ID 입력)</h3>
        <div className="input-group">
          <input
            type="text"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            placeholder="Enter User UUID"
          />
          <button onClick={addFriend} disabled={!targetUserId}>
            Add
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="friend-list-section">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul className="friend-list">
            {friends.length === 0 ? (
              <p>No friends yet.</p>
            ) : (
              friends.map((friend) => (
                <li key={friend.id} className="friend-item">
                  <div className="friend-info">
                    <span
                      className="status-dot"
                      style={{ backgroundColor: getStatusColor(friend.status) }}
                      title={friend.status}
                    />
                    <span className="nickname">{friend.nickname}</span>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={() => removeFriend(friend.id)}
                  >
                    Delete
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="pending-requests-section">
        <h3>Friend Requests</h3>
        <p className="placeholder-text">
          Backend API required (요청 목록 API 추가 후 연동 예정)
        </p>
        <div className="disabled-ui">
          <button disabled>Accept (Disabled)</button>
          <button disabled>Reject (Disabled)</button>
        </div>
      </div>
    </aside>
  );
};
