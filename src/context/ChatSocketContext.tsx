import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getValidAccessToken } from '../api/client';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ChatSocketContextValue {
  socket: Socket | null;
  connectionState: ConnectionState;
}

const ChatSocketContext = createContext<ChatSocketContextValue>({
  socket: null,
  connectionState: 'disconnected',
});

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    let cancelled = false;
    const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

    // 토큰이 없으면(비로그인 페이지, 만료 직후 refresh 대기 등) 핸드셰이크
    // 자체를 시작하지 않고 기다린다 — engine.io는 이 콜백이 호출되기 전까지
    // 연결을 시도하지 않으므로, 여기서 미루면 "미인증 연결 → 서버가 즉시
    // disconnect → 클라이언트 재연결 반복" 루프가 원천적으로 생기지 않는다.
    const auth = (cb: (data: { token?: string }) => void) => {
      const tryAuth = () => {
        if (cancelled) return;
        getValidAccessToken().then(token => {
          if (cancelled) return;
          if (token) {
            cb({ token: `Bearer ${token}` });
          } else {
            const t = setTimeout(() => { pendingTimeouts.delete(t); tryAuth(); }, 2000);
            pendingTimeouts.add(t);
          }
        });
      };
      tryAuth();
    };

    const socket: Socket = io('/chat', {
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

    return () => {
      cancelled = true;
      pendingTimeouts.forEach(clearTimeout);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return (
    <ChatSocketContext.Provider value={{ socket: socketRef.current, connectionState }}>
      {children}
    </ChatSocketContext.Provider>
  );
}

export function useChatSocketContext(): ChatSocketContextValue {
  return useContext(ChatSocketContext);
}
