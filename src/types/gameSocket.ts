import type { GamePhase, RoomStatus, StatusEffect } from './game';

// ─── Payload shapes emitted by the server ────────────────────────────────────

export interface PlayerSocketInfo {
  userId: string;
  nickname: string;
  characterId?: number;
  hp: number;
  cardsInHand: number[];
}

export interface DiceDetail {
  count: number;
  successes: number;
  details: boolean[];
}

export interface DiceResults {
  hostAtk?: DiceDetail;
  guestAtk?: DiceDetail;
  hostDef?: DiceDetail;
  guestDef?: DiceDetail;
}

export interface GameStartPayload {
  roomId: string;
  host: PlayerSocketInfo;
  guest: PlayerSocketInfo | null;
  phase: GamePhase;
  distance: number;
  currentTurn: number;
}

export interface PhaseUpdatePayload {
  roomId: string;
  status: RoomStatus;
  currentPhase: GamePhase | null;
  initiative: 'host' | 'guest' | null;
  distance: number;
  currentTurn: number;
  hostHp: number;
  guestHp: number;
  hostCardsInHand: number[];
  guestCardsInHand: number[];
  statusEffects: { host: StatusEffect[]; guest: StatusEffect[] };
  diceResults: DiceResults | null;
  skillsTriggered: string[];
  winnerId: string | null;
}

export interface CardsAcceptedPayload {
  roomId: string;
}

export interface PlayerLeftPayload {
  userId: string;
  nickname: string;
}

import type { MatchEndData } from './acidRain';

// ─── Server-to-client event map ───────────────────────────────────────────────

export interface ServerToClientEvents {
  // legacy TCG events (kept for backwards compat)
  game_start: (data: { type: 'GAME_START'; payload: GameStartPayload; seq: number }) => void;
  phase_update: (data: { type: 'PHASE_UPDATE'; payload: PhaseUpdatePayload; seq: number }) => void;
  cards_accepted: (data: { type: 'CARDS_ACCEPTED'; payload: CardsAcceptedPayload; seq: number }) => void;
  player_left: (data: { type: 'PLAYER_LEFT'; payload: PlayerLeftPayload; seq: number }) => void;
  // acid rain events
  match_ready:           (data: Parameters<import('./acidRain').AcidRainServerEvents['match_ready']>[0]) => void;
  match_start:           (data: Parameters<import('./acidRain').AcidRainServerEvents['match_start']>[0]) => void;
  word_spawn:            (data: Parameters<import('./acidRain').AcidRainServerEvents['word_spawn']>[0]) => void;
  word_cleared:          (data: Parameters<import('./acidRain').AcidRainServerEvents['word_cleared']>[0]) => void;
  word_missed:           (data: Parameters<import('./acidRain').AcidRainServerEvents['word_missed']>[0]) => void;
  submit_rejected:       (data: Parameters<import('./acidRain').AcidRainServerEvents['submit_rejected']>[0]) => void;
  player_eliminated:     (data: Parameters<import('./acidRain').AcidRainServerEvents['player_eliminated']>[0]) => void;
  match_end:             (data: MatchEndData) => void;
  opponent_disconnected: (data: Parameters<import('./acidRain').AcidRainServerEvents['opponent_disconnected']>[0]) => void;
  opponent_reconnected:  (data: Parameters<import('./acidRain').AcidRainServerEvents['opponent_reconnected']>[0]) => void;
  state_sync:            (data: Parameters<import('./acidRain').AcidRainServerEvents['state_sync']>[0]) => void;
}

// ─── Client-to-server event map ───────────────────────────────────────────────

export interface ClientToServerEvents {
  join_room:     (payload: { roomId: string }, callback?: (res: { event: string; data: unknown }) => void) => void;
  leave_room:    (payload: { roomId: string }, callback?: (res: { event: string; data: unknown }) => void) => void;
  submit_cards:  (payload: { roomId: string; cardIds: number[] }, callback?: (res: { event: string; data: unknown }) => void) => void;
  word_submit:   (payload: { roomId: string; wordId: string; text: string; clientTs?: number; attemptId: string }, callback?: (res: { event: string; data: unknown }) => void) => void;
  /** 관전 입장 — room.players에는 등록되지 않는다 (deploy#70) */
  spectate_room: (payload: { roomId: string }, callback?: (res: { event: string; data: unknown }) => void) => void;
  /** 관전 종료(인앱 이동 등) — 소켓 disconnect를 기다리지 않고 즉시 정리 (deploy#70) */
  leave_spectate: (payload: { roomId: string }, callback?: (res: { event: string; data: unknown }) => void) => void;
}
