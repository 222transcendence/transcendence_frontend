import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { AiMonitorSnapshot } from '../types/acidRain';
import { appendDecisionHistory, mergeAiMonitorSnapshot, type AiMonitorDecisionHistoryEntry } from '../lib/aiMonitorSnapshot';
import type { MonitorMessage, MonitorIdentity } from '../hooks/useAiMonitorBridge';

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function sameLifecycle(left: MonitorIdentity, right: MonitorIdentity): boolean {
  return left.roomId === right.roomId && left.matchEpoch === right.matchEpoch;
}

function value(value: unknown): string {
  return value === null || value === undefined ? 'Not available' : String(value);
}

function percent(valueToFormat: number | null | undefined): string {
  return valueToFormat === null || valueToFormat === undefined ? 'Not available' : `${(valueToFormat * 100).toFixed(1)}%`;
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
        <div><div style={styles.kicker}>AI OBSERVABILITY</div><h1 style={styles.title}>AI Monitor</h1><div style={styles.status}>{status}</div></div>
        <button type="button" onClick={close} style={styles.close}>닫기</button>
      </header>
      <div style={styles.identity}>room: {value(normalizedRoomId)} · lifecycle: {identity ? `${identity.matchEpoch.slice(0, 8)} / ${identity.bridgeSessionId.slice(0, 8)}` : 'Not available'}</div>
      {!snapshot || snapshot.roomId !== normalizedRoomId ? <section style={styles.empty}>현재 매치 snapshot을 기다리는 중입니다.</section> : (
        <>
          <section style={styles.grid}>
            <Card title="Player profile">
              <Field label="WPM">{value(snapshot.profile.wpm)}</Field><Field label="Accuracy">{percent(snapshot.profile.accuracy)}</Field>
              <Field label="Reaction">{value(snapshot.profile.reactionTimeMs)} ms</Field><Field label="Samples">{value(snapshot.profile.sampleCount)}</Field>
              <Field label="Confidence">{percent(snapshot.profile.confidence)}</Field><Field label="Source">Not available</Field>
            </Card>
            <Card title="Execution profile">
              <Field label="Difficulty">{value(snapshot.executionProfile.difficulty)}</Field><Field label="Typing WPM">{value(snapshot.executionProfile.typingWpm)}</Field>
              <Field label="Accuracy">{percent(snapshot.executionProfile.accuracy)}</Field><Field label="Reaction delay">{value(snapshot.executionProfile.reactionDelayMs)} ms</Field>
              <Field label="Typo">{percent(snapshot.executionProfile.typoProbability)}</Field><Field label="Correction">{value(snapshot.executionProfile.correctionDelayMs)} ms</Field>
              <Field label="Abandon">{percent(snapshot.executionProfile.abandonProbability)}</Field>
            </Card>
            <Card title="Current decision">
              <Field label="Action">{value(snapshot.currentDecision.action)}</Field><Field label="Phase">{value(snapshot.currentDecision.phase)}</Field>
              <Field label="Target">{value(snapshot.currentDecision.targetWordId)}</Field><Field label="Previous">{value(snapshot.currentDecision.previousTargetWordId)}</Field>
              <Field label="Keystrokes">{snapshot.completedKeystrokes} / {snapshot.totalKeystrokes}</Field><Field label="stateVersion">{snapshot.stateVersion}</Field>
            </Card>
          </section>
          <Card title="Candidates">
            <div style={styles.table}><div style={styles.tableRow}><b>Word</b><b>Eligible</b><b>Selected</b><b>Utility</b><b>Success</b><b>Remaining</b></div>
              {snapshot.candidates.map(candidate => <div style={styles.tableRow} key={candidate.wordId}><span>{candidate.wordId}</span><span>{candidate.eligible ? 'true' : 'false'}</span><span>{candidate.selected ? 'true' : 'false'}</span><span>{value(candidate.utility)}</span><span>{percent(candidate.successProbability)}</span><span>{value(candidate.remainingMs)} ms</span></div>)}
            </div>
          </Card>
          <Card title="Recent decisions">
            {history.length === 0 ? <div style={styles.muted}>Not available</div> : history.map(entry => <div style={styles.historyRow} key={entry.stateVersion}><span>#{entry.stateVersion}</span><span>{entry.action}</span><span>{entry.phase}</span><span>{value(entry.targetWordId)}</span></div>)}
          </Card>
          <div style={styles.notAvailable}>Strategy · rejectionReason · expectedDamage · selectionProbability: Not available</div>
        </>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section style={styles.card}><h2 style={styles.cardTitle}>{title}</h2>{children}</section>;
}

const styles = {
  page: { minHeight: '100vh', boxSizing: 'border-box' as const, padding: 28, background: '#080b14', color: '#e2e8f5', fontFamily: "'JetBrains Mono', monospace" },
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
