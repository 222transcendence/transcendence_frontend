import { useEffect, useRef, useCallback } from 'react';
import { useGameSocketContext } from '../context/GameSocketContext';
import type {
  AcidRainServerEvents,
  FallingWord,
  MatchEndData,
  PlayerPublic,
  HpPair,
} from '../types/acidRain';

export interface AcidRainHandlers {
  onMatchReady?:           (players: { host: PlayerPublic; guest: PlayerPublic }) => void;
  onMatchStart?:           (startAt: string, now: string, initialHp: number) => void;
  onWordSpawn?:            (word: FallingWord) => void;
  onWordCleared?:          (wordId: string, clearedBy: string, damage: number, targetHp: HpPair) => void;
  onWordMissed?:           (wordId: string, splashDamage: number, targetHp: HpPair) => void;
  onSubmitRejected?:       (wordId: string, reason: string) => void;
  onMatchEnd?:             (data: MatchEndData) => void;
  onOpponentDisconnected?: (userId: string, graceMs: number) => void;
  onOpponentReconnected?:  (userId: string) => void;
  onStateSync?:            (data: Parameters<AcidRainServerEvents['state_sync']>[0]) => void;
}

/** 서버 `now`와 클라이언트 수신 시각의 차이를 클록 오프셋(ms)으로 반환 */
function calcClockOffset(serverNow: string): number {
  return Date.parse(serverNow) - Date.now();
}

export function useAcidRainSocket(roomId: string, handlers: AcidRainHandlers = {}) {
  const { socket, connectionState, connect } = useGameSocketContext();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // match_start 수신 시 계산된 클록 오프셋 보관 (word_spawn 보정에 사용)
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
      handlersRef.current.onMatchReady?.(data.players);
    };

    const onMatchStart = (data: Parameters<AcidRainServerEvents['match_start']>[0]) => {
      clockOffsetRef.current = calcClockOffset(data.now);
      handlersRef.current.onMatchStart?.(data.startAt, data.now, data.initialHp);
    };

    const onWordSpawn = (data: Parameters<AcidRainServerEvents['word_spawn']>[0]) => {
      // 낙하 높이 동기화: 애니메이션 시작 시각 = 서버 spawnedAt + 클록 오프셋 보정
      const serverSpawnMs = Date.parse(data.spawnedAt);
      const animStartAt = serverSpawnMs + clockOffsetRef.current;

      const word: FallingWord = {
        ...data,
        animStartAt,
      };
      handlersRef.current.onWordSpawn?.(word);
    };

    const onWordCleared = (data: Parameters<AcidRainServerEvents['word_cleared']>[0]) => {
      handlersRef.current.onWordCleared?.(data.wordId, data.clearedBy, data.damage, data.targetHp);
    };

    const onWordMissed = (data: Parameters<AcidRainServerEvents['word_missed']>[0]) => {
      handlersRef.current.onWordMissed?.(data.wordId, data.splashDamage, data.targetHp);
    };

    const onSubmitRejected = (data: Parameters<AcidRainServerEvents['submit_rejected']>[0]) => {
      handlersRef.current.onSubmitRejected?.(data.wordId, data.reason);
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
      // 재접속 시 클록 오프셋 갱신
      clockOffsetRef.current = calcClockOffset(data.now);
      handlersRef.current.onStateSync?.(data);
    };

    socket.on('match_ready', onMatchReady);
    socket.on('match_start', onMatchStart);
    socket.on('word_spawn', onWordSpawn);
    socket.on('word_cleared', onWordCleared);
    socket.on('word_missed', onWordMissed);
    socket.on('submit_rejected', onSubmitRejected);
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
      socket.off('match_end', onMatchEnd);
      socket.off('opponent_disconnected', onOpponentDisconnected);
      socket.off('opponent_reconnected', onOpponentReconnected);
      socket.off('state_sync', onStateSync);
    };
  }, [socket]);

  const submitWord = useCallback((wordId: string, text: string) => {
    socket?.emit('word_submit', { roomId, wordId, text, clientTs: Date.now() });
  }, [socket, roomId]);

  return { connectionState, submitWord };
}
