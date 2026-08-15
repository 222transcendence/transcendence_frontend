import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { AiMonitorMetricMetadata, AiMonitorSnapshot } from '../types/acidRain';
import { appendDecisionHistory, mergeAiMonitorSnapshot, type AiMonitorDecisionHistoryEntry } from '../lib/aiMonitorSnapshot';
import type { MonitorMessage, MonitorIdentity } from '../hooks/useAiMonitorBridge';

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function sameLifecycle(left: MonitorIdentity, right: MonitorIdentity): boolean {
  return left.roomId === right.roomId && left.matchEpoch === right.matchEpoch;
}

function value(value: unknown): string {
  return value === null || value === undefined ? '정보 없음' : String(value);
}

function percent(valueToFormat: number | null | undefined): string {
  return valueToFormat === null || valueToFormat === undefined ? '정보 없음' : `${(valueToFormat * 100).toFixed(1)}%`;
}

const SOURCE_LABELS: Record<string, string> = {
  DEFAULT: '기본값 (DEFAULT)',
  BLENDED: '혼합형 (BLENDED)',
  PERSONALIZED: '개인화 (PERSONALIZED)',
};

const FALLBACK_LABELS: Record<string, string> = {
  NO_USER: '사용자 정보 없음 (NO_USER)',
  NO_PERSONAL_SAMPLES: '개인 표본 없음 (NO_PERSONAL_SAMPLES)',
  PROFILE_SOURCE_ERROR: '프로필 출처 오류 (PROFILE_SOURCE_ERROR)',
};

const ACTION_LABELS: Record<string, string> = {
  KEEP: '유지 (KEEP)',
  SWITCH: '전환 (SWITCH)',
  ABANDON: '포기 (ABANDON)',
  SELECT: '선택 (SELECT)',
  NO_TARGET: '목표 없음 (NO_TARGET)',
};

const PHASE_LABELS: Record<string, string> = {
  IDLE: '대기 (IDLE)',
  REACTION: '반응 (REACTION)',
  TYPING: '입력 중 (TYPING)',
  CORRECTING: '수정 중 (CORRECTING)',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  BEGINNER: '초급 (BEGINNER)',
  NORMAL: '보통 (NORMAL)',
  HARD: '어려움 (HARD)',
};

function enumLabel(raw: unknown, labels: Record<string, string>): string {
  if (raw === null || raw === undefined) return '정보 없음';
  return labels[String(raw)] ?? String(raw);
}

function metricMetadata(
  profile: AiMonitorSnapshot['profile'],
  key: string,
): AiMonitorMetricMetadata | null {
  return profile.metricConfidence?.[key] ?? null;
}

function metricAvailability(metadata: AiMonitorMetricMetadata | null): string {
  if (!metadata) return '정보 없음';
  return metadata.available ? '사용 가능' : '데이터 없음';
}

function fallbackLabel(
  fallback: AiMonitorSnapshot['profile']['fallbackReason'],
): string {
  if (!fallback || fallback === 'NONE') return '정보 없음';
  return FALLBACK_LABELS[fallback] ?? String(fallback);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div style={styles.field}><span style={styles.label}>{label}</span><span>{children}</span></div>;
}

export default function AiMonitorPage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const normalizedRoomId = roomId.trim();
  const [snapshot, setSnapshot] = useState<AiMonitorSnapshot | null>(null);
  const [history, setHistory] = useState<AiMonitorDecisionHistoryEntry[]>([]);
  const [identity, setIdentity] = useState<MonitorIdentity | null>(null);
  const [status, setStatus] = useState(!normalizedRoomId ? '유효하지 않은 roomId' : (typeof BroadcastChannel === 'undefined' ? 'BroadcastChannel을 사용할 수 없습니다' : '게임 창 연결 대기 중'));
  const identityRef = useRef<MonitorIdentity | null>(null);
  const snapshotRef = useRef<AiMonitorSnapshot | null>(null);
  const terminalRef = useRef(false);

  useEffect(() => {
    if (!normalizedRoomId || typeof BroadcastChannel === 'undefined') {
      return undefined;
    }
    const channel = new BroadcastChannel(`ai-monitor:${normalizedRoomId}`);
    const requestId = newId();
    channel.onmessage = (event: MessageEvent<MonitorMessage>) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'READY') return;
      if (message.identity.roomId !== normalizedRoomId) return;

      if (message.type === 'LIFECYCLE') {
        const current = identityRef.current;
        if (current && sameLifecycle(current, message.identity)) {
          setIdentity(message.identity);
          return;
        }
        if (current && message.identity.issuedAt < current.issuedAt) return;
        identityRef.current = message.identity;
        setIdentity(message.identity);
        terminalRef.current = false;
        snapshotRef.current = null;
        setSnapshot(null);
        setHistory([]);
        setStatus('새 매치 연결 중');
        return;
      }

      if (message.type === 'FULL') {
        const currentIdentity = identityRef.current;
        if (currentIdentity && !sameLifecycle(currentIdentity, message.identity)) return;
        if (snapshotRef.current && message.snapshot.stateVersion <= snapshotRef.current.stateVersion) return;
        identityRef.current = message.identity;
        setIdentity(message.identity);
        terminalRef.current = false;
        snapshotRef.current = message.snapshot;
        setSnapshot(message.snapshot);
        setHistory(appendDecisionHistory([], { ...message.snapshot, kind: 'DECISION' }));
        setStatus('연결됨');
        return;
      }

      if (!identityRef.current || !sameLifecycle(message.identity, identityRef.current)) return;
      if (message.type === 'SNAPSHOT') {
        if (terminalRef.current) return;
        const previous = snapshotRef.current;
        if (message.patch.stateVersion <= (previous?.stateVersion ?? -1)) return;
        const merged = mergeAiMonitorSnapshot(previous, message.patch);
        if (!merged) return;
        snapshotRef.current = merged;
        setSnapshot(merged);
        if (message.patch.kind === 'TERMINAL') {
          terminalRef.current = true;
          setStatus('매치 종료 · 최종 상태');
        } else setStatus('연결됨');
        if (message.patch.kind === 'FULL' || message.patch.kind === 'DECISION') setHistory(previousHistory => appendDecisionHistory(previousHistory, { ...merged, kind: 'DECISION' }));
      } else if (message.type === 'MATCH_END') {
        setStatus('매치 종료 · 최종 상태');
      } else if (message.type === 'DISCONNECT') {
        if (terminalRef.current) return;
        setStatus('게임 창 연결 끊김 · 마지막 상태 표시');
      }
    };
    channel.postMessage({ type: 'READY', roomId: normalizedRoomId, requestId } satisfies MonitorMessage);
    return () => {
      channel.onmessage = null;
      channel.close();
    };
  }, [normalizedRoomId]);

  const close = () => {
    window.close();
    setStatus('이 창을 닫아 주세요');
  };

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div><div style={styles.kicker}>AI 모니터링</div><h1 style={styles.title}>AI 모니터 (AI Monitor)</h1><div style={styles.status}>{status}</div></div>
        <button type="button" onClick={close} style={styles.close}>닫기</button>
      </header>
      <div style={styles.identity}>방 ID (room): {value(normalizedRoomId)} · 매치 식별값 (matchEpoch): {identity ? `${identity.matchEpoch.slice(0, 8)} / ${identity.bridgeSessionId.slice(0, 8)}` : '정보 없음'}</div>
      {!snapshot || snapshot.roomId !== normalizedRoomId ? <section style={styles.empty}>현재 매치 snapshot을 기다리는 중입니다.</section> : (
        <>
          <section style={styles.grid}>
            <Card title="플레이어 프로필">
              <Field label="입력 속도 (WPM)">{value(snapshot.profile.wpm)}</Field><Field label="정확도">{percent(snapshot.profile.accuracy)}</Field>
              <Field label="반응 시간">{value(snapshot.profile.reactionTimeMs)} ms</Field><Field label="표본 수">{value(snapshot.profile.sampleCount)}</Field>
              <Field label="신뢰도">{percent(snapshot.profile.confidence)}</Field><Field label="프로필 출처">{enumLabel(snapshot.profile.source, SOURCE_LABELS)}</Field>
              <Field label="프로필 버전">{value(snapshot.profile.profileVersion)}</Field>
              <Field label="모집단 버전">{value(snapshot.profile.populationDefaultVersion)}</Field>
              <Field label="기본값 적용 사유">{fallbackLabel(snapshot.profile.fallbackReason)}</Field>
              <Field label="입력 속도 표본/신뢰도">{metricSummary(metricMetadata(snapshot.profile, 'wpm'))}</Field>
              <Field label="정확도 표본/신뢰도">{metricSummary(metricMetadata(snapshot.profile, 'accuracy'))}</Field>
              <Field label="반응 시간 표본/신뢰도">{metricSummary(metricMetadata(snapshot.profile, 'reactionTimeMs'))}</Field>
            </Card>
            <Card title="실행 프로필">
              <Field label="난이도">{enumLabel(snapshot.executionProfile.difficulty, DIFFICULTY_LABELS)}</Field><Field label="입력 속도 (WPM)">{value(snapshot.executionProfile.typingWpm)}</Field>
              <Field label="정확도">{percent(snapshot.executionProfile.accuracy)}</Field><Field label="반응 지연">{value(snapshot.executionProfile.reactionDelayMs)} ms</Field>
              <Field label="오타 확률">{percent(snapshot.executionProfile.typoProbability)}</Field><Field label="수정 지연">{value(snapshot.executionProfile.correctionDelayMs)} ms</Field>
              <Field label="포기 확률">{percent(snapshot.executionProfile.abandonProbability)}</Field>
            </Card>
            <Card title="현재 판단">
              <Field label="선택 행동">{enumLabel(snapshot.currentDecision.action, ACTION_LABELS)}</Field><Field label="행동 단계">{enumLabel(snapshot.currentDecision.phase, PHASE_LABELS)}</Field>
              <Field label="목표 단어">{value(snapshot.currentDecision.targetWordId)}</Field><Field label="이전 목표">{value(snapshot.currentDecision.previousTargetWordId)}</Field>
              <Field label="입력 횟수">{snapshot.completedKeystrokes} / {snapshot.totalKeystrokes}</Field><Field label="상태 버전 (stateVersion)">{snapshot.stateVersion}</Field>
            </Card>
            <Card title="행동 지표">
              <BehaviorMetric label="오타 확률" metadata={metricMetadata(snapshot.profile, 'typoProbability')} fallback={snapshot.profile.fallbackReason} />
              <BehaviorMetric label="수정 지연" metadata={metricMetadata(snapshot.profile, 'correctionDelayMs')} fallback={snapshot.profile.fallbackReason} />
              <BehaviorMetric label="포기 확률" metadata={metricMetadata(snapshot.profile, 'abandonProbability')} fallback={snapshot.profile.fallbackReason} />
              <BehaviorMetric label="짧은 단어 성능" metadata={metricMetadata(snapshot.profile, 'shortWordPerformance')} fallback={snapshot.profile.fallbackReason} />
              <BehaviorMetric label="중간 단어 성능" metadata={metricMetadata(snapshot.profile, 'mediumWordPerformance')} fallback={snapshot.profile.fallbackReason} />
              <BehaviorMetric label="긴 단어 성능" metadata={metricMetadata(snapshot.profile, 'longWordPerformance')} fallback={snapshot.profile.fallbackReason} />
              <div style={styles.muted}>단어 유형 선호: 정보 없음</div>
            </Card>
          </section>
          <Card title="후보 단어">
            <div style={styles.table}><div style={styles.tableRow}><b>단어</b><b>선택 가능</b><b>선택됨</b><b>효용</b><b>성공 확률</b><b>남은 시간</b></div>
              {snapshot.candidates.map(candidate => <div style={styles.tableRow} key={candidate.wordId}><span>{candidate.wordId}</span><span>{candidate.eligible ? '가능' : '불가'}</span><span>{candidate.selected ? '선택됨' : '미선택'}</span><span>{value(candidate.utility)}</span><span>{percent(candidate.successProbability)}</span><span>{value(candidate.remainingMs)} ms</span></div>)}
            </div>
          </Card>
          <Card title="최근 판단 기록">
            {history.length === 0 ? <div style={styles.muted}>정보 없음</div> : history.map(entry => <div style={styles.historyRow} key={entry.stateVersion}><span>#{entry.stateVersion}</span><span>{enumLabel(entry.action, ACTION_LABELS)}</span><span>{enumLabel(entry.phase, PHASE_LABELS)}</span><span>{value(entry.targetWordId)}</span></div>)}
          </Card>
          <div style={styles.notAvailable}>전략 · 거절 사유 · 예상 피해 · 선택 확률: 정보 없음</div>
        </>
      )}
    </main>
  );
}

function metricSummary(metadata: AiMonitorMetricMetadata | null): string {
  if (!metadata) return '정보 없음';
  return `${metadata.sampleCount} / ${percent(metadata.confidence)} (${metricAvailability(metadata)})`;
}

function BehaviorMetric({
  label,
  metadata,
  fallback,
}: {
  label: string;
  metadata: AiMonitorMetricMetadata | null;
  fallback: AiMonitorSnapshot['profile']['fallbackReason'];
}) {
  return (
    <Field label={label}>
      {metadata
        ? `${metricAvailability(metadata)} · ${metadata.sampleCount} 표본 · ${percent(metadata.confidence)}${metadata.available ? '' : ` · ${fallbackLabel(fallback)}`}`
        : `정보 없음 · ${fallbackLabel(fallback)}`}
    </Field>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section style={styles.card}><h2 style={styles.cardTitle}>{title}</h2>{children}</section>;
}

const styles = {
  page: { minHeight: '100dvh', boxSizing: 'border-box' as const, padding: 28, background: '#080b14', color: '#e2e8f5', fontFamily: "'JetBrains Mono', monospace" },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', maxWidth: 1200, margin: '0 auto 18px' },
  kicker: { color: '#b47cff', fontSize: 11, letterSpacing: '.14em' },
  title: { margin: '6px 0', fontFamily: "'Rajdhani', sans-serif", fontSize: 36 },
  status: { color: '#8a93a8', fontSize: 12 },
  close: { padding: '8px 14px', border: '1px solid rgba(255,255,255,.2)', borderRadius: 7, background: 'transparent', color: '#c7cede', cursor: 'pointer' },
  identity: { maxWidth: 1200, margin: '0 auto 14px', color: '#5c6a8a', fontSize: 11 },
  grid: { maxWidth: 1200, margin: '0 auto 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 },
  card: { maxWidth: 1200, margin: '0 auto 14px', padding: 18, border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, background: '#0d1220' },
  cardTitle: { margin: '0 0 14px', color: '#b47cff', fontSize: 14 },
  field: { display: 'flex', justifyContent: 'space-between', gap: 18, padding: '6px 0', fontSize: 12 },
  label: { color: '#8a93a8' },
  table: { overflowX: 'auto' as const, fontSize: 11 },
  tableRow: { display: 'grid', gridTemplateColumns: '1.5fr repeat(5, 1fr)', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' },
  historyRow: { display: 'grid', gridTemplateColumns: '80px 100px 110px 1fr', gap: 10, padding: '6px 0', fontSize: 11 },
  empty: { maxWidth: 1200, margin: '30px auto', padding: 50, textAlign: 'center' as const, color: '#8a93a8', border: '1px dashed rgba(255,255,255,.15)', borderRadius: 12 },
  muted: { color: '#8a93a8', fontSize: 12 },
  notAvailable: { maxWidth: 1200, margin: '20px auto', color: '#5c6a8a', fontSize: 11 },
};
