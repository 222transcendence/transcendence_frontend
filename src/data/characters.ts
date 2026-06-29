import type { Character } from '../types/lobby';

// TODO: replace with GET /api/characters once the backend exposes the Character entity (Epic backend#2).
export const CHARACTERS: Character[] = [
  { id: 'magician', name: 'Magician' },
  { id: 'knight', name: 'Knight' },
  { id: 'gunner', name: 'Gunner' },
];
