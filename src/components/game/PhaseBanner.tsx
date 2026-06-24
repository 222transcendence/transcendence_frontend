import type { GamePhase } from '../../types/gameAnimation';

const PHASE_LABEL: Record<GamePhase, string> = {
  DRAW: 'Draw',
  MOVE: 'Move',
  ATTACK: 'Attack',
  DEFENSE: 'Defense',
  RESULT: 'Result',
};

interface PhaseBannerProps {
  phase: GamePhase;
}

export default function PhaseBanner({ phase }: PhaseBannerProps) {
  return (
    <div key={phase} className="phase-banner">
      {PHASE_LABEL[phase]}
    </div>
  );
}
