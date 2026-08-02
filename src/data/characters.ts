export interface CharacterDef {
  id: number; // DB primary key (1=MAGE, 2=WARRIOR, 3=ROGUE)
  key: string;
  name: string;
  desc: string;
  color: string;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 2, key: 'warrior', name: '전사', desc: '근접 공격 위주, 높은 체력. 방어 카드 2장으로 Shield Bash 스킬 발동.', color: '#ef4a63' },
  { id: 1, key: 'mage',    name: '마법사', desc: '원거리 마법 공격, 특수 스킬 강화. Fireball·Curse 스킬 보유.', color: '#8b5cf6' },
  { id: 3, key: 'rogue',   name: '도적', desc: '기동성 중심. 이동 카드 2장으로 Shadowstep(이동력 +2) 발동.', color: '#12c8a8' },
];
