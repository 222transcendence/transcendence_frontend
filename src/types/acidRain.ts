export type GamePhase = 'WAITING' | 'COUNTDOWN' | 'IN_PROGRESS' | 'FINISHED';
export type EndReason = 'KO' | 'TIME_LIMIT' | 'FORFEIT';
export type ParticipantType = 'HUMAN' | 'AI';
export type AiDifficulty = 'BEGINNER' | 'NORMAL' | 'HARD';

export interface ParticipantPublic {
  participantId: string;
  userId?: string;
  nickname: string;
  type: ParticipantType;
  aiDifficulty?: AiDifficulty;
}

/** HP/순위를 포함한 참가자 상태 */
export interface ParticipantState extends ParticipantPublic {
  hp: number;
  /** 탈락 확정 시 rank 기록, 생존 중은 undefined */
  rank?: number;
}

/** participantId를 키로 하는 HP 맵 — backend#138 canonical 계약 */
export type HpByParticipantId = Record<string, number>;

export interface RankingEntry {
  participantId: string;
  rank: number;
}

export interface FallingWord {
  wordId: string;
  text: string;
  keystrokes: number;
  lane: number;
  fallDurationMs: number;
  spawnedAt: string;
  /** 서버가 확정한 공격력 (backend#138 계약 확정 이후 항상 전송됨) */
  damage: number;
  /** 클라이언트가 보정 후 계산한 애니메이션 시작 epoch (ms) */
  animStartAt: number;
  /** word가 state에 추가되는 시점(이벤트 핸들러) 기준으로 미리 계산한 CSS animation-delay(ms) — render에서 Date.now() 호출을 피하기 위함 */
  renderDelayMs: number;
}

export interface MatchEndData {
  /** 단독 우승자 (공동 우승 시 null) */
  winnerId: string | null;
  reason: EndReason;
  /** 최종 순위 (rank=1이 우승) */
  ranking: RankingEntry[];
  /** participantId 기준 최종 HP */
  finalHp: HpByParticipantId;
  durationSec: number;
  wordsTyped?: Record<string, number>;
}

// ── Server → Client ──────────────────────────────────────────────────────────

export interface AcidRainServerEvents {
  /** 전원 입장 완료 — participants[] 기반(HUMAN/AI 공통 표현, backend#138) */
  match_ready: (data: {
    roomId: string;
    protocolVersion: string;
    participants: ParticipantState[];
  }) => void;

  match_start: (data: {
    roomId: string;
    startAt: string;
    now: string;
    initialHp: number;
  }) => void;

  word_spawn: (data: {
    wordId: string;
    text: string;
    keystrokes: number;
    lane: number;
    fallDurationMs: number;
    spawnedAt: string;
    /** 바닥 도달 예정 시각 (ISO8601) */
    landAt: string;
    damage: number;
  }) => void;

  /** 정타 — participantId 기준 HP 맵 갱신 */
  word_cleared: (data: {
    wordId: string;
    clearedBy: string;
    targetParticipantId: string;
    damage: number;
    hp: HpByParticipantId;
  }) => void;

  /** 바닥 도달 — participantId 기준 HP 맵 갱신 */
  word_missed: (data: {
    wordId: string;
    splashDamage: number;
    hp: HpByParticipantId;
  }) => void;

  submit_rejected: (data: {
    wordId: string;
    reason: 'ALREADY_CLEARED' | 'NOT_FOUND' | 'WRONG_TEXT';
  }) => void;

  /** 탈락 이벤트 (N인 배틀로얄) */
  player_eliminated: (data: {
    userId: string;
    rank: number;
    finalHp: number;
  }) => void;

  state_sync: (data: {
    roomId: string;
    participants: ParticipantState[];
    hp: HpByParticipantId;
    activeWords: Array<{
      wordId: string;
      text: string;
      keystrokes: number;
      lane: number;
      fallDurationMs: number;
      spawnedAt: string;
      landAt: string;
      damage: number;
      status: 'ACTIVE';
    }>;
    elapsedMs: number;
    now: string;
  }) => void;

  opponent_disconnected: (data: { userId: string; graceMs: number }) => void;
  opponent_reconnected:  (data: { userId: string }) => void;
  match_end:             (data: MatchEndData) => void;
  error:                 (data: { message: string }) => void;
}

// ── Client → Server ──────────────────────────────────────────────────────────

export interface AcidRainClientEvents {
  join_room:   (payload: { roomId: string }) => void;
  leave_room:  (payload: { roomId: string }) => void;
  word_submit: (payload: { roomId: string; wordId: string; text: string; clientTs: number; attemptId: string }) => void;
}
