import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LobbySocket } from '../api/lobbySocket';
import { fetchMyProfile } from '../api/client';
import type { Room } from '../types/lobby';
import { CHARACTERS } from '../data/characters';

function characterName(characterId: string): string {
  return CHARACTERS.find((c) => c.id === characterId)?.name ?? characterId;
}

export default function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const socketRef = useRef<LobbySocket | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!roomId) return;
    const socket = new LobbySocket();
    socketRef.current = socket;
    let isMounted = true;
    let isTransitioningToGame = false;

    const unsubscribers = [
      socket.on('ROOM_UPDATED', ({ room: updatedRoom }) => {
        if (isMounted && updatedRoom.id === roomId) setRoom(updatedRoom);
      }),
      socket.on('ROOM_CLOSED', ({ roomId: closedRoomId }) => {
        if (isMounted && closedRoomId === roomId) {
          setErrorMessage('The host has left the room.');
          setRoom(null);
        }
      }),
      socket.on('GAME_START', ({ roomId: startedRoomId }) => {
        if (startedRoomId === roomId) {
          isTransitioningToGame = true;
          // Battle UI is tracked separately (backend Epic #2 core game engine).
          navigate(`/game/${roomId}`);
        }
      }),
      socket.on('ACTION_REJECTED', ({ message }) => {
        if (isMounted) setErrorMessage(message);
      }),
    ];

    fetchMyProfile()
      .then((me) => {
        if (isMounted) setMyUserId(me.id);
      })
      .catch(() => undefined);

    socket
      .connect()
      .then(() => {
        if (!isMounted) return;
        socket.send('GET_ROOM', { roomId });
        setIsConnecting(false);
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Unable to connect to the lobby server.');
          setIsConnecting(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (!isTransitioningToGame) {
        socket.send('LEAVE_ROOM', { roomId });
      }
      socket.disconnect();
    };
  }, [roomId, navigate]);

  const myPlayer = room && (room.host.userId === myUserId ? room.host : room.guest);
  const isHost = room?.host.userId === myUserId;

  const toggleReady = () => {
    if (!roomId || !myPlayer) return;
    socketRef.current?.send('SET_READY', { roomId, ready: !myPlayer.ready });
  };

  if (isConnecting) {
    return (
      <div className="auth-container">
        <h2>Joining Room...</h2>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="auth-container">
        {errorMessage && <div className="alert-error">{errorMessage}</div>}
        <button className="btn-secondary" onClick={() => navigate('/lobby')}>
          Back to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Waiting Room</h2>
        <button className="btn-secondary" onClick={() => navigate('/lobby')}>
          Leave Room
        </button>
      </div>

      {errorMessage && <div className="alert-error">{errorMessage}</div>}

      <div className="dashboard-grid">
        <div className="stat-card">
          <h3>Host</h3>
          <p>{room.host.nickname}</p>
          <p>Character: {characterName(room.host.characterId)}</p>
          <span className="badge-status">{room.host.ready ? 'Ready' : 'Not Ready'}</span>
        </div>
        <div className="stat-card">
          <h3>Guest</h3>
          {room.guest ? (
            <>
              <p>{room.guest.nickname}</p>
              <p>Character: {characterName(room.guest.characterId)}</p>
              <span className="badge-status">{room.guest.ready ? 'Ready' : 'Not Ready'}</span>
            </>
          ) : (
            <p>Waiting for a guest to join...</p>
          )}
        </div>
      </div>

      {myPlayer && (
        <button type="button" className="btn-primary" style={{ marginTop: 24 }} onClick={toggleReady}>
          {myPlayer.ready ? 'Cancel Ready' : isHost ? 'Ready Up' : 'Ready'}
        </button>
      )}
    </div>
  );
}
