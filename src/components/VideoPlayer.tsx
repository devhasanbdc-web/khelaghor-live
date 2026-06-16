import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, 
  RotateCcw, Radio, Tv, Info, Heart 
} from 'lucide-react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
  onChannelError?: () => void;
}

export default function VideoPlayer({ 
  channel, 
  isFavorite, 
  onToggleFavorite,
  onNextChannel,
  onPrevChannel,
  onChannelError
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [availableQualities, setAvailableQualities] = useState<Array<{level: number, height: number}>>([]);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2800);
  };

  const triggerAutoNext = useCallback(() => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => {
      if (onChannelError && onNextChannel) {
        onChannelError();
        onNextChannel();
      }
    }, 2500);
  }, [onChannelError, onNextChannel]);

  // Load Stream with Auto Quality
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setErrorMsg(null);
    setIsPlaying(true);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = channel.url;
    if (!streamUrl) {
      setErrorMsg("No stream URL available");
      setIsLoading(false);
      return;
    }

    video.muted = isMuted;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 30,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 20,
        abrEwmaDefaultEstimate: 800000,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setAvailableQualities(hls.levels.map((l: any, i: number) => ({ level: i, height: l.height })));
        video.play().catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play();
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, level) => {
        const height = hls.levels[level]?.height || 'auto';
        setCurrentQuality(height === 'auto' ? 'auto' : `${height}p`);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setErrorMsg("Stream failed. Auto switching...");
          triggerAutoNext();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.load();
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [channel.url]);

  const changeQuality = (level: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level;
      setCurrentQuality(level === -1 ? 'auto' : `${hlsRef.current.levels[level]?.height || 720}p`);
    }
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.pause();
    else video.play();
    setIsPlaying(!isPlaying);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video rounded-2xl bg-zinc-950 overflow-hidden shadow-2xl border border-zinc-800"
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted={isMuted}
        onClick={handlePlayPause}
      />

      {/* Quality Selector */}
      <div className={`absolute top-4 right-4 z-30 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <select 
          value={currentQuality}
          onChange={(e) => {
            const val = e.target.value === 'auto' ? -1 : parseInt(e.target.value);
            changeQuality(val);
          }}
          className="bg-zinc-900/95 text-white text-xs px-4 py-2 rounded-xl border border-zinc-700 focus:outline-none"
        >
          <option value="auto">AUTO (Adaptive)</option>
          {availableQualities.map((q, i) => (
            <option key={i} value={q.level}>{q.height}p</option>
          ))}
        </select>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center">
            <Radio className="w-10 h-10 text-lime-400 animate-pulse mx-auto" />
            <p className="text-lime-400 mt-3">Loading Live Stream...</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-red-400">
            <Tv className="w-12 h-12 mx-auto mb-3" />
            <p>{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
