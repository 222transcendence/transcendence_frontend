export type WordTier = 'easy' | 'medium' | 'hard';
export type GamePhase = 'WAITING' | 'COUNTDOWN' | 'IN_PROGRESS' | 'FINISHED';
export type EndReason = 'KO' | 'TIME_LIMIT' | 'FORFEIT';

export interface PlayerPublic {
  userId: string;
  nickname: string;
  avatar?: string;
}

/** N인 대응 플레이어 상태 (HP 포함) */
export interface PlayerState extends PlayerPublic {
  hp: number;
  /** 탈락 확정 시 rank 기록, 생존 중은 undefined */
  rank?: number;
}

/** N인 HP 업데이트 페이로드 */
export interface PlayerHpUpdate {
  userId: string;
  hp: number;
}

/** 하위호환: 구형 2인 매치용 HP 쌍 */
export interface HpPair {
  host: number;
  guest: number;
}

export interface FallingWord {
  wordId: string;
  text: string;
  keystrokes: number;
  lane: number;
  fallDurationMs: number;
  spawnedAt: string;
  /** 클라이언트가 보정 후 계산한 애니메이션 시작 epoch (ms) */
  animStartAt: number;
  /** word가 state에 추가되는 시점(이벤트 핸들러) 기준으로 미리 계산한 CSS animation-delay(ms) — render에서 Date.now() 호출을 피하기 위함 */
  renderDelayMs: number;
}

export interface PlayerRank {
  userId: string;
  rank: number;
  finalHp: number;
}

export interface MatchEndData {
  /** 단독 우승자 (공동 우승 시 null) */
  winnerId: string | null;
  reason: EndReason;
  /** N인 최종 순위 (rank=1이 우승) */
  ranking: PlayerRank[];
  durationSec: number;
  /** 하위호환: 구형 2인 매치 finalHp */
  finalHp?: HpPair;
  wordsTyped?: Record<string, number>;
}

// ── Server → Client ──────────────────────────────────────────────────────────

export interface AcidRainServerEvents {
  /** 전원 입장 완료 — players[] 기반 N인 */
  match_ready: (data: {
    roomId: string;
    protocolVersion: string;
    players: PlayerState[];
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
  }) => void;

  /** 정타 — players[] HP 업데이트 */
  word_cleared: (data: {
    wordId: string;
    clearedBy: string;
    damage: number;
    /** N인 HP 업데이트 배열 */
    hpUpdates: PlayerHpUpdate[];
    /** 하위호환: 2인 targetHp */
    targetHp?: HpPair;
  }) => void;

  /** 바닥 도달 — players[] HP 업데이트 */
  word_missed: (data: {
    wordId: string;
    splashDamage: number;
    hpUpdates: PlayerHpUpdate[];
    targetHp?: HpPair;
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
    players: PlayerState[];
    activeWords: Array<{
      wordId: string;
      text: string;
      keystrokes: number;
      lane: number;
      fallDurationMs: number;
      spawnedAt: string;
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
  word_submit: (payload: { roomId: string; wordId: string; text: string; clientTs: number }) => void;
}
