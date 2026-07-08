import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { fetchChatHistory } from '../api/client';
import type { ChatMessage } from '../types/chat';
import { LobbySocket } from '../api/lobbySocket';
import {
  fetchMyProfile, updateMyProfile, uploadMyAvatar, deleteMyAvatar,
  getFriends, removeFriend,
  sendFriendRequestByNickname, getPendingRequests, respondFriendRequest,
  type PendingRequest,
} from '../api/client';
import CharacterSelectModal from '../components/CharacterSelectModal';
import type { Room } from '../types/lobby';
import type { Friend } from '../types/friend';

type Tab = 'lobby' | 'friends' | 'stats' | 'settings';

interface Stats { wins: number; losses: number; winRate: number; totalGames: number; }

export default function LobbyPage() {
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const awaitingOwnRoomRef = useRef(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('lobby');
  const [myNickname, setMyNickname] = useState('');
  const [myAvatar, setMyAvatar] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [pendingJoinRoom, setPendingJoinRoom] = useState<Room | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Friends
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [addNickname, setAddNickname] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [friendPopup, setFriendPopup] = useState<Friend | null>(null);

  // Settings — separate message states
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameMsg, setNicknameMsg] = useState('');
  const [avatarMsg, setAvatarMsg] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchMyProfile().then(me => {
      myUserIdRef.current = me.id;
      setMyUserId(me.id);
      setMyNickname(me.nickname);
      setMyAvatar(me.avatar ?? '');
      setNicknameInput(me.nickname);
    }).catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  useEffect(() => {
    const socket = new LobbySocket();
    socketRef.current = socket;
    let isMounted = true;

    const unsubs = [
      socket.on('ROOM_LIST', ({ rooms: roomList }) => { if (isMounted) setRooms(roomList); }),
      socket.on('ROOM_UPDATED', ({ room }) => {
        if (!isMounted) return;
        setRooms(prev => {
          const idx = prev.findIndex(r => r.id === room.id);
          if (idx === -1) return [...prev, room];
          const next = [...prev]; next[idx] = room; return next;
        });
        if (awaitingOwnRoomRef.current && room.host.userId === myUserIdRef.current) {
          awaitingOwnRoomRef.current = false;
          navigate(`/lobby/${room.id}`);
        }
      }),
      socket.on('ROOM_CLOSED', ({ roomId }) => { if (isMounted) setRooms(prev => prev.filter(r => r.id !== roomId)); }),
      socket.on('ACTION_REJECTED', ({ message }) => { if (isMounted) setConnectionError(message); }),
    ];

    socket.connect()
      .then(() => { if (isMounted) { socket.send('LIST_ROOMS', {}); setIsConnecting(false); } })
      .catch(() => { if (isMounted) { setConnectionError('로비 서버에 연결할 수 없습니다.'); setIsConnecting(false); } });

    return () => { isMounted = false; unsubs.forEach(u => u()); socket.disconnect(); };
  }, [navigate]);

  const loadFriends = useCallback(() => {
    getFriends().then(setFriends).catch(() => {});
    getPendingRequests().then(setPendingRequests).catch(() => {});
  }, []);

  useEffect(() => { if (tab === 'friends') loadFriends(); }, [tab, loadFriends]);

  useEffect(() => {
    if (tab === 'stats' && myUserId) {
      fetch(`/api/game/users/${myUserId}/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      }).then(r => r.json()).then(j => { if (j.data) setStats(j.data); }).catch(() => {});
    }
  }, [tab, myUserId]);

  const handleCreateRoom = (characterId: number) => {
    awaitingOwnRoomRef.current = true;
    socketRef.current?.send('CREATE_ROOM', { characterId });
    setIsCreatingRoom(false);
  };

  const handleJoinRoom = (characterId: number) => {
    if (!pendingJoinRoom) return;
    socketRef.current?.send('JOIN_ROOM', { roomId: pendingJoinRoom.id, characterId });
    navigate(`/lobby/${pendingJoinRoom.id}`);
    setPendingJoinRoom(null);
  };

  const handleAddFriend = async () => {
    if (!addNickname.trim()) return;
    try { await sendFriendRequestByNickname(addNickname.trim()); setAddMsg('친구 요청을 보냈습니다.'); setAddNickname(''); }
    catch { setAddMsg('요청 실패: 닉네임을 확인해주세요.'); }
  };

  const handleRespondRequest = async (requestId: string, action: 'accept' | 'reject') => {
    await respondFriendRequest(requestId, action).catch(() => {});
    loadFriends();
  };

  const handleRemoveFriend = async (friendId: string) => {
    await removeFriend(friendId).catch(() => {});
    setFriends(prev => prev.filter(f => f.id !== friendId));
  };

  const handleSaveNickname = async () => {
    if (!nicknameInput.trim()) return;
    try { await updateMyProfile(nicknameInput.trim()); setMyNickname(nicknameInput.trim()); setNicknameMsg('닉네임이 변경되었습니다.'); }
    catch { setNicknameMsg('변경 실패: 이미 사용 중인 닉네임입니다.'); }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    setAvatarMsg('');
    try {
      const updated = await uploadMyAvatar(file);
      setMyAvatar(updated.avatar ?? '');
      setAvatarMsg('프로필 사진이 변경되었습니다.');
    } catch { setAvatarMsg('업로드 실패: 이미지 파일을 확인해주세요.'); }
    finally { setIsUploadingAvatar(false); if (avatarFileRef.current) avatarFileRef.current.value = ''; }
  };

  const handleDeleteAvatar = async () => {
    setIsDeletingAvatar(true);
    setAvatarMsg('');
    try {
      await deleteMyAvatar();
      setMyAvatar('');
      setAvatarMsg('프로필 사진이 삭제되었습니다.');
    } catch { setAvatarMsg('삭제 실패: 다시 시도해주세요.'); }
    finally { setIsDeletingAvatar(false); }
  };

  return (
    <div style={S.page} onClick={() => setProfileMenuOpen(false)}>
      {/* Sidebar */}
      <nav style={S.sidebar}>
        <div style={S.logo}>TRANSCENDENCE</div>

        {/* Profile card — clickable, shows dropdown */}
        <div style={{ position: 'relative' as const }}>
          <button
            onClick={e => { e.stopPropagation(); setProfileMenuOpen(o => !o); }}
            style={S.userChip}
          >
            <div style={{ ...S.avatar, backgroundImage: myAvatar ? `url(${myAvatar})` : 'none' }} />
            <div style={{ flex: 1, textAlign: 'left' as const }}>
              <div style={S.userName}>{myNickname || '…'}</div>
              <div style={S.userOnline}>● Online</div>
            </div>
            <div style={{ color: '#5c6a8a', fontSize: 10 }}>{profileMenuOpen ? '▲' : '▼'}</div>
          </button>
          {profileMenuOpen && (
            <div style={S.profileDropdown} onClick={e => e.stopPropagation()}>
              <Link to={`/profile`} style={S.dropdownItem} onClick={() => setProfileMenuOpen(false)}>내 프로필</Link>
              <Link to="/leaderboard" style={S.dropdownItem} onClick={() => setProfileMenuOpen(false)}>리더보드</Link>
              <div style={S.dropdownDivider} />
              <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={S.dropdownDangerItem}>로그아웃</button>
            </div>
          )}
        </div>

        <div style={S.navList}>
          {(['lobby', 'friends', 'stats', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.navBtn, ...(tab === t ? S.navBtnActive : {}) }}>
              {NAV_ICON[t]} {NAV_LABEL[t]}
            </button>
          ))}
        </div>
      </nav>

      {/* Main */}
      <main style={S.main}>
        {tab === 'lobby' && (
          <LobbyTab
            rooms={rooms} isConnecting={isConnecting} connectionError={connectionError}
            onCreateRoom={() => setIsCreatingRoom(true)} onJoinRoom={setPendingJoinRoom}
            currentUserId={myUserId}
          />
        )}
        {tab === 'friends' && (
          <div style={{ flex: 1, overflowY: 'auto' as const }}>
            <FriendsTab
              friends={friends} pendingRequests={pendingRequests}
              addNickname={addNickname} addMsg={addMsg}
              onAddNicknameChange={setAddNickname} onAddFriend={handleAddFriend}
              onRespond={handleRespondRequest} onRemove={handleRemoveFriend}
              onFriendClick={setFriendPopup}
            />
          </div>
        )}
        {tab === 'stats' && <div style={{ flex: 1, overflowY: 'auto' as const }}><StatsTab stats={stats} userId={myUserId} /></div>}
        {tab === 'settings' && (
          <div style={{ flex: 1, overflowY: 'auto' as const }}>
            <SettingsTab
              nicknameInput={nicknameInput} nicknameMsg={nicknameMsg}
              avatarMsg={avatarMsg} myAvatar={myAvatar}
              isUploadingAvatar={isUploadingAvatar} isDeletingAvatar={isDeletingAvatar}
              avatarFileRef={avatarFileRef}
              onNicknameChange={setNicknameInput} onSaveNickname={handleSaveNickname}
              onAvatarSelect={handleAvatarSelect} onDeleteAvatar={handleDeleteAvatar}
            />
          </div>
        )}
      </main>

      {isCreatingRoom && (
        <CharacterSelectModal title="캐릭터를 선택하세요" onConfirm={handleCreateRoom} onCancel={() => setIsCreatingRoom(false)} />
      )}
      {pendingJoinRoom && (
        <CharacterSelectModal title={`${pendingJoinRoom.host.nickname}의 방에 참가`} onConfirm={handleJoinRoom} onCancel={() => setPendingJoinRoom(null)} />
      )}
      {friendPopup && (
        <FriendProfilePopup friend={friendPopup} onClose={() => setFriendPopup(null)} />
      )}

    </div>
  );
}

// ── Sub-tabs ──────────────────────────────────────────────────────────────────

function LobbyTab({ rooms, isConnecting, connectionError, onCreateRoom, onJoinRoom, currentUserId }: {
  rooms: Room[]; isConnecting: boolean; connectionError: string;
  onCreateRoom: () => void; onJoinRoom: (room: Room) => void;
  currentUserId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%' }}>
      {/* Rooms section — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto' as const, paddingBottom: 12 }}>
        <div style={S.sectionHeader}>
          <div>
            <div style={S.sectionTitle}>게임 로비</div>
            <div style={S.sectionSub}>{rooms.length}개 방이 열려있습니다</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCreateRoom} disabled={isConnecting} style={S.primaryBtn}>+ 방 만들기</button>
            <button disabled style={{ ...S.ghostBtn, opacity: 0.4, cursor: 'not-allowed' }}>랜덤 매칭</button>
            <button disabled style={{ ...S.ghostBtn, opacity: 0.4, cursor: 'not-allowed' }}>AI 대전</button>
          </div>
        </div>
        {connectionError && <div style={S.errorBanner}>{connectionError}</div>}
        {isConnecting ? (
          <div style={S.emptyState}>로비에 연결 중…</div>
        ) : rooms.length === 0 ? (
          <div style={S.emptyState}>열린 방이 없습니다. 방을 만들어보세요!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
            {rooms.map(room => (
              <div key={room.id} style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={S.cardTitle}>{room.host.nickname}의 방</div>
                  <div style={S.cardSub}>{room.guest ? '2/2 명 · 게임 중' : '1/2 명 · 대기 중'}</div>
                </div>
                <button onClick={() => onJoinRoom(room)} disabled={!!room.guest} style={room.guest ? S.disabledBtn : S.primaryBtn}>
                  {room.guest ? '참가 불가' : '참가하기'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global chat — fixed at bottom */}
      {currentUserId && <GlobalChatPanel currentUserId={currentUserId} />}
    </div>
  );
}

function GlobalChatPanel({ currentUserId }: { currentUserId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io('/chat', { path: '/socketio', auth: { token: `Bearer ${token}` } });
    socketRef.current = socket;

    socket.on('connect', async () => {
      try {
        const history = await fetchChatHistory();
        setMessages(history.filter(m => !m.roomId));
      } catch { /* non-fatal */ }
    });

    socket.on('receive_message', (msg: ChatMessage) => {
      if (!msg.roomId) setMessages(prev => [...prev, msg]);
    });

    socket.on('connect_error', () => socket.disconnect());

    return () => { socket.disconnect(); socketRef.current = null; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const content = input.trim();
    if (!content || !socketRef.current?.connected) return;
    socketRef.current.emit('send_message', { content, type: 'NORMAL' });
    setInput('');
  };

  return (
    <div style={CS.panel}>
      <div style={CS.header}>
        <span style={CS.headerLabel}>GLOBAL CHAT</span>
      </div>
      <div style={CS.messages}>
        {messages.length === 0 && (
          <div style={CS.empty}>아직 메시지가 없습니다</div>
        )}
        {messages.map(msg => {
          const isMine = msg.sender.id === currentUserId;
          return (
            <div key={msg.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {!isMine && (
                <span style={CS.nick}>{msg.sender.nickname}:</span>
              )}
              {isMine && (
                <span style={{ ...CS.nick, color: '#12c8a8' }}>나:</span>
              )}
              <span style={CS.text}>{msg.content}</span>
              <span style={CS.time}>{new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={CS.inputRow}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="메시지 입력..."
          style={CS.input}
        />
        <button onClick={send} disabled={!input.trim()} style={{ ...CS.sendBtn, opacity: input.trim() ? 1 : 0.4 }}>전송</button>
      </div>
    </div>
  );
}

const CS = {
  panel: { borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column' as const, height: 220, flex: 'none' as const },
  header: { padding: '8px 0 6px', display: 'flex', alignItems: 'center' },
  headerLabel: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: '.14em', color: '#3a4256' },
  messages: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 5 },
  empty: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3a4256', textAlign: 'center' as const, paddingTop: 16 },
  nick: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, color: '#5c6a8a', whiteSpace: 'nowrap' as const, flex: 'none' as const },
  text: { fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c7cede', wordBreak: 'break-word' as const, flex: 1 },
  time: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#2a3246', whiteSpace: 'nowrap' as const, flex: 'none' as const },
  inputRow: { display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.05)', marginTop: 4 },
  input: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#e2e8f5', fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none' },
  sendBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(18,200,168,.4)', background: 'rgba(18,200,168,.08)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'pointer' },
} as const;

function FriendsTab({ friends, pendingRequests, addNickname, addMsg, onAddNicknameChange, onAddFriend, onRespond, onRemove, onFriendClick }: {
  friends: Friend[]; pendingRequests: PendingRequest[]; addNickname: string; addMsg: string;
  onAddNicknameChange: (v: string) => void; onAddFriend: () => void;
  onRespond: (id: string, action: 'accept' | 'reject') => void;
  onRemove: (id: string) => void;
  onFriendClick: (f: Friend) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={S.sectionTitle}>친구 목록</div>

      {/* Add */}
      <div style={S.card}>
        <div style={S.cardTitle}>친구 추가</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={addNickname} onChange={e => onAddNicknameChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAddFriend()} placeholder="닉네임 입력" style={S.input} />
          <button onClick={onAddFriend} style={S.primaryBtn}>요청</button>
        </div>
        {addMsg && <div style={S.infoText}>{addMsg}</div>}
      </div>

      {/* Pending requests — always visible */}
      <div style={S.card}>
        <div style={S.cardTitle}>친구 요청 {pendingRequests.length > 0 && <span style={{ color: '#ef4a63', marginLeft: 6 }}>({pendingRequests.length})</span>}</div>
        {pendingRequests.length === 0 ? (
          <div style={{ ...S.cardSub, marginTop: 8 }}>받은 친구 요청이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ ...S.friendAvatar, backgroundImage: req.requester.avatar ? `url(${req.requester.avatar})` : 'none' }} />
                  <span style={{ fontSize: 13, color: '#c7cede' }}>{req.requester.nickname}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onRespond(req.id, 'accept')} style={S.primaryBtnSm}>수락</button>
                  <button onClick={() => onRespond(req.id, 'reject')} style={S.dangerBtnSm}>거절</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friend list */}
      <div style={S.card}>
        <div style={S.cardTitle}>친구 ({friends.length})</div>
        {friends.length === 0 ? (
          <div style={{ ...S.cardSub, marginTop: 8 }}>친구가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {friends.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => onFriendClick(f)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ ...S.friendAvatar, backgroundImage: f.avatar ? `url(${f.avatar})` : 'none' }} />
                  <span style={{ fontSize: 8, color: f.status === 'ONLINE' ? '#12c8a8' : f.status === 'IN_GAME' ? '#eab308' : '#5c6a8a' }}>●</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c7cede' }}>{f.nickname}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5c6a8a' }}>{f.status}</span>
                </button>
                <button onClick={() => onRemove(f.id)} style={S.dangerBtnSm}>삭제</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsTab({ stats, userId }: { stats: Stats | null; userId: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={S.sectionTitle}>내 통계</div>
        {userId && <Link to={`/stats/${userId}`} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8', textDecoration: 'none' }}>전체 전적 →</Link>}
      </div>
      {!stats ? (
        <div style={S.emptyState}>불러오는 중…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {[
            { label: '승리', value: stats.wins, color: '#12c8a8' },
            { label: '패배', value: stats.losses, color: '#ef4a63' },
            { label: '승률', value: `${stats.winRate ?? 0}%`, color: '#eab308' },
            { label: '총 게임', value: stats.totalGames, color: '#8b5cf6' },
          ].map(item => (
            <div key={item.label} style={S.card}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: '#5c6a8a', letterSpacing: '.1em' }}>{item.label}</div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 32, color: item.color as string, marginTop: 4 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ nicknameInput, nicknameMsg, avatarMsg, myAvatar, isUploadingAvatar, isDeletingAvatar, avatarFileRef, onNicknameChange, onSaveNickname, onAvatarSelect, onDeleteAvatar }: {
  nicknameInput: string; nicknameMsg: string; avatarMsg: string; myAvatar: string;
  isUploadingAvatar: boolean; isDeletingAvatar: boolean;
  avatarFileRef: React.RefObject<HTMLInputElement | null>;
  onNicknameChange: (v: string) => void; onSaveNickname: () => void;
  onAvatarSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteAvatar: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={S.sectionTitle}>설정</div>

      {/* Avatar */}
      <div style={S.card}>
        <div style={S.cardTitle}>프로필 사진</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: myAvatar ? 'transparent' : '#1a2040', border: '2px solid rgba(18,200,168,.4)', backgroundImage: myAvatar ? `url(${myAvatar})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onAvatarSelect} />
            <button onClick={() => avatarFileRef.current?.click()} disabled={isUploadingAvatar || isDeletingAvatar} style={S.primaryBtn}>
              {isUploadingAvatar ? '업로드 중…' : '사진 변경'}
            </button>
            {myAvatar && (
              <button onClick={onDeleteAvatar} disabled={isUploadingAvatar || isDeletingAvatar} style={S.dangerBtnSm}>
                {isDeletingAvatar ? '삭제 중…' : '사진 삭제'}
              </button>
            )}
          </div>
        </div>
        {avatarMsg && <div style={S.infoText}>{avatarMsg}</div>}
      </div>

      {/* Nickname */}
      <div style={S.card}>
        <div style={S.cardTitle}>닉네임 변경</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={nicknameInput} onChange={e => onNicknameChange(e.target.value)} placeholder="새 닉네임" style={S.input} />
          <button onClick={onSaveNickname} style={S.primaryBtn}>저장</button>
        </div>
        {nicknameMsg && <div style={S.infoText}>{nicknameMsg}</div>}
      </div>
    </div>
  );
}

function FriendProfilePopup({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div style={{ background: '#0d1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '24px 20px', minWidth: 260, boxShadow: '0 16px 40px rgba(0,0,0,.5)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1a2040', border: '1.5px solid rgba(18,200,168,.4)', backgroundImage: friend.avatar ? `url(${friend.avatar})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 16, color: '#e2e8f5' }}>{friend.nickname}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: friend.status === 'ONLINE' ? '#12c8a8' : '#5c6a8a', marginTop: 2 }}>● {friend.status}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { navigate(`/stats/${friend.id}`); onClose(); }} style={{ ...S.primaryBtn, flex: 1 }}>전적 보기</button>
          <button onClick={() => { navigate(`/profile/${friend.id}`); onClose(); }} style={{ ...S.ghostBtn, flex: 1 }}>프로필</button>
        </div>
      </div>
    </div>
  );
}

// ── Icons & Labels ─────────────────────────────────────────────────────────────
const NAV_ICON: Record<Tab, string> = { lobby: '⊞', friends: '♛', stats: '◈', settings: '⚙' };
const NAV_LABEL: Record<Tab, string> = { lobby: '로비', friends: '친구', stats: '통계', settings: '설정' };

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: '#05070c', display: 'flex', fontFamily: "'Inter',sans-serif" },
  sidebar: { width: 220, minHeight: '100vh', background: '#0a0e1a', borderRight: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column' as const, padding: '20px 14px', gap: 4, flex: 'none' as const },
  logo: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, letterSpacing: '.2em', color: '#12c8a8', marginBottom: 16 },
  userChip: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', marginBottom: 14, cursor: 'pointer', width: '100%', textAlign: 'left' as const },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: '#1a2040', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const },
  userName: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, color: '#e2e8f5' },
  userOnline: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#12c8a8', marginTop: 1 },
  profileDropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, marginTop: 4, background: '#0d1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 50 },
  dropdownItem: { display: 'block', padding: '10px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 as const, fontSize: 13, color: '#c7cede', textDecoration: 'none', cursor: 'pointer', background: 'transparent', border: 'none', width: '100%', textAlign: 'left' as const },
  dropdownDivider: { height: 1, background: 'rgba(255,255,255,.06)', margin: '2px 0' },
  dropdownDangerItem: { display: 'block', padding: '10px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 as const, fontSize: 13, color: '#ef4a63', background: 'transparent', border: 'none', width: '100%', textAlign: 'left' as const, cursor: 'pointer' },
  navList: { display: 'flex', flexDirection: 'column' as const, gap: 2, flex: 1 },
  navBtn: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 8, border: 'none', background: 'transparent', color: '#5c6a8a', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 as const, fontSize: 13, cursor: 'pointer', textAlign: 'left' as const },
  navBtnActive: { background: 'rgba(18,200,168,.1)', color: '#12c8a8', border: '1px solid rgba(18,200,168,.25)' },
  main: { flex: 1, padding: '28px 24px 20px', display: 'flex', flexDirection: 'column' as const, height: '100vh', overflow: 'hidden', minWidth: 0 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap' as const, gap: 10 },
  sectionTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 22, color: '#e2e8f5' },
  sectionSub: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: '#5c6a8a', marginTop: 3 },
  card: { background: '#0d1220', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: '14px 16px' },
  cardTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 15, color: '#c7cede' },
  cardSub: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: '#5c6a8a', marginTop: 3 },
  primaryBtn: { padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(18,200,168,.5)', background: 'rgba(18,200,168,.1)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  primaryBtnSm: { padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(18,200,168,.5)', background: 'rgba(18,200,168,.1)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 12, cursor: 'pointer' },
  dangerBtnSm: { padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,74,99,.35)', background: 'rgba(239,74,99,.06)', color: '#ef4a63', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 12, cursor: 'pointer' },
  ghostBtn: { padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: '#8a93a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  disabledBtn: { padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'transparent', color: '#3a4256', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'not-allowed', whiteSpace: 'nowrap' as const },
  input: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: '#111827', color: '#e2e8f5', fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none' },
  emptyState: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5c6a8a', padding: '24px 0', textAlign: 'center' as const },
  errorBanner: { background: 'rgba(239,74,99,.1)', border: '1px solid rgba(239,74,99,.35)', borderRadius: 8, padding: '10px 14px', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, marginBottom: 12 },
  friendAvatar: { width: 30, height: 30, borderRadius: '50%', background: '#1a2040', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const },
  infoText: { marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8' },
} as const;
