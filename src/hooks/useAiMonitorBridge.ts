import { useCallback, useEffect, useRef } from 'react';
import type {
  AiMonitorSnapshot,
  AiMonitorSnapshotPatch,
  AcidRainServerEvents,
} from '../types/acidRain';
import { mergeAiMonitorSnapshot } from '../lib/aiMonitorSnapshot';

interface MonitorIdentity {
  roomId: string;
  bridgeSessionId: string;
  matchEpoch: string;
  issuedAt: number;
}

type MonitorMessage =
  | { type: 'READY'; roomId: string; requestId: string }
  | { type: 'LIFECYCLE'; identity: MonitorIdentity }
  | { type: 'SNAPSHOT'; identity: MonitorIdentity; patch: AiMonitorSnapshotPatch }
  | { type: 'FULL'; identity: MonitorIdentity; requestId?: string; snapshot: AiMonitorSnapshot }
  | { type: 'MATCH_END'; identity: MonitorIdentity }
  | { type: 'DISCONNECT'; identity: MonitorIdentity };

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useAiMonitorBridge(roomId: string) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const bridgeSessionIdRef = useRef(newId());
  const identityRef = useRef<MonitorIdentity | null>(null);
  const snapshotRef = useRef<AiMonitorSnapshot | null>(null);
  const terminalRef = useRef(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectChannelRef = useRef<BroadcastChannel | null>(null);
  const matchReadyKeyRef = useRef('');
  const matchEndedRef = useRef(false);
  const roomRef = useRef('');

  useEffect(() => {
    if (!roomId || typeof BroadcastChannel === 'undefined') return undefined;
    if (roomRef.current && roomRef.current !== roomId) {
      bridgeSessionIdRef.current = newId();
      identityRef.current = null;
      snapshotRef.current = null;
      terminalRef.current = false;
      matchReadyKeyRef.current = '';
      matchEndedRef.current = false;
    }
    roomRef.current = roomId;
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectChannelRef.current?.close();
    disconnectChannelRef.current = null;
    const channel = new BroadcastChannel(`ai-monitor:${roomId}`);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<MonitorMessage>) => {
      const message = event.data;
      if (message?.type === 'LIFECYCLE') {
        const current = identityRef.current;
        if (!current || (!snapshotRef.current && !terminalRef.current)) identityRef.current = message.identity;
        return;
      }
      if (message?.type !== 'READY' || message.roomId !== roomId) return;
      const identity = identityRef.current;
      const snapshot = snapshotRef.current;
      if (!identity || !snapshot) return;
      channel.postMessage({ type: 'FULL', identity, requestId: message.requestId, snapshot } satisfies MonitorMessage);
    };

    return () => {
      channel.onmessage = null;
      const identity = identityRef.current;
      if (identity) {
        disconnectChannelRef.current = channel;
        disconnectTimerRef.current = setTimeout(() => {
          channel.postMessage({ type: 'DISCONNECT', identity } satisfies MonitorMessage);
          channel.close();
          disconnectChannelRef.current = null;
          disconnectTimerRef.current = null;
        }, 1500);
      } else channel.close();
      channelRef.current = null;
    };
  }, [roomId]);

  const onMatchReady = useCallback((data: Parameters<AcidRainServerEvents['match_ready']>[0]) => {
    if (data.roomId !== roomId) return;
    const matchReadyKey = `${data.protocolVersion}:${data.participants.map(participant => participant.participantId).sort().join(',')}`;
    if (identityRef.current && !terminalRef.current && !matchEndedRef.current && matchReadyKeyRef.current === matchReadyKey) return;
    matchReadyKeyRef.current = matchReadyKey;
    const identity: MonitorIdentity = {
      roomId,
      bridgeSessionId: bridgeSessionIdRef.current,
      matchEpoch: newId(),
      issuedAt: Date.now(),
    };
    identityRef.current = identity;
    snapshotRef.current = null;
    terminalRef.current = false;
    matchEndedRef.current = false;
    channelRef.current?.postMessage({ type: 'LIFECYCLE', identity } satisfies MonitorMessage);
  }, [roomId]);

  const onMatchStart = useCallback((startAt: string) => {
    const current = identityRef.current;
    if (!current) return;
    const identity: MonitorIdentity = { ...current, matchEpoch: `start:${startAt}` };
    if (identity.matchEpoch === current.matchEpoch) return;
    identityRef.current = identity;
    terminalRef.current = false;
    matchEndedRef.current = false;
    channelRef.current?.postMessage({ type: 'LIFECYCLE', identity } satisfies MonitorMessage);
    if (snapshotRef.current) channelRef.current?.postMessage({ type: 'FULL', identity, snapshot: snapshotRef.current } satisfies MonitorMessage);
  }, []);

  const onSnapshot = useCallback((patch: AiMonitorSnapshotPatch) => {
    if (patch.roomId !== roomId) return;
    let identity = identityRef.current;
    if (!identity) {
      identity = { roomId, bridgeSessionId: bridgeSessionIdRef.current, matchEpoch: `snapshot:${patch.timestamp}`, issuedAt: Date.now() };
      identityRef.current = identity;
      matchReadyKeyRef.current = '';
      matchEndedRef.current = false;
      channelRef.current?.postMessage({ type: 'LIFECYCLE', identity } satisfies MonitorMessage);
    }
    if (!identity || terminalRef.current) return;
    if (patch.stateVersion <= (snapshotRef.current?.stateVersion ?? -1)) return;
    const snapshot = mergeAiMonitorSnapshot(snapshotRef.current, patch);
    if (!snapshot) return;
    snapshotRef.current = snapshot;
    matchEndedRef.current = false;
    if (patch.kind === 'TERMINAL') terminalRef.current = true;
    channelRef.current?.postMessage({ type: 'SNAPSHOT', identity, patch } satisfies MonitorMessage);
  }, [roomId]);

  const onMatchEnd = useCallback(() => {
    const identity = identityRef.current;
    if (!identity) return;
    matchEndedRef.current = true;
    channelRef.current?.postMessage({ type: 'MATCH_END', identity } satisfies MonitorMessage);
  }, []);

  const openMonitor = useCallback(() => {
    const url = `/game/${encodeURIComponent(roomId)}/ai-monitor`;
    const popup = window.open(url, `ai-monitor-${roomId}`, 'popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes');
    return popup !== null;
  }, [roomId]);

  return { onMatchReady, onMatchStart, onSnapshot, onMatchEnd, openMonitor };
}

export type { MonitorIdentity, MonitorMessage };
