import { useEffect, useRef, useCallback } from 'react';
import { useGameSocketContext } from '../context/GameSocketContext';
import type { AcidRainServerEvents, FallingWord, MatchEndData } from '../types/acidRain';

interface AcidRainHandlers {
  onMatchStart?:           (hostUserId: string, guestUserId: string) => void;
  onCountdown?:            (sec: number) => void;
  onWordSpawn?:            (word: FallingWord) => void;
  onWordCleared?:          (wordId: string, byUserId: string, damage: number) => void;
  onWordMissed?:           (wordId: string, damage: number) => void;
  onHpUpdate?:             (hostHp: number, guestHp: number) => void;
  onMatchEnd?:             (data: MatchEndData) => void;
  onOpponentDisconnected?: (graceMs: number) => void;
  onStateSync?:            (data: Parameters<AcidRainServerEvents['state_sync']>[0]) => void;
}

export function useAcidRainSocket(roomId: string, handlers: AcidRainHandlers = {}) {
  const { socket, connectionState, connect } = useGameSocketContext();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

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

    const onMatchStart = ({ hostUserId, guestUserId }: { serverTime: number; hostUserId: string; guestUserId: string }) => {
      handlersRef.current.onMatchStart?.(hostUserId, guestUserId);
    };
    const onCountdown = ({ sec }: { sec: number }) => {
      handlersRef.current.onCountdown?.(sec);
    };
    const onWordSpawn = (data: { wordId: string; text: string; tier: 'easy' | 'medium' | 'hard'; fallDurationMs: number }) => {
      const word: FallingWord = {
        ...data,
        x: Math.random() * 82,
        spawnedAt: Date.now(),
      };
      handlersRef.current.onWordSpawn?.(word);
    };
    const onWordCleared = ({ wordId, byUserId, damage }: { wordId: string; byUserId: string; damage: number }) => {
      handlersRef.current.onWordCleared?.(wordId, byUserId, damage);
    };
    const onWordMissed = ({ wordId, damage }: { wordId: string; damage: number }) => {
      handlersRef.current.onWordMissed?.(wordId, damage);
    };
    const onHpUpdate = ({ hostHp, guestHp }: { hostHp: number; guestHp: number }) => {
      handlersRef.current.onHpUpdate?.(hostHp, guestHp);
    };
    const onMatchEnd = (data: MatchEndData) => {
      handlersRef.current.onMatchEnd?.(data);
    };
    const onOpponentDisconnected = ({ graceMs }: { graceMs: number }) => {
      handlersRef.current.onOpponentDisconnected?.(graceMs);
    };
    const onStateSync = (data: Parameters<AcidRainServerEvents['state_sync']>[0]) => {
      handlersRef.current.onStateSync?.(data);
    };

    socket.on('match_start', onMatchStart);
    socket.on('countdown', onCountdown);
    socket.on('word_spawn', onWordSpawn);
    socket.on('word_cleared', onWordCleared);
    socket.on('word_missed', onWordMissed);
    socket.on('hp_update', onHpUpdate);
    socket.on('match_end', onMatchEnd);
    socket.on('opponent_disconnected', onOpponentDisconnected);
    socket.on('state_sync', onStateSync);

    return () => {
      socket.off('match_start', onMatchStart);
      socket.off('countdown', onCountdown);
      socket.off('word_spawn', onWordSpawn);
      socket.off('word_cleared', onWordCleared);
      socket.off('word_missed', onWordMissed);
      socket.off('hp_update', onHpUpdate);
      socket.off('match_end', onMatchEnd);
      socket.off('opponent_disconnected', onOpponentDisconnected);
      socket.off('state_sync', onStateSync);
    };
  }, [socket]);

  const submitWord = useCallback((wordId: string, text: string) => {
    socket?.emit('word_submit', { roomId, wordId, text });
  }, [socket, roomId]);

  return { connectionState, submitWord };
}
