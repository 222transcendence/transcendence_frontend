import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMyProfile } from '../api/client';
import ChatPanel from '../components/ChatPanel';
import { useAcidRainSocket } from '../hooks/useAcidRainSocket';
import type { FallingWord, MatchEndData, GamePhase, PlayerPublic, HpPair } from '../types/acidRain';

const MAX_HP = 100;
const MATCH_DURATION = 180;

// ── Word falling animation injected once ─────────────────────────────────────
const styleId = 'acid-rain-keyframes';
if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes fall { from { transform: translateY(-60px); } to { transform: translateY(calc(100vh - 40px)); } }
    @keyframes flash-green { 0%,100% { background: transparent; } 50% { background: rgba(18,200,168,.18); } }
    @keyframes flash-red   { 0%,100% { background: transparent; } 50% { background: rgba(239,74,99,.18); } }
    @keyframes pop-out { 0% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.6); } }
    .word-chip { animation: fall linear forwards; position: absolute; cursor: default; user-select: none; }
    .word-chip.matched { animation: pop-out .25s ease forwards !important; }
  `;
  document.head.appendChild(style);
}

// ── Tier color ────────────────────────────────────────────────────────────────
const tierColor = { easy: '#12c8a8', medium: '#eab308', hard: '#ef4a63' };

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
  const [opponentNickname, setOpponentNickname] = useState('');
  const myUserIdRef   = useRef('');
  const isHostRef     = useRef(false);

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase, setPhase]         = useState<GamePhase>('WAITING');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [myHp, setMyHp]           = useState(MAX_HP);
  const [oppHp, setOppHp]         = useState(MAX_HP);
  const [elapsed, setElapsed]     = useState(0);
  const [words, setWords]         = useState<FallingWord[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [endData, setEndData]     = useState<(MatchEndData & { isWinner: boolean }) | null>(null);
  const [disconnectGrace, setDisconnectGrace] = useState<number | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [flashMy, setFlashMy]     = useState<'hit' | null>(null);
  const [flashOpp, setFlashOpp]   = useState<'hit' | null>(null);

  // ── Input ─────────────────────────────────────────────────────────────────
  const [input, setInput]     = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);
  const wordsRef              = useRef<FallingWord[]>([]);
  wordsRef.current = words;

  // ── Timer ─────────────────────────────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(e => Math.min(e + 1, MATCH_DURATION));
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Profile fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMyProfile()
      .then(p => { myUserIdRef.current = p.id; setMyNickname(p.nickname); })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  // ── Flash helpers ─────────────────────────────────────────────────────────
  const flashHit = useCallback((target: 'my' | 'opp') => {
    if (target === 'my') {
      setFlashMy('hit');
      setTimeout(() => setFlashMy(null), 400);
    } else {
      setFlashOpp('hit');
      setTimeout(() => setFlashOpp(null), 400);
    }
  }, []);

  // ── Socket handlers ───────────────────────────────────────────────────────

  const applyHp = useCallback((hp: HpPair) => {
    if (isHostRef.current) { setMyHp(hp.host); setOppHp(hp.guest); }
    else                   { setMyHp(hp.guest); setOppHp(hp.host); }
  }, []);

  const handleMatchReady = useCallback((players: { host: PlayerPublic; guest: PlayerPublic }) => {
    // 상대방 닉네임 결정 — match_ready 시점에 players 정보 수신
    setPhase('COUNTDOWN');
    setCountdown(3);
    // isHost는 match_start의 startAt/now 기준으로 최종 확정하지만
    // 여기서 players로 미리 결정 가능
    const myId = myUserIdRef.current;
    isHostRef.current = players.host.userId === myId;
    const oppNick = isHostRef.current ? players.guest.nickname : players.host.nickname;
    setOpponentNickname(oppNick);
  }, []);

  const handleMatchStart = useCallback((startAt: string, now: string, initialHp: number) => {
    void now;
    const msUntilStart = Date.parse(startAt) - Date.now();
    const startGame = () => {
      setPhase('IN_PROGRESS');
      setMyHp(initialHp); setOppHp(initialHp);
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

  const handleWordCleared = useCallback((wordId: string, clearedBy: string, _damage: number, targetHp: HpPair) => {
    setMatchedIds(prev => new Set([...prev, wordId]));
    setTimeout(() => {
      setWords(prev => prev.filter(w => w.wordId !== wordId));
      setMatchedIds(prev => { const n = new Set(prev); n.delete(wordId); return n; });
    }, 300);
    applyHp(targetHp);
    if (clearedBy !== myUserIdRef.current) flashHit('my');
    else flashHit('opp');
  }, [applyHp, flashHit]);

  const handleWordMissed = useCallback((_wordId: string, _splashDamage: number, targetHp: HpPair) => {
    setWords(prev => prev.filter(w => w.wordId !== _wordId));
    applyHp(targetHp);
    flashHit('my');
    flashHit('opp');
  }, [applyHp, flashHit]);

  const handleMatchEnd = useCallback((data: MatchEndData) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('FINISHED');
    setWords([]);
    const isWinner = data.winnerId === myUserIdRef.current;
    setEndData({ ...data, isWinner });
  }, []);

  const handleOpponentDisconnected = useCallback((_userId: string, graceMs: number) => {
    setDisconnectGrace(Math.ceil(graceMs / 1000));
  }, []);

  const handleStateSync = useCallback((data: Parameters<import('../types/acidRain').AcidRainServerEvents['state_sync']>[0]) => {
    setElapsed(Math.round(data.elapsedMs / 1000));
    applyHp(data.hp);
    const clockOffset = Date.parse(data.now) - Date.now();
    const restored: FallingWord[] = data.activeWords.map(w => ({
      ...w,
      animStartAt: Date.parse(w.spawnedAt) + clockOffset,
    }));
    setWords(restored);
    setPhase('IN_PROGRESS');
    startTimer();
  }, [applyHp, startTimer]);

  const { connectionState, submitWord } = useAcidRainSocket(roomId ?? '', {
    onMatchReady: handleMatchReady,
    onMatchStart: handleMatchStart,
    onWordSpawn: handleWordSpawn,
    onWordCleared: handleWordCleared,
    onWordMissed: handleWordMissed,
    onMatchEnd: handleMatchEnd,
    onOpponentDisconnected: handleOpponentDisconnected,
    onStateSync: handleStateSync,
  });

  // ── Input submit: find matching word ─────────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    const match = wordsRef.current.find(w => w.text === val && !matchedIds.has(w.wordId));
    if (match) {
      setInput('');
      submitWord(match.wordId, match.text);
    }
  }, [matchedIds, submitWord]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const myHpPct  = Math.max(0, (myHp  / MAX_HP) * 100);
  const oppHpPct = Math.max(0, (oppHp / MAX_HP) * 100);
  const remaining = Math.max(0, MATCH_DURATION - elapsed);

  // ── End modal ─────────────────────────────────────────────────────────────
  if (endData) {
    const myWords  = isHostRef.current ? endData.wordsTyped.host : endData.wordsTyped.guest;
    const oppWords = isHostRef.current ? endData.wordsTyped.guest : endData.wordsTyped.host;
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
              <div style={S.endStatRow}>
                <span style={S.endStatLabel}>최종 HP</span>
                <span style={{ color: '#12c8a8' }}>{myHp}</span>
                <span style={S.endStatSep}>vs</span>
                <span style={{ color: '#ef4a63' }}>{oppHp}</span>
              </div>
              <div style={S.endStatRow}>
                <span style={S.endStatLabel}>입력한 단어</span>
                <span style={{ color: '#12c8a8' }}>{myWords}</span>
                <span style={S.endStatSep}>vs</span>
                <span style={{ color: '#ef4a63' }}>{oppWords}</span>
              </div>
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
              <button style={S.dangerSm} onClick={() => setLeaveConfirm(true)}>⎋ 나가기</button>
            )}
            <div style={S.timerBox}>
              <span style={{ ...S.timerText, color: remaining <= 30 ? '#ef4a63' : '#e2e8f5' }}>
                {fmtTime(remaining)}
              </span>
            </div>
            <div style={{ width: 80 }} />
          </div>

          {/* Opponent HP */}
          <div style={{ ...S.hpZone, background: flashOpp === 'hit' ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s' }}>
            <div style={S.playerRow}>
              <div style={{ ...S.avatar, borderColor: '#ef4a63' }} />
              <div style={{ flex: 1 }}>
                <div style={S.nickname}>{opponentNickname || '상대방'}</div>
                <div style={S.hpRow}>
                  <span style={S.hpLabel}>HP</span>
                  <div style={S.hpTrack}>
                    <div style={{ ...S.hpFill, width: `${oppHpPct}%`, background: hpColor(oppHpPct) }} />
                  </div>
                  <span style={S.hpNum}>{oppHp} / {MAX_HP}</span>
                </div>
              </div>
            </div>
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

            {/* Falling words */}
            {words.map(word => (
              <div
                key={word.wordId}
                className={`word-chip${matchedIds.has(word.wordId) ? ' matched' : ''}`}
                style={{
                  left: `${(word.lane / 4) * 90}%`,
                  animationDuration: `${word.fallDurationMs}ms`,
                  animationDelay: '0ms',
                  padding: '5px 13px',
                  borderRadius: 8,
                  border: `1px solid ${tierColor[word.tier]}55`,
                  background: `${tierColor[word.tier]}14`,
                  color: tierColor[word.tier],
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize: 17,
                  whiteSpace: 'nowrap',
                  boxShadow: `0 0 12px ${tierColor[word.tier]}44`,
                  letterSpacing: '.04em',
                  opacity: 1,
                } as React.CSSProperties}
              >
                {input && word.text.startsWith(input)
                  ? <><span style={{ color: '#fff', textDecoration: 'underline' }}>{input}</span>{word.text.slice(input.length)}</>
                  : word.text
                }
              </div>
            ))}

            {/* Disconnect notice */}
            {disconnectGrace !== null && (
              <div style={S.disconnectBanner}>
                상대방이 연결이 끊겼습니다. {disconnectGrace}초 내 재접속하지 않으면 승리 처리됩니다.
              </div>
            )}
          </div>

          {/* My HP + input */}
          <div style={{ ...S.hpZone, background: flashMy === 'hit' ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s' }}>
            <div style={S.playerRow}>
              <div style={{ ...S.avatar, borderColor: '#12c8a8' }} />
              <div style={{ flex: 1 }}>
                <div style={S.nickname}>{myNickname || '나'}</div>
                <div style={S.hpRow}>
                  <span style={S.hpLabel}>HP</span>
                  <div style={S.hpTrack}>
                    <div style={{ ...S.hpFill, width: `${myHpPct}%`, background: hpColor(myHpPct) }} />
                  </div>
                  <span style={S.hpNum}>{myHp} / {MAX_HP}</span>
                </div>
              </div>
            </div>

            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              disabled={phase !== 'IN_PROGRESS'}
              placeholder={phase === 'IN_PROGRESS' ? '단어를 입력하세요…' : ''}
              style={S.inputField}
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
