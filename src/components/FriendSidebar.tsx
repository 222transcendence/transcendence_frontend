import React, { useState, useEffect, useCallback } from 'react';
import type { Friend, UserStatus } from '../types/friend';
import type { PublicUserProfile } from '../types/user';
import {
  getFriends,
  sendFriendRequestByNickname,
  removeFriend as apiRemoveFriend,
  getPendingRequests,
  respondFriendRequest,
  fetchUserProfile,
  type PendingRequest,
} from '../api/client';

interface ProfilePopup {
  user: PublicUserProfile;
  x: number;
  y: number;
}

interface FriendSidebarProps {
  currentUserId: string;
}

export const FriendSidebar: React.FC<FriendSidebarProps> = ({ currentUserId }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [targetNickname, setTargetNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<ProfilePopup | null>(null);

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
      case 'ONLINE': return 'var(--status-online, #4caf50)';
      case 'IN_GAME': return 'var(--status-ingame, #ff9800)';
      case 'OFFLINE': default: return 'var(--status-offline, #9e9e9e)';
    }
  };

  const getStatusLabel = (status: UserStatus) => {
    switch (status) {
      case 'ONLINE': return 'Online';
      case 'IN_GAME': return 'In Game';
      case 'OFFLINE': default: return 'Offline';
    }
  };

  const handleNicknameClick = async (e: React.MouseEvent, friendId: string) => {
    e.stopPropagation();
    try {
      const user = await fetchUserProfile(friendId);
      setPopup({ user, x: e.clientX, y: e.clientY });
    } catch {
      // ignore
    }
  };

  return (
    <aside className="friend-sidebar" onClick={() => setPopup(null)}>
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
                    />
                    <div className="friend-name-group">
                      <button
                        className="friend-nickname-btn"
                        onClick={(e) => handleNicknameClick(e, friend.id)}
                      >
                        {friend.nickname}
                      </button>
                      <span className="friend-status-label" style={{ color: getStatusColor(friend.status) }}>
                        {getStatusLabel(friend.status)}
                      </span>
                    </div>
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

      {popup && (
        <div
          className="friend-profile-popup"
          style={{ top: popup.y, left: Math.min(popup.x, window.innerWidth - 200) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="friend-profile-popup-header">
            <img
              src={popup.user.avatar || '/default_avatar.png'}
              alt="avatar"
              className="friend-profile-popup-avatar"
            />
            <span className="friend-profile-popup-nickname">{popup.user.nickname}</span>
          </div>
          <div className="friend-profile-popup-stats">
            승: {popup.user.wins} / 패: {popup.user.losses}
          </div>
          <button className="friend-profile-popup-close" onClick={() => setPopup(null)}>
            닫기
          </button>
        </div>
      )}
    </aside>
  );
};
