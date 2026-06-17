import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, 
  RotateCcw, Radio, Tv, Settings, Check, Heart
} from 'lucide-react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
  onStreamError: (channelId: string) => void; 
}

export default function VideoPlayer({ 
  channel, 
  isFavorite, 
  onToggleFavorite,
  onNextChannel,
  onPrevChannel,
  onStreamError
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Core Media Controllers
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showControls, setShowControls] = useState<boolean>(true);
  
  // Adaptive / Manual Video Quality States
  const [qualities, setQualities] = useState<Array<{ id: number; name: string }>>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 targets Auto Adaptive Bitrate
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  // Handle stream initialization, fallback, error handling, and manual streaming profiles
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setErrorMsg(null);
    setIsPlaying(true);
    setQualities([]);
    setCurrentQuality(-1);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = channel.url;
    if (!streamUrl) {
      setErrorMsg("No streaming link matched.");
      setIsLoading(false);
      onStreamError(channel.id);
      return;
    }

    video.muted = isMuted;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 15,
        enableWorker: true,
        lowLatencyMode: true,
        abrEwmaDefaultEstimate: 5000000 // Force high fallback standard initially
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        
        // Dynamic Parsing of available streaming resolutions (Manual Quality Switcher profiles)
        const availableLevels = hls.levels.map((level, index) => ({
          id: index,
          name: level.height ? `${level.height}p` : `Profile ${index + 1}`
        }));
        setQualities(availableLevels);

        video.play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          });
      });

      // Stream Error intercept -> Triggers automatic sequential failover instantly
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("Network error encountered, attempting recovery load...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("Media decoding anomaly, attempting automatic recovery pipeline...");
              hls.recoverMediaError();
              break;
            default:
              console.error("Fatal unrecoverable HLS breakdown. Auto skipping dead link...");
              setIsLoading(false);
              hls.destroy();
              onStreamError(channel.id); // Triggers parent App component to auto-play next ssc
              break;
          }
        }
      });

      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    } 
    // Native Safari / Apple HLS Engine fallback strategy
    else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.load();
      video.play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().then(() => {
            setIsPlaying(true);
            setIsLoading(false);
          }).catch(() => {
            setIsLoading(false);
            onStreamError(channel.id);
          });
        });
    } else {
      setErrorMsg("HLS streaming format not natively supported on this browser profile.");
      setIsLoading(false);
      onStreamError(channel.id);
    }
  }, [channel.url]);

  // Quality profile switcher callback handler
  const changeVideoQuality = (levelId: number) => {
    if (!hlsRef.current) return;
    setCurrentQuality(levelId);
    hlsRef.current.currentLevel = levelId; // Assigning -1 forces immediate dynamic auto-adaptive mode back
    setShowQualityMenu(false);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true));
    }
    resetControlsTimeout();
  };

  const handleMuteToggle = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    videoRef.current.muted = nextMute;
    setIsMuted(nextMute);
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
    resetControlsTimeout();
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video rounded-2xl bg-zinc-950 overflow-hidden shadow-2xl border border-zinc-900 group"
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onClick={handlePlayPause}
        playsInline
      />

      {/* Floating Center Trigger Overlay */}
      {!isPlaying && !isLoading && (
        <div onClick={handlePlayPause} className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer z-10">
          <div className="p-4 bg-amber-500 text-zinc-950 rounded-full shadow-xl">
            <Play className="w-7 h-7 fill-current translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Adaptive Spinner Loading Canvas */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 z-20 backdrop-blur-sm">
          <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin mb-3" />
          <p className="text-xs font-mono tracking-wider text-amber-500 uppercase animate-pulse">Synchronizing Stadium Bitrates...</p>
        </div>
      )}

      {/* Controls Overlay UI Strip */}
      <div className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col gap-3 transition-all duration-300 z-10 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handlePlayPause} className="p-2.5 bg-amber-500 text-zinc-950 rounded-full transition">
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            {onPrevChannel && <button onClick={onPrevChannel} className="px-2 py-1.5 bg-zinc-900/90 border border-zinc-800 text-zinc-300 rounded-lg text-[10px] font-mono">PREV</button>}
            {onNextChannel && <button onClick={onNextChannel} className="px-2 py-1.5 bg-zinc-900/90 border border-zinc-800 text-zinc-300 rounded-lg text-[10px] font-mono">NEXT</button>}
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Manual Video Resolution / Bitrate Controller Widget */}
            {qualities.length > 0 && (
              <div className="relative">
                <button 
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="p-2 bg-zinc-900/90 border border-zinc-800 rounded-xl text-zinc-300 hover:text-white flex items-center gap-1 text-xs"
                  title="ভিডিও কোয়ালিটি সেট করুন"
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-mono text-[10px]">
                    {currentQuality === -1 ? "Auto" : qualities[currentQuality]?.name}
                  </span>
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-11 right-0 bg-zinc-950 border border-zinc-800 rounded-xl p-1.5 flex flex-col gap-1 w-28 z-30 shadow-2xl">
                    <button
                      onClick={() => changeVideoQuality(-1)}
                      className={`px-2 py-1 text-left text-[11px] rounded-lg font-mono flex items-center justify-between ${currentQuality === -1 ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400'}`}
                    >
                      <span>Auto (Adaptive)</span>
                      {currentQuality === -1 && <Check className="w-3 h-3" />}
                    </button>
                    {qualities.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => changeVideoQuality(q.id)}
                        className={`px-2 py-1 text-left text-[11px] rounded-lg font-mono flex items-center justify-between ${currentQuality === q.id ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400'}`}
                      >
                        <span>{q.name}</span>
                        {currentQuality === q.id && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleMuteToggle} className="text-zinc-400 hover:text-white">
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={toggleFullscreen} className="text-zinc-400 hover:text-white">
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
