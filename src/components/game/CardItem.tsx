import type { CardType } from '../../types/game';

// Card type metadata — resolved when GET /api/game/cards is available (backend gap, tracked in backend#52)
const CARD_TYPE_META: Record<CardType, { label: string; color: string; icon: string }> = {
  MOVE: { label: 'Move', color: '#4facfe', icon: '👟' },
  ATK_SWORD: { label: 'Sword', color: '#ff6b6b', icon: '⚔️' },
  ATK_GUN: { label: 'Gun', color: '#ffa94d', icon: '🔫' },
  DEF: { label: 'Defense', color: '#51cf66', icon: '🛡️' },
  SPECIAL: { label: 'Special', color: '#cc5de8', icon: '✨' },
};

// Temporary: infer card type from ID until card metadata API is available
function inferCardType(cardId: number): CardType {
  const types: CardType[] = ['MOVE', 'ATK_SWORD', 'ATK_GUN', 'DEF', 'SPECIAL'];
  return types[cardId % 5];
}

interface CardItemProps {
  cardId: number;
  isSelected: boolean;
  disabled?: boolean;
  onClick: (cardId: number) => void;
}

export default function CardItem({ cardId, isSelected, disabled = false, onClick }: CardItemProps) {
  const type = inferCardType(cardId);
  const meta = CARD_TYPE_META[type];

  return (
    <button
      type="button"
      className={`card-item ${isSelected ? 'card-item--selected' : ''} ${disabled ? 'card-item--disabled' : ''}`}
      style={{ '--card-color': meta.color } as React.CSSProperties}
      onClick={() => !disabled && onClick(cardId)}
      disabled={disabled}
      title={`${meta.label} (ID: ${cardId})`}
    >
      <span className="card-item-icon">{meta.icon}</span>
      <span className="card-item-label">{meta.label}</span>
      <span className="card-item-id">#{cardId}</span>
    </button>
  );
}
