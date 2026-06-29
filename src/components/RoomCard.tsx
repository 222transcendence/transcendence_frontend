import type { Room } from '../types/lobby';
import { CHARACTERS } from '../data/characters';

interface RoomCardProps {
  room: Room;
  onJoin: (room: Room) => void;
}

function characterName(characterId: string): string {
  return CHARACTERS.find((c) => c.id === characterId)?.name ?? characterId;
}

export default function RoomCard({ room, onJoin }: RoomCardProps) {
  const isFull = room.guest !== null || room.status !== 'WAITING';

  return (
    <div className="stat-card room-card">
      <div className="room-card-header">
        <h3>{room.host.nickname}'s Room</h3>
        <span className="badge-status">{room.status}</span>
      </div>
      <p>Host character: {characterName(room.host.characterId)}</p>
      <p>{room.guest ? `Guest: ${room.guest.nickname}` : 'Waiting for a guest...'}</p>
      <button
        type="button"
        className="btn-primary"
        disabled={isFull}
        onClick={() => onJoin(room)}
      >
        {isFull ? 'Full' : 'Join'}
      </button>
    </div>
  );
}
