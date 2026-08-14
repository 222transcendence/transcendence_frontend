import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { LobbySocket } from '../api/lobbySocket';
import { fetchMyProfile, fetchUserProfile, sendFriendRequest, getFriends, getSentRequests, getValidAccessToken } from '../api/client';
import type { Room } from '../types/lobby';
import type { PublicUserProfile } from '../types/user';
import type { Friend } from '../types/friend';
import ChatPanel from '../components/ChatPanel';

export default function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);

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
  const chatSocketRef = useRef<Socket | null>(null);

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
        socket.send('JOIN_ROOM', { roomId, characterId: 1 });
        setIsConnecting(false);
      })
      .catch(() => { if (isMounted) { setErrorMessage('로비 서버에 연결할 수 없습니다.'); setIsConnecting(false); } });

    // Chat socket for sending invites
    getValidAccessToken().then(token => {
      if (!token || !isMounted) return;
      const chatSocket = io('/chat', { path: '/socketio', auth: { token: `Bearer ${token}` } });
      chatSocketRef.current = chatSocket;
    });

    return () => {
      isMounted = false;
      unsubs.forEach(u => u());
      if (!isTransitioningToGame) socket.send('LEAVE_ROOM', { roomId });
      socket.disconnect();
      chatSocketRef.current?.disconnect();
      chatSocketRef.current = null;
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
    if (!chatSocketRef.current?.connected || !roomId) return;
    chatSocketRef.current.emit('send_message', {
      content: roomId,
      type: 'INVITE',
      targetUserId: friend.id,
    });
    setInvitedIds(prev => new Set([...prev, friend.id]));
  }, [roomId]);

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
      <div style={S.page}>
        <div style={S.center}><div style={S.spinner} /><div style={S.spinnerText}>방에 입장 중…</div></div>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={S.page}>
        <div style={S.center}>
          {errorMessage && <div style={S.errorBox}>{errorMessage}</div>}
          <button onClick={() => navigate('/lobby')} style={S.ghostBtn}>← 로비로 돌아가기</button>
        </div>
      </div>
    );
  }


  return (
    <div style={S.page}>
      <div style={S.outerLayout}>
        {/* Main content */}
        <div style={S.layout}>
          <div style={S.header}>
            <div style={S.logoText}>BATTLE ROOM</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {room.players.length < room.maxPlayers && (
                <button onClick={openInviteModal} style={S.inviteBtn}>👥 친구 초대</button>
              )}
              <button onClick={() => navigate('/lobby')} style={S.leaveBtn}>방 나가기</button>
            </div>
          </div>

          {errorMessage && <div style={S.errorBox}>{errorMessage}</div>}

          <div style={S.playersRow}>
            {room.players.map(p => {
              const isMe = p.userId === myUserId;
              const isPlayerHost = p.userId === room.hostUserId;
              const avatar = isMe ? myAvatar : otherAvatars[p.userId];
              return (
                <div key={p.userId} style={{ ...S.playerCard, borderColor: p.ready ? '#12c8a8' : 'rgba(255,255,255,.1)' }}>
                  <div style={{ ...S.playerDot, backgroundImage: avatar ? `url(${avatar})` : 'none', backgroundColor: isPlayerHost ? '#12c8a8' : '#ef4a63' }} />
                  <div style={S.playerName}>{p.nickname}</div>
                  <div style={{ ...S.roleTag, color: isPlayerHost ? '#12c8a8' : '#8a93a8' }}>{isPlayerHost ? 'HOST' : 'PLAYER'}</div>
                  <div style={{ ...S.readyBadge, background: p.ready ? 'rgba(18,200,168,.15)' : 'rgba(255,255,255,.05)', color: p.ready ? '#12c8a8' : '#5c6a8a', borderColor: p.ready ? 'rgba(18,200,168,.4)' : 'rgba(255,255,255,.1)' }}>
                    {p.ready ? '● READY' : '○ 대기 중'}
                  </div>
                  {!isMe && (
                    <button onClick={() => openPlayerProfile(p.userId)} style={S.viewProfileBtn}>프로필 보기</button>
                  )}
                </div>
              );
            })}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} style={{ ...S.playerCard, borderStyle: 'dashed', opacity: 0.5 }}>
                <div style={S.waitingIcon}>?</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a', marginTop: 8 }}>플레이어 대기 중…</div>
              </div>
            ))}
          </div>

          {allReady && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <div style={S.startingText}>게임 시작 중…</div>
            </div>
          )}

          {myPlayer && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <button onClick={toggleReady} style={{ ...(myPlayer.ready ? S.cancelBtn : S.readyBtn), minWidth: 180 }}>
                {myPlayer.ready ? '준비 취소' : '준비 완료'}
              </button>
              {isHost && room.players.length < 2 && (
                <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a' }}>
                  다른 플레이어가 입장할 때까지 기다려주세요
                </div>
              )}
            </div>
          )}
        </div>

        {/* 1:1 Chat */}
        {myUserId && (
          <div style={S.chatColumn}>
            <ChatPanel currentUserId={myUserId} roomId={roomId} />
          </div>
        )}
      </div>

      {/* Friend invite modal */}
      {showInviteModal && (
        <div style={PS.backdrop} onClick={() => setShowInviteModal(false)}>
          <div style={PS.modal} onClick={e => e.stopPropagation()}>
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
                      <button
                        onClick={() => sendInvite(f)}
                        disabled={disabled}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 11,
                          cursor: disabled ? 'default' : 'pointer',
                          fontFamily: "'JetBrains Mono',monospace",
                          border: disabled ? '1px solid rgba(255,255,255,.08)' : '1px solid rgba(18,200,168,.4)',
                          background: disabled ? 'transparent' : 'rgba(18,200,168,.1)',
                          color: disabled ? '#3a4256' : '#12c8a8',
                        }}
                      >
                        {invitedIds.has(f.id) ? '초대됨' : inRoom ? '참여 중' : f.status === 'OFFLINE' ? '오프라인' : f.status === 'IN_GAME' ? '게임 중' : '초대'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={() => setShowInviteModal(false)} style={{ ...PS.closeBtn, marginTop: 16 }}>닫기</button>
          </div>
        </div>
      )}

      {/* Player profile popup */}
      {selectedPlayer && (
        <div style={PS.backdrop} onClick={() => setSelectedPlayer(null)}>
          <div style={PS.modal} onClick={e => e.stopPropagation()}>
            <div style={PS.row}>
              <div style={{ ...PS.avatar, backgroundImage: selectedPlayer.profile.avatar ? `url(${selectedPlayer.profile.avatar})` : 'none' }} />
              <div>
                <div style={PS.name}>{selectedPlayer.profile.nickname}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: selectedPlayer.profile.status === 'ONLINE' ? '#12c8a8' : '#5c6a8a', marginTop: 2 }}>● {selectedPlayer.profile.status}</div>
              </div>
            </div>
            <div style={PS.statsRow}>
              {[
                { label: '승', value: selectedPlayer.profile.wins, color: '#12c8a8' },
                { label: '패', value: selectedPlayer.profile.losses, color: '#ef4a63' },
                { label: '승률', value: `${selectedPlayer.profile.wins + selectedPlayer.profile.losses > 0 ? Math.round(selectedPlayer.profile.wins / (selectedPlayer.profile.wins + selectedPlayer.profile.losses) * 100) : 0}%`, color: '#eab308' },
              ].map(item => (
                <div key={item.label} style={PS.statBox}>
                  <div style={PS.statLabel}>{item.label}</div>
                  <div style={{ ...PS.statValue, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            {!isAlreadyFriend && !isPendingRequest && friendStatus === 'idle' && (
              <button onClick={handleAddFriend} style={PS.addBtn}>친구 추가</button>
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
            <button onClick={() => setSelectedPlayer(null)} style={PS.closeBtn}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: 'radial-gradient(ellipse 1000px 600px at 50% -5%, #0e1a24 0%, #05070c 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif", padding: 20 },
  outerLayout: { width: '100%', maxWidth: 980, display: 'flex', gap: 20, alignItems: 'flex-start' },
  layout: { flex: 1, minWidth: 0 },
  chatColumn: { width: 240, flex: 'none' as const, height: 480, alignSelf: 'flex-start' as const },
  center: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  logoText: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 18, letterSpacing: '.2em', color: '#12c8a8' },
  inviteBtn: { padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(18,200,168,.35)', background: 'rgba(18,200,168,.06)', color: '#12c8a8', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, cursor: 'pointer' },
  leaveBtn: { padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(239,74,99,.35)', background: 'rgba(239,74,99,.06)', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, cursor: 'pointer' },
  errorBox: { background: 'rgba(239,74,99,.1)', border: '1px solid rgba(239,74,99,.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, marginBottom: 16 },
  playersRow: { display: 'flex', alignItems: 'stretch', gap: 16, flexWrap: 'wrap' as const },
  playerCard: { flex: '1 1 200px', minWidth: 200, background: '#0d1220', border: '1px solid', borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, transition: 'border-color .3s' },
  playerDot: { width: 56, height: 56, borderRadius: '50%', marginBottom: 4, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' as const },
  playerName: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 18, color: '#e2e8f5' },
  playerChar: { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: '.1em' },
  roleTag: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.15em', color: '#12c8a8', marginTop: 2 },
  readyBadge: { marginTop: 8, padding: '4px 12px', borderRadius: 20, border: '1px solid', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 as const, fontSize: 10, letterSpacing: '.08em', transition: 'all .3s' },
  viewProfileBtn: { marginTop: 8, padding: '4px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#5c6a8a', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: 'pointer' },
  vsBlock: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6, flex: 'none' as const },
  vsText: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 28, color: '#2a3246' },
  startingText: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#12c8a8' },
  waitingIcon: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a4256', fontSize: 20, marginBottom: 4 },
  readyBtn: { padding: '12px 32px', borderRadius: 10, border: '1px solid rgba(18,200,168,.5)', background: 'rgba(18,200,168,.12)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 16, cursor: 'pointer', letterSpacing: '.05em' },
  cancelBtn: { padding: '12px 32px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: '#8a93a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 16, cursor: 'pointer' },
  ghostBtn: { padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: '#8a93a8', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, cursor: 'pointer' },
  spinner: { width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(18,200,168,.2)', borderTopColor: '#12c8a8', animation: 'spin 0.8s linear infinite' },
  spinnerText: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a' },
} as const;

const PS = {
  backdrop: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#0d1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '24px 20px', minWidth: 280, boxShadow: '0 20px 50px rgba(0,0,0,.6)' },
  row: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  avatar: { width: 52, height: 52, borderRadius: '50%', background: '#1a2040', border: '2px solid rgba(18,200,168,.35)', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const },
  name: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 18, color: '#e2e8f5' },
  statsRow: { display: 'flex', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' as const },
  statLabel: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5c6a8a', letterSpacing: '.08em', marginBottom: 6 },
  statValue: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 24 },
  addBtn: { width: '100%', padding: '9px 0', borderRadius: 9, border: '1px solid rgba(18,200,168,.5)', background: 'rgba(18,200,168,.1)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'pointer', marginBottom: 8 },
  closeBtn: { width: '100%', padding: '8px 0', borderRadius: 9, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#5c6a8a', fontFamily: "'Rajdhani',sans-serif", fontSize: 13, cursor: 'pointer', marginTop: 4 },
} as const;
