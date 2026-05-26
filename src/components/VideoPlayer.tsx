import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Users } from 'lucide-react';
import { supabase, PlaybackState } from '../lib/supabase';

interface VideoPlayerProps {
  roomId: string;
  videoUrl: string;
  videoName: string;
}

const SEEK_THRESHOLD = 2; // seconds — ignore updates within this delta

export default function VideoPlayer({ roomId, videoUrl, videoName }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [viewerCount, setViewerCount] = useState(1);
  const isSyncing = useRef(false); // prevent feedback loops
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcast = useRef(0);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Sync from remote state
  const applyRemoteState = useCallback((state: PlaybackState) => {
    const video = videoRef.current;
    if (!video) return;
    isSyncing.current = true;

    const diff = Math.abs(video.currentTime - state.position);
    if (diff > SEEK_THRESHOLD) {
      video.currentTime = state.position;
    }

    if (state.is_playing && video.paused) {
      video.play().catch(() => {});
    } else if (!state.is_playing && !video.paused) {
      video.pause();
    }

    setIsPlaying(state.is_playing);

    setTimeout(() => { isSyncing.current = false; }, 300);
  }, []);

  // Broadcast current state to channel
  const broadcast = useCallback((playing: boolean, position: number) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sync',
      payload: { is_playing: playing, position },
    });
  }, []);

  // Persist to DB (throttled)
  const persist = useCallback(async (playing: boolean, position: number) => {
    const now = Date.now();
    if (now - lastBroadcast.current < 500) return;
    lastBroadcast.current = now;

    await supabase
      .from('playback_state')
      .upsert(
        { room_id: roomId, is_playing: playing, position, updated_at: new Date().toISOString() },
        { onConflict: 'room_id' }
      );
  }, [roomId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Load initial state for late join
    supabase
      .from('playback_state')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) applyRemoteState(data as PlaybackState);
      });

    // Realtime channel
    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'sync' }, ({ payload }) => {
        if (!isSyncing.current) {
          applyRemoteState({ ...payload, room_id: roomId, id: '', updated_at: '' });
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, applyRemoteState]);

  const handlePlayPause = async () => {
    const video = videoRef.current;
    if (!video || isSyncing.current) return;

    const playing = video.paused;
    if (playing) {
      await video.play();
    } else {
      video.pause();
    }
    setIsPlaying(playing);
    broadcast(playing, video.currentTime);
    persist(playing, video.currentTime);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    if (!isSyncing.current && !video.paused) {
      const now = Date.now();
      if (now - lastBroadcast.current > 3000) {
        lastBroadcast.current = now;
        broadcast(!video.paused, video.currentTime);
        persist(!video.paused, video.currentTime);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
    broadcast(!video.paused, newTime);
    persist(!video.paused, newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.volume = v;
    setVolume(v);
    setMuted(v === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div className="w-full bg-black rounded-2xl overflow-hidden shadow-2xl group relative">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full aspect-video"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onPlay={() => { if (!isSyncing.current) setIsPlaying(true); }}
        onPause={() => { if (!isSyncing.current) setIsPlaying(false); }}
        onClick={handlePlayPause}
        playsInline
      />

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pt-8 pb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="relative h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 hover:h-2.5 transition-all duration-150"
        >
          {/* Buffered */}
          <div
            className="absolute h-full bg-white/30 rounded-full"
            style={{ width: `${bufferedPercent}%` }}
          />
          {/* Played */}
          <div
            className="absolute h-full bg-sky-400 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="text-white hover:text-sky-300 transition-colors"
          >
            {isPlaying
              ? <Pause className="w-5 h-5 fill-current" />
              : <Play className="w-5 h-5 fill-current" />
            }
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-white hover:text-sky-300 transition-colors">
              {muted || volume === 0
                ? <VolumeX className="w-4 h-4" />
                : <Volume2 className="w-4 h-4" />
              }
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 accent-sky-400 cursor-pointer"
            />
          </div>

          {/* Time */}
          <span className="text-white/70 text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Viewer count */}
          <div className="flex items-center gap-1.5 text-white/60 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{viewerCount}</span>
          </div>

          {/* Fullscreen */}
          <button onClick={handleFullscreen} className="text-white hover:text-sky-300 transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Video title */}
      <div className="absolute top-3 left-4 text-white/80 text-sm font-medium truncate max-w-[60%] opacity-0 group-hover:opacity-100 transition-opacity">
        {videoName}
      </div>
    </div>
  );
}
