import React, { useState, useEffect, useCallback } from 'react';
import type { Friend, UserStatus } from '../types/friend';
import {
  getFriends,
  sendFriendRequestByNickname,
  removeFriend as apiRemoveFriend,
  getPendingRequests,
  respondFriendRequest,
  type PendingRequest,
} from '../api/client';

interface FriendSidebarProps {
  currentUserId: string;
}

export const FriendSidebar: React.FC<FriendSidebarProps> = ({ currentUserId }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [targetNickname, setTargetNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      const [friendsData, pendingData] = await Promise.all([
        getFriends(),
        getPendingRequests(),
      ]);
      setFriends(friendsData);
      setPendingRequests(pendingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchAll();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [fetchAll]);

  const addFriend = async () => {
    if (!targetNickname.trim()) return;
    setError(null);
    try {
      await sendFriendRequestByNickname(targetNickname.trim());
      setTargetNickname('');
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const removeFriendHandler = async (friendId: string) => {
    setError(null);
    try {
      await apiRemoveFriend(friendId);
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleRespondRequest = async (requestId: string, action: 'accept' | 'reject') => {
    setError(null);
    try {
      await respondFriendRequest(requestId, action);
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'ONLINE':
        return 'var(--status-online, #4caf50)';
      case 'IN_GAME':
        return 'var(--status-ingame, #ff9800)';
      case 'OFFLINE':
      default:
        return 'var(--status-offline, #9e9e9e)';
    }
  };

  return (
    <aside className="friend-sidebar">
      <h2>Friends</h2>

      <div className="friend-add-section">
        <h3>닉네임으로 친구 추가</h3>
        <div className="input-group">
          <input
            type="text"
            value={targetNickname}
            onChange={(e) => setTargetNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            placeholder="Enter nickname"
          />
          <button onClick={addFriend} disabled={!targetNickname.trim()}>
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
                    onClick={() => removeFriendHandler(friend.id)}
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
        {pendingRequests.length === 0 ? (
          <p className="placeholder-text">No pending requests.</p>
        ) : (
          <ul className="pending-list">
            {pendingRequests.map((req) => (
              <li key={req.id} className="pending-item">
                <span className="nickname">{req.requester.nickname}</span>
                <div className="pending-actions">
                  <button
                    className="accept-btn"
                    onClick={() => handleRespondRequest(req.id, 'accept')}
                  >
                    Accept
                  </button>
                  <button
                    className="reject-btn"
                    onClick={() => handleRespondRequest(req.id, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
};
