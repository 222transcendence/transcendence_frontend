import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
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
    @keyframes fall { from { transform: translateY(-60px); } to { transform: translateY(calc(100dvh - 40px)); } }
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
      <Page>
        <Center>
          <NotSpectatableBox>이 방은 현재 관전할 수 없습니다</NotSpectatableBox>
          <PrimaryBtn onClick={() => navigate('/lobby')}>로비로 돌아가기</PrimaryBtn>
        </Center>
      </Page>
    );
  }

  if (endData) {
    const ranking = [...endData.ranking].sort((a, b) => a.rank - b.rank);
    return (
      <Page>
        <EndOverlay>
          <EndCard>
            <EndTitle>🏁 경기 종료</EndTitle>
            <EndReason>
              {endData.reason === 'KO' && 'KO 승리'}
              {endData.reason === 'TIME_LIMIT' && '시간 종료'}
              {endData.reason === 'FORFEIT' && '상대방 기권'}
            </EndReason>
            <EndStats>
              {ranking.map(r => (
                <EndStatRow key={r.participantId}>
                  <EndStatLabel>#{r.rank}</EndStatLabel>
                  <span style={{ color: r.participantId === endData.winnerId ? '#12c8a8' : '#c7cede', flex: 1, textAlign: 'left' as const }}>{nicknameFor(r.participantId)}</span>
                  <span style={{ color: '#8a93a8' }}>HP {endData.finalHp[r.participantId] ?? 0}</span>
                  <span style={{ color: '#8a93a8' }}>{endData.wordsTyped?.[r.participantId] ?? 0}단어</span>
                </EndStatRow>
              ))}
              <EndStatRow>
                <EndStatLabel>게임 시간</EndStatLabel>
                <span style={{ color: '#e2e8f5' }}>{fmtTime(endData.durationSec)}</span>
              </EndStatRow>
            </EndStats>
            <PrimaryBtn onClick={() => navigate('/lobby')}>로비로 돌아가기</PrimaryBtn>
          </EndCard>
        </EndOverlay>
      </Page>
    );
  }

  return (
    <Page>
      <OuterLayout>
      <GameCol>
        <TopBar>
          <GhostSm onClick={() => navigate('/lobby')}>⎋ 관전 종료</GhostSm>
          <SpectatorBadge>👁 관전 중</SpectatorBadge>
          <TimerBox>
            <TimerText style={{ color: remaining <= 30 ? '#ef4a63' : '#e2e8f5' }}>
              {fmtTime(remaining)}
            </TimerText>
          </TimerBox>
          {participants.some(participant => participant.type === 'AI') && roomId && (
            <AiMonitorButton roomId={roomId} onOpen={monitor.openMonitor} />
          )}
        </TopBar>

        {/* 참가자 HP — 관전자에게는 "나"가 없으므로 양쪽 다 동일한 패널로 렌더링 */}
        <HpZone>
          {participants.length === 0 && (
            <WaitText>
              {connectionState === 'connecting' ? '연결 중…' : '매치 정보를 불러오는 중…'}
            </WaitText>
          )}
          {participants.map(p => {
            const pct = Math.max(0, (p.hp / MAX_HP) * 100);
            const eliminated = p.rank !== undefined;
            return (
              <PlayerRow
                key={p.participantId}
                style={{ background: flashByParticipantId[p.participantId] ? 'rgba(239,74,99,.1)' : 'transparent', transition: 'background .15s', opacity: eliminated ? 0.5 : 1, borderRadius: 8 }}
              >
                <Avatar style={{ borderColor: eliminated ? '#5c6a8a' : '#12c8a8' }} />
                <div style={{ flex: 1 }}>
                  <Nickname>{p.nickname}{eliminated ? ` · 탈락 #${p.rank}` : ''}</Nickname>
                  <HpRow>
                    <HpLabel>HP</HpLabel>
                    <HpTrack>
                      <HpFill style={{ width: `${pct}%`, background: hpColor(pct) }} />
                    </HpTrack>
                    <HpNum>{p.hp} / {MAX_HP}</HpNum>
                  </HpRow>
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
              </PlayerRow>
            );
          })}
        </HpZone>

        {/* Rain area — 읽기 전용, 입력창 없음 */}
        <RainArea>
          {phase === 'WAITING' && participants.length > 0 && (
            <RainOverlay>
              <WaitText>매치 시작 대기 중…</WaitText>
            </RainOverlay>
          )}
          {phase === 'COUNTDOWN' && countdown !== null && (
            <RainOverlay style={{ flexDirection: 'column' }}>
              <CountdownNum>{countdown}</CountdownNum>
              <CountdownLabel>곧 시작합니다!</CountdownLabel>
            </RainOverlay>
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
            <DisconnectBanner>
              한 참가자의 연결이 끊겼습니다. 재접속을 기다리는 중입니다.
            </DisconnectBanner>
          )}
        </RainArea>
      </GameCol>

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

const Center = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
`;

const NotSpectatableBox = styled.div`
  background: rgba(239, 74, 99, 0.08);
  border: 1px solid rgba(239, 74, 99, 0.3);
  border-radius: 12px;
  padding: 20px 32px;
  color: #ef4a63;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
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

const SpectatorBadge = styled.div`
  background: rgba(18, 200, 168, 0.1);
  border: 1px solid rgba(18, 200, 168, 0.35);
  border-radius: 20px;
  padding: 4px 14px;
  color: #12c8a8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.05em;
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

const EndTitle = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 36px;
  margin-bottom: 8px;
  color: #e2e8f5;
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
