import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LobbySocket } from '../api/lobbySocket';
import {
  fetchMyProfile, updateMyProfile,
  getFriends, removeFriend,
  sendFriendRequestByNickname, getPendingRequests, respondFriendRequest,
  type PendingRequest,
} from '../api/client';
import CharacterSelectModal from '../components/CharacterSelectModal';
import type { Room } from '../types/lobby';
import type { Friend } from '../types/friend';

type Tab = 'lobby' | 'friends' | 'stats' | 'settings';

interface Stats {
  wins: number;
  losses: number;
  winRate: number;
  totalGames: number;
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const awaitingOwnRoomRef = useRef(false);

  const [tab, setTab] = useState<Tab>('lobby');
  const [myNickname, setMyNickname] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [pendingJoinRoom, setPendingJoinRoom] = useState<Room | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Friends
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [addNickname, setAddNickname] = useState('');
  const [addMsg, setAddMsg] = useState('');

  // Settings
  const [nicknameInput, setNicknameInput] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchMyProfile().then(me => {
      myUserIdRef.current = me.id;
      setMyNickname(me.nickname);
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
      socket.on('ROOM_CLOSED', ({ roomId }) => {
        if (isMounted) setRooms(prev => prev.filter(r => r.id !== roomId));
      }),
      socket.on('ACTION_REJECTED', ({ message }) => {
        if (isMounted) setConnectionError(message);
      }),
    ];

    socket.connect()
      .then(() => { if (isMounted) { socket.send('LIST_ROOMS', {}); setIsConnecting(false); } })
      .catch(() => { if (isMounted) { setConnectionError('Unable to connect to the lobby server.'); setIsConnecting(false); } });

    return () => { isMounted = false; unsubs.forEach(u => u()); socket.disconnect(); };
  }, [navigate]);

  const loadFriends = useCallback(() => {
    getFriends().then(setFriends).catch(() => {});
    getPendingRequests().then(setPendingRequests).catch(() => {});
  }, []);

  useEffect(() => { if (tab === 'friends') loadFriends(); }, [tab, loadFriends]);

  useEffect(() => {
    if (tab === 'stats' && myUserIdRef.current) {
      fetch(`/api/game/users/${myUserIdRef.current}/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
        .then(r => r.json())
        .then(j => { if (j.data) setStats(j.data); })
        .catch(() => {});
    }
  }, [tab]);

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
    try {
      await sendFriendRequestByNickname(addNickname.trim());
      setAddMsg('친구 요청을 보냈습니다.');
      setAddNickname('');
    } catch {
      setAddMsg('요청 실패: 닉네임을 확인해주세요.');
    }
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
    try {
      await updateMyProfile(nicknameInput.trim());
      setMyNickname(nicknameInput.trim());
      setSettingsMsg('닉네임이 변경되었습니다.');
    } catch {
      setSettingsMsg('변경 실패: 이미 사용 중인 닉네임입니다.');
    }
  };

  return (
    <div style={S.page}>
      {/* Sidebar */}
      <nav style={S.sidebar}>
        <div style={S.logo}>TRANSCENDENCE</div>
        <div style={S.userChip}>
          <div style={S.avatar} />
          <div>
            <div style={S.userName}>{myNickname || '…'}</div>
            <div style={S.userOnline}>● Online</div>
          </div>
        </div>
        <div style={S.navList}>
          {(['lobby', 'friends', 'stats', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.navBtn, ...(tab === t ? S.navBtnActive : {}) }}>
              {NAV_ICON[t]} {NAV_LABEL[t]}
            </button>
          ))}
        </div>
        <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={S.logoutBtn}>로그아웃</button>
      </nav>

      {/* Main */}
      <main style={S.main}>
        {tab === 'lobby' && (
          <LobbyTab
            rooms={rooms}
            isConnecting={isConnecting}
            connectionError={connectionError}
            onCreateRoom={() => setIsCreatingRoom(true)}
            onJoinRoom={setPendingJoinRoom}
          />
        )}
        {tab === 'friends' && (
          <FriendsTab
            friends={friends}
            pendingRequests={pendingRequests}
            addNickname={addNickname}
            addMsg={addMsg}
            onAddNicknameChange={setAddNickname}
            onAddFriend={handleAddFriend}
            onRespond={handleRespondRequest}
            onRemove={handleRemoveFriend}
          />
        )}
        {tab === 'stats' && <StatsTab stats={stats} />}
        {tab === 'settings' && (
          <SettingsTab
            nicknameInput={nicknameInput}
            settingsMsg={settingsMsg}
            onNicknameChange={setNicknameInput}
            onSaveNickname={handleSaveNickname}
          />
        )}
      </main>

      {isCreatingRoom && (
        <CharacterSelectModal title="캐릭터를 선택하세요" onConfirm={handleCreateRoom} onCancel={() => setIsCreatingRoom(false)} />
      )}
      {pendingJoinRoom && (
        <CharacterSelectModal title={`${pendingJoinRoom.host.nickname}의 방에 참가`} onConfirm={handleJoinRoom} onCancel={() => setPendingJoinRoom(null)} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LobbyTab({ rooms, isConnecting, connectionError, onCreateRoom, onJoinRoom }: {
  rooms: Room[];
  isConnecting: boolean;
  connectionError: string;
  onCreateRoom: () => void;
  onJoinRoom: (room: Room) => void;
}) {
  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <div style={S.sectionTitle}>게임 로비</div>
          <div style={S.sectionSub}>{rooms.length}개 방이 열려있습니다</div>
        </div>
        <button onClick={onCreateRoom} disabled={isConnecting} style={S.primaryBtn}>
          + 방 만들기
        </button>
      </div>
      {connectionError && <div style={S.errorBanner}>{connectionError}</div>}
      {isConnecting ? (
        <div style={S.emptyState}>로비에 연결 중…</div>
      ) : rooms.length === 0 ? (
        <div style={S.emptyState}>열린 방이 없습니다. 방을 만들어보세요!</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rooms.map(room => (
            <RoomRow key={room.id} room={room} onJoin={onJoinRoom} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomRow({ room, onJoin }: { room: Room; onJoin: (r: Room) => void }) {
  const isFull = !!room.guest;
  return (
    <div style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={S.cardTitle}>{room.host.nickname}의 방</div>
        <div style={S.cardSub}>
          {isFull ? '2/2 명 · 게임 중' : '1/2 명 · 대기 중'}
        </div>
      </div>
      <button
        onClick={() => onJoin(room)}
        disabled={isFull}
        style={isFull ? S.disabledBtn : S.primaryBtn}
      >
        {isFull ? '참가 불가' : '참가하기'}
      </button>
    </div>
  );
}

function FriendsTab({ friends, pendingRequests, addNickname, addMsg, onAddNicknameChange, onAddFriend, onRespond, onRemove }: {
  friends: Friend[];
  pendingRequests: PendingRequest[];
  addNickname: string;
  addMsg: string;
  onAddNicknameChange: (v: string) => void;
  onAddFriend: () => void;
  onRespond: (id: string, action: 'accept' | 'reject') => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={S.sectionTitle}>친구 목록</div>

      {/* Add friend */}
      <div style={S.card}>
        <div style={S.cardTitle}>친구 추가</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={addNickname}
            onChange={e => onAddNicknameChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAddFriend()}
            placeholder="닉네임 입력"
            style={S.input}
          />
          <button onClick={onAddFriend} style={S.primaryBtn}>요청 보내기</button>
        </div>
        {addMsg && <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8' }}>{addMsg}</div>}
      </div>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>친구 요청 ({pendingRequests.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c7cede' }}>{req.requester.nickname}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onRespond(req.id, 'accept')} style={S.primaryBtnSm}>수락</button>
                  <button onClick={() => onRespond(req.id, 'reject')} style={S.dangerBtnSm}>거절</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friend list */}
      <div style={S.card}>
        <div style={S.cardTitle}>친구 ({friends.length})</div>
        {friends.length === 0 ? (
          <div style={{ ...S.cardSub, marginTop: 10 }}>친구가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {friends.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 8, color: f.status === 'ONLINE' ? '#12c8a8' : f.status === 'IN_GAME' ? '#eab308' : '#5c6a8a' }}>●</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c7cede' }}>{f.nickname}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5c6a8a' }}>{f.status}</span>
                </div>
                <button onClick={() => onRemove(f.id)} style={S.dangerBtnSm}>삭제</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsTab({ stats }: { stats: Stats | null }) {
  return (
    <div>
      <div style={S.sectionTitle}>내 통계</div>
      {!stats ? (
        <div style={S.emptyState}>불러오는 중…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 16 }}>
          {[
            { label: '승리', value: stats.wins, color: '#12c8a8' },
            { label: '패배', value: stats.losses, color: '#ef4a63' },
            { label: '승률', value: `${stats.winRate ?? 0}%`, color: '#eab308' },
            { label: '총 게임', value: stats.totalGames, color: '#8b5cf6' },
          ].map(item => (
            <div key={item.label} style={S.card}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: '#5c6a8a', letterSpacing: '.1em' }}>{item.label}</div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 32, color: item.color as string, marginTop: 4 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ nicknameInput, settingsMsg, onNicknameChange, onSaveNickname }: {
  nicknameInput: string;
  settingsMsg: string;
  onNicknameChange: (v: string) => void;
  onSaveNickname: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={S.sectionTitle}>설정</div>
      <div style={S.card}>
        <div style={S.cardTitle}>닉네임 변경</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={nicknameInput}
            onChange={e => onNicknameChange(e.target.value)}
            placeholder="새 닉네임"
            style={S.input}
          />
          <button onClick={onSaveNickname} style={S.primaryBtn}>저장</button>
        </div>
        {settingsMsg && <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8' }}>{settingsMsg}</div>}
      </div>
    </div>
  );
}

// ── Icons & Labels ─────────────────────────────────────────────────────────────
const NAV_ICON: Record<Tab, string> = { lobby: '⊞', friends: '♛', stats: '◈', settings: '⚙' };
const NAV_LABEL: Record<Tab, string> = { lobby: '로비', friends: '친구', stats: '통계', settings: '설정' };

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: '#05070c',
    display: 'flex',
    fontFamily: "'Inter',sans-serif",
  },
  sidebar: {
    width: 220,
    minHeight: '100vh',
    background: '#0a0e1a',
    borderRight: '1px solid rgba(255,255,255,.06)',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '20px 14px',
    gap: 4,
    flex: 'none' as const,
  },
  logo: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 13,
    letterSpacing: '.2em',
    color: '#12c8a8',
    marginBottom: 16,
  },
  userChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 10px',
    borderRadius: 10,
    background: 'rgba(255,255,255,.03)',
    border: '1px solid rgba(255,255,255,.06)',
    marginBottom: 14,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: '#1a2040',
    border: '1.5px solid rgba(18,200,168,.5)',
    flex: 'none' as const,
  },
  userName: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 13,
    color: '#e2e8f5',
  },
  userOnline: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 9,
    color: '#12c8a8',
    marginTop: 1,
  },
  navList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    flex: 1,
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '9px 11px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: '#5c6a8a',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 600 as const,
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  navBtnActive: {
    background: 'rgba(18,200,168,.1)',
    color: '#12c8a8',
    border: '1px solid rgba(18,200,168,.25)',
  },
  logoutBtn: {
    padding: '8px 11px',
    borderRadius: 8,
    border: '1px solid rgba(239,74,99,.25)',
    background: 'transparent',
    color: '#ef4a63',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10.5,
    cursor: 'pointer',
    marginTop: 8,
  },
  main: {
    flex: 1,
    padding: '28px 24px',
    overflowY: 'auto' as const,
    maxWidth: 760,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 22,
    color: '#e2e8f5',
  },
  sectionSub: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10.5,
    color: '#5c6a8a',
    marginTop: 3,
  },
  card: {
    background: '#0d1220',
    border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  cardTitle: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 15,
    color: '#c7cede',
  },
  cardSub: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10.5,
    color: '#5c6a8a',
    marginTop: 3,
  },
  primaryBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.1)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  primaryBtnSm: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.1)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 12,
    cursor: 'pointer',
  },
  dangerBtnSm: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(239,74,99,.35)',
    background: 'rgba(239,74,99,.06)',
    color: '#ef4a63',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 12,
    cursor: 'pointer',
  },
  disabledBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.08)',
    background: 'transparent',
    color: '#3a4256',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 13,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap' as const,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.12)',
    background: '#111827',
    color: '#e2e8f5',
    fontFamily: "'Inter',sans-serif",
    fontSize: 13,
    outline: 'none',
  },
  emptyState: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 12,
    color: '#5c6a8a',
    padding: '24px 0',
    textAlign: 'center' as const,
  },
  errorBanner: {
    background: 'rgba(239,74,99,.1)',
    border: '1px solid rgba(239,74,99,.35)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#ef4a63',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11.5,
    marginBottom: 12,
  },
} as const;
