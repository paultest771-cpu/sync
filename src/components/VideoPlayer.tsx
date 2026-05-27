import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Users, Wifi, ExternalLink, AlertCircle, Play as PlayIcon } from 'lucide-react';
import { supabase, PlaybackState } from '../lib/supabase';

interface VideoPlayerProps {
  roomId: string;
  videoUrl: string;
  videoName: string;
}

const SEEK_THRESHOLD = 1.5;

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
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing'>('synced');

  const isSyncing = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcast = useRef(0);
  const localAction = useRef(false);

  const [isEmbedded, setIsEmbedded] = useState(false);

  const getEmbedUrl = (url: string): { embedUrl: string; isEmbed: boolean } => {
    try {
      const urlObj = new URL(url);

      // Google Drive
      if (urlObj.hostname.includes('drive.google.com')) {
        const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          return {
            embedUrl: `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`,
            isEmbed: true
          };
        }
      }

      // Dropbox - convert to direct link
      if (urlObj.hostname.includes('dropbox.com')) {
        if (url.includes('dl=0') || url.includes('dl=1')) {
          return {
            embedUrl: url.replace(/dl=[01]/, 'dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com'),
            isEmbed: false
          };
        }
        return {
          embedUrl: url.replace('www.dropbox.com', 'dl.dropboxusercontent.com') + '?dl=1',
          isEmbed: false
        };
      }

      // OneDrive - get embed link
      if (urlObj.hostname.includes('onedrive.live.com') || urlObj.hostname.includes('1drv.ms')) {
        return {
          embedUrl: url + (url.includes('?') ? '&' : '?') + 'action=embed',
          isEmbed: true
        };
      }

      // Youtube
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        const videoId = urlObj.hostname.includes('youtu.be')
          ? urlObj.pathname.slice(1)
          : urlObj.searchParams.get('v');
        if (videoId) {
          return {
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
            isEmbed: true
          };
        }
      }

      // Direct video URL
      const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
      const isDirect = videoExts.some(ext => url.toLowerCase().includes(ext));
      return { embedUrl: url, isEmbed: false };
    } catch {
      return { embedUrl: url, isEmbed: false };
    }
  };

  const { embedUrl, isEmbed } = getEmbedUrl(videoUrl);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    setIsEmbedded(isEmbed);
  }, [isEmbed]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const applyRemoteState = useCallback((state: PlaybackState) => {
    if (isEmbedded) return;

    const video = videoRef.current;
    if (!video || localAction.current) return;

    isSyncing.current = true;
    setSyncStatus('syncing');

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

    setTimeout(() => {
      isSyncing.current = false;
      setSyncStatus('synced');
    }, 150);
  }, [isEmbedded]);

  const broadcast = useCallback((playing: boolean, position: number) => {
    if (isEmbedded) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sync',
      payload: { is_playing: playing, position },
    });
  }, [isEmbedded]);

  const persist = useCallback(async (playing: boolean, position: number) => {
    if (isEmbedded) return;
    const now = Date.now();
    if (now - lastBroadcast.current < 400) return;
    lastBroadcast.current = now;

    await supabase
      .from('playback_state')
      .upsert(
        { room_id: roomId, is_playing: playing, position, updated_at: new Date().toISOString() },
        { onConflict: 'room_id' }
      );
  }, [roomId, isEmbedded]);

  useEffect(() => {
    if (isEmbedded) {
      const channel = supabase.channel(`room:${roomId}`, {
        config: { presence: { key: crypto.randomUUID() } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          setViewerCount(Object.keys(state).length);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });

      channelRef.current = channel;
      return () => { channel.unsubscribe(); };
    }

    const video = videoRef.current;
    if (!video) return;

    video.load();

    supabase
      .from('playback_state')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          video.currentTime = (data as PlaybackState).position;
          if ((data as PlaybackState).is_playing) {
            video.play().catch(() => {});
            setIsPlaying(true);
          }
        }
      });

    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'sync' }, ({ payload }) => {
        if (!isSyncing.current && !localAction.current) {
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
  }, [roomId, videoUrl, applyRemoteState, isEmbedded]);

  const handlePlayPause = async () => {
    if (isEmbedded) return;

    const video = videoRef.current;
    if (!video) return;

    localAction.current = true;
    const playing = video.paused;
    if (playing) {
      await video.play();
    } else {
      video.pause();
    }
    setIsPlaying(playing);
    broadcast(playing, video.currentTime);
    persist(playing, video.currentTime);

    setTimeout(() => { localAction.current = false; }, 300);
  };

  const handleTimeUpdate = () => {
    if (isEmbedded) return;

    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    if (!isSyncing.current && !localAction.current && !video.paused) {
      const now = Date.now();
      if (now - lastBroadcast.current > 2000) {
        lastBroadcast.current = now;
        broadcast(true, video.currentTime);
        persist(true, video.currentTime);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEmbedded) return;

    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar) return;

    localAction.current = true;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
    setIsPlaying(!video.paused);
    broadcast(!video.paused, newTime);
    persist(!video.paused, newTime);

    setTimeout(() => { localAction.current = false; }, 300);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isEmbedded) return;

    const v = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
    setVolume(v);
    setMuted(v === 0);
  };

  const toggleMute = () => {
    if (isEmbedded) return;

    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleFullscreen = () => {
    const container = videoRef.current?.parentElement?.parentElement;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  // Embedded video (iframe)
  if (isEmbedded) {
    return (
      <div className="w-full bg-black rounded-2xl overflow-hidden shadow-2xl relative">
        <iframe
          src={embedUrl}
          className="w-full aspect-video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-white text-sm font-medium truncate max-w-xs">{videoName}</span>

              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                In neuem Tab oeffnen
              </a>
            </div>

            <div className="flex items-center gap-1.5 text-white/60 text-xs">
              <Users className="w-3.5 h-3.5" />
              <span>{viewerCount}</span>
            </div>
          </div>
        </div>

        <div className="absolute top-3 left-3">
          <div className="bg-black/60 backdrop-blur-sm text-amber-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Sync nicht verfuegbar
          </div>
        </div>
      </div>
    );
  }

  // Native video player
  return (
    <div className="w-full bg-black rounded-2xl overflow-hidden shadow-2xl group relative">
      <video
        ref={videoRef}
        src={embedUrl}
        className="w-full aspect-video"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onPlay={() => { if (!isSyncing.current) setIsPlaying(true); }}
        onPause={() => { if (!isSyncing.current) setIsPlaying(false); }}
        onClick={handlePlayPause}
        onDoubleClick={handleFullscreen}
        playsInline
        preload="metadata"
      />

      {/* Play overlay for paused state */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
          onClick={handlePlayPause}
        >
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <PlayIcon className="w-10 h-10 text-white fill-white" />
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-10 pb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="relative h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 hover:h-2.5 transition-all duration-150"
        >
          <div
            className="absolute h-full bg-white/30 rounded-full"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute h-full bg-sky-400 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayPause}
            className="text-white hover:text-sky-300 transition-colors"
          >
            {isPlaying
              ? <Pause className="w-5 h-5 fill-current" />
              : <Play className="w-5 h-5 fill-current" />
            }
          </button>

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

          <span className="text-white/70 text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 text-white/60 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{viewerCount}</span>
          </div>

          <div className={`flex items-center gap-1 text-xs ${syncStatus === 'synced' ? 'text-green-400' : 'text-amber-400'}`}>
            <Wifi className="w-3.5 h-3.5" />
          </div>

          <button onClick={handleFullscreen} className="text-white hover:text-sky-300 transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="absolute top-3 left-4 text-white/80 text-sm font-medium truncate max-w-[60%] opacity-0 group-hover:opacity-100 transition-opacity">
        {videoName}
      </div>
    </div>
  );
}
