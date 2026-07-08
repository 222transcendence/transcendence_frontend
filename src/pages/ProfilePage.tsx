import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { fetchMyProfile, fetchUserProfile, sendFriendRequest, updateMyProfile, uploadMyAvatar } from '../api/client';
import type { PublicUserProfile, UserProfile } from '../types/user';
import PageLayout from '../components/PageLayout';

export default function ProfilePage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [me, setMe] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [nicknameInput, setNicknameInput] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [friendStatus, setFriendStatus] = useState<'idle' | 'sent' | 'failed'>('idle');

  const isOwnProfile = !id || me?.id === id;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const myProfile = await fetchMyProfile();
        if (!isMounted) return;
        setMe(myProfile);
        if (!id || id === myProfile.id) setProfile(myProfile);
        else { const p = await fetchUserProfile(id); if (isMounted) setProfile(p); }
      } catch (err) {
        if (isMounted) setErrorMessage(err instanceof Error ? err.message : '프로필을 불러올 수 없습니다.');
      } finally { if (isMounted) setIsLoading(false); }
    })();
    return () => { isMounted = false; };
  }, [id]);

  const saveNickname = async () => {
    if (!nicknameInput.trim()) return;
    setIsSavingNickname(true);
    try {
      const updated = await updateMyProfile(nicknameInput.trim());
      setMe(updated); setProfile(updated); setIsEditingNickname(false);
    } catch { setErrorMessage('닉네임 변경에 실패했습니다.'); }
    finally { setIsSavingNickname(false); }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    setIsUploadingAvatar(true);
    try {
      const updated = await uploadMyAvatar(file);
      setMe(updated); setProfile(updated); setAvatarPreview(null);
    } catch { setErrorMessage('아바타 업로드에 실패했습니다.'); setAvatarPreview(null); }
    finally { setIsUploadingAvatar(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleAddFriend = async () => {
    if (!id) return;
    try { await sendFriendRequest(id); setFriendStatus('sent'); }
    catch { setFriendStatus('failed'); }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#05070c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a' }}>불러오는 중…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <PageLayout title="프로필">
        {errorMessage && <div style={S.errorBox}>{errorMessage}</div>}
      </PageLayout>
    );
  }

  const displayedAvatar = avatarPreview ?? profile.avatar ?? '';

  return (
    <PageLayout
      title={isOwnProfile ? '내 프로필' : `${profile.nickname}의 프로필`}
      actions={
        !isOwnProfile ? (
          <button
            onClick={handleAddFriend}
            disabled={friendStatus === 'sent'}
            style={friendStatus === 'sent' ? S.sentBtn : S.addFriendBtn}
          >
            {friendStatus === 'sent' ? '요청 완료' : '친구 추가'}
          </button>
        ) : undefined
      }
    >
      {errorMessage && <div style={S.errorBox}>{errorMessage}</div>}

      {/* Avatar + info */}
      <div style={S.topRow}>
        <div style={{ position: 'relative' as const }}>
          <div style={{ ...S.avatar, backgroundImage: displayedAvatar ? `url(${displayedAvatar})` : 'none' }} />
          {isOwnProfile && (
            <>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarSelect} />
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingAvatar} style={S.editAvatarBtn}>
                {isUploadingAvatar ? '…' : '✎'}
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1 }}>
          {isEditingNickname ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveNickname()}
                autoFocus
                style={S.nicknameInput}
              />
              <button onClick={saveNickname} disabled={isSavingNickname} style={S.saveBtn}>저장</button>
              <button onClick={() => setIsEditingNickname(false)} style={S.cancelBtn}>취소</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={S.profileName}>{profile.nickname}</div>
              {isOwnProfile && (
                <button onClick={() => { setNicknameInput(profile.nickname); setIsEditingNickname(true); }} style={S.editNickBtn}>✎ 편집</button>
              )}
            </div>
          )}
          {'email' in profile && <div style={S.email}>{profile.email}</div>}
          <div style={{ ...S.statusBadge, background: profile.status === 'ONLINE' ? 'rgba(18,200,168,.1)' : 'rgba(255,255,255,.05)', color: profile.status === 'ONLINE' ? '#12c8a8' : '#5c6a8a' }}>
            ● {profile.status}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={S.statGrid}>
        {[
          { label: '승리', value: profile.wins, color: '#12c8a8' },
          { label: '패배', value: profile.losses, color: '#ef4a63' },
          { label: '승률', value: `${profile.wins + profile.losses > 0 ? Math.round(profile.wins / (profile.wins + profile.losses) * 100) : 0}%`, color: '#eab308' },
        ].map(item => (
          <div key={item.label} style={S.statCard}>
            <div style={S.statLabel}>{item.label}</div>
            <div style={{ ...S.statValue, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Full stats link */}
      <div style={{ marginTop: 20 }}>
        <Link to={`/stats${id ? `/${id}` : ''}`} style={S.statsLink}>전체 전적 기록 보기 →</Link>
      </div>
    </PageLayout>
  );
}

const S = {
  topRow: { display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 28 },
  avatar: { width: 72, height: 72, borderRadius: '50%', border: '2px solid rgba(18,200,168,.4)', backgroundSize: 'cover', backgroundPosition: 'center', background: '#1a2040' },
  editAvatarBtn: { position: 'absolute' as const, bottom: -4, right: -4, width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(18,200,168,.5)', background: '#0d1220', color: '#12c8a8', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  profileName: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 22, color: '#e2e8f5' },
  email: { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a', marginBottom: 8 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700 as const },
  nicknameInput: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(18,200,168,.4)', background: '#111827', color: '#e2e8f5', fontFamily: "'Rajdhani',sans-serif", fontSize: 16, outline: 'none' },
  saveBtn: { padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(18,200,168,.5)', background: 'rgba(18,200,168,.1)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'pointer' },
  cancelBtn: { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: '#8a93a8', fontFamily: "'Rajdhani',sans-serif", fontSize: 13, cursor: 'pointer' },
  editNickBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: '#5c6a8a', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: 'pointer' },
  addFriendBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(18,200,168,.5)', background: 'rgba(18,200,168,.1)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'pointer' },
  sentBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#5c6a8a', fontFamily: "'Rajdhani',sans-serif", fontSize: 13, cursor: 'default' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 },
  statCard: { background: '#0d1220', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: '16px 12px', textAlign: 'center' as const },
  statLabel: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5c6a8a', letterSpacing: '.1em', marginBottom: 8 },
  statValue: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 32 },
  statsLink: { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8', textDecoration: 'none' },
  errorBox: { background: 'rgba(239,74,99,.1)', border: '1px solid rgba(239,74,99,.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, marginBottom: 16 },
} as const;
