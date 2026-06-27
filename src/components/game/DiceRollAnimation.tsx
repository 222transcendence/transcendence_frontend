import { useEffect, useState } from 'react';
import type { DiceRollResult } from '../../types/gameAnimation';

interface DiceRollAnimationProps {
  result: DiceRollResult;
  onComplete?: () => void;
}

const ROLL_DURATION_MS = 900;

export default function DiceRollAnimation({ result, onComplete }: DiceRollAnimationProps) {
  const [isRolling, setIsRolling] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRolling(false);
      onComplete?.();
    }, ROLL_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dice-roll">
      <div className={`dice-roll-dice ${isRolling ? 'dice-roll-dice--rolling' : ''}`}>
        {Array.from({ length: result.rolled }).map((_, index) => (
          <span key={index} className="dice-roll-die" style={{ animationDelay: `${index * 80}ms` }}>
            🎲
          </span>
        ))}
      </div>
      {!isRolling && (
        <div className="dice-roll-result">
          {result.success} / {result.rolled} 성공
        </div>
      )}
    </div>
  );
}
