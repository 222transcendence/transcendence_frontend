import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LobbySocket } from '../api/lobbySocket';
import {
  fetchMyProfile, updateMyProfile, uploadMyAvatar,
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

  // Friends
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [addNickname, setAddNickname] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [friendPopup, setFriendPopup] = useState<Friend | null>(null);

  // Settings
  const [nicknameInput, setNicknameInput] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

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
    try { await updateMyProfile(nicknameInput.trim()); setMyNickname(nicknameInput.trim()); setSettingsMsg('닉네임이 변경되었습니다.'); }
    catch { setSettingsMsg('변경 실패: 이미 사용 중인 닉네임입니다.'); }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const updated = await uploadMyAvatar(file);
      setMyAvatar(updated.avatar ?? '');
      setSettingsMsg('프로필 사진이 변경되었습니다.');
    } catch { setSettingsMsg('업로드 실패: 이미지 파일을 확인해주세요.'); }
    finally { setIsUploadingAvatar(false); if (avatarFileRef.current) avatarFileRef.current.value = ''; }
  };

  return (
    <div style={S.page}>
      {/* Sidebar */}
      <nav style={S.sidebar}>
        <div style={S.logo}>TRANSCENDENCE</div>
        <div style={S.userChip}>
          <div style={{ ...S.avatar, backgroundImage: myAvatar ? `url(${myAvatar})` : 'none' }} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <button onClick={() => navigate('/leaderboard')} style={S.sideLink}>리더보드</button>
          <button onClick={() => navigate('/profile')} style={S.sideLink}>내 프로필</button>
          <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={S.logoutBtn}>로그아웃</button>
        </div>
      </nav>

      {/* Main */}
      <main style={S.main}>
        {tab === 'lobby' && (
          <LobbyTab
            rooms={rooms} isConnecting={isConnecting} connectionError={connectionError}
            onCreateRoom={() => setIsCreatingRoom(true)} onJoinRoom={setPendingJoinRoom}
          />
        )}
        {tab === 'friends' && (
          <FriendsTab
            friends={friends} pendingRequests={pendingRequests}
            addNickname={addNickname} addMsg={addMsg}
            onAddNicknameChange={setAddNickname} onAddFriend={handleAddFriend}
            onRespond={handleRespondRequest} onRemove={handleRemoveFriend}
            onFriendClick={setFriendPopup}
          />
        )}
        {tab === 'stats' && <StatsTab stats={stats} userId={myUserId} />}
        {tab === 'settings' && (
          <SettingsTab
            nicknameInput={nicknameInput} settingsMsg={settingsMsg}
            myAvatar={myAvatar} isUploadingAvatar={isUploadingAvatar}
            avatarFileRef={avatarFileRef}
            onNicknameChange={setNicknameInput} onSaveNickname={handleSaveNickname}
            onAvatarSelect={handleAvatarSelect}
          />
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

function LobbyTab({ rooms, isConnecting, connectionError, onCreateRoom, onJoinRoom }: {
  rooms: Room[]; isConnecting: boolean; connectionError: string;
  onCreateRoom: () => void; onJoinRoom: (room: Room) => void;
}) {
  return (
    <div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
  );
}

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
        {addMsg && <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8' }}>{addMsg}</div>}
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

function SettingsTab({ nicknameInput, settingsMsg, myAvatar, isUploadingAvatar, avatarFileRef, onNicknameChange, onSaveNickname, onAvatarSelect }: {
  nicknameInput: string; settingsMsg: string; myAvatar: string; isUploadingAvatar: boolean;
  avatarFileRef: React.RefObject<HTMLInputElement>;
  onNicknameChange: (v: string) => void; onSaveNickname: () => void;
  onAvatarSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={S.sectionTitle}>설정</div>

      {/* Avatar */}
      <div style={S.card}>
        <div style={S.cardTitle}>프로필 사진</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <div style={{ ...S.avatar, backgroundImage: myAvatar ? `url(${myAvatar})` : 'none', width: 56, height: 56, border: '2px solid rgba(18,200,168,.4)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onAvatarSelect} />
            <button onClick={() => avatarFileRef.current?.click()} disabled={isUploadingAvatar} style={S.primaryBtn}>
              {isUploadingAvatar ? '업로드 중…' : '사진 변경'}
            </button>
          </div>
        </div>
      </div>

      {/* Nickname */}
      <div style={S.card}>
        <div style={S.cardTitle}>닉네임 변경</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={nicknameInput} onChange={e => onNicknameChange(e.target.value)} placeholder="새 닉네임" style={S.input} />
          <button onClick={onSaveNickname} style={S.primaryBtn}>저장</button>
        </div>
        {settingsMsg && <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#12c8a8' }}>{settingsMsg}</div>}
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
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1a2040', border: '1.5px solid rgba(18,200,168,.4)', backgroundImage: (friend as any).avatar ? `url(${(friend as any).avatar})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
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
  userChip: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', marginBottom: 14 },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: '#1a2040', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const },
  userName: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, color: '#e2e8f5' },
  userOnline: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#12c8a8', marginTop: 1 },
  navList: { display: 'flex', flexDirection: 'column' as const, gap: 2, flex: 1 },
  navBtn: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 8, border: 'none', background: 'transparent', color: '#5c6a8a', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 as const, fontSize: 13, cursor: 'pointer', textAlign: 'left' as const },
  navBtnActive: { background: 'rgba(18,200,168,.1)', color: '#12c8a8', border: '1px solid rgba(18,200,168,.25)' },
  sideLink: { padding: '7px 11px', borderRadius: 7, border: '1px solid rgba(255,255,255,.08)', background: 'transparent', color: '#5c6a8a', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: 'pointer', textAlign: 'left' as const },
  logoutBtn: { padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(239,74,99,.25)', background: 'transparent', color: '#ef4a63', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, cursor: 'pointer' },
  main: { flex: 1, padding: '28px 24px', overflowY: 'auto' as const, maxWidth: 760 },
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
} as const;
