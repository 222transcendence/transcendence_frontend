import { useState } from 'react';
import styled from 'styled-components';

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
    <Wrapper>
      <OpenBtn type="button" onClick={open}>
        AI Monitor
      </OpenBtn>
      {blocked && (
        <FallbackLink href={fallbackUrl} target="_blank" rel="noreferrer">
          새 탭 열기
        </FallbackLink>
      )}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const OpenBtn = styled.button`
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid rgba(180, 124, 255, 0.45);
  background: rgba(180, 124, 255, 0.08);
  color: #b47cff;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
`;

const FallbackLink = styled.a`
  color: #eab308;
  font-size: 10px;
`;
