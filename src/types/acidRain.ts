export type WordTier = 'easy' | 'medium' | 'hard';
export type GamePhase = 'WAITING' | 'COUNTDOWN' | 'IN_PROGRESS' | 'FINISHED';
export type EndReason = 'KO' | 'TIME_LIMIT' | 'FORFEIT';

export interface FallingWord {
  wordId: string;
  text: string;
  tier: WordTier;
  x: number;           // 0–85 (% from left, clamped so word stays in view)
  fallDurationMs: number;
  spawnedAt: number;   // Date.now() when received
}

export interface MatchEndData {
  winnerId: string | null;
  reason: EndReason;
  finalHp: { host: number; guest: number };
  wordsTyped: { host: number; guest: number };
  durationSec: number;
}

// Server → Client
export interface AcidRainServerEvents {
  match_ready:           (data: { serverTime: number }) => void;
  match_start:           (data: { serverTime: number; hostUserId: string; guestUserId: string }) => void;
  word_spawn:            (data: { wordId: string; text: string; tier: WordTier; fallDurationMs: number }) => void;
  word_cleared:          (data: { wordId: string; byUserId: string; damage: number }) => void;
  word_missed:           (data: { wordId: string; damage: number }) => void;
  submit_rejected:       (data: { wordId: string; reason: 'ALREADY_CLEARED' }) => void;
  hp_update:             (data: { hostHp: number; guestHp: number }) => void;
  match_end:             (data: MatchEndData) => void;
  opponent_disconnected: (data: { graceMs: number }) => void;
  state_sync:            (data: {
    elapsedSec: number;
    hostHp: number;
    guestHp: number;
    activeWords: Array<{ wordId: string; text: string; tier: WordTier; remainingMs: number }>;
    serverTime: number;
  }) => void;
  countdown:             (data: { sec: number }) => void;
}

// Client → Server
export interface AcidRainClientEvents {
  join_room:    (payload: { roomId: string }) => void;
  leave_room:   (payload: { roomId: string }) => void;
  word_submit:  (payload: { roomId: string; wordId: string; text: string }) => void;
}
