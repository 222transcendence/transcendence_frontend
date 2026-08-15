import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpponentTypingPayload, ParticipantState } from '../types/acidRain';

export interface AiTypingState {
  participantId: string;
  wordId: string | null;
  partialText: string;
  completedKeystrokes: number;
  totalKeystrokes: number;
  phase: 'REACTION' | 'TYPING' | 'CORRECTING' | 'IDLE';
}

interface AiTypingLifecycle {
  active: boolean;
  roomId: string | null;
  matchEpoch: number;
}

const EMPTY_AI_TYPING: Record<string, AiTypingState> = {};

/**
 * Keeps AI progress separate from legacy PvP text and rejects stale socket
 * events at the match boundary, including events arriving in the same tick as
 * match_end or a room change.
 */
export function useOpponentTypingState(roomId: string, participants: ParticipantState[]) {
  const [aiTyping, setAiTyping] = useState<Record<string, AiTypingState>>(EMPTY_AI_TYPING);
  const [legacyTyping, setLegacyTyping] = useState<Record<string, string>>({});
  const lifecycleRef = useRef<AiTypingLifecycle>({ active: false, roomId: null, matchEpoch: 0 });
  const latestVersionRef = useRef<Record<string, number>>({});
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const clearDisplay = useCallback(() => {
    setAiTyping({});
    setLegacyTyping({});
  }, []);

  const leaveRoom = useCallback(() => {
    lifecycleRef.current = {
      active: false,
      roomId: null,
      matchEpoch: lifecycleRef.current.matchEpoch + 1,
    };
    latestVersionRef.current = {};
    clearDisplay();
  }, [clearDisplay]);

  useEffect(() => leaveRoom, [roomId, leaveRoom]);

  const startMatch = useCallback((matchRoomId: string, matchParticipants: ParticipantState[]) => {
    if (matchRoomId !== roomId) return;
    const nextEpoch = lifecycleRef.current.matchEpoch + 1;
    lifecycleRef.current = { active: true, roomId: matchRoomId, matchEpoch: nextEpoch };
    participantsRef.current = matchParticipants;
    latestVersionRef.current = {};
    clearDisplay();
  }, [clearDisplay, roomId]);

  const endMatch = useCallback(() => {
    lifecycleRef.current.active = false;
    lifecycleRef.current.matchEpoch += 1;
    latestVersionRef.current = {};
    clearDisplay();
  }, [clearDisplay]);

  const activateFromStateSync = useCallback((syncRoomId: string, syncParticipants: ParticipantState[]) => {
    const lifecycle = lifecycleRef.current;
    // A fresh spectator and a participant reconnect receive only state_sync.
    // Once a lifecycle has existed, state_sync is deliberately not allowed to
    // reopen it after match_end or room cleanup.
    if (lifecycle.active || lifecycle.matchEpoch !== 0 || syncRoomId !== roomId) return;
    lifecycleRef.current = {
      active: true,
      roomId: syncRoomId,
      matchEpoch: 1,
    };
    participantsRef.current = syncParticipants;
    latestVersionRef.current = {};
    clearDisplay();
  }, [clearDisplay, roomId]);

  const applyTyping = useCallback((payload: OpponentTypingPayload) => {
    const lifecycle = lifecycleRef.current;
    const participantExists = participantsRef.current.some(
      participant => participant.participantId === payload.participantId,
    );
    if (!lifecycle.active || lifecycle.roomId !== roomId || !participantExists) return;

    if (payload.stateVersion === undefined) {
      setLegacyTyping(prev => {
        if (payload.partialText) return { ...prev, [payload.participantId]: payload.partialText };
        const next = { ...prev };
        delete next[payload.participantId];
        return next;
      });
      return;
    }

    const latest = latestVersionRef.current[payload.participantId];
    if (latest !== undefined && payload.stateVersion <= latest) return;
    latestVersionRef.current[payload.participantId] = payload.stateVersion;

    if (payload.phase === 'IDLE') {
      setAiTyping(prev => {
        const next = { ...prev };
        delete next[payload.participantId];
        return next;
      });
      return;
    }

    setAiTyping(prev => ({
      ...prev,
      [payload.participantId]: {
        participantId: payload.participantId,
        wordId: payload.wordId ?? null,
        partialText: payload.partialText,
        completedKeystrokes: payload.completedKeystrokes ?? 0,
        totalKeystrokes: payload.totalKeystrokes ?? 0,
        phase: payload.phase ?? 'TYPING',
      },
    }));
  }, [roomId]);

  return { aiTyping, legacyTyping, startMatch, endMatch, activateFromStateSync, applyTyping, leaveRoom };
}
