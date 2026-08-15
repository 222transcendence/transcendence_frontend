import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import {
  fetchMyProfile, fetchUserProfile, sendFriendRequest,
  updateMyProfile, uploadMyAvatar, deleteMyAvatar,
  getFriends,
} from '../api/client';
import type { PublicUserProfile, UserProfile } from '../types/user';
import PageLayout from '../components/PageLayout';
import { useWordFontSize, WORD_FONT_SIZE_MIN, WORD_FONT_SIZE_MAX } from '../hooks/useWordFontSize';

// Default avatar pool — shown when no avatar set
const DEFAULT_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=alpha&backgroundColor=0d1220',
  'https://api.dicebear.com/7.x/bottts/svg?seed=beta&backgroundColor=0d1220',
  'https://api.dicebear.com/7.x/bottts/svg?seed=gamma&backgroundColor=0d1220',
  'https://api.dicebear.com/7.x/bottts/svg?seed=delta&backgroundColor=0d1220',
  'https://api.dicebear.com/7.x/bottts/svg?seed=epsilon&backgroundColor=0d1220',
];

function getDefaultAvatar(userId: string) {
  const sum = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return DEFAULT_AVATARS[sum % DEFAULT_AVATARS.length];
}

export default function ProfilePage() {
  const { id } = useParams<{ id?: string }>();

  const [me, setMe] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAlreadyFriend, setIsAlreadyFriend] = useState(false);

  const [nicknameInput, setNicknameInput] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameMsg, setNicknameMsg] = useState('');

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
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
        if (!id || id === myProfile.id) {
          setProfile(myProfile);
        } else {
          const [p, friendList] = await Promise.all([
            fetchUserProfile(id),
            getFriends(),
          ]);
          if (isMounted) {
            setProfile(p);
            setIsAlreadyFriend(friendList.some(f => f.id === id));
          }
        }
      } catch (err) {
        if (isMounted) setErrorMessage(err instanceof Error ? err.message : '프로필을 불러올 수 없습니다.');
      } finally { if (isMounted) setIsLoading(false); }
    })();
    return () => { isMounted = false; };
  }, [id]);

  const saveNickname = async () => {
    if (!nicknameInput.trim()) return;
    setIsSavingNickname(true);
    setNicknameMsg('');
    try {
      const updated = await updateMyProfile(nicknameInput.trim());
      setMe(updated); setProfile(updated); setIsEditingNickname(false);
      setNicknameMsg('닉네임이 변경되었습니다.');
    } catch { setNicknameMsg('닉네임 변경에 실패했습니다.'); }
    finally { setIsSavingNickname(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true); setAvatarMsg(''); setAvatarMenuOpen(false);
    try {
      const updated = await uploadMyAvatar(file);
      setMe(updated); setProfile(updated); setAvatarMsg('프로필 사진이 변경되었습니다.');
    } catch { setAvatarMsg('업로드 실패: 이미지 파일을 확인해주세요.'); }
    finally { setIsUploadingAvatar(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleAvatarDelete = async () => {
    setIsDeletingAvatar(true); setAvatarMsg(''); setAvatarMenuOpen(false);
    try {
      const updated = await deleteMyAvatar();
      setMe(updated); setProfile(updated); setAvatarMsg('프로필 사진이 삭제되었습니다.');
    } catch { setAvatarMsg('삭제 실패: 다시 시도해주세요.'); }
    finally { setIsDeletingAvatar(false); }
  };

  const handleAddFriend = async () => {
    if (!id) return;
    try { await sendFriendRequest(id); setFriendStatus('sent'); }
    catch { setFriendStatus('failed'); }
  };

  if (isLoading) {
    return (
      <LoadingPage>
        <LoadingText>불러오는 중…</LoadingText>
      </LoadingPage>
    );
  }

  if (!profile) {
    return (
      <PageLayout title="프로필">
        {errorMessage && <ErrorBox>{errorMessage}</ErrorBox>}
      </PageLayout>
    );
  }

  const displayedAvatar = profile.avatar || getDefaultAvatar(profile.id);
  const hasCustomAvatar = !!profile.avatar;

  return (
    <PageLayout
      title={isOwnProfile ? '내 프로필' : `${profile.nickname}의 프로필`}
      actions={
        !isOwnProfile && !isAlreadyFriend && friendStatus === 'idle' ? (
          <AddFriendBtn onClick={handleAddFriend}>친구 추가</AddFriendBtn>
        ) : !isOwnProfile && (isAlreadyFriend || friendStatus === 'sent') ? (
          <SentBtn>{isAlreadyFriend ? '이미 친구' : '요청 완료'}</SentBtn>
        ) : undefined
      }
    >
      {errorMessage && <ErrorBox>{errorMessage}</ErrorBox>}

      {/* Avatar + info */}
      <TopRow onClick={() => setAvatarMenuOpen(false)}>
        <div style={{ position: 'relative' as const }}>
          <Avatar style={{ backgroundImage: `url(${displayedAvatar})` }} />
          {isOwnProfile && (
            <>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              <EditAvatarBtn
                onClick={e => { e.stopPropagation(); setAvatarMenuOpen(o => !o); }}
                disabled={isUploadingAvatar || isDeletingAvatar}
              >
                {(isUploadingAvatar || isDeletingAvatar) ? '…' : '✎'}
              </EditAvatarBtn>
              {avatarMenuOpen && (
                <AvatarMenu onClick={e => e.stopPropagation()}>
                  <AvatarMenuItem onClick={() => { setAvatarMenuOpen(false); fileInputRef.current?.click(); }}>사진 업로드</AvatarMenuItem>
                  {hasCustomAvatar && (
                    <AvatarMenuItem $danger onClick={handleAvatarDelete}>사진 삭제</AvatarMenuItem>
                  )}
                </AvatarMenu>
              )}
            </>
          )}
        </div>

        <div style={{ flex: 1 }}>
          {isOwnProfile && isEditingNickname ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <NicknameInput
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveNickname()}
                autoFocus
              />
              <SaveBtn onClick={saveNickname} disabled={isSavingNickname}>저장</SaveBtn>
              <CancelBtn onClick={() => setIsEditingNickname(false)}>취소</CancelBtn>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <ProfileName>{profile.nickname}</ProfileName>
              {isOwnProfile && (
                <EditNickBtn onClick={() => { setNicknameInput(profile.nickname); setIsEditingNickname(true); }}>✎ 편집</EditNickBtn>
              )}
            </div>
          )}
          {'email' in profile && <Email>{profile.email}</Email>}
          <StatusBadge $online={profile.status === 'ONLINE'}>
            ● {profile.status}
          </StatusBadge>
          {(avatarMsg || nicknameMsg) && (
            <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8' }}>
              {avatarMsg || nicknameMsg}
            </div>
          )}
        </div>
      </TopRow>

      {/* Stat cards */}
      <StatGrid>
        {[
          { label: '승리', value: profile.wins, color: '#12c8a8' },
          { label: '패배', value: profile.losses, color: '#ef4a63' },
          { label: '승률', value: `${profile.wins + profile.losses > 0 ? Math.round(profile.wins / (profile.wins + profile.losses) * 100) : 0}%`, color: '#eab308' },
        ].map(item => (
          <StatCard key={item.label}>
            <StatLabel>{item.label}</StatLabel>
            <StatValue style={{ color: item.color }}>{item.value}</StatValue>
          </StatCard>
        ))}
      </StatGrid>

      <div style={{ marginTop: 20 }}>
        <StatsLink to={`/stats${id ? `/${id}` : `/${me?.id ?? ''}`}`}>전체 전적 기록 보기 →</StatsLink>
      </div>

      {isOwnProfile && <GameSettingsSection />}
    </PageLayout>
  );
}

// ── Game settings (word font size) ───────────────────────────────────────────
function GameSettingsSection() {
  const { fontSize, increase, decrease } = useWordFontSize();
  return (
    <SettingsSection>
      <SettingsTitle>게임 설정</SettingsTitle>
      <SettingsRow>
        <SettingsLabel>단어 글자 크기 (게임 중 +/- 키로도 조절 가능)</SettingsLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FontSizeBtn
            onClick={decrease}
            disabled={fontSize <= WORD_FONT_SIZE_MIN}
          >
            −
          </FontSizeBtn>
          <FontSizeValue>{fontSize}px</FontSizeValue>
          <FontSizeBtn
            onClick={increase}
            disabled={fontSize >= WORD_FONT_SIZE_MAX}
          >
            +
          </FontSizeBtn>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}

const LoadingPage = styled.div`
  min-height: 100dvh;
  background: #05070c;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingText = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #5c6a8a;
`;

const TopRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 28px;
`;

const Avatar = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid rgba(18, 200, 168, 0.4);
  background-size: cover;
  background-position: center;
  background-color: #1a2040;
  overflow: hidden;
`;

const EditAvatarBtn = styled.button`
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: #0d1220;
  color: #12c8a8;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const AvatarMenu = styled.div`
  position: absolute;
  top: 80px;
  left: 0;
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 10;
  min-width: 130px;
`;

const AvatarMenuItem = styled.button<{ $danger?: boolean }>`
  display: block;
  width: 100%;
  padding: 9px 14px;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: ${p => (p.$danger ? '#ef4a63' : '#c7cede')};
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
`;

const ProfileName = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 22px;
  color: #e2e8f5;
`;

const Email = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #5c6a8a;
  margin-bottom: 8px;
`;

const StatusBadge = styled.div<{ $online: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  background: ${p => (p.$online ? 'rgba(18,200,168,.1)' : 'rgba(255,255,255,.05)')};
  color: ${p => (p.$online ? '#12c8a8' : '#5c6a8a')};
`;

const NicknameInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(18, 200, 168, 0.4);
  background: #111827;
  color: #e2e8f5;
  font-family: 'Rajdhani', sans-serif;
  font-size: 16px;
  outline: none;
`;

const SaveBtn = styled.button`
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.1);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
`;

const CancelBtn = styled.button`
  padding: 7px 12px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: #8a93a8;
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px;
  cursor: pointer;
`;

const EditNickBtn = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: #5c6a8a;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  cursor: pointer;
`;

const AddFriendBtn = styled.button`
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.1);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
`;

const SentBtn = styled.span`
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #5c6a8a;
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px;
  display: inline-block;
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
`;

const StatCard = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 16px 12px;
  text-align: center;
`;

const StatLabel = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #5c6a8a;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 32px;
`;

const StatsLink = styled(Link)`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #12c8a8;
  text-decoration: none;
`;

const ErrorBox = styled.div`
  background: rgba(239, 74, 99, 0.1);
  border: 1px solid rgba(239, 74, 99, 0.3);
  border-radius: 10px;
  padding: 10px 14px;
  color: #ef4a63;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  margin-bottom: 16px;
`;

const SettingsSection = styled.div`
  margin-top: 28px;
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 16px 18px;
`;

const SettingsTitle = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: #e2e8f5;
  margin-bottom: 12px;
`;

const SettingsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const SettingsLabel = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #8a93a8;
`;

const FontSizeBtn = styled.button`
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #c7cede;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const FontSizeValue = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #12c8a8;
  min-width: 34px;
  text-align: center;
`;
