import type { CardInfo } from '../../api/client';

type CardSize = 'sm' | 'md' | 'lg';

interface ActionCardProps {
  card: CardInfo;
  size?: CardSize;
  selected?: boolean;
  faded?: boolean;
  showBack?: boolean;
  onClick?: (card: CardInfo) => void;
}

const DIMS: Record<CardSize, { w: number; h: number; fs: number; fsLabel: number; fsRar: number }> = {
  sm: { w: 64,  h: 88,  fs: 15, fsLabel: 7,  fsRar: 8  },
  md: { w: 96,  h: 132, fs: 20, fsLabel: 9,  fsRar: 9  },
  lg: { w: 128, h: 176, fs: 26, fsLabel: 11, fsRar: 10 },
};

const TYPE_META: Record<CardInfo['type'], { color: string; label: string }> = {
  MOVE:      { color: '#8b5cf6', label: 'MOVE'    },
  ATK_SWORD: { color: '#ef4444', label: 'SWORD'   },
  ATK_GUN:   { color: '#22c55e', label: 'GUN'     },
  DEF:       { color: '#3b82f6', label: 'SHIELD'  },
  SPECIAL:   { color: '#eab308', label: 'SPECIAL' },
};

function cardRarity(card: CardInfo): 'C' | 'UC' | 'R' | 'UR' {
  const v = card.valueTop;
  if (v >= 5) return 'UR';
  if (v === 4) return 'R';
  if (v === 3) return 'UC';
  return 'C';
}

const RARITY_META = {
  C:  { color: '#64748b', glow: 'none' },
  UC: { color: '#10b981', glow: '0 0 10px rgba(16,185,129,.35)' },
  R:  { color: '#3b82f6', glow: '0 0 12px rgba(59,130,246,.45)' },
  UR: { color: '#a855f7', glow: '0 0 16px rgba(168,85,247,.6)'  },
};

export default function ActionCard({ card, size = 'md', selected = false, faded = false, showBack = false, onClick }: ActionCardProps) {
  const d = DIMS[size];
  const t = TYPE_META[card.type] || TYPE_META.MOVE;
  const rar = cardRarity(card);
  const r = RARITY_META[rar];
  const iconSize = d.w * 0.34;

  const iconStyle = ((): React.CSSProperties => {
    switch (card.type) {
      case 'MOVE':
        return { width: 0, height: 0, borderTop: `${iconSize * 0.32}px solid transparent`, borderBottom: `${iconSize * 0.32}px solid transparent`, borderLeft: `${iconSize * 0.52}px solid ${t.color}` };
      case 'ATK_SWORD':
        return { width: iconSize * 0.66, height: iconSize * 0.66, background: t.color, transform: 'rotate(45deg)', boxShadow: `0 0 10px ${t.color}55` };
      case 'ATK_GUN':
        return { width: iconSize * 0.62, height: iconSize * 0.62, borderRadius: '50%', background: t.color, boxShadow: `0 0 10px ${t.color}55` };
      case 'DEF':
        return { width: iconSize * 0.7, height: iconSize * 0.72, background: t.color, clipPath: 'polygon(50% 0%, 100% 18%, 100% 60%, 50% 100%, 0% 60%, 0% 18%)' };
      case 'SPECIAL':
        return { width: iconSize * 0.62, height: iconSize * 0.62, borderRadius: '50%', border: `${iconSize * 0.14}px solid ${t.color}`, boxSizing: 'border-box' };
    }
  })();

  return (
    <div
      onClick={() => onClick?.(card)}
      style={{
        position: 'relative',
        width: d.w,
        height: d.h,
        borderRadius: 10,
        border: `2px solid ${r.color}`,
        boxShadow: r.glow,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        opacity: faded ? 0.38 : 1,
        transition: 'transform .15s ease, box-shadow .15s ease',
        transform: selected ? 'translateY(-8px)' : 'translateY(0)',
        background: '#111827',
        flex: 'none',
      }}
    >
      {showBack ? (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#182236,#0a0e17)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: d.w * 0.3, height: d.w * 0.3, background: 'rgba(18,200,168,.18)', border: '1px solid rgba(18,200,168,.5)', transform: 'rotate(45deg)' }} />
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg,${t.color}1c,#111827 82%)` }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: d.w * 0.08 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: d.fs, color: '#e2e8f5', lineHeight: 1 }}>{card.valueTop}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: d.fsRar, color: r.color, border: `1px solid ${r.color}`, borderRadius: 4, padding: '1px 4px' }}>{rar}</span>
          </div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: d.w * 0.09, height: d.h - d.fs * 3.4 }}>
            <div style={iconStyle} />
            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, letterSpacing: '.1em', fontSize: d.fsLabel, color: t.color }}>{t.label}</span>
          </div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', padding: d.w * 0.08, opacity: 0.35 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: d.fs * 0.6, color: '#8a93a8' }}>{card.valueBottom}</span>
          </div>
        </>
      )}
      {selected && (
        <div style={{ position: 'absolute', inset: -2, borderRadius: 12, border: '2px solid #12c8a8', boxShadow: '0 0 14px rgba(18,200,168,.55)', pointerEvents: 'none' }} />
      )}
    </div>
  );
}
