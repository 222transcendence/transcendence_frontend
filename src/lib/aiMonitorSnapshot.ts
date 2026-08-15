import type {
  AiMonitorSnapshot,
  AiMonitorSnapshotPatch,
} from '../types/acidRain';

export const MAX_AI_MONITOR_HISTORY = 20;

export interface AiMonitorDecisionHistoryEntry {
  stateVersion: number;
  timestamp: string;
  action: AiMonitorSnapshot['currentDecision']['action'];
  phase: AiMonitorSnapshot['currentDecision']['phase'];
  targetWordId: string | null;
}

export function mergeAiMonitorSnapshot(
  current: AiMonitorSnapshot | null,
  patch: AiMonitorSnapshotPatch,
): AiMonitorSnapshot | null {
  if (patch.kind === 'FULL') {
    if (!patch.currentDecision || !patch.profile || !patch.executionProfile || !patch.candidates
      || patch.completedKeystrokes === undefined || patch.totalKeystrokes === undefined) return null;
    return {
      roomId: patch.roomId,
      participantId: patch.participantId,
      stateVersion: patch.stateVersion,
      timestamp: patch.timestamp,
      kind: 'FULL',
      currentDecision: patch.currentDecision,
      profile: patch.profile,
      executionProfile: patch.executionProfile,
      candidates: patch.candidates,
      completedKeystrokes: patch.completedKeystrokes,
      totalKeystrokes: patch.totalKeystrokes,
    };
  }

  if (!current || patch.roomId !== current.roomId || patch.participantId !== current.participantId) return null;
  return {
    ...current,
    stateVersion: patch.stateVersion,
    timestamp: patch.timestamp,
    kind: 'FULL',
    ...(patch.currentDecision !== undefined ? { currentDecision: patch.currentDecision } : {}),
    ...(patch.profile !== undefined ? { profile: patch.profile } : {}),
    ...(patch.executionProfile !== undefined ? { executionProfile: patch.executionProfile } : {}),
    ...(patch.candidates !== undefined ? { candidates: patch.candidates } : {}),
    ...(patch.completedKeystrokes !== undefined ? { completedKeystrokes: patch.completedKeystrokes } : {}),
    ...(patch.totalKeystrokes !== undefined ? { totalKeystrokes: patch.totalKeystrokes } : {}),
  };
}

export function appendDecisionHistory(
  history: AiMonitorDecisionHistoryEntry[],
  snapshot: AiMonitorSnapshot,
): AiMonitorDecisionHistoryEntry[] {
  if (snapshot.kind !== 'FULL' && snapshot.kind !== 'DECISION') return history;
  if (history.some(entry => entry.stateVersion === snapshot.stateVersion)) return history;
  return [
    {
      stateVersion: snapshot.stateVersion,
      timestamp: snapshot.timestamp,
      action: snapshot.currentDecision.action,
      phase: snapshot.currentDecision.phase,
      targetWordId: snapshot.currentDecision.targetWordId,
    },
    ...history,
  ].slice(0, MAX_AI_MONITOR_HISTORY);
}
