import { useState } from 'react';
import PhaseBanner from '../../components/game/PhaseBanner';
import DiceRollAnimation from '../../components/game/DiceRollAnimation';
import DamageFloatingNumber from '../../components/game/DamageFloatingNumber';
import SkillEffectOverlay from '../../components/game/SkillEffectOverlay';
import GameEndModal from '../../components/game/GameEndModal';
import type {
  DamagePopup,
  DiceRollResult,
  GamePhase,
  SkillEffectTrigger,
} from '../../types/gameAnimation';

const PHASES: GamePhase[] = ['DRAW', 'MOVE', 'ATTACK', 'DEFENSE', 'RESULT'];

const MOCK_SUMMARY = {
  winnerNickname: 'host_player',
  loserNickname: 'guest_player',
  turnsPlayed: 5,
  finalHostHp: 12,
  finalGuestHp: 0,
};

export default function PhaseAnimationsDemoPage() {
  const [phase, setPhase] = useState<GamePhase>('DRAW');
  const [diceRollId, setDiceRollId] = useState(0);
  const [diceResult, setDiceResult] = useState<DiceRollResult | null>(null);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [skillTriggers, setSkillTriggers] = useState<SkillEffectTrigger[]>([]);
  const [showEndModal, setShowEndModal] = useState(false);

  const rollDice = () => {
    const rolled = 4;
    setDiceResult({ rolled, success: Math.floor(Math.random() * (rolled + 1)) });
    setDiceRollId((id) => id + 1);
  };

  const popDamage = (target: 'host' | 'guest') => {
    setDamagePopups((prev) => [
      ...prev,
      { id: crypto.randomUUID(), target, amount: Math.floor(Math.random() * 5) + 1 },
    ]);
  };

  const triggerSkill = (source: 'host' | 'guest') => {
    setSkillTriggers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), source, label: 'Power Strike!' },
    ]);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Phase / Result Animation Demo (#6)</h2>
      </div>
      <p>
        실제 게임 데이터와 연결되지 않은 데모 페이지입니다. 백엔드 게임 엔진 API와 게임 보드 UI(#5)가
        준비되면 실데이터 연동 작업이 별도로 진행됩니다.
      </p>

      <section style={{ marginTop: 24 }}>
        <h3>Phase Banner</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {PHASES.map((p) => (
            <button key={p} className="btn-secondary" onClick={() => setPhase(p)}>
              {p}
            </button>
          ))}
        </div>
        <PhaseBanner phase={phase} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Dice Roll</h3>
        <button className="btn-secondary" onClick={rollDice}>
          Roll Dice
        </button>
        {diceResult && <DiceRollAnimation key={diceRollId} result={diceResult} />}
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Damage Floating Number</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => popDamage('host')}>
            Hit Host
          </button>
          <button className="btn-secondary" onClick={() => popDamage('guest')}>
            Hit Guest
          </button>
        </div>
        <div style={{ position: 'relative', height: 80 }}>
          {damagePopups.map((popup) => (
            <DamageFloatingNumber
              key={popup.id}
              popup={popup}
              onDone={(id) => setDamagePopups((prev) => prev.filter((p) => p.id !== id))}
            />
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Skill Effect</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => triggerSkill('host')}>
            Host Skill
          </button>
          <button className="btn-secondary" onClick={() => triggerSkill('guest')}>
            Guest Skill
          </button>
        </div>
        <div style={{ position: 'relative', height: 80 }}>
          {skillTriggers.map((trigger) => (
            <SkillEffectOverlay
              key={trigger.id}
              trigger={trigger}
              onDone={(id) => setSkillTriggers((prev) => prev.filter((t) => t.id !== id))}
            />
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Game End Modal</h3>
        <button className="btn-secondary" onClick={() => setShowEndModal(true)}>
          Show Result
        </button>
        {showEndModal && (
          <GameEndModal
            summary={MOCK_SUMMARY}
            isWinner
            onRematch={() => setShowEndModal(false)}
            onBackToLobby={() => setShowEndModal(false)}
          />
        )}
      </section>
    </div>
  );
}
