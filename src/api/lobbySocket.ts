import type { LobbyClientMessage, LobbyServerMessage } from '../types/lobby';

interface InboundEnvelope {
  type: string;
  payload: unknown;
  seq: number;
}

type Listener = (payload: unknown) => void;

export class LobbySocket {
  private ws: WebSocket | null = null;
  private seq = 0;
  private listeners = new Map<string, Set<Listener>>();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('accessToken');
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${protocol}://${window.location.host}/ws/lobby?token=${encodeURIComponent(token ?? '')}`;

      const socket = new WebSocket(url);
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Failed to connect to lobby'));
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as InboundEnvelope;
          this.listeners.get(message.type)?.forEach((handler) => handler(message.payload));
        } catch {
          // ignore malformed messages
        }
      };

      this.ws = socket;
    });
  }

  on<K extends keyof LobbyServerMessage>(
    type: K,
    handler: (payload: LobbyServerMessage[K]) => void,
  ): () => void {
    const listener = handler as Listener;
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  send<K extends keyof LobbyClientMessage>(type: K, payload: LobbyClientMessage[K]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq += 1;
    this.ws.send(JSON.stringify({ type, payload, seq: this.seq }));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}
