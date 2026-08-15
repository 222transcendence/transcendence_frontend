import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { fetchLeaderboard } from '../api/gameStats';
import { fetchChatHistory, getValidAccessToken } from '../api/client';
import type { LeaderboardEntry } from '../types/gameStats';
import type { ChatMessage } from '../types/chat';
import { LobbySocket } from '../api/lobbySocket';
import {
  fetchMyProfile,
  getFriends, removeFriend,
  sendFriendRequestByNickname, getPendingRequests, respondFriendRequest,
  getSentRequests,
  type PendingRequest, type SentRequest,
} from '../api/client';
import type { Room, AiDifficulty } from '../types/lobby';
import type { Friend } from '../types/friend';

type Tab = 'lobby' | 'friends' | 'leaderboard';

export default function LobbyPage() {
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const awaitingOwnRoomRef = useRef(false);

  const [tab, setTab] = useState<Tab>('lobby');
  const [myNickname, setMyNickname] = useState('');
  const [myAvatar, setMyAvatar] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [spectatableRooms, setSpectatableRooms] = useState<Room[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [pendingJoinRoom, setPendingJoinRoom] = useState<Room | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // Friends
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [addNickname, setAddNickname] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [friendPopup, setFriendPopup] = useState<Friend | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetchMyProfile().then(me => {
      myUserIdRef.current = me.id;
      setMyUserId(me.id);
      setMyNickname(me.nickname);
      setMyAvatar(me.avatar ?? '');
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
        if (awaitingOwnRoomRef.current && room.players.some(p => p.userId === myUserIdRef.current)) {
          awaitingOwnRoomRef.current = false;
          navigate(`/lobby/${room.id}`);
        }
      }),
      socket.on('ROOM_CLOSED', ({ roomId }) => { if (isMounted) setRooms(prev => prev.filter(r => r.id !== roomId)); }),
      socket.on('ACTION_REJECTED', ({ message }) => {
        if (!isMounted) return;
        // AI practice 세션이 남아 있는 경우 자동 취소 후 재시도
        if (message.includes('active AI practice session')) {
          socket.send('CANCEL_AI_PRACTICE', {});
          // 취소 후 잠시 뒤 방 목록 재요청 (재시도는 사용자가 직접)
          setTimeout(() => { if (isMounted) setConnectionError('이전 AI 대전 세션이 정리되었습니다. 다시 시도해주세요.'); }, 300);
        } else {
          setConnectionError(message);
        }
      }),
      socket.on('SPECTATABLE_ROOM_LIST', ({ rooms: roomList }) => { if (isMounted) setSpectatableRooms(roomList); }),
    ];

    socket.connect()
      .then(() => {
        if (!isMounted) return;
        socket.send('LIST_ROOMS', {});
        socket.send('LIST_SPECTATABLE_ROOMS', {});
        // 게임 종료 후 로비 복귀 시 잔여 AI practice 세션 자동 정리
        socket.send('CANCEL_AI_PRACTICE', {});
        setIsConnecting(false);
      })
      .catch(() => { if (isMounted) { setConnectionError('로비 서버에 연결할 수 없습니다.'); setIsConnecting(false); } });

    return () => { isMounted = false; unsubs.forEach(u => u()); socket.disconnect(); };
  }, [navigate]);

  const loadFriends = useCallback(() => {
    getFriends().then(setFriends).catch(() => {});
    getPendingRequests().then(setPendingRequests).catch(() => {});
    getSentRequests().then(setSentRequests).catch(() => {});
  }, []);

  useEffect(() => { if (tab === 'friends') loadFriends(); }, [tab, loadFriends]);
  useEffect(() => {
    if (tab === 'leaderboard') fetchLeaderboard().then(setLeaderboard).catch(() => {});
  }, [tab]);

  const handleCreateRoom = () => {
    awaitingOwnRoomRef.current = true;
    socketRef.current?.send('CREATE_ROOM', {});
  };

  const handleJoinRoom = (room: Room) => {
    socketRef.current?.send('JOIN_ROOM', { roomId: room.id });
    navigate(`/lobby/${room.id}`);
    setPendingJoinRoom(null);
  };

  const handleSpectateRoom = (room: Room) => {
    navigate(`/spectate/${room.id}`);
  };

  const handleRejoinRoom = (room: Room) => {
    navigate(`/game/${room.id}`);
  };

  // WAITING 목록(rooms, 실시간 갱신)과 관전 가능(IN_GAME) 목록을 id 기준으로 합쳐서 보여준다.
  // rooms 쪽이 ROOM_UPDATED로 실시간 갱신되므로 겹치면 rooms 값을 우선한다.
  const displayRooms = (() => {
    const map = new Map(spectatableRooms.map(r => [r.id, r] as const));
    rooms.forEach(r => map.set(r.id, r));
    return Array.from(map.values());
  })();

  const handleAddFriend = async () => {
    if (!addNickname.trim()) return;
    try { await sendFriendRequestByNickname(addNickname.trim()); setAddMsg('친구 요청을 보냈습니다.'); setAddNickname(''); getSentRequests().then(setSentRequests).catch(() => {}); }
	// catch { setAddMsg('요청 실패: 닉네임을 확인해주세요.'); }
	catch (error) {
		if (error instanceof Error) {
			switch (error.message) {
			case 'Already friends':
				setAddMsg('이미 친구입니다.');
				break;

			case 'Friend request already exists':
				setAddMsg('이미 친구 요청을 보냈습니다.');
				break;

			default:
				setAddMsg('요청 실패: 닉네임을 확인해주세요.');
			}
		}
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

  return (
    <div style={S.page} onClick={() => setProfileMenuOpen(false)}>
      {/* Sidebar */}
      <nav style={S.sidebar}>
        <a href="/lobby" style={{ ...S.logo, textDecoration: 'none', cursor: 'pointer' }}>Acid-Rain</a>

        {/* Profile card — clickable dropdown */}
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
              <Link to="/profile" style={S.dropdownItem} onClick={() => setProfileMenuOpen(false)}>내 프로필</Link>
              <div style={S.dropdownDivider} />
              <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={S.dropdownDangerItem}>로그아웃</button>
            </div>
          )}
        </div>

        <div style={S.navList}>
          {(['lobby', 'friends', 'leaderboard'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.navBtn, ...(tab === t ? S.navBtnActive : {}) }}>
              {NAV_ICON[t]} {NAV_LABEL[t]}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={S.sidebarFooter}>
          <Link to="/terms-of-service" style={S.footerLink}>이용약관</Link>
          <span style={S.footerDot}>·</span>
          <Link to="/privacy-policy" style={S.footerLink}>개인정보처리방침</Link>
        </div>
      </nav>

      {/* Main */}
      <main style={S.main}>
        {tab === 'lobby' && (
          <LobbyTab
            rooms={displayRooms} isConnecting={isConnecting} connectionError={connectionError}
            onCreateRoom={handleCreateRoom} onJoinRoom={(room) => handleJoinRoom(room)}
            onSpectateRoom={(room) => handleSpectateRoom(room)}
            onRejoinRoom={(room) => handleRejoinRoom(room)}
            currentUserId={myUserId} onAiClick={() => setShowAiModal(true)}
          />
        )}
        {tab === 'friends' && (
          <div style={{ flex: 1, overflowY: 'auto' as const }}>
            <FriendsTab
              friends={friends} pendingRequests={pendingRequests} sentRequests={sentRequests}
              addNickname={addNickname} addMsg={addMsg}
              onAddNicknameChange={setAddNickname} onAddFriend={handleAddFriend}
              onRespond={handleRespondRequest} onRemove={handleRemoveFriend}
              onFriendClick={setFriendPopup}
            />
          </div>
        )}
        {tab === 'leaderboard' && (
          <div style={{ flex: 1, overflowY: 'auto' as const }}>
            <LeaderboardTab entries={leaderboard} myUserId={myUserId} />
          </div>
        )}
      </main>

      {pendingJoinRoom && (
        <div style={{ display: 'none' }} />
      )}
      {friendPopup && (
        <FriendProfilePopup friend={friendPopup} friendIds={friends.map(f => f.id)} onClose={() => setFriendPopup(null)} />
      )}
      {showAiModal && (
        <AiDifficultyModal
          onClose={() => setShowAiModal(false)}
          socket={socketRef.current}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// ── Lobby tab ─────────────────────────────────────────────────────────────────

function LobbyTab({ rooms, isConnecting, connectionError, onCreateRoom, onJoinRoom, onSpectateRoom, onRejoinRoom, currentUserId, onAiClick }: {
  rooms: Room[]; isConnecting: boolean; connectionError: string;
  onCreateRoom: () => void; onJoinRoom: (room: Room) => void;
  onSpectateRoom: (room: Room) => void;
  onRejoinRoom: (room: Room) => void;
  currentUserId: string; onAiClick: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto' as const, paddingBottom: 12 }}>
        <div style={S.sectionHeader}>
          <div>
            <div style={S.sectionTitle}>게임 로비</div>
            <div style={S.sectionSub}>{rooms.length}개 방이 열려있습니다</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCreateRoom} disabled={isConnecting} style={S.primaryBtn}>+ 방 만들기</button>
            <button onClick={onAiClick} style={S.ghostBtn}>AI 대전</button>
          </div>
        </div>
        {connectionError && <div style={S.errorBanner}>{connectionError}</div>}
        {isConnecting ? (
          <div style={S.emptyState}>로비에 연결 중…</div>
        ) : rooms.length === 0 ? (
          <div style={S.emptyState}>열린 방이 없습니다. 방을 만들어보세요!</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {rooms.map(room => {
              const host = room.players.find(p => p.userId === room.hostUserId);
              const isInGame = room.status !== 'WAITING';
              const isWaitingFull = room.players.length >= room.maxPlayers;
              const isOwnRoom = room.players.some(p => p.userId === currentUserId);
              return (
                <div key={room.id} style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={S.cardTitle}>{host?.nickname ?? '알 수 없음'}의 방</div>
                    <div style={S.cardSub}>{room.players.length}/{room.maxPlayers} 명 · {isInGame ? '게임 중' : '대기 중'}</div>
                  </div>
                  {isInGame ? (
                    isOwnRoom ? (
                      <button onClick={() => onRejoinRoom(room)} style={S.primaryBtn}>재접속하기</button>
                    ) : (
                      <button onClick={() => onSpectateRoom(room)} style={S.ghostBtn}>👁 관전하기</button>
                    )
                  ) : (
                    <button onClick={() => onJoinRoom(room)} disabled={isWaitingFull} style={isWaitingFull ? S.disabledBtn : S.primaryBtn}>
                      {isWaitingFull ? '참가 불가' : '참가하기'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {currentUserId && <GlobalChatPanel currentUserId={currentUserId} />}
    </div>
  );
}

// ── Friends tab ───────────────────────────────────────────────────────────────

function FriendsTab({ friends, pendingRequests, sentRequests, addNickname, addMsg, onAddNicknameChange, onAddFriend, onRespond, onRemove, onFriendClick }: {
  friends: Friend[]; pendingRequests: PendingRequest[]; sentRequests: SentRequest[]; addNickname: string; addMsg: string;
  onAddNicknameChange: (v: string) => void; onAddFriend: () => void;
  onRespond: (id: string, action: 'accept' | 'reject') => void;
  onRemove: (id: string) => void;
  onFriendClick: (f: Friend) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 18 }}>
      <div style={S.sectionTitle}>친구 목록</div>

      <div style={S.card}>
        <div style={S.cardTitle}>친구 추가</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={addNickname} onChange={e => onAddNicknameChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAddFriend()} placeholder="닉네임 입력" style={S.input} />
          <button onClick={onAddFriend} style={S.primaryBtn}>요청</button>
        </div>
        {addMsg && <div style={S.infoText}>{addMsg}</div>}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>친구 요청 {pendingRequests.length > 0 && <span style={{ color: '#ef4a63', marginLeft: 6 }}>({pendingRequests.length})</span>}</div>
        {pendingRequests.length === 0 ? (
          <div style={{ ...S.cardSub, marginTop: 8 }}>받은 친구 요청이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 10 }}>
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

      <div style={S.card}>
        <div style={S.cardTitle}>보낸 요청 {sentRequests.length > 0 && <span style={{ color: '#5c6a8a', marginLeft: 6 }}>({sentRequests.length})</span>}</div>
        {sentRequests.length === 0 ? (
          <div style={{ ...S.cardSub, marginTop: 8 }}>보낸 친구 요청이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 10 }}>
            {sentRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ ...S.friendAvatar, backgroundImage: req.receiver.avatar ? `url(${req.receiver.avatar})` : 'none' }} />
                  <span style={{ fontSize: 13, color: '#c7cede' }}>{req.receiver.nickname}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#5c6a8a' }}>대기 중</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>친구 ({friends.length})</div>
        {friends.length === 0 ? (
          <div style={{ ...S.cardSub, marginTop: 8 }}>친구가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 10 }}>
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

// ── Leaderboard tab ───────────────────────────────────────────────────────────

const LB_RANK_META = [
  { medal: '🥇', borderColor: 'rgba(255,215,0,.25)', bg: 'rgba(255,215,0,.04)', glowColor: '#ffd700' },
  { medal: '🥈', borderColor: 'rgba(192,192,192,.2)',  bg: 'rgba(192,192,192,.03)', glowColor: '#c0c0c0' },
  { medal: '🥉', borderColor: 'rgba(205,127,50,.2)',   bg: 'rgba(205,127,50,.04)', glowColor: '#cd7f32' },
];

function LeaderboardTab({ entries, myUserId }: { entries: LeaderboardEntry[]; myUserId: string }) {
  return (
    <div>
      <div style={S.sectionTitle}>리더보드</div>
      {entries.length === 0 ? (
        <div style={S.emptyState}>불러오는 중…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginTop: 18 }}>
          {entries.map((entry, i) => {
            const winPct = Math.round(entry.winRate * 100);
            const isMe = entry.id === myUserId;
            const hasRecord = entry.wins + entry.losses > 0;
            const meta = hasRecord ? LB_RANK_META[i] : undefined;
            return (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, border: '1px solid', borderColor: isMe ? 'rgba(18,200,168,.3)' : (meta?.borderColor ?? 'rgba(255,255,255,.06)'), background: meta?.bg ?? 'rgba(255,255,255,.015)', boxShadow: hasRecord && i === 0 ? '0 0 18px rgba(255,215,0,.06)' : undefined, transition: 'background .15s' }}>
                <div style={{ width: 32, textAlign: 'center' as const, flex: 'none' as const }}>
                  {!hasRecord ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#3a4a6a', fontWeight: 700 }}>-</span> : i < 3 ? <span style={{ fontSize: 18, lineHeight: 1 }}>{meta!.medal}</span> : <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#3a4a6a', fontWeight: 700 }}>#{i + 1}</span>}
                </div>
                <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const, border: `1.5px solid ${meta?.glowColor ?? 'rgba(255,255,255,.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', backgroundImage: entry.avatar ? `url(${entry.avatar})` : 'none' }}>
                  {!entry.avatar && <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: '#5c6a8a' }}>{entry.nickname[0].toUpperCase()}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/stats/${entry.id}`} style={{ display: 'block', color: isMe ? '#12c8a8' : '#c7cede', textDecoration: 'none', fontWeight: 600, fontSize: 13, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {entry.nickname}{isMe && ' (나)'}
                  </Link>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: '#182236', overflow: 'hidden', maxWidth: 80 }}>
                      <div style={{ height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#12c8a8)', borderRadius: 2, width: `${winPct}%` }} />
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5c6a8a' }}>{winPct}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', minWidth: 24, gap: 1 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#3a4a6a', letterSpacing: '.05em' }}>승</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: '#12c8a8' }}>{entry.wins}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', minWidth: 24, gap: 1 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#3a4a6a', letterSpacing: '.05em' }}>패</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: '#ef4a63' }}>{entry.losses}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Friend profile popup ──────────────────────────────────────────────────────

function FriendProfilePopup({ friend, friendIds, onClose }: { friend: Friend; friendIds: string[]; onClose: () => void }) {
  const navigate = useNavigate();
  const isFriend = friendIds.includes(friend.id);
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
        {!isFriend && (
          <div style={{ marginTop: 8 }}>
            <button style={{ ...S.primaryBtn, width: '100%' }} onClick={async () => {
              try {
                const { sendFriendRequest } = await import('../api/client');
                await sendFriendRequest(friend.id); onClose();
              } catch { /* already sent */ }
            }}>친구 추가</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI 실력 선택 (AI_OPPONENT_SPEC.md §4.2) ─────────────────────────────────────

const AI_DIFFICULTY_CARDS: { key: AiDifficulty; label: string; desc: string }[] = [
  { key: 'BEGINNER', label: 'Beginner', desc: '반응이 느리고 실수가 많아요' },
  { key: 'NORMAL', label: 'Normal', desc: '평균적인 속도와 정확도로 플레이해요' },
  { key: 'HARD', label: 'Hard', desc: '빠르고 정확하지만 가끔 실수해요' },
];

function AiDifficultyModal({
  onClose,
  socket,
  navigate,
}: {
  onClose: () => void;
  socket: import('../api/lobbySocket').LobbySocket | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [difficulty, setDifficulty] = useState<AiDifficulty>('NORMAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = () => {
    if (!socket || loading) return;
    setLoading(true);
    setError('');

    const requestId = crypto.randomUUID();

    const unsubCreated = socket.on('AI_PRACTICE_CREATED', (payload) => {
      unsubCreated();
      unsubRejected();
      navigate(`/game/${payload.roomId}`);
    });

    const unsubRejected = socket.on('AI_PRACTICE_REJECTED', (payload) => {
      unsubCreated();
      unsubRejected();
      setLoading(false);
      setError(payload.message || 'AI 대전 세션 생성에 실패했습니다.');
    });

    socket.send('CREATE_AI_PRACTICE', { requestId, difficulty });
  };

  return (
    <div style={AS.backdrop} onClick={onClose}>
      <div style={AS.modal} onClick={e => e.stopPropagation()}>
        <div style={AS.title}>AI 실력 선택</div>
        <div style={AS.subtitle}>게임 규칙과 시간별 난이도 상승은 온라인 대전과 동일합니다.</div>

        <div style={AS.cardRow}>
          {AI_DIFFICULTY_CARDS.map(c => {
            const selected = c.key === difficulty;
            return (
              <button
                key={c.key}
                onClick={() => { if (!loading) setDifficulty(c.key); }}
                style={{ ...AS.card, ...(selected ? AS.cardSelected : {}), ...(loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                aria-pressed={selected}
                disabled={loading}
              >
                <div style={AS.cardLabelRow}>
                  <span style={AS.cardLabel}>{c.label}</span>
                  {selected && <span style={AS.cardCheck}>✓</span>}
                </div>
                <div style={AS.cardDesc}>{c.desc}</div>
              </button>
            );
          })}
        </div>

        <div style={AS.notice}>AI 대전 결과는 PvP 랭킹에 반영되지 않습니다.</div>

        {error && <div style={AS.errorMsg}>{error}</div>}

        <button
          onClick={handleStart}
          disabled={loading}
          style={{ ...S.primaryBtn, width: '100%', padding: '10px 0', opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? '연결 중…' : 'AI 대전 시작'}
        </button>
        <button onClick={onClose} disabled={loading} style={{ ...S.ghostBtn, width: '100%', marginTop: 8, opacity: loading ? 0.4 : 1 }}>닫기</button>
      </div>
    </div>
  );
}

const AS = {
  backdrop: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#0d1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '24px 22px', width: 380, boxShadow: '0 20px 50px rgba(0,0,0,.6)' },
  title: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 18, color: '#e2e8f5', marginBottom: 6 },
  subtitle: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: '#5c6a8a', marginBottom: 18, lineHeight: 1.5 },
  cardRow: { display: 'flex', gap: 8, marginBottom: 16 },
  card: { flex: 1, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '12px 10px', cursor: 'pointer', textAlign: 'left' as const, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  cardSelected: { background: 'rgba(18,200,168,.1)', border: '1.5px solid rgba(18,200,168,.6)' },
  cardLabelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, color: '#e2e8f5' },
  cardCheck: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, color: '#12c8a8' },
  cardDesc: { fontFamily: "'Inter',sans-serif", fontSize: 10.5, color: '#8a93a8', lineHeight: 1.4 },
  notice: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#5c6a8a', textAlign: 'center' as const, marginBottom: 14 },
  errorMsg: { fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#f87171', textAlign: 'center' as const, background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '10px 8px', marginBottom: 12 },
} as const;

// ── Global chat ───────────────────────────────────────────────────────────────

function GlobalChatPanel({ currentUserId }: { currentUserId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [height, setHeight] = useState(220);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getValidAccessToken();
      if (!token || cancelled) return;
      const socket = io('/chat', { path: '/socketio', auth: { token: `Bearer ${token}` } });
      socketRef.current = socket;
      socket.on('connect', async () => {
        try { const h = await fetchChatHistory(); setMessages(h.filter((m: ChatMessage) => !m.roomId)); } catch { /* ok */ }
      });
      socket.on('receive_message', (msg: ChatMessage) => { if (!msg.roomId && msg.type !== 'INVITE') setMessages(prev => [...prev, msg]); });
      socket.on('connect_error', () => socket.disconnect());
    })();
    return () => { cancelled = true; socketRef.current?.disconnect(); socketRef.current = null; };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    if (isComposingRef.current) return;
    const content = input.trim();
    if (!content || !socketRef.current?.connected) return;
    socketRef.current.emit('send_message', { content, type: 'NORMAL' });
    setInput('');
  };

  const onDragStart = (e: React.MouseEvent) => {
    dragStartY.current = e.clientY;
    dragStartH.current = height;
    const onMove = (ev: MouseEvent) => {
      const delta = dragStartY.current - ev.clientY;
      setHeight(Math.max(120, Math.min(500, dragStartH.current + delta)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{ ...CS.panel, height }}>
      {/* Drag handle */}
      <div style={CS.dragHandle} onMouseDown={onDragStart} title="드래그로 크기 조절">
        <div style={CS.dragBar} />
      </div>
      <div style={CS.header}>
        <span style={CS.headerLabel}>GLOBAL CHAT</span>
      </div>
      <div style={CS.messages}>
        {messages.length === 0 && <div style={CS.empty}>아직 메시지가 없습니다</div>}
        {messages.map(msg => {
          const isMine = msg.sender.id === currentUserId;
          return (
            <div key={msg.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ ...CS.nick, color: isMine ? '#12c8a8' : '#5c6a8a' }}>{isMine ? '나' : msg.sender.nickname}:</span>
              <span style={CS.text}>{msg.content}</span>
              <span style={CS.time}>{new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={CS.inputRow}>
        <input value={input} onChange={e => setInput(e.target.value)} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !isComposingRef.current) send(); }} placeholder="메시지 입력..." style={CS.input} />
        <button onClick={send} disabled={!input.trim()} style={{ ...CS.sendBtn, opacity: input.trim() ? 1 : 0.4 }}>전송</button>
      </div>
    </div>
  );
}

// ── Icons & Labels ─────────────────────────────────────────────────────────────
const NAV_ICON: Record<Tab, string> = { lobby: '⊞', friends: '♛', leaderboard: '◈' };
const NAV_LABEL: Record<Tab, string> = { lobby: '로비', friends: '친구', leaderboard: '리더보드' };

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100dvh', background: '#05070c', display: 'flex', fontFamily: "'Inter',sans-serif" },
  sidebar: { width: 220, minHeight: '100dvh', background: '#0a0e1a', borderRight: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column' as const, padding: '20px 14px', gap: 4, flex: 'none' as const },
  logo: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, letterSpacing: '.2em', color: '#12c8a8', marginBottom: 16 },
  userChip: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', marginBottom: 14, cursor: 'pointer', width: '100%', textAlign: 'left' as const },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: '#1a2040', backgroundSize: 'cover', backgroundPosition: 'center', flex: 'none' as const },
  userName: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, color: '#e2e8f5' },
  userOnline: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#12c8a8', marginTop: 1 },
  profileDropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, marginTop: 4, background: '#0d1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 50 },
  dropdownItem: { display: 'block', padding: '10px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 as const, fontSize: 13, color: '#c7cede', textDecoration: 'none' as const },
  dropdownDivider: { height: 1, background: 'rgba(255,255,255,.06)' },
  dropdownDangerItem: { display: 'block', padding: '10px 14px', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 as const, fontSize: 13, color: '#ef4a63', background: 'transparent', border: 'none', width: '100%', textAlign: 'left' as const, cursor: 'pointer' },
  navList: { display: 'flex', flexDirection: 'column' as const, gap: 2, flex: 1 },
  navBtn: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 8, border: 'none', background: 'transparent', color: '#5c6a8a', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 as const, fontSize: 13, cursor: 'pointer', textAlign: 'left' as const },
  sidebarFooter: { display: 'flex', alignItems: 'center', gap: 4, padding: '10px 4px 4px', flexWrap: 'wrap' as const },
  footerLink: { fontFamily: "'Inter',sans-serif", fontSize: 11, color: '#3a4460', textDecoration: 'none', lineHeight: 1.4 },
  footerDot: { fontSize: 10, color: '#2a3250' },
  navBtnActive: { background: 'rgba(18,200,168,.1)', color: '#12c8a8', border: '1px solid rgba(18,200,168,.25)' },
  main: { flex: 1, padding: '28px 24px 20px', display: 'flex', flexDirection: 'column' as const, height: '100dvh', overflow: 'hidden', minWidth: 0 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap' as const, gap: 10 },
  sectionTitle: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 22, color: '#e2e8f5', marginBottom: 4 },
  sectionSub: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: '#5c6a8a' },
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

const CS = {
  panel: { borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column' as const, flex: 'none' as const, userSelect: 'none' as const },
  dragHandle: { display: 'flex', justifyContent: 'center', padding: '4px 0', cursor: 'ns-resize' },
  dragBar: { width: 36, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.12)' },
  header: { padding: '4px 0 6px', display: 'flex', alignItems: 'center' },
  headerLabel: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: '.14em', color: '#3a4256' },
  messages: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 5 },
  empty: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3a4256', textAlign: 'center' as const, paddingTop: 12 },
  nick: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, whiteSpace: 'nowrap' as const, flex: 'none' as const },
  text: { fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c7cede', wordBreak: 'break-word' as const, flex: 1 },
  time: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#2a3246', whiteSpace: 'nowrap' as const, flex: 'none' as const },
  inputRow: { display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.05)', marginTop: 4 },
  input: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#e2e8f5', fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none' },
  sendBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(18,200,168,.4)', background: 'rgba(18,200,168,.08)', color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const, fontSize: 13, cursor: 'pointer' },
} as const;
