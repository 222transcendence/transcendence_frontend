import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LobbySocket } from '../api/lobbySocket';
import { fetchMyProfile } from '../api/client';
import CharacterSelectModal from '../components/CharacterSelectModal';
import RoomCard from '../components/RoomCard';
import type { Room } from '../types/lobby';

export default function LobbyPage() {
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const awaitingOwnRoomRef = useRef(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [pendingJoinRoom, setPendingJoinRoom] = useState<Room | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  useEffect(() => {
    const socket = new LobbySocket();
    socketRef.current = socket;
    let isMounted = true;

    const unsubscribers = [
      socket.on('ROOM_LIST', ({ rooms: roomList }) => {
        if (isMounted) setRooms(roomList);
      }),
      socket.on('ROOM_UPDATED', ({ room }) => {
        if (!isMounted) return;
        setRooms((prev) => {
          const index = prev.findIndex((r) => r.id === room.id);
          if (index === -1) return [...prev, room];
          const next = [...prev];
          next[index] = room;
          return next;
        });

        if (awaitingOwnRoomRef.current && room.host.userId === myUserIdRef.current) {
          awaitingOwnRoomRef.current = false;
          navigate(`/lobby/${room.id}`);
        }
      }),
      socket.on('ROOM_CLOSED', ({ roomId }) => {
        if (!isMounted) return;
        setRooms((prev) => prev.filter((r) => r.id !== roomId));
      }),
      socket.on('ACTION_REJECTED', ({ message }) => {
        if (isMounted) setConnectionError(message);
      }),
    ];

    fetchMyProfile()
      .then((me) => {
        myUserIdRef.current = me.id;
      })
      .catch(() => undefined);

    socket
      .connect()
      .then(() => {
        if (!isMounted) return;
        socket.send('LIST_ROOMS', {});
        setIsConnecting(false);
      })
      .catch(() => {
        if (isMounted) {
          setConnectionError('Unable to connect to the lobby server.');
          setIsConnecting(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      socket.disconnect();
    };
  }, [navigate]);

  const handleCreateRoom = (characterId: string) => {
    awaitingOwnRoomRef.current = true;
    socketRef.current?.send('CREATE_ROOM', { characterId });
    setIsCreatingRoom(false);
  };

  const handleJoinRoom = (characterId: string) => {
    if (!pendingJoinRoom) return;
    socketRef.current?.send('JOIN_ROOM', { roomId: pendingJoinRoom.id, characterId });
    navigate(`/lobby/${pendingJoinRoom.id}`);
    setPendingJoinRoom(null);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Game Lobby</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsCreatingRoom(true)}
            disabled={isConnecting}
          >
            Create Room
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>

      {connectionError && <div className="alert-error">{connectionError}</div>}

      {isConnecting ? (
        <p>Connecting to lobby...</p>
      ) : rooms.length === 0 ? (
        <p>No rooms yet. Create one to start playing!</p>
      ) : (
        <div className="room-list">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} onJoin={setPendingJoinRoom} />
          ))}
        </div>
      )}

      {isCreatingRoom && (
        <CharacterSelectModal
          title="Choose your character"
          onConfirm={handleCreateRoom}
          onCancel={() => setIsCreatingRoom(false)}
        />
      )}

      {pendingJoinRoom && (
        <CharacterSelectModal
          title={`Join ${pendingJoinRoom.host.nickname}'s Room`}
          onConfirm={handleJoinRoom}
          onCancel={() => setPendingJoinRoom(null)}
        />
      )}
    </div>
  );
}
