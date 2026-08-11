import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../types/gameSocket';
import { getValidAccessToken } from '../api/client';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface GameSocketContextValue {
  socket: GameSocket | null;
  connectionState: ConnectionState;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const GameSocketContext = createContext<GameSocketContextValue>({
  socket: null,
  connectionState: 'disconnected',
  connect: async () => {},
  disconnect: () => {},
});

export function GameSocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<GameSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnectionState('disconnected');
    }
  };

  const connect = async () => {
    if (socketRef.current?.connected) return;
    disconnect();

    setConnectionState('connecting');
    const token = (await getValidAccessToken()) ?? '';

    const socket: GameSocket = io('/game', {
      path: '/socketio',
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));
    socket.on('connect_error', () => setConnectionState('error'));

    socketRef.current = socket;
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <GameSocketContext.Provider
      value={{ socket: socketRef.current, connectionState, connect, disconnect }}
    >
      {children}
    </GameSocketContext.Provider>
  );
}

export function useGameSocketContext(): GameSocketContextValue {
  return useContext(GameSocketContext);
}
