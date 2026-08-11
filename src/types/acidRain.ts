export type WordTier = 'easy' | 'medium' | 'hard';
export type GamePhase = 'WAITING' | 'COUNTDOWN' | 'IN_PROGRESS' | 'FINISHED';
export type EndReason = 'KO' | 'TIME_LIMIT' | 'FORFEIT';

export interface PlayerPublic {
  userId: string;
  nickname: string;
}

export interface HpPair {
  host: number;
  guest: number;
}

export interface FallingWord {
  wordId: string;
  text: string;
  tier: WordTier;
  lane: number;        // 서버가 결정하는 레인 (0~4)
  fallDurationMs: number;
  spawnedAt: string;   // ISO8601 — 서버 발행 시각, 클록 보정에 사용
  /** 클라이언트가 보정 후 계산한 애니메이션 시작 epoch (ms) */
  animStartAt: number;
}

export interface MatchEndData {
  winnerId: string | null;
  reason: EndReason;
  finalHp: HpPair;
}

// ── Server → Client ──────────────────────────────────────────────────────────

export interface AcidRainServerEvents {
  /** 양쪽 소켓 룸 입장 완료 — 카운트다운 시작 신호 */
  match_ready: (data: {
    roomId: string;
    protocolVersion: string;
    players: { host: PlayerPublic; guest: PlayerPublic };
  }) => void;

  /**
   * 동기화된 매치 시작.
   * - `startAt`: 게임 시작 시각 (ISO8601) — 카운트다운 종료 시각
   * - `now`: 서버 현재 시각 (ISO8601) — 클록 오차 보정용
   * - `initialHp`: 양쪽 초기 HP (100)
   */
  match_start: (data: {
    roomId: string;
    startAt: string;
    now: string;
    initialHp: number;
  }) => void;

  /** 낙하 단어 스폰. `lane`(0~4)과 `spawnedAt`은 높이 동기화에 필수 */
  word_spawn: (data: {
    wordId: string;
    text: string;
    tier: WordTier;
    lane: number;
    fallDurationMs: number;
    spawnedAt: string; // ISO8601
  }) => void;

  /** 누군가 먼저 정타 — 상대 HP 감소. `targetHp`로 HP 상태 갱신 */
  word_cleared: (data: {
    wordId: string;
    clearedBy: string; // userId
    damage: number;
    targetHp: HpPair;
  }) => void;

  /** 아무도 못 지운 단어 바닥 도달 — 양쪽 HP 감소 */
  word_missed: (data: {
    wordId: string;
    splashDamage: number;
    targetHp: HpPair;
  }) => void;

  /** 제출자에게만 전송 */
  submit_rejected: (data: {
    wordId: string;
    reason: 'ALREADY_CLEARED' | 'NOT_FOUND' | 'WRONG_TEXT';
  }) => void;

  /** 재접속 시 전체 스냅샷 */
  state_sync: (data: {
    roomId: string;
    hp: HpPair;
    activeWords: Array<{
      wordId: string;
      text: string;
      tier: WordTier;
      lane: number;
      fallDurationMs: number;
      spawnedAt: string; // ISO8601 — 원래 스폰 시각 그대로
    }>;
    elapsedMs: number;
    spawnIntervalMs: number;
    now: string; // ISO8601 — 클록 보정용
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
  /** `clientTs`는 지연 텔레메트리용 — 판정에는 사용 안 함 */
  word_submit: (payload: { roomId: string; wordId: string; text: string; clientTs: number }) => void;
}
