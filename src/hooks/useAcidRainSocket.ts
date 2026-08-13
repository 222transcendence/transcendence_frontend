import { useEffect, useRef, useCallback } from 'react';
import { useGameSocketContext } from '../context/GameSocketContext';
import type {
  AcidRainServerEvents,
  FallingWord,
  MatchEndData,
  HpByParticipantId,
} from '../types/acidRain';

export interface AcidRainHandlers {
  /** 전원 입장 완료 — HUMAN/AI 공통 participants[] (backend#138) */
  onMatchReady?: (data: Parameters<AcidRainServerEvents['match_ready']>[0]) => void;
  onMatchStart?: (startAt: string, now: string, initialHp: number) => void;
  onWordSpawn?: (word: FallingWord) => void;
  onWordCleared?: (wordId: string, clearedBy: string, targetParticipantId: string, damage: number, hp: HpByParticipantId) => void;
  onWordMissed?: (wordId: string, splashDamage: number, hp: HpByParticipantId) => void;
  onSubmitRejected?: (wordId: string, reason: string) => void;
  /** 탈락 이벤트 (N인 배틀로얄) */
  onPlayerEliminated?: (userId: string, rank: number, finalHp: number) => void;
  onMatchEnd?: (data: MatchEndData) => void;
  onOpponentDisconnected?: (userId: string) => void;
  onOpponentReconnected?: (userId: string) => void;
  onStateSync?: (data: Parameters<AcidRainServerEvents['state_sync']>[0]) => void;
  /** 상대방 실시간 입력 진행도 (#71) */
  onOpponentTyping?: (data: Parameters<AcidRainServerEvents['opponent_typing']>[0]) => void;
  onAiMonitorSnapshot?: (data: Parameters<AcidRainServerEvents['ai_monitor_snapshot']>[0]) => void;
}

function calcClockOffset(serverNow: string): number {
  return Date.parse(serverNow) - Date.now();
}

export function useAcidRainSocket(
  roomId: string,
  handlers: AcidRainHandlers = {},
  mode: 'player' | 'spectator' = 'player',
) {
  const { socket, connectionState, connect } = useGameSocketContext();
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const clockOffsetRef = useRef<number>(0);
  // match_ready/state_sync 수신 여부 — 받기 전까지는 join_room을 주기적으로 재전송한다.
  const joinedRef = useRef(false);

  useEffect(() => {
    connect();
    // 관전자는 room.players/세션에 등록된 적이 없으므로 leave_room을 보낼 필요가 없다
    // (서버에도 정리할 상태가 없음 — WEBSOCKET_PROTOCOL.md §6.7). 대신 인앱 이동 시
    // 소켓 disconnect를 기다리지 않고 바로 "관전 종료" 메시지를 보내도록 leave_spectate를 emit.
    return () => {
      if (mode === 'player') {
        socket?.emit('leave_room', { roomId });
      } else {
        socket?.emit('leave_spectate', { roomId });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    joinedRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!socket || connectionState !== 'connected' || !roomId) return;

    if (mode === 'spectator') {
      socket.emit('spectate_room', { roomId });

      // 로비는 join_room의 match_ready 시점(카운트다운 시작)에 바로 방을 "관전 가능"으로
      // 보여주지만(#153), 서버의 getSpectatorSnapshot은 세션이 IN_PROGRESS일 때만 스냅샷을
      // 준다 — 카운트다운(3초) 동안은 spectate_room이 거부된다. state_sync를 받을 때까지
      // 짧게 재시도해 이 틈을 메운다(join_room의 #144 재시도와 동일한 패턴).
      const spectateRetry = setInterval(() => {
        if (joinedRef.current) return;
        socket.emit('spectate_room', { roomId });
      }, 1500);
      return () => clearInterval(spectateRetry);
    }

    socket.emit('join_room', { roomId });

    // 소켓 connect와 React 렌더 타이밍이 어긋나 join_room이 서버에 도달하지
    // 않는 사례가 관측되어(#144), match_ready/state_sync로 응답이 올 때까지
    // 짧은 간격으로 재전송한다. 서버의 join_room 처리는 멱등이라 이미 입장한
    // 상태에서 재수신해도 안전하다(WAITING이면 다시 대기, 세션이 있으면
    // state_sync 재전송).
    const retry = setInterval(() => {
      if (joinedRef.current) return;
      socket.emit('join_room', { roomId });
    }, 2000);
    return () => clearInterval(retry);
  }, [socket, connectionState, roomId, mode]);

  useEffect(() => {
    if (!socket) return;

    const onMatchReady = (data: Parameters<AcidRainServerEvents['match_ready']>[0]) => {
      joinedRef.current = true;
      handlersRef.current.onMatchReady?.(data);
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
      handlersRef.current.onOpponentDisconnected?.(data.userId);
    };

    const onOpponentReconnected = (data: Parameters<AcidRainServerEvents['opponent_reconnected']>[0]) => {
      handlersRef.current.onOpponentReconnected?.(data.userId);
    };

    const onStateSync = (data: Parameters<AcidRainServerEvents['state_sync']>[0]) => {
      joinedRef.current = true;
      clockOffsetRef.current = calcClockOffset(data.now);
      handlersRef.current.onStateSync?.(data);
    };

    const onOpponentTyping = (data: Parameters<AcidRainServerEvents['opponent_typing']>[0]) => {
      handlersRef.current.onOpponentTyping?.(data);
    };

    const onAiMonitorSnapshot = (data: Parameters<AcidRainServerEvents['ai_monitor_snapshot']>[0]) => {
      handlersRef.current.onAiMonitorSnapshot?.(data);
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
    socket.on('opponent_typing', onOpponentTyping);
    socket.on('ai_monitor_snapshot', onAiMonitorSnapshot);

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
      socket.off('opponent_typing', onOpponentTyping);
      socket.off('ai_monitor_snapshot', onAiMonitorSnapshot);
    };
  }, [socket]);

  const submitWord = useCallback(
    (wordId: string, text: string) => {
      if (mode === 'spectator') return; // 관전자는 판정에 참여할 수 없다 (서버도 거부함)
      // attemptId — 서버가 이 값으로 재전송(replay)을 구분/방지한다. 같은 wordId를
      // 다시 제출하더라도(재시도 등) 매번 새 시도로 취급되도록 매 호출마다 새로 발급.
      const attemptId = crypto.randomUUID();
      socket?.emit('word_submit', { roomId, wordId, text, clientTs: Date.now(), attemptId });
    },
    [socket, roomId, mode],
  );

  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTypingProgress = useCallback(
    (partialText: string, wordId?: string) => {
      if (mode === 'spectator' || !socket) return;
      if (throttleTimerRef.current) return;
      socket.emit('typing_progress', { roomId, partialText, wordId, clientTs: Date.now() });
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
      }, 100);
    },
    [socket, roomId, mode],
  );

  return { connectionState, submitWord, sendTypingProgress };
}
