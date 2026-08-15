import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { fetchMyProfile } from '../api/client';
import ChatPanel from '../components/ChatPanel';
import { useAcidRainSocket } from '../hooks/useAcidRainSocket';
import { useOpponentTypingState } from '../hooks/useOpponentTypingState';
import { useWordFontSize } from '../hooks/useWordFontSize';
import { useAiMonitorBridge } from '../hooks/useAiMonitorBridge';
import AiMonitorButton from '../components/game/AiMonitorButton';
import type { FallingWord, MatchEndData, GamePhase, ParticipantState, HpByParticipantId } from '../types/acidRain';

const MAX_HP = 100;
const MATCH_DURATION = 180;
// 매치 종료 후 새로고침 등으로 재마운트되면 서버 세션이 이미 정리돼(#123)
// match_ready/state_sync가 영원히 오지 않을 수 있다 — SpectateBoardPage의
// notSpectatable과 같은 패턴으로, 이 시간 안에 WAITING을 벗어나지 못하면
// "더 이상 진행할 수 없는 매치"로 간주한다.
const MATCH_UNAVAILABLE_TIMEOUT_MS = 6000;

// fall 키프레임(translateY(-60px) → translateY(calc(100dvh - 40px)))과 정확히 같은 값을
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
    @keyframes fall { from { transform: translateY(-60px); } to { transform: translateY(calc(100dvh - 40px)); } }
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
  const [myAvatar, setMyAvatar]     = useState('');
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
  const [matchUnavailable, setMatchUnavailable] = useState(false);
  // 강제 탈락/승리 처리 데드라인은 없다 — 그냥 정보성 배너다(backend#161).
  const [disconnectedOpponent, setDisconnectedOpponent] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [flashByUserId, setFlashByUserId] = useState<Record<string, boolean>>({});
  const [inputError, setInputError] = useState(false);

  // ── Input ─────────────────────────────────────────────────────────────────
  const [input, setInput]     = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);
  const wordsRef              = useRef<FallingWord[]>([]);
  wordsRef.current = words;

  // ── Word font size (+/- 키, localStorage 저장) ───────────────────────────────
  const { fontSize, increase: increaseFontSize, decrease: decreaseFontSize } = useWordFontSize();
  const { aiTyping, legacyTyping, startMatch, endMatch, activateFromStateSync, applyTyping } = useOpponentTypingState(roomId ?? '', players);
  const monitor = useAiMonitorBridge(roomId ?? '');

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

  // 종료된 매치를 새로고침 등으로 재방문하면 서버 세션이 이미 정리돼 있어
  // match_ready/state_sync가 오지 않는다(#123) — 일정 시간 안에 WAITING을
  // 벗어나지 못하면 더 이상 진행할 수 없는 매치로 간주한다.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPhase(current => {
        if (current === 'WAITING') setMatchUnavailable(true);
        return current;
      });
    }, MATCH_UNAVAILABLE_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  // ── Profile fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMyProfile()
      .then(p => { myUserIdRef.current = p.id; setMyNickname(p.nickname); setMyAvatar(p.avatar ?? ''); })
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

  const handleMatchReady = useCallback((data: Parameters<import('../types/acidRain').AcidRainServerEvents['match_ready']>[0]) => {
    if (data.roomId !== roomId) return;
    monitor.onMatchReady(data);
    startMatch(data.roomId, data.participants);
    setPhase('COUNTDOWN');
    setCountdown(3);
    setPlayers(data.participants);
  }, [roomId, startMatch, monitor]);

  const handleMatchStart = useCallback((startAt: string, now: string, initialHp: number) => {
    monitor.onMatchStart(startAt);
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
  }, [monitor, startTimer]);

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
    monitor.onMatchEnd();
    endMatch();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('FINISHED');
    setWords([]);
    const isWinner = data.winnerId === myUserIdRef.current;
    setEndData({ ...data, isWinner });
  }, [endMatch, monitor]);

  const handleOpponentDisconnected = useCallback(() => {
    setDisconnectedOpponent(true);
  }, []);

  const handleOpponentReconnected = useCallback(() => {
    setDisconnectedOpponent(false);
  }, []);

  const handleStateSync = useCallback((data: Parameters<import('../types/acidRain').AcidRainServerEvents['state_sync']>[0]) => {
    activateFromStateSync(data.roomId, data.participants);
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
  }, [activateFromStateSync, startTimer]);

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
    onOpponentTyping: applyTyping,
    onAiMonitorSnapshot: monitor.onSnapshot,
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

  // ── Avatar helper ─────────────────────────────────────────────────────────
  const avatarFor = (p: { avatar?: string; type: string }, fallbackSrc?: string, borderColor?: string) => {
    const src = p.avatar || fallbackSrc || '';
    const color = borderColor ?? (p.type === 'HUMAN' ? '#ef4a63' : '#12c8a8');
    return (
      <Avatar style={{ borderColor: color }}>
        {src ? (
          <img src={src} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        ) : null}
      </Avatar>
    );
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const myId = myUserIdRef.current;
  const myPlayer = players.find(p => p.participantId === myId) ?? { participantId: myId, nickname: myNickname || '나', type: 'HUMAN' as const, hp: MAX_HP };
  const otherPlayers = players.filter(p => p.participantId !== myId);
  const myHpPct = Math.max(0, (myPlayer.hp / MAX_HP) * 100);
  const remaining = Math.max(0, MATCH_DURATION - elapsed);
  const nicknameFor = (participantId: string) => players.find(p => p.participantId === participantId)?.nickname ?? (participantId === myId ? (myNickname || '나') : '???');

  // 매치가 이미 끝나 서버 세션이 정리된 상태로 재방문한 경우(#123) — 무한
  // 대기 대신 안내 화면을 보여준다.
  if (matchUnavailable) {
    return (
      <Page>
        <EndOverlay>
          <EndCard>
            <EndResult style={{ color: '#8a93a8', fontSize: 28 }}>이 매치는 더 이상 진행할 수 없습니다</EndResult>
            <EndReason>이미 종료되었거나 존재하지 않는 방입니다</EndReason>
            <EndActions>
              <PrimaryBtn onClick={() => navigate('/lobby')}>로비로 돌아가기</PrimaryBtn>
            </EndActions>
          </EndCard>
        </EndOverlay>
      </Page>
    );
  }

  // ── End modal ─────────────────────────────────────────────────────────────
  if (endData) {
    const ranking = [...endData.ranking].sort((a, b) => a.rank - b.rank);
    return (
      <Page>
        <EndOverlay>
          <EndCard>
            <EndResult style={{ color: endData.isWinner ? '#12c8a8' : '#ef4a63' }}>
              {endData.isWinner ? '🏆 승리' : '💀 패배'}
            </EndResult>
            <EndReason>
              {endData.reason === 'KO' && 'KO 승리'}
              {endData.reason === 'TIME_LIMIT' && '시간 종료'}
              {endData.reason === 'FORFEIT' && '상대방 기권'}
            </EndReason>
            <EndStats>
              {ranking.map(r => (
                <EndStatRow key={r.participantId}>
                  <EndStatLabel>#{r.rank}</EndStatLabel>
                  <span style={{ color: r.participantId === myId ? '#12c8a8' : '#c7cede', flex: 1, textAlign: 'left' as const }}>{nicknameFor(r.participantId)}</span>
                  <span style={{ color: '#8a93a8' }}>HP {endData.finalHp[r.participantId] ?? 0}</span>
                  <span style={{ color: '#8a93a8' }}>{endData.wordsTyped?.[r.participantId] ?? 0}단어</span>
                </EndStatRow>
              ))}
              <EndStatRow>
                <EndStatLabel>게임 시간</EndStatLabel>
                <span style={{ color: '#e2e8f5' }}>{fmtTime(endData.durationSec)}</span>
              </EndStatRow>
            </EndStats>
            <EndActions>
              <PrimaryBtn onClick={() => navigate('/lobby')}>로비로 돌아가기</PrimaryBtn>
            </EndActions>
          </EndCard>
        </EndOverlay>
      </Page>
    );
  }

  return (
    <Page>
      <OuterLayout>

        {/* ── Main game area ── */}
        <GameCol>

          {/* Top bar */}
          <TopBar>
            {leaveConfirm ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LeaveText>나가면 패배 처리됩니다</LeaveText>
                <DangerSm onClick={() => navigate('/lobby')}>확인</DangerSm>
                <GhostSm onClick={() => setLeaveConfirm(false)}>취소</GhostSm>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DangerSm onClick={() => setLeaveConfirm(true)}>⎋ 나가기</DangerSm>
                <FontSizeHint>+/- 글자 크기 조절</FontSizeHint>
              </div>
            )}
            <TimerBox>
              <TimerText style={{ color: remaining <= 30 ? '#ef4a63' : '#e2e8f5' }}>
                {fmtTime(remaining)}
              </TimerText>
            </TimerBox>
            {players.some(player => player.type === 'AI') && roomId && (
              <AiMonitorButton roomId={roomId} onOpen={monitor.openMonitor} />
            )}
          </TopBar>

          {/* Other players' HP (up to 3, battle royale) */}
          <HpZone>
            {otherPlayers.length === 0 && phase === 'WAITING' && (
              <PlayerRow>
                {avatarFor({ type: 'HUMAN' })}
                <div style={{ flex: 1 }}>
                  <Nickname>상대방</Nickname>
                </div>
              </PlayerRow>
            )}
            {otherPlayers.map(p => {
              const pct = Math.max(0, (p.hp / MAX_HP) * 100);
              const eliminated = p.rank !== undefined;
              return (
                <PlayerRow
                  key={p.participantId}
                  style={{ background: flashByUserId[p.participantId] ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s', opacity: eliminated ? 0.5 : 1, borderRadius: 8 }}
                >
                  {avatarFor(p, undefined, eliminated ? '#5c6a8a' : '#ef4a63')}
                  <div style={{ flex: 1 }}>
                    <Nickname>{p.nickname}{eliminated ? ` · 탈락 #${p.rank}` : ''}</Nickname>
                    <HpRow>
                      <HpLabel>HP</HpLabel>
                      <HpTrack>
                        <HpFill style={{ width: `${pct}%`, background: hpColor(pct) }} />
                      </HpTrack>
                      <HpNum>{p.hp} / {MAX_HP}</HpNum>
                    </HpRow>
                    {/* 상대방 실시간 입력 진행도 — Option B: 입력 문자열 직접 표시 (#71).
                        내용 유무와 무관하게 컨테이너를 항상 마운트해 높이를 예약해두고
                        visibility만 토글한다 — 그래야 표시/숨김 전환마다 HP 영역 높이가
                        흔들리지 않는다(#102). */}
                    {phase === 'IN_PROGRESS' && (() => {
                      const ai = aiTyping[p.participantId];
                      const partial = ai?.partialText ?? legacyTyping[p.participantId] ?? '';
                      const hasContent = !!partial || !!ai;
                      const progress = ai && ai.totalKeystrokes > 0
                        ? Math.min(100, (ai.completedKeystrokes / ai.totalKeystrokes) * 100)
                        : 0;
                      return (
                        <TypingProgress style={{ color: ai ? '#b47cff' : '#12c8a8', borderColor: ai ? '#b47cff88' : undefined, visibility: hasContent ? 'visible' : 'hidden' }}>
                          {ai && <AiPhase>{ai.phase}</AiPhase>}
                          <TypingBlocks>{partial}</TypingBlocks>
                          {ai && ai.totalKeystrokes > 0 && <AiProgress>{ai.completedKeystrokes}/{ai.totalKeystrokes}</AiProgress>}
                          {ai && <AiProgressBar style={{ width: `${progress}%` }} />}
                        </TypingProgress>
                      );
                    })()}
                  </div>
                </PlayerRow>
              );
            })}
          </HpZone>

          {/* Rain area */}
          <RainArea>
            {/* Waiting / countdown overlay */}
            {phase === 'WAITING' && (
              <RainOverlay>
                <WaitText>
                  {connectionState === 'connecting' ? '연결 중…' : '상대방 대기 중…'}
                </WaitText>
              </RainOverlay>
            )}
            {phase === 'COUNTDOWN' && countdown !== null && (
              <RainOverlay style={{ flexDirection: 'column' }}>
                <CountdownNum>{countdown}</CountdownNum>
                <CountdownLabel>준비하세요!</CountdownLabel>
              </RainOverlay>
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
                  border: (() => {
                    const ai = otherPlayers.map(p => aiTyping[p.participantId]).find(state => state?.wordId === word.wordId);
                    if (ai?.phase === 'REACTION') return '1px dashed #b47cff';
                    if (ai?.phase === 'TYPING') return '1px solid #b47cff';
                    if (ai?.phase === 'CORRECTING') return '1px solid #f0a6ff';
                    return `1px solid ${keystrokeColor(word.keystrokes)}55`;
                  })(),
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
              <DisconnectBanner>
                상대방의 연결이 끊겼습니다. 재접속을 기다리는 중입니다.
              </DisconnectBanner>
            )}
          </RainArea>

          {/* My HP + input */}
          <HpZone style={{ background: flashByUserId[myId] ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s' }}>
            <PlayerRow>
              {avatarFor(myPlayer, myAvatar, '#12c8a8')}
              <div style={{ flex: 1 }}>
                <Nickname>{myPlayer.nickname}</Nickname>
                <HpRow>
                  <HpLabel>HP</HpLabel>
                  <HpTrack>
                    <HpFill style={{ width: `${myHpPct}%`, background: hpColor(myHpPct) }} />
                  </HpTrack>
                  <HpNum>{myPlayer.hp} / {MAX_HP}</HpNum>
                </HpRow>
              </div>
            </PlayerRow>

            <InputField
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              disabled={phase !== 'IN_PROGRESS'}
              placeholder={phase === 'IN_PROGRESS' ? '단어를 입력하세요…' : ''}
              $error={inputError}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </HpZone>
        </GameCol>

        {/* ── Chat column ── */}
        <ChatCol>
          <ChatPanel currentUserId={myUserIdRef.current} roomId={roomId} />
        </ChatCol>
      </OuterLayout>
    </Page>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const Page = styled.div`
  min-height: 100dvh;
  background: radial-gradient(ellipse 1200px 700px at 50% -5%, #0a1520 0%, #05070c 60%);
  font-family: 'Inter', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
`;

const OuterLayout = styled.div`
  width: 100%;
  max-width: 1100px;
  display: flex;
  gap: 12px;
  align-items: stretch;
  height: calc(100dvh - 24px);
`;

const GameCol = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ChatCol = styled.div`
  width: 240px;
  flex-shrink: 0;
  height: 100%;
`;

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
`;

const TimerBox = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 4px 16px;
`;

const TimerText = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 22px;
`;

const HpZone = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 12px 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const PlayerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Avatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #182236;
  border: 2px solid;
  flex-shrink: 0;
`;

const Nickname = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: #e2e8f5;
  margin-bottom: 4px;
`;

const HpRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HpLabel = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #8a93a8;
  width: 20px;
`;

const HpTrack = styled.div`
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: #182236;
  overflow: hidden;
  max-width: 300px;
`;

const HpFill = styled.div`
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease, background 0.4s ease;
`;

const HpNum = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #c7cede;
  min-width: 60px;
`;

const TypingProgress = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  height: 14px;
`;

const TypingBlocks = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #12c8a8;
  letter-spacing: 0.5px;
  opacity: 0.85;
`;

const AiPhase = styled.span`
  font-size: 9px;
  opacity: 0.8;
`;

const AiProgress = styled.span`
  font-size: 9px;
  opacity: 0.8;
  margin-left: auto;
`;

const AiProgressBar = styled.span`
  position: absolute;
  left: 0;
  bottom: -2px;
  height: 2px;
  background: #b47cff;
  transition: width 0.1s;
`;

const RainArea = styled.div`
  flex: 1;
  position: relative;
  background: rgba(5, 7, 12, 0.6);
  border: 1px solid rgba(18, 200, 168, 0.08);
  border-radius: 12px;
  overflow: hidden;
  min-height: 0;
`;

const RainOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 7, 12, 0.7);
  z-index: 10;
`;

const WaitText = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  color: #5c6a8a;
  letter-spacing: 0.08em;
`;

const CountdownNum = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 120px;
  color: #12c8a8;
  line-height: 1;
  text-shadow: 0 0 40px rgba(18, 200, 168, 0.5);
`;

const CountdownLabel = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  color: #5c6a8a;
  letter-spacing: 0.2em;
  margin-top: 12px;
`;

const InputField = styled.input<{ $error: boolean }>`
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  color: #e2e8f5;
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 700;
  outline: none;
  letter-spacing: 0.05em;
  box-sizing: border-box;
  transition: border-color 0.15s, background 0.15s;
  border: ${p => (p.$error ? '1px solid rgba(239,74,99,.6)' : '1px solid rgba(18,200,168,.3)')};
  background: ${p => (p.$error ? 'rgba(239,74,99,.08)' : 'rgba(18,200,168,.05)')};
`;

const DisconnectBanner = styled.div`
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(239, 74, 99, 0.12);
  border: 1px solid rgba(239, 74, 99, 0.4);
  border-radius: 8px;
  padding: 8px 16px;
  color: #ef4a63;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  white-space: nowrap;
  z-index: 20;
`;

const LeaveText = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #c7cede;
`;

const FontSizeHint = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #5c6478;
  white-space: nowrap;
`;

const DangerSm = styled.button`
  padding: 5px 11px;
  border-radius: 7px;
  border: 1px solid rgba(239, 74, 99, 0.35);
  background: rgba(239, 74, 99, 0.06);
  color: #ef4a63;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  cursor: pointer;
`;

const GhostSm = styled.button`
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #8a93a8;
  cursor: pointer;
  font-size: 10.5px;
  font-family: 'JetBrains Mono', monospace;
`;

const PrimaryBtn = styled.button`
  padding: 11px 28px;
  border-radius: 10px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.12);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
`;

// End screen
const EndOverlay = styled.div`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const EndCard = styled.div`
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 40px 48px;
  min-width: 380px;
  text-align: center;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
`;

const EndResult = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 48px;
  margin-bottom: 8px;
`;

const EndReason = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #5c6a8a;
  letter-spacing: 0.1em;
  margin-bottom: 32px;
`;

const EndStats = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 32px;
`;

const EndStatRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
`;

const EndStatLabel = styled.span`
  color: #5c6a8a;
  min-width: 80px;
  text-align: right;
`;

const EndActions = styled.div`
  display: flex;
  justify-content: center;
  gap: 12px;
`;
