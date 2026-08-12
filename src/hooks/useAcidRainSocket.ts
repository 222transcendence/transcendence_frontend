import { useEffect, useRef, useCallback } from 'react';
import { useGameSocketContext } from '../context/GameSocketContext';
import type {
  AcidRainServerEvents,
  FallingWord,
  MatchEndData,
  ParticipantState,
  HpByParticipantId,
} from '../types/acidRain';

export interface AcidRainHandlers {
  /** 전원 입장 완료 — HUMAN/AI 공통 participants[] (backend#138) */
  onMatchReady?: (participants: ParticipantState[]) => void;
  onMatchStart?: (startAt: string, now: string, initialHp: number) => void;
  onWordSpawn?: (word: FallingWord) => void;
  onWordCleared?: (wordId: string, clearedBy: string, targetParticipantId: string, damage: number, hp: HpByParticipantId) => void;
  onWordMissed?: (wordId: string, splashDamage: number, hp: HpByParticipantId) => void;
  onSubmitRejected?: (wordId: string, reason: string) => void;
  /** 탈락 이벤트 (N인 배틀로얄) */
  onPlayerEliminated?: (userId: string, rank: number, finalHp: number) => void;
  onMatchEnd?: (data: MatchEndData) => void;
  onOpponentDisconnected?: (userId: string, graceMs: number) => void;
  onOpponentReconnected?: (userId: string) => void;
  onStateSync?: (data: Parameters<AcidRainServerEvents['state_sync']>[0]) => void;
}

function calcClockOffset(serverNow: string): number {
  return Date.parse(serverNow) - Date.now();
}

export function useAcidRainSocket(roomId: string, handlers: AcidRainHandlers = {}) {
  const { socket, connectionState, connect } = useGameSocketContext();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const clockOffsetRef = useRef<number>(0);

  useEffect(() => {
    connect();
    return () => { socket?.emit('leave_room', { roomId }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!socket || connectionState !== 'connected' || !roomId) return;
    socket.emit('join_room', { roomId });
  }, [socket, connectionState, roomId]);

  useEffect(() => {
    if (!socket) return;

    const onMatchReady = (data: Parameters<AcidRainServerEvents['match_ready']>[0]) => {
      handlersRef.current.onMatchReady?.(data.participants);
    };

    const onMatchStart = (data: Parameters<AcidRainServerEvents['match_start']>[0]) => {
      clockOffsetRef.current = calcClockOffset(data.now);
      handlersRef.current.onMatchStart?.(data.startAt, data.now, data.initialHp);
    };

    const onWordSpawn = (data: Parameters<AcidRainServerEvents['word_spawn']>[0]) => {
      const serverSpawnMs = Date.parse(data.spawnedAt);
      const animStartAt = serverSpawnMs + clockOffsetRef.current;

      const word: FallingWord = {
        ...data,
        animStartAt,
        renderDelayMs: animStartAt - Date.now(),
      };
      handlersRef.current.onWordSpawn?.(word);
    };

    const onWordCleared = (data: Parameters<AcidRainServerEvents['word_cleared']>[0]) => {
      handlersRef.current.onWordCleared?.(data.wordId, data.clearedBy, data.targetParticipantId, data.damage, data.hp);
    };

    const onWordMissed = (data: Parameters<AcidRainServerEvents['word_missed']>[0]) => {
      handlersRef.current.onWordMissed?.(data.wordId, data.splashDamage, data.hp);
    };

    const onSubmitRejected = (data: Parameters<AcidRainServerEvents['submit_rejected']>[0]) => {
      handlersRef.current.onSubmitRejected?.(data.wordId, data.reason);
    };

    const onPlayerEliminated = (data: Parameters<AcidRainServerEvents['player_eliminated']>[0]) => {
      handlersRef.current.onPlayerEliminated?.(data.userId, data.rank, data.finalHp);
    };

    const onMatchEnd = (data: MatchEndData) => {
      handlersRef.current.onMatchEnd?.(data);
    };

    const onOpponentDisconnected = (data: Parameters<AcidRainServerEvents['opponent_disconnected']>[0]) => {
      handlersRef.current.onOpponentDisconnected?.(data.userId, data.graceMs);
    };

    const onOpponentReconnected = (data: Parameters<AcidRainServerEvents['opponent_reconnected']>[0]) => {
      handlersRef.current.onOpponentReconnected?.(data.userId);
    };

    const onStateSync = (data: Parameters<AcidRainServerEvents['state_sync']>[0]) => {
      clockOffsetRef.current = calcClockOffset(data.now);
      handlersRef.current.onStateSync?.(data);
    };

    socket.on('match_ready', onMatchReady);
    socket.on('match_start', onMatchStart);
    socket.on('word_spawn', onWordSpawn);
    socket.on('word_cleared', onWordCleared);
    socket.on('word_missed', onWordMissed);
    socket.on('submit_rejected', onSubmitRejected);
    socket.on('player_eliminated', onPlayerEliminated);
    socket.on('match_end', onMatchEnd);
    socket.on('opponent_disconnected', onOpponentDisconnected);
    socket.on('opponent_reconnected', onOpponentReconnected);
    socket.on('state_sync', onStateSync);

    return () => {
      socket.off('match_ready', onMatchReady);
      socket.off('match_start', onMatchStart);
      socket.off('word_spawn', onWordSpawn);
      socket.off('word_cleared', onWordCleared);
      socket.off('word_missed', onWordMissed);
      socket.off('submit_rejected', onSubmitRejected);
      socket.off('player_eliminated', onPlayerEliminated);
      socket.off('match_end', onMatchEnd);
      socket.off('opponent_disconnected', onOpponentDisconnected);
      socket.off('opponent_reconnected', onOpponentReconnected);
      socket.off('state_sync', onStateSync);
    };
  }, [socket]);

  const submitWord = useCallback(
    (wordId: string, text: string) => {
      // attemptId — 서버가 이 값으로 재전송(replay)을 구분/방지한다. 같은 wordId를
      // 다시 제출하더라도(재시도 등) 매번 새 시도로 취급되도록 매 호출마다 새로 발급.
      const attemptId = crypto.randomUUID();
      socket?.emit('word_submit', { roomId, wordId, text, clientTs: Date.now(), attemptId });
    },
    [socket, roomId],
  );

  return { connectionState, submitWord };
}
