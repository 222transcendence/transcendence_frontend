import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { fetchChatHistory, fetchUserProfile } from '../api/client';
import type { ChatMessage } from '../types/chat';
import type { PublicUserProfile } from '../types/user';

interface ChatPanelProps {
  currentUserId: string;
  onInviteAccept?: (roomId: string) => void;
}

interface ProfilePopup {
  user: PublicUserProfile;
  x: number;
  y: number;
}

export default function ChatPanel({ currentUserId, onInviteAccept }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [popup, setPopup] = useState<ProfilePopup | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || socketRef.current?.connected) return;

    const socket = io('/chat', {
      path: '/socketio',
      auth: { token: `Bearer ${token}` },
    });

    socket.on('connect', async () => {
      try {
        const history = await fetchChatHistory();
        setMessages(history);
      } catch {
        // history load failure is non-fatal
      }
    });

    socket.on('receive_message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('connect_error', () => {
      socket.disconnect();
    });

    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => {
    if (isOpen) connect();
    else disconnect();
    return disconnect;
  }, [isOpen, connect, disconnect]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage() {
    const content = input.trim();
    if (!content || !socketRef.current?.connected) return;
    socketRef.current.emit('send_message', { content, type: 'NORMAL' });
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') sendMessage();
  }

  async function handleNicknameClick(
    e: React.MouseEvent,
    senderId: string,
  ) {
    e.stopPropagation();
    try {
      const user = await fetchUserProfile(senderId);
      setPopup({ user, x: e.clientX, y: e.clientY });
    } catch {
      // ignore
    }
  }

  function handleInviteAccept(msg: ChatMessage) {
    try {
      const payload = JSON.parse(msg.content) as { roomId: string };
      onInviteAccept?.(payload.roomId);
    } catch {
      // malformed invite — ignore
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          padding: '10px 18px',
          borderRadius: 24,
          background: '#4f46e5',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {isOpen ? '✕ 채팅 닫기' : '💬 채팅'}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 72,
            right: 24,
            width: 340,
            height: 480,
            background: '#1e1e2e',
            border: '1px solid #3b3b5c',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
          onClick={() => setPopup(null)}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #3b3b5c',
              fontWeight: 700,
              color: '#e2e2f0',
              fontSize: 15,
            }}
          >
            글로벌 채팅
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {messages.map((msg) => {
              const isMine = msg.sender.id === currentUserId;
              const isInvite = msg.type === 'INVITE';
              const time = new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMine ? 'flex-end' : 'flex-start',
                  }}
                >
                  {!isMine && (
                    <button
                      onClick={(e) => handleNicknameClick(e, msg.sender.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#a5b4fc',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                        marginBottom: 2,
                        padding: 0,
                      }}
                    >
                      {msg.sender.nickname}
                    </button>
                  )}
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '6px 10px',
                      borderRadius: 10,
                      background: isInvite
                        ? '#312e81'
                        : isMine
                        ? '#4f46e5'
                        : '#2a2a3e',
                      color: '#e2e2f0',
                      fontSize: 13,
                    }}
                  >
                    {isInvite ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span>🎮 게임 초대</span>
                        {!isMine && (
                          <button
                            onClick={() => handleInviteAccept(msg)}
                            style={{
                              marginTop: 4,
                              padding: '3px 10px',
                              background: '#4ade80',
                              color: '#14532d',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            수락
                          </button>
                        )}
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{time}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              display: 'flex',
              borderTop: '1px solid #3b3b5c',
              padding: '8px 10px',
              gap: 8,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지 입력..."
              style={{
                flex: 1,
                background: '#2a2a3e',
                border: '1px solid #3b3b5c',
                borderRadius: 8,
                color: '#e2e2f0',
                padding: '6px 10px',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              style={{
                padding: '6px 14px',
                background: '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                opacity: input.trim() ? 1 : 0.5,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              전송
            </button>
          </div>
        </div>
      )}

      {/* Profile popup */}
      {popup && (
        <div
          style={{
            position: 'fixed',
            top: popup.y,
            left: popup.x,
            zIndex: 2000,
            background: '#1e1e2e',
            border: '1px solid #3b3b5c',
            borderRadius: 10,
            padding: '12px 16px',
            minWidth: 180,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            color: '#e2e2f0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <img
              src={popup.user.avatar || '/default_avatar.png'}
              alt="avatar"
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
            />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{popup.user.nickname}</span>
          </div>
          <div style={{ fontSize: 12, color: '#a5b4fc' }}>
            승: {popup.user.wins} / 패: {popup.user.losses}
          </div>
          <button
            onClick={() => setPopup(null)}
            style={{
              marginTop: 8,
              padding: '3px 10px',
              background: '#3b3b5c',
              color: '#e2e2f0',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            닫기
          </button>
        </div>
      )}
    </>
  );
}
