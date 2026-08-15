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
    const socket: Socket = io('/chat', {
      path: '/socketio',
      auth: (cb) => {
        getValidAccessToken().then(token => cb({ token: token ? `Bearer ${token}` : undefined }));
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));
    socket.on('connect_error', () => setConnectionState('error'));

    socketRef.current = socket;

    return () => {
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
