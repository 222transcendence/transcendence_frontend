import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { fetchChatHistory } from '../api/client';
import type { ChatMessage } from '../types/chat';

interface ChatPanelProps {
  currentUserId: string;
  /** 인게임 모드: roomId를 주면 해당 방 메시지만 필터 & 전송 */
  roomId?: string;
}

export default function ChatPanel({ currentUserId, roomId }: ChatPanelProps) {
  const isGame = !!roomId;
  const [isOpen, setIsOpen] = useState(isGame);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

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
        const filtered = roomId
          ? history.filter(m => m.roomId === roomId)
          : history.filter(m => !m.roomId);
        setMessages(filtered);
      } catch { /* non-fatal */ }
    });

    socket.on('receive_message', (msg: ChatMessage) => {
      const belongs = roomId ? msg.roomId === roomId : !msg.roomId;
      if (!belongs) return;
      setMessages(prev => [...prev, msg]);
      if (!isOpenRef.current) setUnread(n => n + 1);
    });

    socket.on('connect_error', () => socket.disconnect());

    socketRef.current = socket;
  }, [roomId]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const sendMessage = () => {
    const content = input.trim();
    if (!content || !socketRef.current?.connected) return;
    socketRef.current.emit('send_message', { content, type: 'NORMAL', roomId });
    setInput('');
  };

  if (isGame) {
    return (
      <div style={GS.panel}>
        <div style={GS.header}>
          <span style={GS.title}>대화</span>
        </div>
        <div style={GS.messages}>
          {messages.length === 0 && (
            <div style={GS.empty}>아직 메시지가 없습니다</div>
          )}
          {messages.map(msg => {
            const isMine = msg.sender.id === currentUserId;
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2 }}>
                {!isMine && (
                  <span style={GS.senderName}>{msg.sender.nickname}</span>
                )}
                <div style={{ ...GS.bubble, ...(isMine ? GS.bubbleMine : GS.bubbleOpp) }}>
                  {msg.content}
                </div>
                <span style={GS.time}>{formatTime(msg.createdAt)}</span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div style={GS.inputRow}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="메시지…"
            style={GS.input}
          />
          <button onClick={sendMessage} disabled={!input.trim()} style={{ ...GS.sendBtn, opacity: input.trim() ? 1 : 0.4 }}>↑</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setIsOpen(v => !v)}
        style={{ ...FS.fab, ...(unread > 0 ? FS.fabUnread : {}) }}
      >
        {isOpen ? '✕' : '💬'}
        {!isOpen && unread > 0 && <span style={FS.badge}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {/* Panel */}
      {isOpen && (
        <div style={FS.panel}>
          <div style={FS.header}>
            <span style={FS.title}>글로벌 채팅</span>
            <button onClick={() => setIsOpen(false)} style={FS.closeBtn}>✕</button>
          </div>
          <div style={FS.messages}>
            {messages.length === 0 && (
              <div style={FS.empty}>아직 메시지가 없습니다</div>
            )}
            {messages.map(msg => {
              const isMine = msg.sender.id === currentUserId;
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2 }}>
                  {!isMine && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ ...FS.miniAvatar, backgroundImage: msg.sender.avatar ? `url(${msg.sender.avatar})` : 'none' }} />
                      <span style={FS.senderName}>{msg.sender.nickname}</span>
                    </div>
                  )}
                  <div style={{ ...FS.bubble, ...(isMine ? FS.bubbleMine : FS.bubbleOpp) }}>
                    {msg.content}
                  </div>
                  <span style={FS.time}>{formatTime(msg.createdAt)}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div style={FS.inputRow}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="메시지 입력…"
              style={FS.input}
            />
            <button onClick={sendMessage} disabled={!input.trim()} style={{ ...FS.sendBtn, opacity: input.trim() ? 1 : 0.4 }}>전송</button>
          </div>
        </div>
      )}
    </>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// ── In-game panel styles ───────────────────────────────────────────────────────
const GS = {
  panel: {
    display: 'flex', flexDirection: 'column' as const,
    background: 'rgba(5,7,12,.85)', backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,.07)', borderRadius: 12,
    height: '100%', overflow: 'hidden',
  },
  header: {
    padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.07)',
    display: 'flex', alignItems: 'center',
  },
  title: {
    fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const,
    fontSize: 13, letterSpacing: '.08em', color: '#8a93a8',
  },
  messages: {
    flex: 1, overflowY: 'auto' as const, padding: '10px 12px',
    display: 'flex', flexDirection: 'column' as const, gap: 6,
  },
  empty: {
    fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
    color: '#3a4256', textAlign: 'center' as const, padding: '12px 0',
  },
  senderName: {
    fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5,
    color: '#5c6a8a', paddingLeft: 2,
  },
  bubble: {
    maxWidth: '85%', padding: '5px 9px', borderRadius: 8,
    fontFamily: "'Inter',sans-serif", fontSize: 12, lineHeight: 1.4,
    wordBreak: 'break-word' as const,
  },
  bubbleMine: { background: 'rgba(18,200,168,.15)', color: '#b2f0e8', borderBottomRightRadius: 3 },
  bubbleOpp: { background: 'rgba(255,255,255,.06)', color: '#c7cede', borderBottomLeftRadius: 3 },
  time: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#3a4256' },
  inputRow: {
    display: 'flex', borderTop: '1px solid rgba(255,255,255,.06)',
    padding: '7px 10px', gap: 6,
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 7, color: '#e2e8f5', padding: '5px 9px',
    fontFamily: "'Inter',sans-serif", fontSize: 12, outline: 'none',
  },
  sendBtn: {
    width: 28, height: 28, borderRadius: 7,
    border: '1px solid rgba(18,200,168,.4)', background: 'rgba(18,200,168,.1)',
    color: '#12c8a8', fontSize: 13, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
} as const;

// ── Floating (lobby) panel styles ─────────────────────────────────────────────
const FS = {
  fab: {
    position: 'fixed' as const, bottom: 24, right: 24, zIndex: 1000,
    width: 44, height: 44, borderRadius: '50%',
    border: '1px solid rgba(18,200,168,.4)', background: 'rgba(18,200,168,.12)',
    color: '#12c8a8', fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,.4)',
    transition: 'all .2s',
  },
  fabUnread: {
    borderColor: 'rgba(239,74,99,.6)', background: 'rgba(239,74,99,.12)', color: '#ef4a63',
  },
  badge: {
    position: 'absolute' as const, top: -4, right: -4,
    background: '#ef4a63', color: '#fff',
    fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 as const, fontSize: 9,
    width: 16, height: 16, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    position: 'fixed' as const, bottom: 78, right: 24, zIndex: 999,
    width: 320, height: 440,
    background: '#0a0e1a', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 14, display: 'flex', flexDirection: 'column' as const,
    boxShadow: '0 12px 40px rgba(0,0,0,.6)', overflow: 'hidden',
  },
  header: {
    padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.07)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  title: {
    fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const,
    fontSize: 14, letterSpacing: '.08em', color: '#c7cede',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#5c6a8a',
    fontSize: 14, cursor: 'pointer', padding: 0,
  },
  messages: {
    flex: 1, overflowY: 'auto' as const, padding: '10px 12px',
    display: 'flex', flexDirection: 'column' as const, gap: 8,
  },
  empty: {
    fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
    color: '#3a4256', textAlign: 'center' as const, padding: '16px 0',
  },
  miniAvatar: {
    width: 18, height: 18, borderRadius: '50%',
    background: '#1a2040', backgroundSize: 'cover', backgroundPosition: 'center',
    flex: 'none' as const,
  },
  senderName: {
    fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#12c8a8',
  },
  bubble: {
    maxWidth: '82%', padding: '6px 10px', borderRadius: 10,
    fontFamily: "'Inter',sans-serif", fontSize: 13, lineHeight: 1.4,
    wordBreak: 'break-word' as const,
  },
  bubbleMine: { background: 'rgba(18,200,168,.15)', color: '#b2f0e8', borderBottomRightRadius: 3 },
  bubbleOpp: { background: 'rgba(255,255,255,.06)', color: '#c7cede', borderBottomLeftRadius: 3 },
  time: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: '#3a4256' },
  inputRow: {
    display: 'flex', borderTop: '1px solid rgba(255,255,255,.07)',
    padding: '8px 10px', gap: 7,
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 8, color: '#e2e8f5', padding: '7px 11px',
    fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none',
  },
  sendBtn: {
    padding: '7px 14px', borderRadius: 8,
    border: '1px solid rgba(18,200,168,.4)', background: 'rgba(18,200,168,.1)',
    color: '#12c8a8', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 as const,
    fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
} as const;
