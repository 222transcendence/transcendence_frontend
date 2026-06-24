import { useEffect } from 'react';
import type { SkillEffectTrigger } from '../../types/gameAnimation';

const EFFECT_DURATION_MS = 1200;

interface SkillEffectOverlayProps {
  trigger: SkillEffectTrigger;
  onDone: (id: string) => void;
}

export default function SkillEffectOverlay({ trigger, onDone }: SkillEffectOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(trigger.id), EFFECT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [trigger.id, onDone]);

  return (
    <div className={`skill-effect skill-effect--${trigger.source}`}>
      <span className="skill-effect-label">{trigger.label}</span>
    </div>
  );
}
