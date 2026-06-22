import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchMyProfile,
  fetchUserProfile,
  sendFriendRequest,
  updateMyProfile,
  uploadMyAvatar,
} from '../api/client';
import type { PublicUserProfile, UserProfile } from '../types/user';

export default function ProfilePage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [me, setMe] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [friendRequestStatus, setFriendRequestStatus] = useState<'idle' | 'sent' | 'failed'>(
    'idle',
  );

  const isOwnProfile = !id || me?.id === id;

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const myProfile = await fetchMyProfile();
        if (!isMounted) return;
        setMe(myProfile);

        if (!id || id === myProfile.id) {
          setProfile(myProfile);
        } else {
          const targetProfile = await fetchUserProfile(id);
          if (!isMounted) return;
          setProfile(targetProfile);
        }
      } catch (err) {
        if (!isMounted) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const startEditingNickname = () => {
    setNicknameInput(profile?.nickname ?? '');
    setIsEditingNickname(true);
  };

  const cancelEditingNickname = () => {
    setIsEditingNickname(false);
  };

  const saveNickname = async () => {
    if (!nicknameInput.trim()) return;
    setIsSavingNickname(true);
    setErrorMessage('');
    try {
      const updated = await updateMyProfile(nicknameInput.trim());
      setMe(updated);
      setProfile(updated);
      setIsEditingNickname(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update nickname');
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarPreview(URL.createObjectURL(file));
    setIsUploadingAvatar(true);
    setErrorMessage('');
    try {
      const updated = await uploadMyAvatar(file);
      setMe(updated);
      setProfile(updated);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
      setAvatarPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddFriend = async () => {
    if (!id) return;
    try {
      await sendFriendRequest(id);
      setFriendRequestStatus('sent');
    } catch {
      setFriendRequestStatus('failed');
    }
  };

  if (isLoading) {
    return (
      <div
        className="auth-container"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}
      >
        <h2>Loading Profile...</h2>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="auth-container">
        {errorMessage && <div className="alert-error">{errorMessage}</div>}
        <button className="btn-secondary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    );
  }

  const displayedAvatar = avatarPreview || profile.avatar;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-user-info">
          <div style={{ position: 'relative' }}>
            <img
              src={displayedAvatar}
              onError={(e) => {
                e.currentTarget.src =
                  'https://api.dicebear.com/7.x/bottts/svg?seed=' + profile.nickname;
              }}
              alt="User Avatar"
              className="avatar-large"
            />
            {isOwnProfile && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleAvatarFileSelected}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ position: 'absolute', bottom: -8, right: -8, padding: '4px 8px', fontSize: 12 }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? '...' : 'Edit'}
                </button>
              </>
            )}
          </div>

          <div className="user-details">
            {isEditingNickname ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="form-input"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  disabled={isSavingNickname}
                  autoFocus
                />
                <button className="btn-primary" onClick={saveNickname} disabled={isSavingNickname}>
                  Save
                </button>
                <button className="btn-secondary" onClick={cancelEditingNickname}>
                  Cancel
                </button>
              </div>
            ) : (
              <h2 onClick={isOwnProfile ? startEditingNickname : undefined} style={isOwnProfile ? { cursor: 'pointer' } : undefined}>
                {profile.nickname} {isOwnProfile && <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>✎</span>}
              </h2>
            )}
            {'email' in profile && <p>{profile.email}</p>}
            <span className="badge-status">{profile.status}</span>
          </div>
        </div>

        {isOwnProfile ? (
          <button className="btn-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={handleAddFriend}
            disabled={friendRequestStatus === 'sent'}
          >
            {friendRequestStatus === 'sent' ? 'Request Sent' : 'Add Friend'}
          </button>
        )}
      </div>

      {errorMessage && <div className="alert-error">{errorMessage}</div>}
      {friendRequestStatus === 'failed' && (
        <div className="alert-error">Failed to send friend request. Please try again.</div>
      )}

      <div className="dashboard-grid">
        <div className="stat-card">
          <h3>Total Wins</h3>
          <div className="stat-value glow-cyan">{profile.wins}</div>
        </div>
        <div className="stat-card">
          <h3>Total Losses</h3>
          <div className="stat-value glow-purple">{profile.losses}</div>
        </div>
        <div className="stat-card">
          <h3>Win Rate</h3>
          <div className="stat-value">
            {profile.wins + profile.losses > 0
              ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
              : 0}
            %
          </div>
        </div>
      </div>
    </div>
  );
}
