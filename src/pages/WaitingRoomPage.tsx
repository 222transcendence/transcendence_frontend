import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LobbySocket } from '../api/lobbySocket';
import { fetchMyProfile, fetchUserProfile, sendFriendRequest, getFriends } from '../api/client';
import type { Room } from '../types/lobby';
import type { PublicUserProfile } from '../types/user';
import { CHARACTERS } from '../data/characters';
import ChatPanel from '../components/ChatPanel';

function characterInfo(characterId: number) {
  return CHARACTERS.find(c => c.id === characterId) ?? { name: String(characterId), color: '#5c6a8a' };
}

export default function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [oppProfile, setOppProfile] = useState<PublicUserProfile | null>(null);
  const [isAlreadyFriend, setIsAlreadyFriend] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'idle' | 'sent' | 'failed'>('idle');

  useEffect(() => {
    if (!roomId) return;
    const socket = new LobbySocket();
    socketRef.current = socket;
    let isMounted = true;
    let isTransitioningToGame = false;

    const unsubs = [
      socket.on('ROOM_UPDATED', ({ room: r }) => { if (isMounted && r.id === roomId) setRoom(r); }),
      socket.on('ROOM_CLOSED', ({ roomId: id }) => {
        if (isMounted && id === roomId) { setErrorMessage('호스트가 방을 나갔습니다.'); setRoom(null); }
      }),
      socket.on('GAME_START', ({ roomId: id }) => {
        if (id === roomId) { isTransitioningToGame = true; navigate(`/game/${roomId}`); }
      }),
      socket.on('ACTION_REJECTED', ({ message }) => { if (isMounted) setErrorMessage(message); }),
    ];

    fetchMyProfile().then(me => { if (isMounted) setMyUserId(me.id); }).catch(() => {});

    socket.connect()
      .then(() => { if (!isMounted) return; socket.send('GET_ROOM', { roomId }); setIsConnecting(false); })
      .catch(() => { if (isMounted) { setErrorMessage('로비 서버에 연결할 수 없습니다.'); setIsConnecting(false); } });

    return () => {
      isMounted = false;
      unsubs.forEach(u => u());
      if (!isTransitioningToGame) socket.send('LEAVE_ROOM', { roomId });
      socket.disconnect();
    };
  }, [roomId, navigate]);

  const myPlayer = room && (room.host.userId === myUserId ? room.host : room.guest);
  const isHost = room?.host.userId === myUserId;
  const opponent = room && (isHost ? room.guest : room.host);

  const toggleReady = () => {
    if (!roomId || !myPlayer) return;
    socketRef.current?.send('SET_READY', { roomId, ready: !myPlayer.ready });
  };

  const openOppProfile = async () => {
    if (!opponent) return;
    try {
      const [profile, friends] = await Promise.all([
        fetchUserProfile(opponent.userId),
        getFriends(),
      ]);
      setOppProfile(profile);
      setIsAlreadyFriend(friends.some(f => f.id === opponent.userId));
    } catch { /* ignore */ }
  };

  const handleAddFriend = async () => {
    if (!opponent) return;
    try { await sendFriendRequest(opponent.userId); setFriendStatus('sent'); }
    catch { setFriendStatus('failed'); }
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

  const hostChar = characterInfo(room.host.characterId);
  const guestChar = room.guest ? characterInfo(room.guest.characterId) : null;

  return (
    <div style={S.page}>
      <div style={S.outerLayout}>
        {/* Main content */}
        <div style={S.layout}>
          <div style={S.header}>
            <div style={S.logoText}>BATTLE ROOM</div>
            <button onClick={() => navigate('/lobby')} style={S.leaveBtn}>방 나가기</button>
          </div>

          {errorMessage && <div style={S.errorBox}>{errorMessage}</div>}

          <div style={S.playersRow}>
            {/* Host */}
            <div style={{ ...S.playerCard, borderColor: room.host.ready ? '#12c8a8' : 'rgba(255,255,255,.1)' }}>
              <div style={{ ...S.playerDot, background: hostChar.color }} />
              <div style={S.playerName}>{room.host.nickname}</div>
              <div style={{ ...S.playerChar, color: hostChar.color }}>{hostChar.name}</div>
              <div style={S.roleTag}>HOST</div>
              <div style={{ ...S.readyBadge, background: room.host.ready ? 'rgba(18,200,168,.15)' : 'rgba(255,255,255,.05)', color: room.host.ready ? '#12c8a8' : '#5c6a8a', borderColor: room.host.ready ? 'rgba(18,200,168,.4)' : 'rgba(255,255,255,.1)' }}>
                {room.host.ready ? '● READY' : '○ 대기 중'}
              </div>
              {/* Opponent view button (shown to guest looking at host) */}
              {!isHost && (
                <button onClick={openOppProfile} style={S.viewProfileBtn}>프로필 보기</button>
              )}
            </div>

            <div style={S.vsBlock}>
              <div style={S.vsText}>VS</div>
              {room.host.ready && room.guest?.ready && <div style={S.startingText}>게임 시작 중…</div>}
            </div>

            {/* Guest */}
            {room.guest ? (
              <div style={{ ...S.playerCard, borderColor: room.guest.ready ? '#12c8a8' : 'rgba(255,255,255,.1)' }}>
                <div style={{ ...S.playerDot, background: guestChar?.color ?? '#5c6a8a' }} />
                <div style={S.playerName}>{room.guest.nickname}</div>
                <div style={{ ...S.playerChar, color: guestChar?.color ?? '#5c6a8a' }}>{guestChar?.name}</div>
                <div style={{ ...S.roleTag, color: '#8a93a8' }}>GUEST</div>
                <div style={{ ...S.readyBadge, background: room.guest.ready ? 'rgba(18,200,168,.15)' : 'rgba(255,255,255,.05)', color: room.guest.ready ? '#12c8a8' : '#5c6a8a', borderColor: room.guest.ready ? 'rgba(18,200,168,.4)' : 'rgba(255,255,255,.1)' }}>
                  {room.guest.ready ? '● READY' : '○ 대기 중'}
                </div>
                {/* Host can view guest profile */}
                {isHost && (
                  <button onClick={openOppProfile} style={S.viewProfileBtn}>프로필 보기</button>
                )}
              </div>
            ) : (
              <div style={{ ...S.playerCard, borderStyle: 'dashed', opacity: 0.5 }}>
                <div style={S.waitingIcon}>?</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a', marginTop: 8 }}>게스트 대기 중…</div>
              </div>
            )}
          </div>

          {myPlayer && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <button onClick={toggleReady} style={{ ...(myPlayer.ready ? S.cancelBtn : S.readyBtn), minWidth: 180 }}>
                {myPlayer.ready ? '준비 취소' : '준비 완료'}
              </button>
              {isHost && !room.guest && (
                <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a' }}>
                  게스트가 입장할 때까지 기다려주세요
                </div>
              )}
            </div>
          )}
        </div>

        {/* 1:1 Chat */}
        {myUserId && room.guest && (
          <div style={S.chatColumn}>
            <ChatPanel currentUserId={myUserId} roomId={roomId} />
          </div>
        )}
      </div>

      {/* Opponent profile popup */}
      {oppProfile && (
        <div style={PS.backdrop} onClick={() => setOppProfile(null)}>
          <div style={PS.modal} onClick={e => e.stopPropagation()}>
            <div style={PS.row}>
              <div style={{ ...PS.avatar, backgroundImage: oppProfile.avatar ? `url(${oppProfile.avatar})` : 'none' }} />
              <div>
                <div style={PS.name}>{oppProfile.nickname}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: oppProfile.status === 'ONLINE' ? '#12c8a8' : '#5c6a8a', marginTop: 2 }}>● {oppProfile.status}</div>
              </div>
            </div>
            <div style={PS.statsRow}>
              {[
                { label: '승', value: oppProfile.wins, color: '#12c8a8' },
                { label: '패', value: oppProfile.losses, color: '#ef4a63' },
                { label: '승률', value: `${oppProfile.wins + oppProfile.losses > 0 ? Math.round(oppProfile.wins / (oppProfile.wins + oppProfile.losses) * 100) : 0}%`, color: '#eab308' },
              ].map(item => (
                <div key={item.label} style={PS.statBox}>
                  <div style={PS.statLabel}>{item.label}</div>
                  <div style={{ ...PS.statValue, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            {!isAlreadyFriend && friendStatus === 'idle' && (
              <button onClick={handleAddFriend} style={PS.addBtn}>친구 추가</button>
            )}
            {(isAlreadyFriend || friendStatus === 'sent') && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5c6a8a', textAlign: 'center' as const, marginTop: 8 }}>
                {isAlreadyFriend ? '이미 친구입니다' : '친구 요청을 보냈습니다'}
              </div>
            )}
            <button onClick={() => setOppProfile(null)} style={PS.closeBtn}>닫기</button>
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
  leaveBtn: { padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(239,74,99,.35)', background: 'rgba(239,74,99,.06)', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, cursor: 'pointer' },
  errorBox: { background: 'rgba(239,74,99,.1)', border: '1px solid rgba(239,74,99,.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, marginBottom: 16 },
  playersRow: { display: 'flex', alignItems: 'center', gap: 20 },
  playerCard: { flex: 1, background: '#0d1220', border: '1px solid', borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, transition: 'border-color .3s' },
  playerDot: { width: 48, height: 48, borderRadius: '50%', marginBottom: 4 },
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
