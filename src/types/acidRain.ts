export type GamePhase = 'WAITING' | 'COUNTDOWN' | 'IN_PROGRESS' | 'FINISHED';
export type EndReason = 'KO' | 'TIME_LIMIT' | 'FORFEIT';
export type ParticipantType = 'HUMAN' | 'AI';
export type AiDifficulty = 'BEGINNER' | 'NORMAL' | 'HARD';
export type OpponentTypingPhase = 'IDLE' | 'REACTION' | 'TYPING' | 'CORRECTING';
export type AiMonitorSnapshotKind = 'FULL' | 'DECISION' | 'PHASE' | 'TERMINAL';

export interface OpponentTypingPayload {
  participantId: string;
  partialText: string;
  wordId?: string;
  completedKeystrokes?: number;
  totalKeystrokes?: number;
  phase?: OpponentTypingPhase;
  stateVersion?: number;
}

export interface AiMonitorDecision {
  action: 'KEEP' | 'SWITCH' | 'ABANDON' | 'SELECT' | 'NO_TARGET';
  phase: OpponentTypingPhase;
  targetWordId: string | null;
  previousTargetWordId: string | null;
}

export interface AiMonitorPlayerProfile {
  wpm: number;
  accuracy: number;
  reactionTimeMs: number;
  sampleCount: number;
  confidence: number;
  source: null;
}

export interface AiMonitorExecutionProfile {
  difficulty: AiDifficulty;
  typingWpm: number;
  accuracy: number;
  reactionDelayMs: number;
  typoProbability: number;
  correctionDelayMs: number;
  abandonProbability: number;
}

export interface AiMonitorCandidate {
  wordId: string;
  utility: number | null;
  successProbability: number | null;
  urgency: number | null;
  completionMs: number | null;
  opportunityCost: number | null;
  remainingMs: number;
  eligible: boolean;
  selected: boolean;
}

export interface AiMonitorSnapshot {
  roomId: string;
  participantId: string;
  stateVersion: number;
  timestamp: string;
  kind: AiMonitorSnapshotKind;
  currentDecision: AiMonitorDecision;
  profile: AiMonitorPlayerProfile;
  executionProfile: AiMonitorExecutionProfile;
  candidates: AiMonitorCandidate[];
  completedKeystrokes: number;
  totalKeystrokes: number;
}

export interface AiMonitorSnapshotPatch {
  roomId: string;
  participantId: string;
  stateVersion: number;
  timestamp: string;
  kind: AiMonitorSnapshotKind;
  currentDecision?: AiMonitorDecision;
  profile?: AiMonitorPlayerProfile;
  executionProfile?: AiMonitorExecutionProfile;
  candidates?: AiMonitorCandidate[];
  completedKeystrokes?: number;
  totalKeystrokes?: number;
}

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
    /** PLAYER_ELIMINATED — 탈락(HP 0)한 참가자의 제출은 거부된다 (backend#157) */
    reason: 'ALREADY_CLEARED' | 'NOT_FOUND' | 'WRONG_TEXT' | 'PLAYER_ELIMINATED';
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

  /** 상대방 실시간 입력 진행도 — partialText가 빈 문자열이면 초기화 (#71) */
  opponent_typing: (data: OpponentTypingPayload) => void;

  ai_monitor_snapshot: (data: AiMonitorSnapshotPatch) => void;

  /** 강제 탈락/승리 처리 데드라인은 없다 — 언제든 재접속 가능하고, 매치 자체에 이미
   *  하드 타임아웃이 있다(backend#161) */
  opponent_disconnected: (data: { userId: string }) => void;
  opponent_reconnected:  (data: { userId: string }) => void;
  match_end:             (data: MatchEndData) => void;
  error:                 (data: { message: string }) => void;
}

// ── Client → Server ──────────────────────────────────────────────────────────

export interface AcidRainClientEvents {
  join_room:       (payload: { roomId: string }) => void;
  leave_room:      (payload: { roomId: string }) => void;
  word_submit:     (payload: { roomId: string; wordId: string; text: string; clientTs: number; attemptId: string }) => void;
  /** 실시간 입력 진행도 전송 (#71) — wordId/clientTs는 서버 측 타건 성능 추적용 (#160) */
  typing_progress: (payload: { roomId: string; partialText: string; wordId?: string; clientTs?: number }) => void;
  /** 관전 입장 — room.players에는 등록되지 않는다 (#70) */
  spectate_room:   (payload: { roomId: string }) => void;
  /** 관전 종료(인앱 이동 등) (#70) */
  leave_spectate:  (payload: { roomId: string }) => void;
}
