import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { LobbySocket } from '../api/lobbySocket';
import { fetchMyProfile, fetchUserProfile, sendFriendRequest, getFriends, getSentRequests } from '../api/client';
import { useChatSocketContext } from '../context/ChatSocketContext';
import type { Room } from '../types/lobby';
import type { PublicUserProfile } from '../types/user';
import type { Friend } from '../types/friend';
import ChatPanel from '../components/ChatPanel';

export default function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);
  const { socket: chatSocket } = useChatSocketContext();

  const [room, setRoom] = useState<Room | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [otherAvatars, setOtherAvatars] = useState<Record<string, string | null>>({});
  const [selectedPlayer, setSelectedPlayer] = useState<{ userId: string; profile: PublicUserProfile } | null>(null);
  const [isAlreadyFriend, setIsAlreadyFriend] = useState(false);
  const [isPendingRequest, setIsPendingRequest] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [friendErrorMsg, setFriendErrorMsg] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!roomId) return;
    const socket = new LobbySocket();
    socketRef.current = socket;
    let isMounted = true;
    let isTransitioningToGame = false;

    const unsubs = [
      socket.on('ROOM_UPDATED', ({ room: r }) => { if (isMounted && r.id === roomId) { setRoom(r); setErrorMessage(''); } }),
      socket.on('ROOM_CLOSED', ({ roomId: id }) => {
        if (isMounted && id === roomId) { setErrorMessage('호스트가 방을 나갔습니다.'); setRoom(null); }
      }),
      socket.on('GAME_START', ({ roomId: id }) => {
        if (id === roomId) { isTransitioningToGame = true; navigate(`/game/${roomId}`); }
      }),
      socket.on('ACTION_REJECTED', ({ message }) => {
        // JOIN_ROOM 관련 정상 에러 (host 자신의 방, 이미 IN_GAME 상태) — 무시
        // 'Already in this room': 방을 만든 host 본인 또는 이미 참가한 유저가
        // 재접속 시 자동으로 보내는 JOIN_ROOM이 거부되는 정상 케이스 (game.service.ts
        // joinRoom()이 host/guest를 구분하지 않고 players[] 포함 여부로만 판단하므로
        // 예전 'Cannot join your own room' 메시지 대신 이 문구가 온다)
        const ignored = ['Cannot join your own room', 'Already in this room', 'Room is not in WAITING status', 'Room is already full'];
        if (isMounted && !ignored.includes(message)) setErrorMessage(message);
      }),
    ];

    fetchMyProfile().then(me => { if (isMounted) { setMyUserId(me.id); setMyAvatar(me.avatar ?? null); } }).catch(() => {});

    socket.connect()
      .then(async () => {
        if (!isMounted) return;
        // GET_ROOM으로 현재 방 상태 조회
        socket.send('GET_ROOM', { roomId });
        // 초대 수락 등으로 직접 진입한 경우 guest로 JOIN_ROOM 시도
        // 이미 host이거나 이미 참가한 경우 ACTION_REJECTED가 오므로 무시
        socket.send('JOIN_ROOM', { roomId });
        setIsConnecting(false);
      })
      .catch(() => { if (isMounted) { setErrorMessage('로비 서버에 연결할 수 없습니다.'); setIsConnecting(false); } });

    return () => {
      isMounted = false;
      unsubs.forEach(u => u());
      if (!isTransitioningToGame) socket.send('LEAVE_ROOM', { roomId });
      socket.disconnect();
    };
  }, [roomId, navigate]);

  const openInviteModal = useCallback(async () => {
    try {
      const list = await getFriends();
      setFriends(list);
    } catch { /* ignore */ }
    setShowInviteModal(true);
  }, []);

  const sendInvite = useCallback((friend: Friend) => {
    if (!chatSocket?.connected || !roomId) return;
    chatSocket.emit('send_message', {
      content: roomId,
      type: 'INVITE',
      targetUserId: friend.id,
    });
    setInvitedIds(prev => new Set([...prev, friend.id]));
  }, [roomId, chatSocket]);

  const myPlayer = room?.players.find(p => p.userId === myUserId);
  const isHost = room?.hostUserId === myUserId;
  const otherPlayers = room?.players.filter(p => p.userId !== myUserId) ?? [];
  const emptySlots = room ? Math.max(0, room.maxPlayers - room.players.length) : 0;
  const allReady = room ? room.players.length >= 2 && room.players.every(p => p.ready) : false;

  useEffect(() => {
    otherPlayers.forEach(p => {
      if (p.userId in otherAvatars) return;
      fetchUserProfile(p.userId).then(prof => {
        setOtherAvatars(prev => ({ ...prev, [p.userId]: prof.avatar ?? null }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const toggleReady = () => {
    if (!roomId || !myPlayer) return;
    socketRef.current?.send('SET_READY', { roomId, ready: !myPlayer.ready });
  };

  const openPlayerProfile = async (userId: string) => {
    try {
      const [profile, friends, sentRequests] = await Promise.all([
        fetchUserProfile(userId),
        getFriends(),
        getSentRequests(),
      ]);
      setSelectedPlayer({ userId, profile });
      setIsAlreadyFriend(friends.some(f => f.id === userId));
      setIsPendingRequest(sentRequests.some(r => r.receiver.id === userId));
      setFriendStatus('idle');
      setFriendErrorMsg('');
    } catch { /* ignore */ }
  };

  const handleAddFriend = async () => {
    if (!selectedPlayer) return;
    try {
      await sendFriendRequest(selectedPlayer.userId);
      setFriendStatus('sent');
    } catch (error) {
      setFriendStatus('failed');
      if (error instanceof Error) {
        switch (error.message) {
          case 'Already friends':
            setIsAlreadyFriend(true);
            break;
          case 'Friend request already exists':
            setIsPendingRequest(true);
            break;
          default:
            setFriendErrorMsg('요청 실패: 잠시 후 다시 시도해주세요.');
        }
      }
    }
  };

  if (isConnecting) {
    return (
      <Page>
        <Center><Spinner /><SpinnerText>방에 입장 중…</SpinnerText></Center>
      </Page>
    );
  }

  if (!room) {
    return (
      <Page>
        <Center>
          {errorMessage && <ErrorBox>{errorMessage}</ErrorBox>}
          <GhostBtn onClick={() => navigate('/lobby')}>← 로비로 돌아가기</GhostBtn>
        </Center>
      </Page>
    );
  }


  return (
    <Page>
      <OuterLayout>
        {/* Main content */}
        <Layout>
          <Header>
            <LogoText>BATTLE ROOM</LogoText>
            <div style={{ display: 'flex', gap: 8 }}>
              {room.players.length < room.maxPlayers && (
                <InviteBtn onClick={openInviteModal}>👥 친구 초대</InviteBtn>
              )}
              <LeaveBtn onClick={() => navigate('/lobby')}>방 나가기</LeaveBtn>
            </div>
          </Header>

          {errorMessage && <ErrorBox>{errorMessage}</ErrorBox>}

          <PlayersRow>
            {room.players.map(p => {
              const isMe = p.userId === myUserId;
              const isPlayerHost = p.userId === room.hostUserId;
              const avatar = isMe ? myAvatar : otherAvatars[p.userId];
              return (
                <PlayerCard key={p.userId} style={{ borderColor: p.ready ? '#12c8a8' : 'rgba(255,255,255,.1)' }}>
                  <PlayerDot style={{ backgroundImage: avatar ? `url(${avatar})` : 'none', backgroundColor: isPlayerHost ? '#12c8a8' : '#ef4a63' }} />
                  <PlayerName>{p.nickname}</PlayerName>
                  <RoleTag style={{ color: isPlayerHost ? '#12c8a8' : '#8a93a8' }}>{isPlayerHost ? 'HOST' : 'PLAYER'}</RoleTag>
                  <ReadyBadge style={{ background: p.ready ? 'rgba(18,200,168,.15)' : 'rgba(255,255,255,.05)', color: p.ready ? '#12c8a8' : '#5c6a8a', borderColor: p.ready ? 'rgba(18,200,168,.4)' : 'rgba(255,255,255,.1)' }}>
                    {p.ready ? '● READY' : '○ 대기 중'}
                  </ReadyBadge>
                  {!isMe && (
                    <ViewProfileBtn onClick={() => openPlayerProfile(p.userId)}>프로필 보기</ViewProfileBtn>
                  )}
                </PlayerCard>
              );
            })}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <PlayerCard key={`empty-${i}`} style={{ borderStyle: 'dashed', opacity: 0.5 }}>
                <WaitingIcon>?</WaitingIcon>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a', marginTop: 8 }}>플레이어 대기 중…</div>
              </PlayerCard>
            ))}
          </PlayersRow>

          {allReady && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <StartingText>게임 시작 중…</StartingText>
            </div>
          )}

          {myPlayer && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              {myPlayer.ready ? (
                <CancelBtn onClick={toggleReady} style={{ minWidth: 180 }}>준비 취소</CancelBtn>
              ) : (
                <ReadyBtn onClick={toggleReady} style={{ minWidth: 180 }}>준비 완료</ReadyBtn>
              )}
              {isHost && room.players.length < 2 && (
                <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a' }}>
                  다른 플레이어가 입장할 때까지 기다려주세요
                </div>
              )}
            </div>
          )}
        </Layout>

        {/* 1:1 Chat */}
        {myUserId && (
          <ChatColumn>
            <ChatPanel currentUserId={myUserId} roomId={roomId} />
          </ChatColumn>
        )}
      </OuterLayout>

      {/* Friend invite modal */}
      {showInviteModal && (
        <Backdrop onClick={() => setShowInviteModal(false)}>
          <Modal onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 18, color: '#e2e8f5', marginBottom: 16 }}>
              친구 초대
            </div>
            {friends.length === 0 ? (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a', textAlign: 'center', padding: '20px 0' }}>
                친구 목록이 없습니다
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {friends.map(f => {
                  const inRoom = room?.players.some(p => p.userId === f.id) ?? false;
                  const disabled = f.status !== 'ONLINE' || invitedIds.has(f.id) || inRoom;
                  return (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: f.status === 'ONLINE' ? '#12c8a8' : f.status === 'IN_GAME' ? '#eab308' : '#3a4256', flexShrink: 0 }} />
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#e2e8f5' }}>{f.nickname}</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#5c6a8a' }}>{f.status}</span>
                      </div>
                      <InviteFriendBtn
                        onClick={() => sendInvite(f)}
                        disabled={disabled}
                        $disabled={disabled}
                      >
                        {invitedIds.has(f.id) ? '초대됨' : inRoom ? '참여 중' : f.status === 'OFFLINE' ? '오프라인' : f.status === 'IN_GAME' ? '게임 중' : '초대'}
                      </InviteFriendBtn>
                    </div>
                  );
                })}
              </div>
            )}
            <CloseBtn onClick={() => setShowInviteModal(false)} style={{ marginTop: 16 }}>닫기</CloseBtn>
          </Modal>
        </Backdrop>
      )}

      {/* Player profile popup */}
      {selectedPlayer && (
        <Backdrop onClick={() => setSelectedPlayer(null)}>
          <Modal onClick={e => e.stopPropagation()}>
            <ProfileRow>
              <ProfileAvatar style={{ backgroundImage: selectedPlayer.profile.avatar ? `url(${selectedPlayer.profile.avatar})` : 'none' }} />
              <div>
                <ProfileNameText>{selectedPlayer.profile.nickname}</ProfileNameText>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: selectedPlayer.profile.status === 'ONLINE' ? '#12c8a8' : '#5c6a8a', marginTop: 2 }}>● {selectedPlayer.profile.status}</div>
              </div>
            </ProfileRow>
            <StatsRow>
              {[
                { label: '승', value: selectedPlayer.profile.wins, color: '#12c8a8' },
                { label: '패', value: selectedPlayer.profile.losses, color: '#ef4a63' },
                { label: '승률', value: `${selectedPlayer.profile.wins + selectedPlayer.profile.losses > 0 ? Math.round(selectedPlayer.profile.wins / (selectedPlayer.profile.wins + selectedPlayer.profile.losses) * 100) : 0}%`, color: '#eab308' },
              ].map(item => (
                <StatBox key={item.label}>
                  <StatLabel>{item.label}</StatLabel>
                  <StatValue style={{ color: item.color }}>{item.value}</StatValue>
                </StatBox>
              ))}
            </StatsRow>
            {!isAlreadyFriend && !isPendingRequest && friendStatus === 'idle' && (
              <AddBtn onClick={handleAddFriend}>친구 추가</AddBtn>
            )}
            {(isAlreadyFriend || isPendingRequest || friendStatus === 'sent') && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a', textAlign: 'center' as const, marginTop: 8 }}>
                {isAlreadyFriend ? '이미 친구입니다' : friendStatus === 'sent' ? '친구 요청을 보냈습니다' : '이미 친구 요청을 보냈습니다'}
              </div>
            )}
            {friendStatus === 'failed' && friendErrorMsg && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#ef4a63', textAlign: 'center' as const, marginTop: 8 }}>
                {friendErrorMsg}
              </div>
            )}
            <CloseBtn onClick={() => setSelectedPlayer(null)}>닫기</CloseBtn>
          </Modal>
        </Backdrop>
      )}
    </Page>
  );
}

const Page = styled.div`
  min-height: 100dvh;
  background: radial-gradient(ellipse 1000px 600px at 50% -5%, #0e1a24 0%, #05070c 60%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', sans-serif;
  padding: 20px;
`;

const OuterLayout = styled.div`
  width: 100%;
  max-width: 980px;
  display: flex;
  gap: 20px;
  align-items: flex-start;
`;

const Layout = styled.div`
  flex: 1;
  min-width: 0;
`;

const ChatColumn = styled.div`
  width: 240px;
  flex: none;
  height: 480px;
  align-self: flex-start;
`;

const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
`;

const LogoText = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 0.2em;
  color: #12c8a8;
`;

const InviteBtn = styled.button`
  padding: 6px 14px;
  border-radius: 7px;
  border: 1px solid rgba(18, 200, 168, 0.35);
  background: rgba(18, 200, 168, 0.06);
  color: #12c8a8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  cursor: pointer;
`;

const LeaveBtn = styled.button`
  padding: 6px 14px;
  border-radius: 7px;
  border: 1px solid rgba(239, 74, 99, 0.35);
  background: rgba(239, 74, 99, 0.06);
  color: #ef4a63;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  cursor: pointer;
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

const PlayersRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 16px;
  flex-wrap: wrap;
`;

const PlayerCard = styled.div`
  flex: 1 1 200px;
  min-width: 200px;
  background: #0d1220;
  border: 1px solid;
  border-radius: 16px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: border-color 0.3s;
`;

const PlayerDot = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  margin-bottom: 4px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
`;

const PlayerName = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 18px;
  color: #e2e8f5;
`;

const RoleTag = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.15em;
  color: #12c8a8;
  margin-top: 2px;
`;

const ReadyBadge = styled.div`
  margin-top: 8px;
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.08em;
  transition: all 0.3s;
`;

const ViewProfileBtn = styled.button`
  margin-top: 8px;
  padding: 4px 12px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #5c6a8a;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  cursor: pointer;
`;

const StartingText = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #12c8a8;
`;

const WaitingIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3a4256;
  font-size: 20px;
  margin-bottom: 4px;
`;

const ReadyBtn = styled.button`
  padding: 12px 32px;
  border-radius: 10px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.12);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  letter-spacing: 0.05em;
`;

const CancelBtn = styled.button`
  padding: 12px 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: #8a93a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
`;

const GhostBtn = styled.button`
  padding: 9px 18px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #8a93a8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  cursor: pointer;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid rgba(18, 200, 168, 0.2);
  border-top-color: #12c8a8;
  animation: spin 0.8s linear infinite;
`;

const SpinnerText = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #5c6a8a;
`;

const InviteFriendBtn = styled.button<{ $disabled: boolean }>`
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  cursor: ${p => (p.$disabled ? 'default' : 'pointer')};
  border: ${p => (p.$disabled ? '1px solid rgba(255,255,255,.08)' : '1px solid rgba(18,200,168,.4)')};
  background: ${p => (p.$disabled ? 'transparent' : 'rgba(18,200,168,.1)')};
  color: ${p => (p.$disabled ? '#3a4256' : '#12c8a8')};
`;

// ── Modal (invite / profile popup) styles ───────────────────────────────────
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const Modal = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px 20px;
  min-width: 280px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
`;

const ProfileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
`;

const ProfileAvatar = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #1a2040;
  border: 2px solid rgba(18, 200, 168, 0.35);
  background-size: cover;
  background-position: center;
  flex: none;
`;

const ProfileNameText = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 18px;
  color: #e2e8f5;
`;

const StatsRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const StatBox = styled.div`
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 10px 8px;
  text-align: center;
`;

const StatLabel = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #5c6a8a;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
`;

const StatValue = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 24px;
`;

const AddBtn = styled.button`
  width: 100%;
  padding: 9px 0;
  border-radius: 9px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.1);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 8px;
`;

const CloseBtn = styled.button`
  width: 100%;
  padding: 8px 0;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #5c6a8a;
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px;
  cursor: pointer;
  margin-top: 4px;
`;
