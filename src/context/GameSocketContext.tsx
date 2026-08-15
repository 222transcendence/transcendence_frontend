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
  const pendingAuthTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const clearPendingAuth = () => {
    pendingAuthTimeoutsRef.current.forEach(clearTimeout);
    pendingAuthTimeoutsRef.current.clear();
  };

  const disconnect = () => {
    clearPendingAuth();
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

    // 토큰이 없으면(만료 직후 refresh 대기 등) 핸드셰이크를 시작하지 않고
    // 기다린다 — engine.io는 이 콜백이 호출되기 전까지 socket.io 네임스페이스
    // CONNECT 패킷을 보내지 않으므로, 미인증 상태로 연결→서버가 즉시
    // disconnect→재연결 반복(#chat과 동일한 클래스의 버그, ChatSocketContext
    // 참고)이 원천적으로 생기지 않는다. 정적 auth 객체 대신 함수로 넘겨서
    // 재연결 시도마다 토큰을 새로 가져오게 한다.
    const auth = (cb: (data: { token?: string }) => void) => {
      const tryAuth = () => {
        getValidAccessToken().then(token => {
          if (token) {
            cb({ token });
          } else {
            const t = setTimeout(() => { pendingAuthTimeoutsRef.current.delete(t); tryAuth(); }, 2000);
            pendingAuthTimeoutsRef.current.add(t);
          }
        });
      };
      tryAuth();
    };

    const socket: GameSocket = io('/game', {
      path: '/socketio',
      auth,
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
      clearPendingAuth();
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
