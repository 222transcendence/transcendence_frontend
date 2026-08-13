import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMyProfile } from '../api/client';
import ChatPanel from '../components/ChatPanel';
import { useAcidRainSocket } from '../hooks/useAcidRainSocket';
import { useWordFontSize } from '../hooks/useWordFontSize';
import type { FallingWord, MatchEndData, GamePhase, ParticipantState, HpByParticipantId } from '../types/acidRain';

const MAX_HP = 100;
const MATCH_DURATION = 180;

// fall 키프레임(translateY(-60px) → translateY(calc(100vh - 40px)))과 정확히 같은 값을
// 써야 한다 — 정답 처리 순간 현재 낙하 위치를 계산해 pop-out 애니메이션에 그대로
// 넘겨주기 위함(#93: 안 그러면 위치가 top으로 리셋된 채 사라지는 것처럼 보임).
const FALL_START_Y = -60;
const FALL_END_Y_OFFSET = 40;

// 단어의 현재(정답 처리 시점) 낙하 위치를 fall 애니메이션과 동일한 공식으로 계산한다.
function currentFallY(animStartAt: number, fallDurationMs: number): number {
  const endY = window.innerHeight - FALL_END_Y_OFFSET;
  const fraction = Math.min(Math.max((Date.now() - animStartAt) / fallDurationMs, 0), 1);
  return FALL_START_Y + fraction * (endY - FALL_START_Y);
}

// ── 낙하 단어 색상 — keystrokes 구간 기준 (GAME_DESIGN.md §3.2 LOW/MID/HIGH) ───
function keystrokeColor(keystrokes: number) {
  if (keystrokes <= 5) return '#12c8a8';
  if (keystrokes <= 9) return '#eab308';
  return '#ef4a63';
}

// ── 위험도 라벨 — damage가 서버에서 오기 전까지는 keystrokes로만 위험/보상을 가늠 ──
function riskLabel(keystrokes: number) {
  if (keystrokes <= 5) return '약';
  if (keystrokes <= 9) return '중';
  return '강';
}

// ── Word falling animation injected once ─────────────────────────────────────
const styleId = 'acid-rain-keyframes';
if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes fall { from { transform: translateY(-60px); } to { transform: translateY(calc(100vh - 40px)); } }
    @keyframes flash-green { 0%,100% { background: transparent; } 50% { background: rgba(18,200,168,.18); } }
    @keyframes flash-red   { 0%,100% { background: transparent; } 50% { background: rgba(239,74,99,.18); } }
    @keyframes pop-out { 0% { opacity:1; transform: translateY(var(--fall-y, 0px)) scale(1); } 100% { opacity:0; transform: translateY(var(--fall-y, 0px)) scale(1.6); } }
    @keyframes shrink-bar { from { width: 100%; } to { width: 0%; } }
    .word-chip { animation: fall linear forwards; position: absolute; cursor: default; user-select: none; }
    .word-chip.matched { animation: pop-out .25s ease forwards !important; }
    .word-chip .time-bar { animation: shrink-bar linear forwards; }
  `;
  document.head.appendChild(style);
}

// ── HP bar color based on remaining % ────────────────────────────────────────
function hpColor(pct: number) {
  if (pct > 60) return '#12c8a8';
  if (pct > 30) return '#eab308';
  return '#ef4a63';
}

// ── Format seconds → mm:ss ────────────────────────────────────────────────────
function fmtTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function GameBoardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // ── Identity ─────────────────────────────────────────────────────────────
  const [myNickname, setMyNickname] = useState('');
  const myUserIdRef      = useRef('');

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase, setPhase]         = useState<GamePhase>('WAITING');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [players, setPlayers]     = useState<ParticipantState[]>([]);
  const [elapsed, setElapsed]     = useState(0);
  const [words, setWords]         = useState<FallingWord[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  /** wordId → 정답 처리 순간의 낙하 위치(px) — pop-out 애니메이션이 그 지점에서 시작하도록 고정 */
  const [frozenYById, setFrozenYById] = useState<Record<string, number>>({});
  const [endData, setEndData]     = useState<(MatchEndData & { isWinner: boolean }) | null>(null);
  // 강제 탈락/승리 처리 데드라인은 없다 — 그냥 정보성 배너다(backend#161).
  const [disconnectedOpponent, setDisconnectedOpponent] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [flashByUserId, setFlashByUserId] = useState<Record<string, boolean>>({});
  const [inputError, setInputError] = useState(false);
  /** participantId → 현재 입력 중인 텍스트 (상대방 실시간 진행도 #71) */
  const [opponentTyping, setOpponentTyping] = useState<Record<string, string>>({});

  // ── Input ─────────────────────────────────────────────────────────────────
  const [input, setInput]     = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);
  const wordsRef              = useRef<FallingWord[]>([]);
  wordsRef.current = words;

  // ── Word font size (+/- 키, localStorage 저장) ───────────────────────────────
  const { fontSize, increase: increaseFontSize, decrease: decreaseFontSize } = useWordFontSize();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '+' && e.key !== '-' && e.key !== '=') return;
      e.preventDefault();
      if (e.key === '-') decreaseFontSize();
      else increaseFontSize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [increaseFontSize, decreaseFontSize]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  // 로컬 setInterval 카운터로 1초씩 증가시키면 백그라운드 탭 스로틀링 등으로
  // 서서히 어긋난다. match_start.now/state_sync.now로 얻은 서버 클록 오프셋과
  // 서버 기준 매치 시작 시각을 기준으로, 매 tick마다 경과 시간을 다시 계산한다.
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockOffsetRef    = useRef(0);   // 서버시각 - 로컬시각 (ms)
  const serverStartAtRef  = useRef(0);   // 서버 기준 매치 시작 시각 (epoch ms)

  const tickElapsed = useCallback(() => {
    const serverNowMs = Date.now() + clockOffsetRef.current;
    const elapsedSec = Math.round((serverNowMs - serverStartAtRef.current) / 1000);
    setElapsed(Math.min(Math.max(elapsedSec, 0), MATCH_DURATION));
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    tickElapsed();
    timerRef.current = setInterval(tickElapsed, 1000);
  }, [tickElapsed]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Countdown 3→2→1 표시 — phase가 COUNTDOWN인 동안만 1초마다 감소.
  // 실제 매치 시작 타이밍은 서버의 match_start(msUntilStart)를 그대로 따르므로,
  // 이 카운트다운은 순수 표시용이다(handleMatchStart 참고).
  useEffect(() => {
    if (phase !== 'COUNTDOWN') return;
    const interval = setInterval(() => {
      setCountdown(prev => (prev === null || prev <= 1 ? null : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Profile fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMyProfile()
      .then(p => { myUserIdRef.current = p.id; setMyNickname(p.nickname); })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  // ── Flash helper — briefly highlight a player's HP row on hit ────────────────
  const flashHit = useCallback((userId: string) => {
    setFlashByUserId(prev => ({ ...prev, [userId]: true }));
    setTimeout(() => setFlashByUserId(prev => ({ ...prev, [userId]: false })), 400);
  }, []);

  // ── Socket handlers ───────────────────────────────────────────────────────

  const applyHp = useCallback((hp: HpByParticipantId) => {
    setPlayers(prev => prev.map(p => (p.participantId in hp ? { ...p, hp: hp[p.participantId] } : p)));
  }, []);

  const handleMatchReady = useCallback((participants: ParticipantState[]) => {
    setPhase('COUNTDOWN');
    setCountdown(3);
    setPlayers(participants);
  }, []);

  const handleMatchStart = useCallback((startAt: string, now: string, initialHp: number) => {
    clockOffsetRef.current = Date.parse(now) - Date.now();
    serverStartAtRef.current = Date.parse(startAt);
    const msUntilStart = serverStartAtRef.current - (Date.now() + clockOffsetRef.current);
    const startGame = () => {
      setPhase('IN_PROGRESS');
      setPlayers(prev => prev.map(p => ({ ...p, hp: initialHp, rank: undefined })));
      setWords([]); setElapsed(0);
      startTimer();
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    if (msUntilStart > 0) setTimeout(startGame, msUntilStart);
    else startGame();
  }, [startTimer]);

  const handleWordSpawn = useCallback((word: FallingWord) => {
    setWords(prev => [...prev, word]);
  }, []);

  const handleWordCleared = useCallback((wordId: string, _clearedBy: string, targetParticipantId: string, _damage: number, hp: HpByParticipantId) => {
    const word = wordsRef.current.find(w => w.wordId === wordId);
    if (word) {
      setFrozenYById(prev => ({ ...prev, [wordId]: currentFallY(word.animStartAt, word.fallDurationMs) }));
    }
    setMatchedIds(prev => new Set([...prev, wordId]));
    setTimeout(() => {
      setWords(prev => prev.filter(w => w.wordId !== wordId));
      setMatchedIds(prev => { const n = new Set(prev); n.delete(wordId); return n; });
      setFrozenYById(prev => { const rest = { ...prev }; delete rest[wordId]; return rest; });
    }, 300);
    applyHp(hp);
    // 실제로 맞은 대상 한 명만 하이라이팅한다 — hp 맵은 전원의 최신 HP를 담고 있을 뿐,
    // hp 맵의 키 전체가 이번에 데미지를 받은 대상이라는 뜻이 아니다.
    flashHit(targetParticipantId);
  }, [applyHp, flashHit]);

  const handleWordMissed = useCallback((_wordId: string, _splashDamage: number, hp: HpByParticipantId) => {
    setWords(prev => prev.filter(w => w.wordId !== _wordId));
    applyHp(hp);
    // 스플래시 데미지는 생존자 전원에게 적용되므로(GAME_DESIGN.md §3.6), 이 경우엔
    // 전원 하이라이팅이 맞다.
    Object.keys(hp).forEach(flashHit);
  }, [applyHp, flashHit]);

  const handlePlayerEliminated = useCallback((userId: string, rank: number, finalHp: number) => {
    setPlayers(prev => prev.map(p => p.participantId === userId ? { ...p, hp: finalHp, rank } : p));
  }, []);

  // 경합 패배(ALREADY_CLEARED) 등으로 제출이 거부된 경우 — 이미 사라진 단어를
  // 계속 붙들고 있지 않도록 입력을 정리하고 짧게 오류 피드백을 보여준다.
  const handleSubmitRejected = useCallback(() => {
    setInput('');
    setInputError(true);
    setTimeout(() => setInputError(false), 300);
  }, []);

  const handleMatchEnd = useCallback((data: MatchEndData) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('FINISHED');
    setWords([]);
    const isWinner = data.winnerId === myUserIdRef.current;
    setEndData({ ...data, isWinner });
  }, []);

  const handleOpponentDisconnected = useCallback(() => {
    setDisconnectedOpponent(true);
  }, []);

  const handleOpponentReconnected = useCallback(() => {
    setDisconnectedOpponent(false);
  }, []);

  const handleStateSync = useCallback((data: Parameters<import('../types/acidRain').AcidRainServerEvents['state_sync']>[0]) => {
    const clockOffset = Date.parse(data.now) - Date.now();
    clockOffsetRef.current = clockOffset;
    // 서버 현재시각(now) - 경과시간(elapsedMs) = 서버 기준 매치 시작 시각
    serverStartAtRef.current = Date.parse(data.now) - data.elapsedMs;
    setPlayers(data.participants.map(p => (p.participantId in data.hp ? { ...p, hp: data.hp[p.participantId] } : p)));
    const restored: FallingWord[] = data.activeWords.map(w => {
      const animStartAt = Date.parse(w.spawnedAt) + clockOffset;
      return { ...w, animStartAt, renderDelayMs: animStartAt - Date.now() };
    });
    setWords(restored);
    setPhase('IN_PROGRESS');
    startTimer();
  }, [startTimer]);

  const { connectionState, submitWord, sendTypingProgress } = useAcidRainSocket(roomId ?? '', {
    onMatchReady: handleMatchReady,
    onMatchStart: handleMatchStart,
    onWordSpawn: handleWordSpawn,
    onWordCleared: handleWordCleared,
    onWordMissed: handleWordMissed,
    onPlayerEliminated: handlePlayerEliminated,
    onSubmitRejected: handleSubmitRejected,
    onMatchEnd: handleMatchEnd,
    onOpponentDisconnected: handleOpponentDisconnected,
    onOpponentReconnected: handleOpponentReconnected,
    onStateSync: handleStateSync,
    onOpponentTyping: useCallback((participantId: string, partialText: string) => {
      setOpponentTyping(prev => ({ ...prev, [participantId]: partialText }));
    }, []),
  });

  // ── Input submit: 엔터 키로 제출 (#86) ──────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    const targetWord = val
      ? wordsRef.current.find(w => w.text.startsWith(val) && !matchedIds.has(w.wordId))
      : undefined;
    sendTypingProgress(val, targetWord?.wordId);
  }, [matchedIds, sendTypingProgress]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const val = input.trim();
    if (!val) return;
    const match = wordsRef.current.find(w => w.text === val && !matchedIds.has(w.wordId));
    if (match) {
      submitWord(match.wordId, match.text);
    }
    setInput('');
    sendTypingProgress('', undefined);
  }, [input, matchedIds, submitWord, sendTypingProgress]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const myId = myUserIdRef.current;
  const myPlayer = players.find(p => p.participantId === myId) ?? { participantId: myId, nickname: myNickname || '나', type: 'HUMAN' as const, hp: MAX_HP };
  const otherPlayers = players.filter(p => p.participantId !== myId);
  const myHpPct = Math.max(0, (myPlayer.hp / MAX_HP) * 100);
  const remaining = Math.max(0, MATCH_DURATION - elapsed);
  const nicknameFor = (participantId: string) => players.find(p => p.participantId === participantId)?.nickname ?? (participantId === myId ? (myNickname || '나') : '???');

  // ── End modal ─────────────────────────────────────────────────────────────
  if (endData) {
    const ranking = [...endData.ranking].sort((a, b) => a.rank - b.rank);
    return (
      <div style={S.page}>
        <div style={S.endOverlay}>
          <div style={S.endCard}>
            <div style={{ ...S.endResult, color: endData.isWinner ? '#12c8a8' : '#ef4a63' }}>
              {endData.isWinner ? '🏆 승리' : '💀 패배'}
            </div>
            <div style={S.endReason}>
              {endData.reason === 'KO' && 'KO 승리'}
              {endData.reason === 'TIME_LIMIT' && '시간 종료'}
              {endData.reason === 'FORFEIT' && '상대방 기권'}
            </div>
            <div style={S.endStats}>
              {ranking.map(r => (
                <div key={r.participantId} style={S.endStatRow}>
                  <span style={S.endStatLabel}>#{r.rank}</span>
                  <span style={{ color: r.participantId === myId ? '#12c8a8' : '#c7cede', flex: 1, textAlign: 'left' as const }}>{nicknameFor(r.participantId)}</span>
                  <span style={{ color: '#8a93a8' }}>HP {endData.finalHp[r.participantId] ?? 0}</span>
                  <span style={{ color: '#8a93a8' }}>{endData.wordsTyped?.[r.participantId] ?? 0}단어</span>
                </div>
              ))}
              <div style={S.endStatRow}>
                <span style={S.endStatLabel}>게임 시간</span>
                <span style={{ color: '#e2e8f5' }}>{fmtTime(endData.durationSec)}</span>
              </div>
            </div>
            <div style={S.endActions}>
              <button style={S.primaryBtn} onClick={() => navigate('/lobby')}>로비로 돌아가기</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.outerLayout}>

        {/* ── Main game area ── */}
        <div style={S.gameCol}>

          {/* Top bar */}
          <div style={S.topBar}>
            {leaveConfirm ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={S.leaveText}>나가면 패배 처리됩니다</span>
                <button style={S.dangerSm} onClick={() => navigate('/lobby')}>확인</button>
                <button style={S.ghostSm}  onClick={() => setLeaveConfirm(false)}>취소</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button style={S.dangerSm} onClick={() => setLeaveConfirm(true)}>⎋ 나가기</button>
                <span style={S.fontSizeHint}>+/- 글자 크기 조절</span>
              </div>
            )}
            <div style={S.timerBox}>
              <span style={{ ...S.timerText, color: remaining <= 30 ? '#ef4a63' : '#e2e8f5' }}>
                {fmtTime(remaining)}
              </span>
            </div>
            <div style={{ width: 80 }} />
          </div>

          {/* Other players' HP (up to 3, battle royale) */}
          <div style={S.hpZone}>
            {otherPlayers.length === 0 && phase === 'WAITING' && (
              <div style={S.playerRow}>
                <div style={{ ...S.avatar, borderColor: '#ef4a63' }} />
                <div style={{ flex: 1 }}>
                  <div style={S.nickname}>상대방</div>
                </div>
              </div>
            )}
            {otherPlayers.map(p => {
              const pct = Math.max(0, (p.hp / MAX_HP) * 100);
              const eliminated = p.rank !== undefined;
              return (
                <div
                  key={p.participantId}
                  style={{ ...S.playerRow, background: flashByUserId[p.participantId] ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s', opacity: eliminated ? 0.5 : 1, borderRadius: 8 }}
                >
                  <div style={{ ...S.avatar, borderColor: eliminated ? '#5c6a8a' : '#ef4a63' }} />
                  <div style={{ flex: 1 }}>
                    <div style={S.nickname}>{p.nickname}{eliminated ? ` · 탈락 #${p.rank}` : ''}</div>
                    <div style={S.hpRow}>
                      <span style={S.hpLabel}>HP</span>
                      <div style={S.hpTrack}>
                        <div style={{ ...S.hpFill, width: `${pct}%`, background: hpColor(pct) }} />
                      </div>
                      <span style={S.hpNum}>{p.hp} / {MAX_HP}</span>
                    </div>
                    {/* 상대방 실시간 입력 진행도 — Option B: 입력 문자열 직접 표시 (#71) */}
                    {phase === 'IN_PROGRESS' && (() => {
                      const partial = opponentTyping[p.participantId] ?? '';
                      if (!partial) return null;
                      return (
                        <div style={S.typingProgress}>
                          <span style={S.typingBlocks}>{partial}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rain area */}
          <div style={S.rainArea}>
            {/* Waiting / countdown overlay */}
            {phase === 'WAITING' && (
              <div style={S.rainOverlay}>
                <div style={S.waitText}>
                  {connectionState === 'connecting' ? '연결 중…' : '상대방 대기 중…'}
                </div>
              </div>
            )}
            {phase === 'COUNTDOWN' && countdown !== null && (
              <div style={{ ...S.rainOverlay, flexDirection: 'column' }}>
                <div style={S.countdownNum}>{countdown}</div>
                <div style={S.countdownLabel}>준비하세요!</div>
              </div>
            )}

            {/* Falling words — 레인마다 고정 폭 컬럼을 배정해 옆 레인과 겹치지 않게 하되,
                글자 크기(+/- 조절)가 우선이므로 블록은 내용/폰트에 맞춰 늘어난다(#98). */}
            {words.map(word => (
              <div
                key={word.wordId}
                className={`word-chip${matchedIds.has(word.wordId) ? ' matched' : ''}`}
                style={{
                  left: `calc(${word.lane} * 18%)`,
                  minWidth: '16%',
                  width: 'max-content',
                  maxWidth: '34%',
                  animationDuration: `${word.fallDurationMs}ms`,
                  // animStartAt이 과거(재접속 복원)면 음수 delay로 애니메이션을 이미 진행된
                  // 지점으로 점프시켜, 새로 낙하가 시작된 것처럼 보이지 않도록 한다.
                  animationDelay: `${word.renderDelayMs}ms`,
                  // 정답 처리된 단어는 pop-out이 그 순간의 낙하 위치에서 시작하도록 고정
                  // (그렇지 않으면 fall→pop-out 전환 시 transform이 top으로 리셋된다).
                  ...(matchedIds.has(word.wordId) && word.wordId in frozenYById
                    ? { '--fall-y': `${frozenYById[word.wordId]}px` }
                    : {}),
                  padding: `${fontSize * 0.3}px ${fontSize * 0.6}px ${fontSize * 0.24}px`,
                  borderRadius: 8,
                  border: `1px solid ${keystrokeColor(word.keystrokes)}55`,
                  background: `${keystrokeColor(word.keystrokes)}14`,
                  color: keystrokeColor(word.keystrokes),
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize,
                  whiteSpace: 'nowrap',
                  boxShadow: `0 0 12px ${keystrokeColor(word.keystrokes)}44`,
                  letterSpacing: '.04em',
                  opacity: 1,
                  boxSizing: 'border-box',
                } as React.CSSProperties}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {input && word.text.startsWith(input)
                      ? <><span style={{ color: '#fff', textDecoration: 'underline' }}>{input}</span>{word.text.slice(input.length)}</>
                      : word.text
                    }
                  </span>
                  <span style={{ fontSize: 9, opacity: .75, flexShrink: 0 }}>
                    {word.damage !== undefined ? `⚔${word.damage}` : riskLabel(word.keystrokes)}
                  </span>
                </div>
                {/* 남은 낙하 시간 — 위험/보상을 눈으로 가늠할 수 있도록 fall 애니메이션과 같은 duration/delay로 동기화 */}
                <div style={{ marginTop: 4, height: 2, borderRadius: 1, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
                  <div
                    className="time-bar"
                    style={{
                      height: '100%',
                      background: keystrokeColor(word.keystrokes),
                      animationDuration: `${word.fallDurationMs}ms`,
                      animationDelay: `${word.renderDelayMs}ms`,
                    } as React.CSSProperties}
                  />
                </div>
              </div>
            ))}

            {/* Disconnect notice */}
            {disconnectedOpponent && (
              <div style={S.disconnectBanner}>
                상대방의 연결이 끊겼습니다. 재접속을 기다리는 중입니다.
              </div>
            )}
          </div>

          {/* My HP + input */}
          <div style={{ ...S.hpZone, background: flashByUserId[myId] ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s' }}>
            <div style={S.playerRow}>
              <div style={{ ...S.avatar, borderColor: '#12c8a8' }} />
              <div style={{ flex: 1 }}>
                <div style={S.nickname}>{myPlayer.nickname}</div>
                <div style={S.hpRow}>
                  <span style={S.hpLabel}>HP</span>
                  <div style={S.hpTrack}>
                    <div style={{ ...S.hpFill, width: `${myHpPct}%`, background: hpColor(myHpPct) }} />
                  </div>
                  <span style={S.hpNum}>{myPlayer.hp} / {MAX_HP}</span>
                </div>
              </div>
            </div>

            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              disabled={phase !== 'IN_PROGRESS'}
              placeholder={phase === 'IN_PROGRESS' ? '단어를 입력하세요…' : ''}
              style={{
                ...S.inputField,
                border: inputError ? '1px solid rgba(239,74,99,.6)' : S.inputField.border,
                background: inputError ? 'rgba(239,74,99,.08)' : S.inputField.background,
                transition: 'border-color .15s, background .15s',
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* ── Chat column ── */}
        <div style={S.chatCol}>
          <ChatPanel currentUserId={myUserIdRef.current} roomId={roomId} />
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse 1200px 700px at 50% -5%, #0a1520 0%, #05070c 60%)',
    fontFamily: "'Inter', sans-serif",
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '12px',
  },
  outerLayout: {
    width: '100%',
    maxWidth: 1100,
    display: 'flex',
    gap: 12,
    alignItems: 'stretch',
    height: 'calc(100vh - 24px)',
  },
  gameCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  chatCol: {
    width: 240,
    flexShrink: 0,
    height: '100%',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  timerBox: {
    background: '#0d1220',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 10,
    padding: '4px 16px',
  },
  timerText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: 22,
  },
  hpZone: {
    background: '#0d1220',
    border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 12,
    padding: '12px 16px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#182236',
    border: '2px solid',
    flexShrink: 0,
  },
  nickname: {
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700,
    fontSize: 15,
    color: '#e2e8f5',
    marginBottom: 4,
  },
  hpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  hpLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    color: '#8a93a8',
    width: 20,
  },
  hpTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: '#182236',
    overflow: 'hidden',
    maxWidth: 300,
  },
  hpFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width .4s ease, background .4s ease',
  },
  hpNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: '#c7cede',
    minWidth: 60,
  },
  typingProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    height: 14,
  },
  typingBlocks: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: '#12c8a8',
    letterSpacing: 0.5,
    opacity: 0.85,
  },
  rainArea: {
    flex: 1,
    position: 'relative' as const,
    background: 'rgba(5,7,12,.6)',
    border: '1px solid rgba(18,200,168,.08)',
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 0,
  },
  rainOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(5,7,12,.7)',
    zIndex: 10,
  },
  waitText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 18,
    color: '#5c6a8a',
    letterSpacing: '.08em',
  },
  countdownNum: {
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700,
    fontSize: 120,
    color: '#12c8a8',
    lineHeight: 1,
    textShadow: '0 0 40px rgba(18,200,168,.5)',
  },
  countdownLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    color: '#5c6a8a',
    letterSpacing: '.2em',
    marginTop: 12,
  },
  inputField: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid rgba(18,200,168,.3)',
    background: 'rgba(18,200,168,.05)',
    color: '#e2e8f5',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 16,
    fontWeight: 700,
    outline: 'none',
    letterSpacing: '.05em',
    boxSizing: 'border-box' as const,
  },
  disconnectBanner: {
    position: 'absolute' as const,
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(239,74,99,.12)',
    border: '1px solid rgba(239,74,99,.4)',
    borderRadius: 8,
    padding: '8px 16px',
    color: '#ef4a63',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    whiteSpace: 'nowrap' as const,
    zIndex: 20,
  },
  leaveText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: '#c7cede',
  },
  fontSizeHint: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: '#5c6478',
    whiteSpace: 'nowrap' as const,
  },
  dangerSm: {
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid rgba(239,74,99,.35)',
    background: 'rgba(239,74,99,.06)',
    color: '#ef4a63',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10.5,
    cursor: 'pointer',
  },
  ghostSm: {
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'transparent',
    color: '#8a93a8',
    cursor: 'pointer',
    fontSize: 10.5,
    fontFamily: "'JetBrains Mono', monospace",
  },
  primaryBtn: {
    padding: '11px 28px',
    borderRadius: 10,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.12)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
  // End screen
  endOverlay: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endCard: {
    background: '#0d1220',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 20,
    padding: '40px 48px',
    minWidth: 380,
    textAlign: 'center' as const,
    boxShadow: '0 32px 80px rgba(0,0,0,.6)',
  },
  endResult: {
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700,
    fontSize: 48,
    marginBottom: 8,
  },
  endReason: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: '#5c6a8a',
    letterSpacing: '.1em',
    marginBottom: 32,
  },
  endStats: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    marginBottom: 32,
  },
  endStatRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
  },
  endStatLabel: {
    color: '#5c6a8a',
    minWidth: 80,
    textAlign: 'right' as const,
  },
  endStatSep: {
    color: '#3a4256',
    fontSize: 10,
  },
  endActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
  },
} as const;
