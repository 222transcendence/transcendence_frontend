import { useEffect } from 'react';
import type { DamagePopup } from '../../types/gameAnimation';

const FLOAT_DURATION_MS = 1000;

interface DamageFloatingNumberProps {
  popup: DamagePopup;
  onDone: (id: string) => void;
}

export default function DamageFloatingNumber({ popup, onDone }: DamageFloatingNumberProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(popup.id), FLOAT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [popup.id, onDone]);

  return (
    <div className={`damage-float damage-float--${popup.target}`}>
      -{popup.amount}
    </div>
  );
}
