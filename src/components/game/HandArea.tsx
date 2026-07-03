import CardItem from './CardItem';

interface HandAreaProps {
  cardIds: number[];
  selectedIds: number[];
  disabled?: boolean;
  onSelect: (cardId: number) => void;
  onSubmit: () => void;
  waitingForOpponent?: boolean;
}

export default function HandArea({
  cardIds,
  selectedIds,
  disabled = false,
  onSelect,
  onSubmit,
  waitingForOpponent = false,
}: HandAreaProps) {
  const canSubmit = !disabled && selectedIds.length > 0 && !waitingForOpponent;

  return (
    <div className="hand-area">
      <div className="hand-area-cards">
        {cardIds.length === 0 ? (
          <p className="hand-area-empty">No cards in hand</p>
        ) : (
          cardIds.map((id) => (
            <CardItem
              key={id}
              cardId={id}
              isSelected={selectedIds.includes(id)}
              disabled={disabled || waitingForOpponent}
              onClick={onSelect}
            />
          ))
        )}
      </div>
      <div className="hand-area-actions">
        {waitingForOpponent ? (
          <p className="hand-area-waiting">Waiting for opponent...</p>
        ) : (
          <button
            type="button"
            className="btn-primary hand-area-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            Submit {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
