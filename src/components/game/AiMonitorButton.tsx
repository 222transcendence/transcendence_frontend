import { useState } from 'react';

interface AiMonitorButtonProps {
  roomId: string;
  onOpen: () => boolean;
}

export default function AiMonitorButton({ roomId, onOpen }: AiMonitorButtonProps) {
  const [blocked, setBlocked] = useState(false);
  const fallbackUrl = `/game/${encodeURIComponent(roomId)}/ai-monitor`;

  const open = () => {
    setBlocked(!onOpen());
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={open}
        style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(180,124,255,.45)', background: 'rgba(180,124,255,.08)', color: '#b47cff', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5 }}
      >
        AI Monitor
      </button>
      {blocked && (
        <a href={fallbackUrl} target="_blank" rel="noreferrer" style={{ color: '#eab308', fontSize: 10 }}>
          새 탭 열기
        </a>
      )}
    </div>
  );
}
