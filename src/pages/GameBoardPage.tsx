import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMyProfile } from '../api/client';
import { useGameSocket } from '../hooks/useGameSocket';
import PhaseBanner from '../components/game/PhaseBanner';
import HandArea from '../components/game/HandArea';
import DamageFloatingNumber from '../components/game/DamageFloatingNumber';
import SkillEffectOverlay from '../components/game/SkillEffectOverlay';
import GameEndModal from '../components/game/GameEndModal';
import type { GamePhase } from '../types/game';
import type { GameStartPayload, PhaseUpdatePayload } from '../types/gameSocket';
import type { DamagePopup, SkillEffectTrigger, MatchSummary } from '../types/gameAnimation';

const TIMER_SECONDS = 30;

interface BoardState {
  phase: GamePhase;
  distance: number;
  currentTurn: number;
  initiative: 'host' | 'guest' | null;
  myHp: number;
  opponentHp: number;
  myCardsInHand: number[];
  opponentCardCount: number;
  myStatusEffects: { type: string; duration: number }[];
  opponentStatusEffects: { type: string; duration: number }[];
  winnerId: string | null;
}

export default function GameBoardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [myUserId, setMyUserId] = useState('');
  const [myNickname, setMyNickname] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opponentNickname, setOpponentNickname] = useState('');
  const [boardState, setBoardState] = useState<BoardState | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [disconnectMsg, setDisconnectMsg] = useState('');
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [skillTriggers, setSkillTriggers] = useState<SkillEffectTrigger[]>([]);
  const [endModalData, setEndModalData] = useState<{ summary: MatchSummary; isWinner: boolean } | null>(null);
  const [timer, setTimer] = useState(TIMER_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostNicknameRef = useRef('');
  const guestNicknameRef = useRef('');

  useEffect(() => {
    fetchMyProfile()
      .then((profile) => {
        setMyUserId(profile.id);
        setMyNickname(profile.nickname);
      })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(TIMER_SECONDS);
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleGameStart = useCallback(
    (payload: GameStartPayload) => {
      if (!myUserId) return;
      const amHost = payload.host.userId === myUserId;
      setIsHost(amHost);
      hostNicknameRef.current = payload.host.nickname;
      guestNicknameRef.current = payload.guest?.nickname ?? '';
      setOpponentNickname(amHost ? (payload.guest?.nickname ?? '?') : payload.host.nickname);
      setBoardState({
        phase: payload.phase,
        distance: payload.distance,
        currentTurn: payload.currentTurn,
        initiative: null,
        myHp: amHost ? payload.host.hp : (payload.guest?.hp ?? 0),
        opponentHp: amHost ? (payload.guest?.hp ?? 0) : payload.host.hp,
        myCardsInHand: amHost ? payload.host.cardsInHand : (payload.guest?.cardsInHand ?? []),
        opponentCardCount: amHost ? (payload.guest?.cardsInHand.length ?? 0) : payload.host.cardsInHand.length,
        myStatusEffects: [],
        opponentStatusEffects: [],
        winnerId: null,
      });
      setSelectedCardIds([]);
      setWaitingForOpponent(false);
      resetTimer();
    },
    [myUserId, resetTimer],
  );

  const handlePhaseUpdate = useCallback(
    (payload: PhaseUpdatePayload) => {
      const amHost = isHost;
      setBoardState({
        phase: payload.currentPhase ?? 'RESULT',
        distance: payload.distance,
        currentTurn: payload.currentTurn,
        initiative: payload.initiative,
        myHp: amHost ? payload.hostHp : payload.guestHp,
        opponentHp: amHost ? payload.guestHp : payload.hostHp,
        myCardsInHand: amHost ? payload.hostCardsInHand : payload.guestCardsInHand,
        opponentCardCount: (amHost ? payload.guestCardsInHand : payload.hostCardsInHand).length,
        myStatusEffects: amHost ? payload.statusEffects.host : payload.statusEffects.guest,
        opponentStatusEffects: amHost ? payload.statusEffects.guest : payload.statusEffects.host,
        winnerId: payload.winnerId,
      });
      setSelectedCardIds([]);
      setWaitingForOpponent(false);
      resetTimer();

      // spawn damage/skill animations from action log
      if (payload.skillsTriggered.length > 0) {
        const newTriggers: SkillEffectTrigger[] = payload.skillsTriggered.map((label, i) => ({
          id: `skill-${Date.now()}-${i}`,
          source: 'host',
          label,
        }));
        setSkillTriggers((prev) => [...prev, ...newTriggers]);
      }

      if (payload.winnerId) {
        const isWinner = payload.winnerId === myUserId;
        const winnerNickname =
          payload.winnerId === (amHost ? myUserId : '') ? myNickname : opponentNickname;
        setEndModalData({
          summary: {
            winnerNickname,
            loserNickname: winnerNickname === myNickname ? opponentNickname : myNickname,
            turnsPlayed: payload.currentTurn,
            finalHostHp: payload.hostHp,
            finalGuestHp: payload.guestHp,
          },
          isWinner,
        });
        if (timerRef.current) clearInterval(timerRef.current);
      }
    },
    [isHost, myUserId, myNickname, opponentNickname, resetTimer],
  );

  const handleCardsAccepted = useCallback(() => {
    setWaitingForOpponent(true);
  }, []);

  const handlePlayerLeft = useCallback((_userId: string, nickname: string) => {
    setDisconnectMsg(`${nickname} has disconnected.`);
  }, []);

  const { connectionState, submitCards } = useGameSocket(roomId ?? '', {
    onGameStart: handleGameStart,
    onPhaseUpdate: handlePhaseUpdate,
    onCardsAccepted: handleCardsAccepted,
    onPlayerLeft: handlePlayerLeft,
  });

  const toggleCard = useCallback((cardId: number) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (selectedCardIds.length === 0) return;
    submitCards(selectedCardIds);
  }, [selectedCardIds, submitCards]);

  if (!boardState) {
    return (
      <div className="game-board-loading">
        <p>
          {connectionState === 'connecting' && 'Connecting to game...'}
          {connectionState === 'connected' && 'Waiting for game to start...'}
          {connectionState === 'error' && 'Connection failed. Please refresh.'}
          {connectionState === 'disconnected' && 'Disconnected.'}
        </p>
      </div>
    );
  }

  const PHASE_LABEL: Record<GamePhase, string> = {
    DRAW: 'Draw', MOVE: 'Move', ATTACK: 'Attack', DEFENSE: 'Defense', RESULT: 'Result',
  };

  return (
    <div className="game-board">
      {/* Left sidebar: turn + timer */}
      <aside className="game-board-sidebar">
        <div className="game-sidebar-item">
          <span className="game-sidebar-label">Turn</span>
          <span className="game-sidebar-value">{boardState.currentTurn}</span>
        </div>
        <div className={`game-sidebar-item ${timer <= 10 ? 'timer-urgent' : ''}`}>
          <span className="game-sidebar-label">Timer</span>
          <span className="game-sidebar-value">{timer}s</span>
        </div>
        <div className="game-sidebar-item">
          <span className="game-sidebar-label">You</span>
          <span className="game-sidebar-value" style={{ fontSize: 12 }}>{myNickname}</span>
        </div>
      </aside>

      <div className="game-board-main">
        {/* Top: opponent info */}
        <div className="game-board-opponent">
          <div className="game-board-player-info">
            <span className="player-name">{opponentNickname}</span>
            <div className="status-effects">
              {boardState.opponentStatusEffects.map((se, i) => (
                <span key={i} className="status-badge">{se.type} ×{se.duration}</span>
              ))}
            </div>
          </div>
          <div className="hp-bar-container">
            <span className="hp-label">HP</span>
            <div className="hp-bar-bg">
              <div className="hp-bar-fill" style={{ width: `${Math.min(100, boardState.opponentHp)}%` }} />
            </div>
            <span className="hp-value">{boardState.opponentHp}</span>
          </div>
          <span className="card-count-badge">{boardState.opponentCardCount} cards</span>
        </div>

        {/* Center: distance, phase, initiative */}
        <div className="game-board-center">
          <PhaseBanner phase={boardState.phase} />
          <div className="game-center-stats">
            <div className="game-center-stat">
              <span className="game-center-stat-label">Distance</span>
              <span className="game-center-stat-value glow-cyan">{boardState.distance}</span>
            </div>
            <div className="game-center-stat">
              <span className="game-center-stat-label">Phase</span>
              <span className="game-center-stat-value">{PHASE_LABEL[boardState.phase]}</span>
            </div>
            {boardState.initiative && (
              <div className="game-center-stat">
                <span className="game-center-stat-label">Initiative</span>
                <span className="game-center-stat-value glow-cyan">
                  {boardState.initiative === 'host'
                    ? hostNicknameRef.current
                    : guestNicknameRef.current}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* My info */}
        <div className="game-board-me">
          <div className="hp-bar-container">
            <span className="hp-label">HP</span>
            <div className="hp-bar-bg">
              <div className="hp-bar-fill" style={{ width: `${Math.min(100, boardState.myHp)}%` }} />
            </div>
            <span className="hp-value">{boardState.myHp}</span>
          </div>
          <div className="game-board-player-info">
            <span className="player-name">{myNickname}</span>
            <div className="status-effects">
              {boardState.myStatusEffects.map((se, i) => (
                <span key={i} className="status-badge">{se.type} ×{se.duration}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Hand area */}
        <HandArea
          cardIds={boardState.myCardsInHand}
          selectedIds={selectedCardIds}
          disabled={boardState.phase === 'DRAW' || boardState.phase === 'RESULT'}
          onSelect={toggleCard}
          onSubmit={handleSubmit}
          waitingForOpponent={waitingForOpponent}
        />
      </div>

      {/* Floating overlays */}
      {damagePopups.map((popup) => (
        <DamageFloatingNumber
          key={popup.id}
          popup={popup}
          onDone={(id) => setDamagePopups((prev) => prev.filter((p) => p.id !== id))}
        />
      ))}
      {skillTriggers.map((trigger) => (
        <SkillEffectOverlay
          key={trigger.id}
          trigger={trigger}
          onDone={(id) => setSkillTriggers((prev) => prev.filter((t) => t.id !== id))}
        />
      ))}

      {disconnectMsg && (
        <div className="game-disconnect-banner">{disconnectMsg}</div>
      )}

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
