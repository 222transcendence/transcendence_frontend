import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMyProfile, fetchAllCards, type CardInfo } from '../api/client';
import { useGameSocket } from '../hooks/useGameSocket';
import ActionCard from '../components/game/ActionCard';
import GameEndModal from '../components/game/GameEndModal';
import type { GamePhase } from '../types/game';
import type { GameStartPayload, PhaseUpdatePayload } from '../types/gameSocket';
import type { MatchSummary } from '../types/gameAnimation';

const TIMER_SECONDS = 30;
const PHASES: GamePhase[] = ['DRAW', 'MOVE', 'ATTACK', 'DEFENSE', 'RESULT'];

function cardFallback(id: number): CardInfo {
  const types: CardInfo['type'][] = ['MOVE', 'ATK_SWORD', 'ATK_GUN', 'DEF', 'SPECIAL'];
  return { id, type: types[id % 5], valueTop: (id % 4) + 1, valueBottom: (id % 3) + 1 };
}

function legalTypes(phase: GamePhase): CardInfo['type'][] {
  if (phase === 'MOVE')    return ['MOVE'];
  if (phase === 'ATTACK')  return ['ATK_SWORD', 'ATK_GUN', 'SPECIAL'];
  if (phase === 'DEFENSE') return ['DEF', 'SPECIAL'];
  return [];
}

interface BoardState {
  phase: GamePhase;
  distance: number;
  currentTurn: number;
  initiative: 'host' | 'guest' | null;
  myHp: number;
  opponentHp: number;
  maxHp: number;
  myCardsInHand: number[];
  opponentCardCount: number;
  myStatusEffects: { type: string; duration: number }[];
  opponentStatusEffects: { type: string; duration: number }[];
  winnerId: string | null;
}

export default function GameBoardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [myNickname, setMyNickname] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opponentNickname, setOpponentNickname] = useState('');
  const [boardState, setBoardState] = useState<BoardState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [disconnectMsg, setDisconnectMsg] = useState('');
  const [endModalData, setEndModalData] = useState<{ summary: MatchSummary; isWinner: boolean } | null>(null);
  const [timer, setTimer] = useState(TIMER_SECONDS);
  const [cardMap, setCardMap] = useState<Map<number, CardInfo>>(new Map());
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [oppCardHover, setOppCardHover] = useState(false);
  const [oppStats, setOppStats] = useState<{ wins: number; losses: number; winRate: number } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostNicknameRef = useRef('');
  const guestNicknameRef = useRef('');
  const pendingStartRef = useRef<GameStartPayload | null>(null);
  const isHostRef = useRef(false);
  const myUserIdRef = useRef('');
  const myNicknameRef = useRef('');
  const opponentNicknameRef = useRef('');
  const opponentUserIdRef = useRef('');

  useEffect(() => {
    fetchAllCards().then(cards => {
      const map = new Map<number, CardInfo>();
      cards.forEach(c => map.set(c.id, c));
      setCardMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchMyProfile().then(profile => {

      setMyNickname(profile.nickname);
      myUserIdRef.current = profile.id;
      myNicknameRef.current = profile.nickname;
      if (pendingStartRef.current) {
        applyGameStart(pendingStartRef.current, profile.id);
        pendingStartRef.current = null;
      }
    }).catch(() => navigate('/login', { replace: true }));
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(TIMER_SECONDS);
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const applyGameStart = useCallback((payload: GameStartPayload, userId: string) => {
    const amHost = payload.host.userId === userId;
    isHostRef.current = amHost;
    setIsHost(amHost);
    hostNicknameRef.current = payload.host.nickname;
    guestNicknameRef.current = payload.guest?.nickname ?? '';
    const oppNick = amHost ? (payload.guest?.nickname ?? '?') : payload.host.nickname;
    opponentNicknameRef.current = oppNick;
    setOpponentNickname(oppNick);
    const oppId = amHost ? (payload.guest?.userId ?? '') : payload.host.userId;
    opponentUserIdRef.current = oppId;
    setBoardState({
      phase: payload.phase,
      distance: payload.distance,
      currentTurn: payload.currentTurn,
      initiative: null,
      myHp: amHost ? payload.host.hp : (payload.guest?.hp ?? 0),
      opponentHp: amHost ? (payload.guest?.hp ?? 0) : payload.host.hp,
      maxHp: 20,
      myCardsInHand: amHost ? payload.host.cardsInHand : (payload.guest?.cardsInHand ?? []),
      opponentCardCount: amHost ? (payload.guest?.cardsInHand.length ?? 0) : payload.host.cardsInHand.length,
      myStatusEffects: [],
      opponentStatusEffects: [],
      winnerId: null,
    });
    setSelectedCardId(null);
    setWaitingForOpponent(false);
    resetTimer();
  }, [resetTimer]);

  const handleGameStart = useCallback((payload: GameStartPayload) => {
    const uid = myUserIdRef.current;
    if (!uid) {
      pendingStartRef.current = payload;
      return;
    }
    applyGameStart(payload, uid);
  }, [applyGameStart]);

  const handlePhaseUpdate = useCallback((payload: PhaseUpdatePayload) => {
    const amHost = isHostRef.current;
    setBoardState({
      phase: payload.currentPhase ?? 'RESULT',
      distance: payload.distance,
      currentTurn: payload.currentTurn,
      initiative: payload.initiative,
      myHp: amHost ? payload.hostHp : payload.guestHp,
      opponentHp: amHost ? payload.guestHp : payload.hostHp,
      maxHp: 20,
      myCardsInHand: amHost ? payload.hostCardsInHand : payload.guestCardsInHand,
      opponentCardCount: (amHost ? payload.guestCardsInHand : payload.hostCardsInHand).length,
      myStatusEffects: amHost ? payload.statusEffects.host : payload.statusEffects.guest,
      opponentStatusEffects: amHost ? payload.statusEffects.guest : payload.statusEffects.host,
      winnerId: payload.winnerId,
    });
    setSelectedCardId(null);
    setWaitingForOpponent(false);
    resetTimer();

    if (payload.skillsTriggered.length > 0) {
      setBattleLog(prev => [...payload.skillsTriggered, ...prev].slice(0, 40));
    }

    if (payload.winnerId) {
      const isWinner = payload.winnerId === myUserIdRef.current;
      const winnerNickname = isWinner ? myNicknameRef.current : opponentNicknameRef.current;
      const loserNickname = isWinner ? opponentNicknameRef.current : myNicknameRef.current;
      setEndModalData({
        summary: {
          winnerNickname,
          loserNickname,
          turnsPlayed: payload.currentTurn,
          finalHostHp: payload.hostHp,
          finalGuestHp: payload.guestHp,
        },
        isWinner,
      });
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [resetTimer]);

  const handleCardsAccepted = useCallback(() => setWaitingForOpponent(true), []);
  const handlePlayerLeft = useCallback((_userId: string, nickname: string) => {
    setDisconnectMsg(`${nickname} has disconnected.`);
  }, []);

  const { connectionState, submitCards } = useGameSocket(roomId ?? '', {
    onGameStart: handleGameStart,
    onPhaseUpdate: handlePhaseUpdate,
    onCardsAccepted: handleCardsAccepted,
    onPlayerLeft: handlePlayerLeft,
  });

  const getCard = (id: number): CardInfo => cardMap.get(id) ?? cardFallback(id);

  const handleSubmit = useCallback(() => {
    if (selectedCardId === null) return;
    submitCards([selectedCardId]);
    setWaitingForOpponent(true);
  }, [selectedCardId, submitCards]);

  const handleSkip = useCallback(() => {
    submitCards([]);
    setWaitingForOpponent(true);
  }, [submitCards]);

  if (!boardState) {
    return (
      <div style={S.loadingWrap}>
        <div style={S.loadingText}>
          {connectionState === 'connecting' && 'Connecting to game...'}
          {connectionState === 'connected' && 'Waiting for game to start...'}
          {connectionState === 'error' && 'Connection failed. Please refresh.'}
          {connectionState === 'disconnected' && 'Disconnected.'}
        </div>
      </div>
    );
  }

  const phase = boardState.phase;
  const curPhaseIdx = PHASES.indexOf(phase);
  const isAttacker = boardState.initiative
    ? (isHost ? boardState.initiative === 'host' : boardState.initiative === 'guest')
    : true;

  const isMyMoveTurn    = phase === 'MOVE';
  const isMyAttackTurn  = phase === 'ATTACK'  && isAttacker;
  const isMyDefenseTurn = phase === 'DEFENSE' && !isAttacker;
  const waitingOnEnemy  = (phase === 'ATTACK' && !isAttacker) || (phase === 'DEFENSE' && isAttacker);

  const legal = legalTypes(phase);
  const handCards = boardState.myCardsInHand.map(id => getCard(id));
  const myHpPct  = Math.max(0, Math.round((boardState.myHp  / boardState.maxHp) * 100));
  const oppHpPct = Math.max(0, Math.round((boardState.opponentHp / boardState.maxHp) * 100));
  const selectedCard = selectedCardId !== null ? getCard(selectedCardId) : null;
  const canSubmit = selectedCard !== null && legal.includes(selectedCard.type);
  const showActions = !waitingForOpponent && (isMyMoveTurn || isMyAttackTurn || isMyDefenseTurn);

  return (
    <div style={S.page}>
      <div style={S.layout}>

        {/* ── Top bar ── */}
        <div style={S.topBar}>
          {leaveConfirm ? (
            <div style={S.leaveConfirmRow}>
              <span style={S.leaveConfirmText}>정말 나가시겠습니까? (패배 처리됩니다)</span>
              <button onClick={() => navigate('/lobby')} style={S.dangerSm}>예</button>
              <button onClick={() => setLeaveConfirm(false)} style={S.ghostSm}>아니오</button>
            </div>
          ) : (
            <button onClick={() => setLeaveConfirm(true)} style={S.dangerSm}>⎋ 나가기</button>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={S.label}>ROUND</div>
            <div style={S.roundNum}>{boardState.currentTurn}</div>
          </div>
        </div>

        {/* ── Enemy zone ── */}
        <div style={S.enemyZone}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}
              onMouseEnter={() => {
                setOppCardHover(true);
                const uid = opponentUserIdRef.current;
                if (uid && !oppStats) {
                  fetch(`/api/game/users/${uid}/stats`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
                  }).then(r => r.json()).then(j => { if (j.data) setOppStats(j.data); }).catch(() => {});
                }
              }}
              onMouseLeave={() => setOppCardHover(false)}>
              <div style={{ ...S.avatar, borderColor: '#ef4a63', background: '#1a0e12' }} />
              <div>
                <div style={S.playerName}>{opponentNickname}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  <span style={S.hpLabel}>HP</span>
                  <div style={S.hpTrack}>
                    <div style={{ ...S.hpFill, background: '#ef4a63', width: `${oppHpPct}%` }} />
                  </div>
                  <span style={S.hpNum}>{boardState.opponentHp}/{boardState.maxHp}</span>
                </div>
                {boardState.opponentStatusEffects.length > 0 && (
                  <div style={S.effectRow}>
                    {boardState.opponentStatusEffects.map((se, i) => (
                      <span key={i} style={S.effectBadge}>{se.type} ×{se.duration}</span>
                    ))}
                  </div>
                )}
              </div>
              {oppCardHover && (
                <div style={S.tooltip}>
                  <div style={S.tooltipLabel}>상대 전적</div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: '#e2e8f5', marginBottom: 6 }}>{opponentNickname}</div>
                  {!oppStats ? (
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#5c6a8a' }}>불러오는 중…</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>
                        <span style={{ color: '#12c8a8' }}>승 {oppStats.wins}</span>
                        <span style={{ color: '#ef4a63' }}>패 {oppStats.losses}</span>
                        <span style={{ color: '#eab308' }}>{Math.round(oppStats.winRate * 100)}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.1)', overflow: 'hidden', marginTop: 2 }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,#8b5cf6,#12c8a8)', width: `${Math.round(oppStats.winRate * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <span style={S.cardCountBadge}>{boardState.opponentCardCount} cards</span>
          </div>
        </div>

        {/* ── Battlefield ── */}
        <div style={S.battlefield}>
          {/* Phase steps */}
          <div style={S.phaseSteps}>
            {PHASES.map((p, i) => (
              <span key={p} style={{
                fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 11,
                letterSpacing: '.14em',
                color: i === curPhaseIdx ? '#12c8a8' : i < curPhaseIdx ? '#2a3246' : '#4e5e80',
                textShadow: i === curPhaseIdx ? '0 0 12px rgba(18,200,168,.7)' : 'none',
              }}>{p}</span>
            ))}
          </div>

          {/* VS display */}
          <div style={S.vsRow}>
            {/* Enemy card slot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: '#ef4a63' }}>ENEMY</span>
              <div style={S.cardSlot}>
                <span style={{ color: '#3a4256', fontSize: 10 }}>?</span>
              </div>
            </div>

            {/* Center info */}
            <div style={S.vsCenter}>
              <div style={S.vsLabel}>VS</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#8a93a8' }}>
                {boardState.distance <= 2 ? '⚔' : '➹'} 거리 {boardState.distance}
              </div>
              {boardState.initiative && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#5c6a8a', marginTop: 2 }}>
                  선공: {boardState.initiative === 'host' ? hostNicknameRef.current : guestNicknameRef.current}
                </div>
              )}
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: timer <= 10 ? '#ef4a63' : '#8a93a8', marginTop: 6 }}>
                ⏱ {timer}s
              </div>
            </div>

            {/* My card slot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: '#12c8a8' }}>YOU</span>
              {selectedCard
                ? <ActionCard card={selectedCard} size="sm" selected />
                : <div style={{ ...S.cardSlot, borderColor: 'rgba(18,200,168,.2)' }}><span style={{ color: '#3a4256', fontSize: 10 }}>-</span></div>
              }
            </div>
          </div>

          {/* Battle log */}
          {battleLog.length > 0 && (
            <div style={S.battleLog}>
              {battleLog.slice(0, 6).map((entry, i) => (
                <p key={i} style={S.battleLogLine}>{entry}</p>
              ))}
            </div>
          )}
        </div>

        {/* ── Player zone ── */}
        <div style={S.playerZone}>
          <div style={S.playerZoneTop}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ ...S.avatar, width: 44, height: 44, borderColor: '#12c8a8', background: '#0a1a16' }} />
              <div>
                <div style={S.playerName}>{myNickname}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  <span style={S.hpLabel}>HP</span>
                  <div style={S.hpTrack}>
                    <div style={{ ...S.hpFill, background: '#12c8a8', width: `${myHpPct}%` }} />
                  </div>
                  <span style={S.hpNum}>{boardState.myHp}/{boardState.maxHp}</span>
                </div>
                {boardState.myStatusEffects.length > 0 && (
                  <div style={S.effectRow}>
                    {boardState.myStatusEffects.map((se, i) => (
                      <span key={i} style={S.effectBadge}>{se.type} ×{se.duration}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(waitingForOpponent || waitingOnEnemy) ? (
                <span style={S.waitingText}>상대 행동 대기 중…</span>
              ) : showActions ? (
                <>
                  <button onClick={handleSubmit} disabled={!canSubmit} style={canSubmit ? S.primaryBtn : S.disabledBtn}>
                    {isMyMoveTurn && '이동 카드 제출'}
                    {isMyAttackTurn && '공격 카드 제출'}
                    {isMyDefenseTurn && '방어 카드 제출'}
                  </button>
                  <button onClick={handleSkip} style={S.ghostBtn}>
                    {isMyMoveTurn && '휴식 (HP+1)'}
                    {isMyAttackTurn && '건너뛰기'}
                    {isMyDefenseTurn && '포기'}
                  </button>
                </>
              ) : (phase === 'DRAW' || phase === 'RESULT') ? (
                <span style={S.waitingText}>
                  {phase === 'DRAW' ? '카드 드로우 중…' : '결과 처리 중…'}
                </span>
              ) : null}
            </div>
          </div>

          {/* Hand */}
          <div style={S.handLabel}>
            HAND — {handCards.length} CARDS
          </div>
          <div style={S.hand}>
            {handCards.map(card => {
              const isLegal = legal.includes(card.type);
              return (
                <ActionCard
                  key={card.id}
                  card={card}
                  size="md"
                  selected={selectedCardId === card.id}
                  faded={!isLegal}
                  onClick={(!waitingForOpponent && !waitingOnEnemy && isLegal)
                    ? c => setSelectedCardId(selectedCardId === c.id ? null : c.id)
                    : undefined}
                />
              );
            })}
          </div>
        </div>

        {disconnectMsg && (
          <div style={S.disconnectBanner}>{disconnectMsg}</div>
        )}
      </div>

      {endModalData && (
        <GameEndModal
          summary={endModalData.summary}
          isWinner={endModalData.isWinner}
          onRematch={() => navigate('/lobby')}
          onBackToLobby={() => navigate('/lobby')}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse 1200px 700px at 50% -5%, #0e1a24 0%, #05070c 60%)',
    fontFamily: "'Inter',sans-serif",
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '16px 12px',
  },
  layout: {
    width: '100%',
    maxWidth: 860,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  loadingWrap: {
    minHeight: '100vh',
    background: '#05070c',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 13,
    color: '#5c6a8a',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leaveConfirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  leaveConfirmText: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11,
    color: '#c7cede',
  },
  label: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 9,
    color: '#5c6a8a',
    letterSpacing: '.1em',
  },
  roundNum: {
    fontFamily: "'JetBrains Mono',monospace",
    fontWeight: 700 as const,
    fontSize: 16,
    color: '#e2e8f5',
  },
  enemyZone: {
    background: 'linear-gradient(180deg,rgba(239,74,99,.09),transparent)',
    border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 12,
    padding: '12px 16px',
  },
  battlefield: {
    background: '#0d1220',
    border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  playerZone: {
    background: 'linear-gradient(0deg,rgba(18,200,168,.07),transparent)',
    border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 12,
    padding: '12px 16px',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: '50%',
    border: '2px solid transparent',
    flex: 'none' as const,
  },
  playerName: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 14,
    color: '#e2e8f5',
  },
  hpLabel: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 9,
    color: '#8a93a8',
    width: 22,
  },
  hpTrack: {
    width: 140,
    height: 7,
    borderRadius: 4,
    background: '#182236',
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    transition: 'width .5s ease',
  },
  hpNum: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    color: '#c7cede',
  },
  effectRow: {
    display: 'flex',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap' as const,
  },
  effectBadge: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 9,
    color: '#eab308',
    border: '1px solid #eab308',
    borderRadius: 4,
    padding: '1px 5px',
  },
  cardCountBadge: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10.5,
    color: '#8a93a8',
  },
  tooltip: {
    position: 'absolute' as const,
    top: 64,
    left: 0,
    width: 190,
    background: '#111827',
    border: '1px solid rgba(239,74,99,.3)',
    borderRadius: 10,
    padding: 12,
    boxShadow: '0 12px 30px rgba(0,0,0,.5)',
    zIndex: 50,
  },
  tooltipLabel: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 9.5,
    color: '#5c6a8a',
    marginBottom: 6,
  },
  phaseSteps: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 14,
    flexWrap: 'wrap' as const,
  },
  vsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 12,
  },
  cardSlot: {
    width: 64,
    height: 88,
    borderRadius: 8,
    border: '1px dashed rgba(255,255,255,.14)',
    background: '#0a0e17',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsCenter: {
    textAlign: 'center' as const,
  },
  vsLabel: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    color: '#2a3246',
    fontSize: 20,
    marginBottom: 5,
  },
  battleLog: {
    borderTop: '1px solid rgba(255,255,255,.06)',
    paddingTop: 8,
    marginTop: 4,
    maxHeight: 72,
    overflowY: 'auto' as const,
  },
  battleLogLine: {
    margin: '2px 0',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    color: '#5c6a8a',
    lineHeight: 1.6,
  },
  playerZoneTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  handLabel: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 9.5,
    color: '#5c6a8a',
    letterSpacing: '.12em',
    marginBottom: 8,
  },
  hand: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto' as const,
    paddingBottom: 4,
  },
  waitingText: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11.5,
    color: '#5c6a8a',
  },
  primaryBtn: {
    padding: '8px 15px',
    borderRadius: 8,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.1)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 13,
    cursor: 'pointer',
  },
  disabledBtn: {
    padding: '8px 15px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.08)',
    background: 'transparent',
    color: '#3a4256',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 13,
    cursor: 'not-allowed',
    opacity: 0.4,
  },
  ghostBtn: {
    padding: '8px 15px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'transparent',
    color: '#8a93a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 13,
    cursor: 'pointer',
  },
  dangerSm: {
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid rgba(239,74,99,.35)',
    background: 'rgba(239,74,99,.06)',
    color: '#ef4a63',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10.5,
    cursor: 'pointer',
  },
  ghostSm: {
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'transparent',
    color: '#8a93a8',
    cursor: 'pointer',
    fontSize: 10.5,
    fontFamily: "'JetBrains Mono',monospace",
  },
  disconnectBanner: {
    background: 'rgba(239,74,99,.12)',
    border: '1px solid rgba(239,74,99,.4)',
    borderRadius: 8,
    padding: '10px 16px',
    color: '#ef4a63',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 12,
  },
} as const;
