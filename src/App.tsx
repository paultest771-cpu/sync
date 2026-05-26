import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

function getRoomIdFromHash() {
  const hash = window.location.hash.slice(1);
  return hash || null;
}

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(getRoomIdFromHash);

  useEffect(() => {
    const handler = () => setRoomId(getRoomIdFromHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const enterRoom = (id: string) => {
    window.location.hash = id;
    setRoomId(id);
  };

  const goHome = () => {
    window.location.hash = '';
    setRoomId(null);
  };

  if (roomId) {
    return <RoomPage roomId={roomId} onBack={goHome} />;
  }

  return <HomePage onEnterRoom={enterRoom} />;
}
