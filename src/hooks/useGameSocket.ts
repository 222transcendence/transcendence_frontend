import { useEffect, useRef } from 'react';
import { useGameSocketContext } from '../context/GameSocketContext';
import type { ServerToClientEvents } from '../types/gameSocket';
import type { GameStartPayload, PhaseUpdatePayload } from '../types/gameSocket';

interface GameSocketHandlers {
  onGameStart?: (payload: GameStartPayload) => void;
  onPhaseUpdate?: (payload: PhaseUpdatePayload) => void;
  onCardsAccepted?: (roomId: string) => void;
  onPlayerLeft?: (userId: string, nickname: string) => void;
}

export function useGameSocket(roomId: string, handlers: GameSocketHandlers = {}) {
  const { socket, connectionState, connect } = useGameSocketContext();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Auto-connect and join room when roomId is provided
  useEffect(() => {
    connect();
    return () => {
      socket?.emit('leave_room', { roomId });
    };
    // connect and socket are stable references; roomId is the join key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Join the socket room once connected
  useEffect(() => {
    if (!socket || connectionState !== 'connected' || !roomId) return;
    socket.emit('join_room', { roomId });
  }, [socket, connectionState, roomId]);

  // Subscribe to server events
  useEffect(() => {
    if (!socket) return;

    const onGameStart: ServerToClientEvents['game_start'] = ({ payload }) => {
      handlersRef.current.onGameStart?.(payload);
    };
    const onPhaseUpdate: ServerToClientEvents['phase_update'] = ({ payload }) => {
      handlersRef.current.onPhaseUpdate?.(payload);
    };
    const onCardsAccepted: ServerToClientEvents['cards_accepted'] = ({ payload }) => {
      handlersRef.current.onCardsAccepted?.(payload.roomId);
    };
    const onPlayerLeft: ServerToClientEvents['player_left'] = ({ payload }) => {
      handlersRef.current.onPlayerLeft?.(payload.userId, payload.nickname);
    };

    socket.on('game_start', onGameStart);
    socket.on('phase_update', onPhaseUpdate);
    socket.on('cards_accepted', onCardsAccepted);
    socket.on('player_left', onPlayerLeft);

    return () => {
      socket.off('game_start', onGameStart);
      socket.off('phase_update', onPhaseUpdate);
      socket.off('cards_accepted', onCardsAccepted);
      socket.off('player_left', onPlayerLeft);
    };
  }, [socket]);

  const submitCards = (cardIds: number[]) => {
    socket?.emit('submit_cards', { roomId, cardIds });
  };

  return { connectionState, submitCards };
}
