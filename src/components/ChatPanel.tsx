import { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { fetchChatHistory } from '../api/client';
import { useChatSocketContext } from '../context/ChatSocketContext';
import type { ChatMessage } from '../types/chat';

interface ChatPanelProps {
  currentUserId: string;
  /** 인게임 모드: roomId를 주면 해당 방 메시지만 필터 & 전송 */
  roomId?: string;
}

export default function ChatPanel({ currentUserId, roomId }: ChatPanelProps) {
  const isGame = !!roomId;
  const { socket } = useChatSocketContext();
  const [isOpen, setIsOpen] = useState(isGame);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef(isOpen);
  const isComposingRef = useRef(false);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  useEffect(() => {
    if (!socket) return;

    const loadHistory = async () => {
      try {
        const history = await fetchChatHistory();
        const filtered = roomId
          ? history.filter(m => m.roomId === roomId)
          : history.filter(m => !m.roomId);
        // 글로벌 채팅은 sessionStorage 캐시와 병합해 사라지지 않게 처리
        if (!roomId) {
          const cached = sessionStorage.getItem('globalChatMessages');
          const cachedMsgs: ChatMessage[] = cached ? JSON.parse(cached) : [];
          const merged = [...filtered];
          for (const m of cachedMsgs) {
            if (!merged.find(x => x.id === m.id)) merged.push(m);
          }
          merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          setMessages(merged);
        } else {
          setMessages(filtered);
        }
      } catch { /* non-fatal */ }
    };

    if (socket.connected) loadHistory();
    socket.on('connect', loadHistory);

    const handleMessage = (msg: ChatMessage) => {
      const belongs = roomId ? msg.roomId === roomId : !msg.roomId;
      if (!belongs) return;
      setMessages(prev => {
        const next = [...prev, msg];
        if (!roomId) {
          sessionStorage.setItem('globalChatMessages', JSON.stringify(next.slice(-200)));
        }
        return next;
      });
      if (!isOpenRef.current) setUnread(n => n + 1);
    };
    socket.on('receive_message', handleMessage);

    return () => {
      socket.off('connect', loadHistory);
      socket.off('receive_message', handleMessage);
    };
  }, [socket, roomId]);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const sendMessage = useCallback(() => {
    if (isComposingRef.current) return;
    const content = input.trim();
    if (!content || !socket?.connected) return;
    socket.emit('send_message', { content, type: 'NORMAL', roomId });
    setInput('');
  }, [input, roomId, socket]);

  if (isGame) {
    return (
      <GamePanel>
        <GameHeader>
          <GameTitle>대화</GameTitle>
        </GameHeader>
        <GameMessages>
          {messages.length === 0 && (
            <GameEmpty>아직 메시지가 없습니다</GameEmpty>
          )}
          {messages.map(msg => {
            const isMine = msg.sender.id === currentUserId;
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2 }}>
                {!isMine && (
                  <GameSenderName>{msg.sender.nickname}</GameSenderName>
                )}
                <GameBubble $mine={isMine}>
                  {msg.content}
                </GameBubble>
                <GameTime>{formatTime(msg.createdAt)}</GameTime>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </GameMessages>
        <GameInputRow>
          <GameInput
            value={input}
            onChange={e => setInput(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !isComposingRef.current) sendMessage(); }}
            placeholder="메시지…"
          />
          <GameSendBtn onClick={sendMessage} disabled={!input.trim()} style={{ opacity: input.trim() ? 1 : 0.4 }}>↑</GameSendBtn>
        </GameInputRow>
      </GamePanel>
    );
  }

  return (
    <>
      {/* FAB */}
      <Fab
        onClick={() => setIsOpen(v => !v)}
        $unread={unread > 0}
      >
        {isOpen ? '✕' : '💬'}
        {!isOpen && unread > 0 && <Badge>{unread > 9 ? '9+' : unread}</Badge>}
      </Fab>

      {/* Panel */}
      {isOpen && (
        <FloatPanel>
          <FloatHeader>
            <FloatTitle>글로벌 채팅</FloatTitle>
            <FloatCloseBtn onClick={() => setIsOpen(false)}>✕</FloatCloseBtn>
          </FloatHeader>
          <FloatMessages>
            {messages.length === 0 && (
              <FloatEmpty>아직 메시지가 없습니다</FloatEmpty>
            )}
            {messages.map(msg => {
              const isMine = msg.sender.id === currentUserId;
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2 }}>
                  {!isMine && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <MiniAvatar style={{ backgroundImage: msg.sender.avatar ? `url(${msg.sender.avatar})` : 'none' }} />
                      <FloatSenderName>{msg.sender.nickname}</FloatSenderName>
                    </div>
                  )}
                  <FloatBubble $mine={isMine}>
                    {msg.content}
                  </FloatBubble>
                  <FloatTime>{formatTime(msg.createdAt)}</FloatTime>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </FloatMessages>
          <FloatInputRow>
            <FloatInput
              value={input}
              onChange={e => setInput(e.target.value)}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !isComposingRef.current) sendMessage(); }}
              placeholder="메시지 입력…"
            />
            <FloatSendBtn onClick={sendMessage} disabled={!input.trim()} style={{ opacity: input.trim() ? 1 : 0.4 }}>전송</FloatSendBtn>
          </FloatInputRow>
        </FloatPanel>
      )}
    </>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// ── In-game panel styles ───────────────────────────────────────────────────────
const GamePanel = styled.div`
  display: flex;
  flex-direction: column;
  background: rgba(5, 7, 12, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  height: 100%;
  overflow: hidden;
`;

const GameHeader = styled.div`
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  align-items: center;
`;

const GameTitle = styled.span`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: #8a93a8;
`;

const GameMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const GameEmpty = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #3a4256;
  text-align: center;
  padding: 12px 0;
`;

const GameSenderName = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  color: #5c6a8a;
  padding-left: 2px;
`;

const GameBubble = styled.div<{ $mine: boolean }>`
  max-width: 85%;
  padding: 5px 9px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-word;
  ${p => (p.$mine
    ? 'background: rgba(18,200,168,.15); color: #b2f0e8; border-bottom-right-radius: 3px;'
    : 'background: rgba(255,255,255,.06); color: #c7cede; border-bottom-left-radius: 3px;')}
`;

const GameTime = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #3a4256;
`;

const GameInputRow = styled.div`
  display: flex;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 7px 10px;
  gap: 6px;
`;

const GameInput = styled.input`
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  color: #e2e8f5;
  padding: 5px 9px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  outline: none;
`;

const GameSendBtn = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid rgba(18, 200, 168, 0.4);
  background: rgba(18, 200, 168, 0.1);
  color: #12c8a8;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

// ── Floating (lobby) panel styles ─────────────────────────────────────────────
const Fab = styled.button<{ $unread: boolean }>`
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: all 0.2s;
  ${p => (p.$unread
    ? 'border: 1px solid rgba(239,74,99,.6); background: rgba(239,74,99,.12); color: #ef4a63;'
    : 'border: 1px solid rgba(18,200,168,.4); background: rgba(18,200,168,.12); color: #12c8a8;')}
`;

const Badge = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ef4a63;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 9px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const FloatPanel = styled.div`
  position: fixed;
  bottom: 78px;
  right: 24px;
  z-index: 999;
  width: 320px;
  height: 440px;
  background: #0a0e1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  overflow: hidden;
`;

const FloatHeader = styled.div`
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const FloatTitle = styled.span`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.08em;
  color: #c7cede;
`;

const FloatCloseBtn = styled.button`
  background: none;
  border: none;
  color: #5c6a8a;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
`;

const FloatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FloatEmpty = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #3a4256;
  text-align: center;
  padding: 16px 0;
`;

const MiniAvatar = styled.div`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1a2040;
  background-size: cover;
  background-position: center;
  flex: none;
`;

const FloatSenderName = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #12c8a8;
`;

const FloatBubble = styled.div<{ $mine: boolean }>`
  max-width: 82%;
  padding: 6px 10px;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
  ${p => (p.$mine
    ? 'background: rgba(18,200,168,.15); color: #b2f0e8; border-bottom-right-radius: 3px;'
    : 'background: rgba(255,255,255,.06); color: #c7cede; border-bottom-left-radius: 3px;')}
`;

const FloatTime = styled.span`
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  color: #3a4256;
`;

const FloatInputRow = styled.div`
  display: flex;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding: 8px 10px;
  gap: 7px;
`;

const FloatInput = styled.input`
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #e2e8f5;
  padding: 7px 11px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  outline: none;
`;

const FloatSendBtn = styled.button`
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(18, 200, 168, 0.4);
  background: rgba(18, 200, 168, 0.1);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
`;
