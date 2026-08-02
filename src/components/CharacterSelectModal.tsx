import { useState } from 'react';
import { CHARACTERS } from '../data/characters';

interface CharacterSelectModalProps {
  title: string;
  onConfirm: (characterId: number) => void;
  onCancel: () => void;
}

export default function CharacterSelectModal({ title, onConfirm, onCancel }: CharacterSelectModalProps) {
  const [selectedId, setSelectedId] = useState<number>(CHARACTERS[0]?.id ?? 1);

  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.title}>{title}</div>
        <div style={S.grid}>
          {CHARACTERS.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              style={{
                ...S.charBtn,
                borderColor: c.id === selectedId ? c.color : 'rgba(255,255,255,.1)',
                background: c.id === selectedId ? `${c.color}18` : 'transparent',
                boxShadow: c.id === selectedId ? `0 0 18px ${c.color}40` : 'none',
              }}
            >
              <div style={{ ...S.charDot, background: c.color }} />
              <div style={{ ...S.charName, color: c.id === selectedId ? c.color : '#e2e8f5' }}>{c.name}</div>
              <div style={S.charDesc}>{c.desc}</div>
            </button>
          ))}
        </div>
        <div style={S.actions}>
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => onConfirm(selectedId)}
            style={S.confirmBtn}
          >
            확인
          </button>
          <button type="button" onClick={onCancel} style={S.cancelBtn}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,.6)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#0d1220',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 16,
    padding: '28px 24px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 24px 60px rgba(0,0,0,.6)',
  },
  title: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 20,
    color: '#e2e8f5',
    marginBottom: 20,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  charBtn: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'border-color .15s, background .15s',
  },
  charDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    marginTop: 4,
    flex: 'none' as const,
  },
  charName: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 15,
    minWidth: 48,
  },
  charDesc: {
    fontFamily: "'Inter',sans-serif",
    fontSize: 11.5,
    color: '#5c6a8a',
    lineHeight: 1.5,
    flex: 1,
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 22,
  },
  confirmBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.12)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 14,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '10px 20px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'transparent',
    color: '#8a93a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 14,
    cursor: 'pointer',
  },
} as const;
