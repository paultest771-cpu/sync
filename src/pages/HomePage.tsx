import { useState } from 'react';
import { Film, Plus, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface HomePageProps {
  onEnterRoom: (id: string) => void;
}

export default function HomePage({ onEnterRoom }: HomePageProps) {
  const [roomName, setRoomName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    const name = roomName.trim();
    if (!name) { setError('Bitte einen Raumnamen eingeben.'); return; }
    setCreating(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('rooms')
      .insert({ name })
      .select('id')
      .single();

    if (err || !data) {
      setError('Raum konnte nicht erstellt werden.');
      setCreating(false);
      return;
    }

    // Init playback state
    await supabase.from('playback_state').insert({
      room_id: data.id,
      is_playing: false,
      position: 0,
    });

    onEnterRoom(data.id);
  };

  const joinRoom = () => {
    const id = joinId.trim();
    if (!id) { setError('Bitte eine Raum-ID eingeben.'); return; }
    onEnterRoom(id);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-500/10 border border-sky-500/20 rounded-2xl mb-6">
          <Film className="w-8 h-8 text-sky-400" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Video schauen
        </h1>
        <p className="text-slate-400 text-lg max-w-sm mx-auto leading-relaxed">
          Lade ein Video hoch und schau es gemeinsam mit anderen — live synchronisiert.
        </p>
      </div>

      {/* Cards */}
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* Create */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-sky-400" />
            Neuen Raum erstellen
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Raumname..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createRoom()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
            <button
              onClick={createRoom}
              disabled={creating}
              className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Erstellen'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-slate-600 text-sm">oder</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Join */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-emerald-400" />
            Raum beitreten
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Raum-ID eingeben..."
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
            />
            <button
              onClick={joinRoom}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              Beitreten
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>

      {/* Features */}
      <div className="mt-16 grid grid-cols-3 gap-6 w-full max-w-md text-center">
        {[
          { label: 'Live-Sync', desc: 'Play, Pause & Seek sofort synchronisiert' },
          { label: 'Late-Join', desc: 'Später beitreten und sofort auf gleichen Stand' },
          { label: 'Fortschritt', desc: 'Upload-Fortschrittsanzeige in Echtzeit' },
        ].map((f) => (
          <div key={f.label} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">{f.label}</span>
            <span className="text-xs text-slate-500 leading-relaxed">{f.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
