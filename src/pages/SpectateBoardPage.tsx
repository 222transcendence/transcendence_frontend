import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAcidRainSocket } from '../hooks/useAcidRainSocket';
import { useOpponentTypingState } from '../hooks/useOpponentTypingState';
import { useWordFontSize } from '../hooks/useWordFontSize';
import { fetchMyProfile } from '../api/client';
import { useAiMonitorBridge } from '../hooks/useAiMonitorBridge';
import AiMonitorButton from '../components/game/AiMonitorButton';
import ChatPanel from '../components/ChatPanel';
import type { FallingWord, MatchEndData, GamePhase, ParticipantState, HpByParticipantId } from '../types/acidRain';

// 관전 전용 읽기 화면 (deploy#70). GameBoardPage.tsx를 그대로 재사용하지 않는 이유:
// 그쪽은 "나(participantId===내 userId)" 매칭을 전제로 내 HP 행/입력창/승패 프레이밍을
// 그리는데, 관전자는 어느 쪽 참가자도 아니므로 이 가정이 전부 어긋난다. 대신 양쪽
// 참가자를 동일한 형태의 패널로 보여주고, 입력창과 승패 프레이밍은 아예 없앤다.
// 채팅은 참가자 채팅방을 그대로 읽기+쓰기 가능하게 열어준다 — 입장/퇴장 시스템
// 메시지는 백엔드 acid-rain.gateway가 스스로 sendSystemMessage로 발송한다.

const MAX_HP = 100;
const MATCH_DURATION = 180;
// state_sync를 이 시간(ms) 안에 못 받으면 관전 불가능한 방으로 간주하고 안내 화면을 보여준다.
const SNAPSHOT_TIMEOUT_MS = 6000;

function keystrokeColor(keystrokes: number) {
  if (keystrokes <= 5) return '#12c8a8';
  if (keystrokes <= 9) return '#eab308';
  return '#ef4a63';
}

function riskLabel(keystrokes: number) {
  if (keystrokes <= 5) return '약';
  if (keystrokes <= 9) return '중';
  return '강';
}

const styleId = 'acid-rain-keyframes';
if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes fall { from { transform: translateY(-60px); } to { transform: translateY(calc(100vh - 40px)); } }
    @keyframes pop-out { 0% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.6); } }
    @keyframes shrink-bar { from { width: 100%; } to { width: 0%; } }
    .word-chip { animation: fall linear forwards; position: absolute; cursor: default; user-select: none; }
    .word-chip.matched { animation: pop-out .25s ease forwards !important; }
    .word-chip .time-bar { animation: shrink-bar linear forwards; }
  `;
  document.head.appendChild(style);
}

function hpColor(pct: number) {
  if (pct > 60) return '#12c8a8';
  if (pct > 30) return '#eab308';
  return '#ef4a63';
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function SpectateBoardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [phase, setPhase]         = useState<GamePhase>('WAITING');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [participants, setParticipants] = useState<ParticipantState[]>([]);
  const [elapsed, setElapsed]     = useState(0);
  const [words, setWords]         = useState<FallingWord[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [endData, setEndData]     = useState<MatchEndData | null>(null);
  // 강제 탈락/승리 처리 데드라인은 없다 — 그냥 정보성 배너다(backend#161).
  const [disconnectedParticipant, setDisconnectedParticipant] = useState(false);
  const [flashByParticipantId, setFlashByParticipantId] = useState<Record<string, boolean>>({});
  const [notSpectatable, setNotSpectatable] = useState(false);

  const { fontSize } = useWordFontSize();

  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockOffsetRef    = useRef(0);
  const serverStartAtRef  = useRef(0);
  const myUserIdRef       = useRef('');
  const { aiTyping, legacyTyping, startMatch, endMatch, activateFromStateSync, applyTyping } = useOpponentTypingState(roomId ?? '', participants);
  const monitor = useAiMonitorBridge(roomId ?? '');

  useEffect(() => {
    fetchMyProfile()
      .then(p => { myUserIdRef.current = p.id; })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

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

  // 관전 가능한 방이 아니면(대기 중/이미 종료) 서버가 state_sync를 보내지 않는다 —
  // 일정 시간 안에 아무 진행도 없으면 안내 화면으로 전환한다.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPhase(current => {
        if (current === 'WAITING') setNotSpectatable(true);
        return current;
      });
    }, SNAPSHOT_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  const flashHit = useCallback((participantId: string) => {
    setFlashByParticipantId(prev => ({ ...prev, [participantId]: true }));
    setTimeout(() => setFlashByParticipantId(prev => ({ ...prev, [participantId]: false })), 400);
  }, []);

  const applyHp = useCallback((hp: HpByParticipantId) => {
    setParticipants(prev => prev.map(p => (p.participantId in hp ? { ...p, hp: hp[p.participantId] } : p)));
  }, []);

  const handleMatchReady = useCallback((data: Parameters<import('../types/acidRain').AcidRainServerEvents['match_ready']>[0]) => {
    if (data.roomId !== roomId) return;
    monitor.onMatchReady(data);
    startMatch(data.roomId, data.participants);
    setPhase('COUNTDOWN');
    setCountdown(3);
    setParticipants(data.participants);
  }, [roomId, startMatch, monitor]);

  const handleMatchStart = useCallback((startAt: string, now: string, initialHp: number) => {
    monitor.onMatchStart(startAt);
    clockOffsetRef.current = Date.parse(now) - Date.now();
    serverStartAtRef.current = Date.parse(startAt);
    const msUntilStart = serverStartAtRef.current - (Date.now() + clockOffsetRef.current);
    const startGame = () => {
      setPhase('IN_PROGRESS');
      setParticipants(prev => prev.map(p => ({ ...p, hp: initialHp, rank: undefined })));
      setWords([]); setElapsed(0);
      startTimer();
    };
    if (msUntilStart > 0) setTimeout(startGame, msUntilStart);
    else startGame();
  }, [monitor, startTimer]);

  const handleWordSpawn = useCallback((word: FallingWord) => {
    setWords(prev => [...prev, word]);
  }, []);

  const handleWordCleared = useCallback((wordId: string, _clearedBy: string, targetParticipantId: string, _damage: number, hp: HpByParticipantId) => {
    setMatchedIds(prev => new Set([...prev, wordId]));
    setTimeout(() => {
      setWords(prev => prev.filter(w => w.wordId !== wordId));
      setMatchedIds(prev => { const n = new Set(prev); n.delete(wordId); return n; });
    }, 300);
    applyHp(hp);
    // 실제로 맞은 대상 한 명만 하이라이팅한다 — hp 맵은 전원의 최신 HP를 담고 있을 뿐,
    // hp 맵의 키 전체가 이번에 데미지를 받은 대상이라는 뜻이 아니다.
    flashHit(targetParticipantId);
  }, [applyHp, flashHit]);

  const handleWordMissed = useCallback((wordId: string, _splashDamage: number, hp: HpByParticipantId) => {
    setWords(prev => prev.filter(w => w.wordId !== wordId));
    applyHp(hp);
    // 스플래시 데미지는 생존자 전원에게 적용되므로(GAME_DESIGN.md §3.6), 이 경우엔
    // 전원 하이라이팅이 맞다.
    Object.keys(hp).forEach(flashHit);
  }, [applyHp, flashHit]);

  const handlePlayerEliminated = useCallback((userId: string, rank: number, finalHp: number) => {
    setParticipants(prev => prev.map(p => p.participantId === userId ? { ...p, hp: finalHp, rank } : p));
  }, []);

  const handleMatchEnd = useCallback((data: MatchEndData) => {
    monitor.onMatchEnd();
    endMatch();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('FINISHED');
    setWords([]);
    setEndData(data);
  }, [endMatch, monitor]);

  const handleOpponentDisconnected = useCallback(() => {
    setDisconnectedParticipant(true);
  }, []);

  const handleOpponentReconnected = useCallback(() => {
    setDisconnectedParticipant(false);
  }, []);

  const handleStateSync = useCallback((data: Parameters<import('../types/acidRain').AcidRainServerEvents['state_sync']>[0]) => {
    activateFromStateSync(data.roomId, data.participants);
    const clockOffset = Date.parse(data.now) - Date.now();
    clockOffsetRef.current = clockOffset;
    serverStartAtRef.current = Date.parse(data.now) - data.elapsedMs;
    setParticipants(data.participants.map(p => (p.participantId in data.hp ? { ...p, hp: data.hp[p.participantId] } : p)));
    const restored: FallingWord[] = data.activeWords.map(w => {
      const animStartAt = Date.parse(w.spawnedAt) + clockOffset;
      return { ...w, animStartAt, renderDelayMs: animStartAt - Date.now() };
    });
    setWords(restored);
    setPhase('IN_PROGRESS');
    startTimer();
  }, [activateFromStateSync, startTimer]);

  const { connectionState } = useAcidRainSocket(
    roomId ?? '',
    {
      onMatchReady: handleMatchReady,
      onMatchStart: handleMatchStart,
      onWordSpawn: handleWordSpawn,
      onWordCleared: handleWordCleared,
      onWordMissed: handleWordMissed,
      onPlayerEliminated: handlePlayerEliminated,
      onMatchEnd: handleMatchEnd,
      onOpponentDisconnected: handleOpponentDisconnected,
      onOpponentReconnected: handleOpponentReconnected,
      onStateSync: handleStateSync,
      onOpponentTyping: applyTyping,
      onAiMonitorSnapshot: monitor.onSnapshot,
    },
    'spectator',
  );

  const remaining = Math.max(0, MATCH_DURATION - elapsed);
  const nicknameFor = (participantId: string) =>
    participants.find(p => p.participantId === participantId)?.nickname ?? '???';

  if (notSpectatable) {
    return (
      <div style={S.page}>
        <div style={S.center}>
          <div style={S.notSpectatableBox}>이 방은 현재 관전할 수 없습니다</div>
          <button style={S.primaryBtn} onClick={() => navigate('/lobby')}>로비로 돌아가기</button>
        </div>
      </div>
    );
  }

  if (endData) {
    const ranking = [...endData.ranking].sort((a, b) => a.rank - b.rank);
    return (
      <div style={S.page}>
        <div style={S.endOverlay}>
          <div style={S.endCard}>
            <div style={S.endTitle}>🏁 경기 종료</div>
            <div style={S.endReason}>
              {endData.reason === 'KO' && 'KO 승리'}
              {endData.reason === 'TIME_LIMIT' && '시간 종료'}
              {endData.reason === 'FORFEIT' && '상대방 기권'}
            </div>
            <div style={S.endStats}>
              {ranking.map(r => (
                <div key={r.participantId} style={S.endStatRow}>
                  <span style={S.endStatLabel}>#{r.rank}</span>
                  <span style={{ color: r.participantId === endData.winnerId ? '#12c8a8' : '#c7cede', flex: 1, textAlign: 'left' as const }}>{nicknameFor(r.participantId)}</span>
                  <span style={{ color: '#8a93a8' }}>HP {endData.finalHp[r.participantId] ?? 0}</span>
                  <span style={{ color: '#8a93a8' }}>{endData.wordsTyped?.[r.participantId] ?? 0}단어</span>
                </div>
              ))}
              <div style={S.endStatRow}>
                <span style={S.endStatLabel}>게임 시간</span>
                <span style={{ color: '#e2e8f5' }}>{fmtTime(endData.durationSec)}</span>
              </div>
            </div>
            <button style={S.primaryBtn} onClick={() => navigate('/lobby')}>로비로 돌아가기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.outerLayout}>
      <div style={S.gameCol}>
        <div style={S.topBar}>
          <button style={S.ghostSm} onClick={() => navigate('/lobby')}>⎋ 관전 종료</button>
          <div style={S.spectatorBadge}>👁 관전 중</div>
          <div style={S.timerBox}>
            <span style={{ ...S.timerText, color: remaining <= 30 ? '#ef4a63' : '#e2e8f5' }}>
              {fmtTime(remaining)}
            </span>
          </div>
          {participants.some(participant => participant.type === 'AI') && roomId && (
            <AiMonitorButton roomId={roomId} onOpen={monitor.openMonitor} />
          )}
        </div>

        {/* 참가자 HP — 관전자에게는 "나"가 없으므로 양쪽 다 동일한 패널로 렌더링 */}
        <div style={S.hpZone}>
          {participants.length === 0 && (
            <div style={S.waitText}>
              {connectionState === 'connecting' ? '연결 중…' : '매치 정보를 불러오는 중…'}
            </div>
          )}
          {participants.map(p => {
            const pct = Math.max(0, (p.hp / MAX_HP) * 100);
            const eliminated = p.rank !== undefined;
            return (
              <div
                key={p.participantId}
                style={{ ...S.playerRow, background: flashByParticipantId[p.participantId] ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s', opacity: eliminated ? 0.5 : 1, borderRadius: 8 }}
              >
                <div style={{ ...S.avatar, borderColor: eliminated ? '#5c6a8a' : '#12c8a8' }} />
                <div style={{ flex: 1 }}>
                  <div style={S.nickname}>{p.nickname}{eliminated ? ` · 탈락 #${p.rank}` : ''}</div>
                  <div style={S.hpRow}>
                    <span style={S.hpLabel}>HP</span>
                    <div style={S.hpTrack}>
                      <div style={{ ...S.hpFill, width: `${pct}%`, background: hpColor(pct) }} />
                    </div>
                    <span style={S.hpNum}>{p.hp} / {MAX_HP}</span>
                  </div>
                  {/* 실시간 입력 진행도 (#85). 내용 유무와 무관하게 컨테이너를 항상
                      마운트해 높이를 예약해두고 visibility만 토글한다 — 그래야
                      표시/숨김 전환마다 HP 영역 높이가 흔들리지 않는다(GameBoardPage의
                      #102 수정을 관전 화면에도 동일 적용). */}
                  {phase === 'IN_PROGRESS' && (() => {
                    const ai = aiTyping[p.participantId];
                    const partial = ai?.partialText ?? legacyTyping[p.participantId] ?? '';
                    const hasContent = !!partial || !!ai;
                    const progress = ai && ai.totalKeystrokes > 0
                      ? Math.min(100, (ai.completedKeystrokes / ai.totalKeystrokes) * 100)
                      : 0;
                    return (
                      <div style={{ marginTop: 4, height: 14, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: ai ? '#b47cff' : '#12c8a8', opacity: 0.85, letterSpacing: 0.5, position: 'relative', visibility: hasContent ? 'visible' : 'hidden' }}>
                        {ai && <span style={{ marginRight: 6 }}>{ai.phase}</span>}
                        {partial}
                        {ai && ai.totalKeystrokes > 0 && <span style={{ marginLeft: 6 }}>{ai.completedKeystrokes}/{ai.totalKeystrokes}</span>}
                        {ai && <span style={{ display: 'block', height: 2, marginTop: 3, background: '#b47cff', width: `${progress}%`, transition: 'width .1s' }} />}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rain area — 읽기 전용, 입력창 없음 */}
        <div style={S.rainArea}>
          {phase === 'WAITING' && participants.length > 0 && (
            <div style={S.rainOverlay}>
              <div style={S.waitText}>매치 시작 대기 중…</div>
            </div>
          )}
          {phase === 'COUNTDOWN' && countdown !== null && (
            <div style={{ ...S.rainOverlay, flexDirection: 'column' }}>
              <div style={S.countdownNum}>{countdown}</div>
              <div style={S.countdownLabel}>곧 시작합니다!</div>
            </div>
          )}

          {words.map(word => (
            <div
              key={word.wordId}
              className={`word-chip${matchedIds.has(word.wordId) ? ' matched' : ''}`}
              style={{
                left: `calc(${word.lane} * 18%)`,
                width: '16%',
                animationDuration: `${word.fallDurationMs}ms`,
                animationDelay: `${word.renderDelayMs}ms`,
                padding: '5px 10px 4px',
                borderRadius: 8,
                border: (() => {
                  const ai = participants.map(p => aiTyping[p.participantId]).find(state => state?.wordId === word.wordId);
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
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                boxShadow: `0 0 12px ${keystrokeColor(word.keystrokes)}44`,
                letterSpacing: '.04em',
                opacity: 1,
                boxSizing: 'border-box',
              } as React.CSSProperties}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{word.text}</span>
                <span style={{ fontSize: 9, opacity: .75, flexShrink: 0 }}>
                  {word.damage !== undefined ? `⚔${word.damage}` : riskLabel(word.keystrokes)}
                </span>
              </div>
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

          {disconnectedParticipant && (
            <div style={S.disconnectBanner}>
              한 참가자의 연결이 끊겼습니다. 재접속을 기다리는 중입니다.
            </div>
          )}
        </div>
      </div>

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
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  notSpectatableBox: {
    background: 'rgba(239,74,99,.08)',
    border: '1px solid rgba(239,74,99,.3)',
    borderRadius: 12,
    padding: '20px 32px',
    color: '#ef4a63',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
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
  spectatorBadge: {
    background: 'rgba(18,200,168,.1)',
    border: '1px solid rgba(18,200,168,.35)',
    borderRadius: 20,
    padding: '4px 14px',
    color: '#12c8a8',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: '.05em',
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
  endTitle: {
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700,
    fontSize: 36,
    marginBottom: 8,
    color: '#e2e8f5',
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
} as const;
