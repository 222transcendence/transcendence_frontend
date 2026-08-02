import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage } from '../types/chat';

interface InvitePopup {
  roomId: string;
  senderNickname: string;
}

export default function InviteNotification() {
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);
  const [invite, setInvite] = useState<InvitePopup | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io('/chat', {
      path: '/socketio',
      auth: { token: `Bearer ${token}` },
    });
    socketRef.current = socket;

    socket.on('receive_message', (msg: ChatMessage) => {
      if (msg.type !== 'INVITE') return;
      setInvite({ roomId: msg.content, senderNickname: msg.sender.nickname });
    });

    socket.on('connect_error', () => socket.disconnect());

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  if (!invite) return null;

  const handleAccept = () => {
    setInvite(null);
    navigate(`/lobby/${invite.roomId}`);
  };

  const handleDecline = () => setInvite(null);

  return (
    <div style={S.backdrop}>
      <div style={S.popup}>
        <div style={S.icon}>📩</div>
        <div style={S.title}>게임 초대</div>
        <div style={S.body}>
          <span style={S.sender}>{invite.senderNickname}</span> 님이 게임에 초대했습니다.
        </div>
        <div style={S.actions}>
          <button style={S.acceptBtn} onClick={handleAccept}>수락</button>
          <button style={S.declineBtn} onClick={handleDecline}>거절</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: 'fixed' as const,
    bottom: 24,
    right: 24,
    zIndex: 9999,
  },
  popup: {
    background: '#0d1220',
    border: '1px solid rgba(18,200,168,.3)',
    borderRadius: 14,
    padding: '20px 24px',
    minWidth: 260,
    boxShadow: '0 8px 32px rgba(0,0,0,.6), 0 0 20px rgba(18,200,168,.08)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  icon: {
    fontSize: 24,
    textAlign: 'center' as const,
  },
  title: {
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700 as const,
    fontSize: 16,
    color: '#12c8a8',
    textAlign: 'center' as const,
    letterSpacing: '.05em',
  },
  body: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: '#c7cede',
    textAlign: 'center' as const,
    lineHeight: 1.5,
  },
  sender: {
    color: '#e2e8f5',
    fontWeight: 600 as const,
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  acceptBtn: {
    flex: 1,
    padding: '9px 0',
    borderRadius: 9,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.12)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700 as const,
    fontSize: 14,
    cursor: 'pointer',
  },
  declineBtn: {
    flex: 1,
    padding: '9px 0',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,.1)',
    background: 'transparent',
    color: '#5c6a8a',
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 14,
    cursor: 'pointer',
  },
} as const;
