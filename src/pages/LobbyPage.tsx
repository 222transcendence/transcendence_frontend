import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import styled from 'styled-components';
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
    <Page onClick={() => setProfileMenuOpen(false)}>
      {/* Sidebar */}
      <Sidebar>
        <Logo href="/lobby">Acid-Rain</Logo>

        {/* Profile card — clickable dropdown */}
        <div style={{ position: 'relative' as const }}>
          <UserChip
            onClick={e => { e.stopPropagation(); setProfileMenuOpen(o => !o); }}
          >
            <Avatar style={{ backgroundImage: myAvatar ? `url(${myAvatar})` : 'none' }} />
            <div style={{ flex: 1, textAlign: 'left' as const }}>
              <UserName>{myNickname || '…'}</UserName>
              <UserOnline>● Online</UserOnline>
            </div>
            <div style={{ color: '#5c6a8a', fontSize: 10 }}>{profileMenuOpen ? '▲' : '▼'}</div>
          </UserChip>
          {profileMenuOpen && (
            <ProfileDropdown onClick={e => e.stopPropagation()}>
              <DropdownItem to="/profile" onClick={() => setProfileMenuOpen(false)}>내 프로필</DropdownItem>
              <DropdownDivider />
              <DropdownDangerItem onClick={() => { localStorage.clear(); navigate('/login'); }}>로그아웃</DropdownDangerItem>
            </ProfileDropdown>
          )}
        </div>

        <NavList>
          {(['lobby', 'friends', 'leaderboard'] as Tab[]).map(t => (
            <NavBtn key={t} onClick={() => setTab(t)} $active={tab === t}>
              {NAV_ICON[t]} {NAV_LABEL[t]}
            </NavBtn>
          ))}
        </NavList>

        <div style={{ flex: 1 }} />

        <SidebarFooter>
          <FooterLink to="/terms-of-service">이용약관</FooterLink>
          <FooterDot>·</FooterDot>
          <FooterLink to="/privacy-policy">개인정보처리방침</FooterLink>
        </SidebarFooter>
      </Sidebar>

      {/* Main */}
      <Main>
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
      </Main>

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
    </Page>
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
        <SectionHeader>
          <div>
            <SectionTitle>게임 로비</SectionTitle>
            <SectionSub>{rooms.length}개 방이 열려있습니다</SectionSub>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <PrimaryBtn onClick={onCreateRoom} disabled={isConnecting}>+ 방 만들기</PrimaryBtn>
            <GhostBtn onClick={onAiClick}>AI 대전</GhostBtn>
          </div>
        </SectionHeader>
        {connectionError && <ErrorBanner>{connectionError}</ErrorBanner>}
        {isConnecting ? (
          <EmptyState>로비에 연결 중…</EmptyState>
        ) : rooms.length === 0 ? (
          <EmptyState>열린 방이 없습니다. 방을 만들어보세요!</EmptyState>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {rooms.map(room => {
              const host = room.players.find(p => p.userId === room.hostUserId);
              const isInGame = room.status !== 'WAITING';
              const isWaitingFull = room.players.length >= room.maxPlayers;
              const isOwnRoom = room.players.some(p => p.userId === currentUserId);
              return (
                <Card key={room.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <CardTitle>{host?.nickname ?? '알 수 없음'}의 방</CardTitle>
                    <CardSub>{room.players.length}/{room.maxPlayers} 명 · {isInGame ? '게임 중' : '대기 중'}</CardSub>
                  </div>
                  {isInGame ? (
                    isOwnRoom ? (
                      <PrimaryBtn onClick={() => onRejoinRoom(room)}>재접속하기</PrimaryBtn>
                    ) : (
                      <GhostBtn onClick={() => onSpectateRoom(room)}>👁 관전하기</GhostBtn>
                    )
                  ) : (
                    isWaitingFull ? (
                      <DisabledBtn disabled>참가 불가</DisabledBtn>
                    ) : (
                      <PrimaryBtn onClick={() => onJoinRoom(room)}>참가하기</PrimaryBtn>
                    )
                  )}
                </Card>
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
      <SectionTitle>친구 목록</SectionTitle>

      <Card>
        <CardTitle>친구 추가</CardTitle>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Input value={addNickname} onChange={e => onAddNicknameChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAddFriend()} placeholder="닉네임 입력" />
          <PrimaryBtn onClick={onAddFriend}>요청</PrimaryBtn>
        </div>
        {addMsg && <InfoText>{addMsg}</InfoText>}
      </Card>

      <Card>
        <CardTitle>친구 요청 {pendingRequests.length > 0 && <span style={{ color: '#ef4a63', marginLeft: 6 }}>({pendingRequests.length})</span>}</CardTitle>
        {pendingRequests.length === 0 ? (
          <CardSub style={{ marginTop: 8 }}>받은 친구 요청이 없습니다.</CardSub>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 10 }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FriendAvatar style={{ backgroundImage: req.requester.avatar ? `url(${req.requester.avatar})` : 'none' }} />
                  <span style={{ fontSize: 13, color: '#c7cede' }}>{req.requester.nickname}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <PrimaryBtnSm onClick={() => onRespond(req.id, 'accept')}>수락</PrimaryBtnSm>
                  <DangerBtnSm onClick={() => onRespond(req.id, 'reject')}>거절</DangerBtnSm>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>보낸 요청 {sentRequests.length > 0 && <span style={{ color: '#5c6a8a', marginLeft: 6 }}>({sentRequests.length})</span>}</CardTitle>
        {sentRequests.length === 0 ? (
          <CardSub style={{ marginTop: 8 }}>보낸 친구 요청이 없습니다.</CardSub>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 10 }}>
            {sentRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FriendAvatar style={{ backgroundImage: req.receiver.avatar ? `url(${req.receiver.avatar})` : 'none' }} />
                  <span style={{ fontSize: 13, color: '#c7cede' }}>{req.receiver.nickname}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#5c6a8a' }}>대기 중</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>친구 ({friends.length})</CardTitle>
        {friends.length === 0 ? (
          <CardSub style={{ marginTop: 8 }}>친구가 없습니다.</CardSub>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 10 }}>
            {friends.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => onFriendClick(f)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <FriendAvatar style={{ backgroundImage: f.avatar ? `url(${f.avatar})` : 'none' }} />
                  <span style={{ fontSize: 8, color: f.status === 'ONLINE' ? '#12c8a8' : f.status === 'IN_GAME' ? '#eab308' : '#5c6a8a' }}>●</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c7cede' }}>{f.nickname}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#5c6a8a' }}>{f.status}</span>
                </button>
                <DangerBtnSm onClick={() => onRemove(f.id)}>삭제</DangerBtnSm>
              </div>
            ))}
          </div>
        )}
      </Card>
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
      <SectionTitle>리더보드</SectionTitle>
      {entries.length === 0 ? (
        <EmptyState>불러오는 중…</EmptyState>
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
          <PrimaryBtn onClick={() => { navigate(`/stats/${friend.id}`); onClose(); }} style={{ flex: 1 }}>전적 보기</PrimaryBtn>
          <GhostBtn onClick={() => { navigate(`/profile/${friend.id}`); onClose(); }} style={{ flex: 1 }}>프로필</GhostBtn>
        </div>
        {!isFriend && (
          <div style={{ marginTop: 8 }}>
            <PrimaryBtn style={{ width: '100%' }} onClick={async () => {
              try {
                const { sendFriendRequest } = await import('../api/client');
                await sendFriendRequest(friend.id); onClose();
              } catch { /* already sent */ }
            }}>친구 추가</PrimaryBtn>
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
    <AiBackdrop onClick={onClose}>
      <AiModal onClick={e => e.stopPropagation()}>
        <AiTitle>AI 실력 선택</AiTitle>
        <AiSubtitle>게임 규칙과 시간별 난이도 상승은 온라인 대전과 동일합니다.</AiSubtitle>

        <AiCardRow>
          {AI_DIFFICULTY_CARDS.map(c => {
            const selected = c.key === difficulty;
            return (
              <AiCard
                key={c.key}
                onClick={() => { if (!loading) setDifficulty(c.key); }}
                $selected={selected}
                $loading={loading}
                aria-pressed={selected}
                disabled={loading}
              >
                <AiCardLabelRow>
                  <AiCardLabel>{c.label}</AiCardLabel>
                  {selected && <AiCardCheck>✓</AiCardCheck>}
                </AiCardLabelRow>
                <AiCardDesc>{c.desc}</AiCardDesc>
              </AiCard>
            );
          })}
        </AiCardRow>

        <AiNotice>AI 대전 결과는 PvP 랭킹에 반영되지 않습니다.</AiNotice>

        {error && <AiErrorMsg>{error}</AiErrorMsg>}

        <PrimaryBtn
          onClick={handleStart}
          disabled={loading}
          style={{ width: '100%', padding: '10px 0', opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? '연결 중…' : 'AI 대전 시작'}
        </PrimaryBtn>
        <GhostBtn onClick={onClose} disabled={loading} style={{ width: '100%', marginTop: 8, opacity: loading ? 0.4 : 1 }}>닫기</GhostBtn>
      </AiModal>
    </AiBackdrop>
  );
}

const AiBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const AiModal = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px 22px;
  width: 380px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
`;

const AiTitle = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 18px;
  color: #e2e8f5;
  margin-bottom: 6px;
`;

const AiSubtitle = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: #5c6a8a;
  margin-bottom: 18px;
  line-height: 1.5;
`;

const AiCardRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const AiCard = styled.button<{ $selected: boolean; $loading: boolean }>`
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 12px 10px;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  ${p => (p.$selected ? 'background: rgba(18,200,168,.1); border: 1.5px solid rgba(18,200,168,.6);' : '')}
  ${p => (p.$loading ? 'opacity: 0.6; cursor: not-allowed;' : '')}
`;

const AiCardLabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const AiCardLabel = styled.span`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #e2e8f5;
`;

const AiCardCheck = styled.span`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #12c8a8;
`;

const AiCardDesc = styled.div`
  font-family: 'Inter', sans-serif;
  font-size: 10.5px;
  color: #8a93a8;
  line-height: 1.4;
`;

const AiNotice = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #5c6a8a;
  text-align: center;
  margin-bottom: 14px;
`;

const AiErrorMsg = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  color: #f87171;
  text-align: center;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  padding: 10px 8px;
  margin-bottom: 12px;
`;

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
    <ChatPanelWrapper style={{ height }}>
      {/* Drag handle */}
      <DragHandle onMouseDown={onDragStart} title="드래그로 크기 조절">
        <DragBar />
      </DragHandle>
      <ChatHeader>
        <ChatHeaderLabel>GLOBAL CHAT</ChatHeaderLabel>
      </ChatHeader>
      <ChatMessages>
        {messages.length === 0 && <ChatEmpty>아직 메시지가 없습니다</ChatEmpty>}
        {messages.map(msg => {
          const isMine = msg.sender.id === currentUserId;
          return (
            <div key={msg.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <ChatNick style={{ color: isMine ? '#12c8a8' : '#5c6a8a' }}>{isMine ? '나' : msg.sender.nickname}:</ChatNick>
              <ChatText>{msg.content}</ChatText>
              <ChatTime>{new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</ChatTime>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </ChatMessages>
      <ChatInputRow>
        <ChatInput value={input} onChange={e => setInput(e.target.value)} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !isComposingRef.current) send(); }} placeholder="메시지 입력..." />
        <ChatSendBtn onClick={send} disabled={!input.trim()} style={{ opacity: input.trim() ? 1 : 0.4 }}>전송</ChatSendBtn>
      </ChatInputRow>
    </ChatPanelWrapper>
  );
}

// ── Icons & Labels ─────────────────────────────────────────────────────────────
const NAV_ICON: Record<Tab, string> = { lobby: '⊞', friends: '♛', leaderboard: '◈' };
const NAV_LABEL: Record<Tab, string> = { lobby: '로비', friends: '친구', leaderboard: '리더보드' };

// ── Styles ────────────────────────────────────────────────────────────────────
const Page = styled.div`
  min-height: 100dvh;
  background: #05070c;
  display: flex;
  font-family: 'Inter', sans-serif;
`;

const Sidebar = styled.nav`
  width: 220px;
  min-height: 100dvh;
  background: #0a0e1a;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  gap: 4px;
  flex: none;
`;

const Logo = styled.a`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.2em;
  color: #12c8a8;
  margin-bottom: 16px;
  text-decoration: none;
  cursor: pointer;
`;

const UserChip = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 14px;
  cursor: pointer;
  width: 100%;
  text-align: left;
`;

const Avatar = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #1a2040;
  background-size: cover;
  background-position: center;
  flex: none;
`;

const UserName = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #e2e8f5;
`;

const UserOnline = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #12c8a8;
  margin-top: 1px;
`;

const ProfileDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 50;
`;

const DropdownItem = styled(Link)`
  display: block;
  padding: 10px 14px;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: #c7cede;
  text-decoration: none;
`;

const DropdownDivider = styled.div`
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
`;

const DropdownDangerItem = styled.button`
  display: block;
  padding: 10px 14px;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: #ef4a63;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
`;

const NavList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
`;

const NavBtn = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 11px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #5c6a8a;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  ${p => (p.$active ? 'background: rgba(18,200,168,.1); color: #12c8a8; border: 1px solid rgba(18,200,168,.25);' : '')}
`;

const SidebarFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 4px;
  flex-wrap: wrap;
`;

const FooterLink = styled(Link)`
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #3a4460;
  text-decoration: none;
  line-height: 1.4;
`;

const FooterDot = styled.span`
  font-size: 10px;
  color: #2a3250;
`;

const Main = styled.main`
  flex: 1;
  padding: 28px 24px 20px;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  min-width: 0;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 18px;
  flex-wrap: wrap;
  gap: 10px;
`;

const SectionTitle = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 22px;
  color: #e2e8f5;
  margin-bottom: 4px;
`;

const SectionSub = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: #5c6a8a;
`;

const Card = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 14px 16px;
`;

const CardTitle = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: #c7cede;
`;

const CardSub = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: #5c6a8a;
  margin-top: 3px;
`;

const PrimaryBtn = styled.button`
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.1);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
`;

const PrimaryBtnSm = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.1);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
`;

const DangerBtnSm = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(239, 74, 99, 0.35);
  background: rgba(239, 74, 99, 0.06);
  color: #ef4a63;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
`;

const GhostBtn = styled.button`
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #8a93a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
`;

const DisabledBtn = styled.button`
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: #3a4256;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: not-allowed;
  white-space: nowrap;
`;

const Input = styled.input`
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #111827;
  color: #e2e8f5;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  outline: none;
`;

const EmptyState = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #5c6a8a;
  padding: 24px 0;
  text-align: center;
`;

const ErrorBanner = styled.div`
  background: rgba(239, 74, 99, 0.1);
  border: 1px solid rgba(239, 74, 99, 0.35);
  border-radius: 8px;
  padding: 10px 14px;
  color: #ef4a63;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  margin-bottom: 12px;
`;

const FriendAvatar = styled.div`
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #1a2040;
  background-size: cover;
  background-position: center;
  flex: none;
`;

const InfoText = styled.div`
  margin-top: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #12c8a8;
`;

// ── Global chat styles ───────────────────────────────────────────────────────
const ChatPanelWrapper = styled.div`
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  flex: none;
  user-select: none;
`;

const DragHandle = styled.div`
  display: flex;
  justify-content: center;
  padding: 4px 0;
  cursor: ns-resize;
`;

const DragBar = styled.div`
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
`;

const ChatHeader = styled.div`
  padding: 4px 0 6px;
  display: flex;
  align-items: center;
`;

const ChatHeaderLabel = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: #3a4256;
`;

const ChatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const ChatEmpty = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #3a4256;
  text-align: center;
  padding-top: 12px;
`;

const ChatNick = styled.span`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  flex: none;
`;

const ChatText = styled.span`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #c7cede;
  word-break: break-word;
  flex: 1;
`;

const ChatTime = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #2a3246;
  white-space: nowrap;
  flex: none;
`;

const ChatInputRow = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: 4px;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #e2e8f5;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  outline: none;
`;

const ChatSendBtn = styled.button`
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(18, 200, 168, 0.4);
  background: rgba(18, 200, 168, 0.08);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
`;
