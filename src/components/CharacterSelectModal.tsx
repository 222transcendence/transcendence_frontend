import { useState } from 'react';
import { CHARACTERS } from '../data/characters';

interface CharacterSelectModalProps {
  title: string;
  onConfirm: (characterId: string) => void;
  onCancel: () => void;
}

export default function CharacterSelectModal({
  title,
  onConfirm,
  onCancel,
}: CharacterSelectModalProps) {
  const [selectedId, setSelectedId] = useState(CHARACTERS[0]?.id ?? '');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="character-grid">
          {CHARACTERS.map((character) => (
            <button
              key={character.id}
              type="button"
              className={
                character.id === selectedId
                  ? 'character-option character-option-selected'
                  : 'character-option'
              }
              onClick={() => setSelectedId(character.id)}
            >
              {character.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedId}
            onClick={() => onConfirm(selectedId)}
          >
            Confirm
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
