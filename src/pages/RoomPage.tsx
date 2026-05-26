import { useEffect, useState, useCallback } from 'react';
import { Link2, ArrowLeft, Users, Loader2 } from 'lucide-react';
import { supabase, Room } from '../lib/supabase';
import UploadZone from '../components/UploadZone';
import VideoPlayer from '../components/VideoPlayer';

interface RoomPageProps {
  roomId: string;
  onBack: () => void;
}

export default function RoomPage({ roomId, onBack }: RoomPageProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();
    setRoom(data as Room | null);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    load();

    // Subscribe to room changes (video uploaded by another user)
    const channel = supabase
      .channel(`room-meta:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [roomId, load]);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUploaded = (url: string, name: string) => {
    setRoom((r) => r ? { ...r, video_url: url, video_name: name } : r);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-white">
        <p className="text-slate-400">Raum nicht gefunden.</p>
        <button onClick={onBack} className="text-sky-400 hover:underline">Zurück</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="font-semibold truncate max-w-xs">{room.name}</span>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
            ${copied ? 'bg-green-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}
          `}
        >
          <Link2 className="w-4 h-4" />
          {copied ? 'Link kopiert!' : 'Link teilen'}
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-8">
        {room.video_url ? (
          <div className="w-full max-w-4xl">
            <VideoPlayer
              roomId={roomId}
              videoUrl={room.video_url}
              videoName={room.video_name ?? 'Video'}
            />
            <p className="mt-3 text-center text-slate-500 text-sm">
              Wiedergabe wird live mit allen Teilnehmern synchronisiert
            </p>
          </div>
        ) : (
          <div className="w-full max-w-xl">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-white mb-2">Noch kein Video hochgeladen</h2>
              <p className="text-slate-400 text-sm">
                Lade ein Video hoch — alle im Raum sehen es sofort.
              </p>
            </div>
            <UploadZone roomId={roomId} onUploaded={handleUploaded} />
          </div>
        )}
      </main>
    </div>
  );
}
