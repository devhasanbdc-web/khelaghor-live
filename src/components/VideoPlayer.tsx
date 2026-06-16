import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, 
  RotateCcw, Radio, Settings, Info, Heart, Wifi
} from 'lucide-react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
  onChannelError?: () => void;
  autoQuality?: boolean;
  internetSpeed?: number;
}

export default function VideoPlayer({ 
  channel, 
  isFavorite, 
  onToggleFavorite,
  onNextChannel,
  onPrevChannel,
  onChannelError,
  autoQuality = true,
  internetSpeed = 5
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showStats, setShowStats] = useState<boolean>(false);
  const [showQuality, setShowQuality] = useState<boolean>(false);
  const [stats, setStats] = useState({ fps: 0, dropped: 0, height: 0, width: 0 });
  const [currentQuality, setCurrentQuality] = useState<string>('Auto');
  const [availableQualities] = useState<string[]>(['Auto', '1080p', '720p', '480p', '360p']);
  const [retryCount, setRetryCount] = useState<number>(0);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  const getAutoQuality = (speed: number) => {
    if (speed > 20) return '1080p';
    if (speed > 10) return '720p';
    if (speed > 5) return '480p';
    return '360p';
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setErrorMsg(null);
    setIsPlaying(true);
    setRetryCount(0);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = channel.url;

    if (!streamUrl) {
      setErrorMsg("কোন স্ট্রিমিং লিঙ্ক পাওয়া যায়নি");
      setIsLoading(false);
      return;
    }

    video.muted = isMuted;

    let quality = autoQuality ? getAutoQuality(internetSpeed) : currentQuality;
    let finalStreamUrl = streamUrl;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 20,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15
      });
      hlsRef.current = hls;

      hls.loadSource(finalStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().then(() => setIsPlaying(true)).catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().then(() => setIsPlaying(true));
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn("HLS Error:", data);
        if (data.fatal) {
          if (retryCount < 3) {
            setRetryCount(prev => prev + 1);
            setTimeout(() => {
              hls.loadSource(finalStreamUrl);
              hls.attachMedia(video);
            }, 2000);
          } else {
            setErrorMsg("স্ট্রিম লোড করা যায়নি, পরবর্তী চ্যানেল খোলা হচ্ছে...");
            setIsLoading(false);
            if (onChannelError) {
              setTimeout(onChannelError, 2000);
            }
          }
        }
      });

      const statsInterval = setInterval(() => {
        if (video) {
          setStats({
            fps: (video as any).webkitDecodedFrameCount ? Math.round(((video as any).webkitDecodedFrameCount) / (video.currentTime || 1)) : 30,
            dropped: (video as any).webkitDroppedFrameCount || 0,
            height: video.videoHeight || 0,
            width: video.videoWidth || 0
          });
          if (autoQuality && internetSpeed > 0) {
            setCurrentQuality(getAutoQuality(internetSpeed));
          }
        }
      }, 2000);

      return () => {
        clearInterval(statsInterval);
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = finalStreamUrl;
      video.load();
      video.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        });
      });
    } else {
      setErrorMsg("আপনার ব্রাউজারে এই লাইভ স্ট্রিম প্লে করা সম্ভব নয়।");
      setIsLoading(false);
    }
  }, [channel.url, autoQuality, internetSpeed, currentQuality, retryCount]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => {
        setIsPlaying(true);
        setErrorMsg(null);
      }).catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => setIsPlaying(true));
      });
    }
    resetControlsTimeout();
  };

  const handleMuteToggle = () => {
    const video = videoRef.current;
    if (!video) return;

    const newMute = !isMuted;
    video.muted = newMute;
    setIsMuted(newMute);
    resetControlsTimeout();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    if (val === 0) {
      video.muted = true;
      setIsMuted(true);
    } else {
      video.muted = false;
      setIsMuted(false);
    }
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
    resetControlsTimeout();
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleRefresh = () => {
    const video = videoRef.current;
    if (!video) return;
    setErrorMsg(null);
    setIsLoading(true);
    setRetryCount(0);
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }
    const streamUrl = channel.url;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().then(() => setIsPlaying(true));
      });
    } else {
      video.src = streamUrl;
      video.load();
      video.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      });
    }
  };

  const handleQualityChange = (quality: string) => {
    setCurrentQuality(quality);
    setShowQuality(false);
    handleRefresh();
  };

  const getCountryEmoji = (code: string) => {
    if (!code || code === 'un') return '🌐';
    const codePoints = code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🌐';
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video rounded-2xl bg-zinc-950 overflow-hidden shadow-2xl border border-zinc-800 focus:outline-none group"
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain pointer-events-auto cursor-pointer"
        onClick={handlePlayPause}
        playsInline
        muted={isMuted}
      />

      {!isPlaying && !isLoading && !errorMsg && (
        <div 
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-zinc-950/45 cursor-pointer z-10 hover:bg-zinc-950/30 transition-all duration-300"
        >
          <div className="p-5 bg-lime-500 hover:bg-lime-400 text-zinc-950 hover:scale-110 active:scale-95 rounded-full shadow-2xl shadow-lime-500/30 transition duration-300 flex items-center justify-center relative">
            <Play className="w-8 h-8 fill-current translate-x-0.5" />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 z-20 backdrop-blur-sm">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-20 h-20 rounded-full border-4 border-lime-500/20 border-t-lime-400 border-r-lime-400 animate-spin" />
            <Radio className="w-8 h-8 text-lime-400 animate-pulse" />
          </div>
          <p className="mt-5 text-lime-400 font-mono text-sm tracking-widest animate-pulse">
            LOADING...
          </p>
          {internetSpeed > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-400">
              <Wifi className={`w-3 h-3 ${internetSpeed > 5 ? 'text-lime-400' : 'text-yellow-400'}`} />
              <span>{internetSpeed} Mbps</span>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 z-20 px-6 text-center">
          <div className="p-3 bg-red-950/50 rounded-full border border-red-500/30 text-red-400 mb-4">
            <Radio className="w-8 h-8" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">স্ট্রিম লোড করা যায়নি</h3>
          <p className="text-zinc-400 text-sm max-w-md mb-5">{errorMsg}</p>
          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-5 py-2.5 bg-lime-500 text-zinc-950 rounded-xl hover:bg-lime-400 active:scale-95 font-semibold text-xs transition"
            >
              <RotateCcw className="w-4 h-4" /> পুনরায় চেষ্টা
            </button>
            {onNextChannel && (
              <button
                onClick={onNextChannel}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-95 font-semibold text-xs transition"
              >
                পরবর্তী চ্যানেল
              </button>
            )}
          </div>
        </div>
      )}

      <div 
        className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-all duration-300 z-10 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900/90 border border-zinc-700 p-1 flex items-center justify-center overflow-hidden">
            {channel.logo ? (
              <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <Radio className="w-5 h-5 text-lime-400" />
            )}
          </div>
          <div>
            <h4 className="text-white font-semibold text-base">{channel.name}</h4>
            <p className="text-xs text-zinc-400">{channel.group || 'Live Sports'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded-lg border border-zinc-700/50">
            <Wifi className={`w-3 h-3 ${internetSpeed > 5 ? 'text-lime-400' : internetSpeed > 2 ? 'text-yellow-400' : 'text-red-400'}`} />
            <span className="text-[9px] font-mono text-zinc-300">{currentQuality}</span>
          </div>

          <button
            onClick={onToggleFavorite}
            className={`p-2.5 rounded-xl border transition-all duration-200 ${
              isFavorite ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-300 hover:text-white'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500' : ''}`} />
          </button>

          <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-lg border border-red-500 text-white font-bold text-xs uppercase tracking-widest animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {showStats && (
        <div className="absolute left-4 top-16 p-3 bg-zinc-950/90 backdrop-blur-md rounded-xl border border-lime-500/30 text-[10px] text-lime-400 font-mono space-y-1 z-10 w-48 shadow-lg">
          <p className="text-zinc-400 font-bold border-b border-zinc-800 pb-1 mb-1">DIAGNOSTICS</p>
          <p>Res: {stats.width}x{stats.height}</p>
          <p>FPS: {stats.fps}</p>
          <p>Dropped: {stats.dropped}</p>
          <p>Internet: {internetSpeed} Mbps</p>
          <p>Quality: {currentQuality}</p>
        </div>
      )}

      {showQuality && (
        <div className="absolute right-4 bottom-24 p-3 bg-zinc-950/95 backdrop-blur-md rounded-xl border border-lime-500/30 z-10 w-40 shadow-lg">
          <p className="text-zinc-400 font-bold text-[10px] border-b border-zinc-800 pb-1 mb-1">QUALITY</p>
          {availableQualities.map((q) => (
            <button
              key={q}
              onClick={() => handleQualityChange(q)}
              className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                q === currentQuality ? 'bg-lime-500/20 text-lime-400 font-bold' : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div 
        className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/45 to-transparent flex flex-col gap-3 transition-all duration-300 z-10 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="p-3 bg-lime-500 text-zinc-950 hover:bg-lime-400 rounded-full transition transform active:scale-90"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            <button
              onClick={handleRefresh}
              className="p-2 bg-zinc-900/80 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl transition"
            >
              <RotateCcw className="w-4.5 h-4.5" />
            </button>

            {onPrevChannel && (
              <button
                onClick={onPrevChannel}
                className="p-2 bg-zinc-900/80 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl transition text-xs font-mono"
              >
                ◀ PREV
              </button>
            )}
            {onNextChannel && (
              <button
                onClick={onNextChannel}
                className="p-2 bg-zinc-900/80 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl transition text-xs font-mono"
              >
                NEXT ▶
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowQuality(!showQuality)}
              className={`p-2 rounded-xl border transition ${
                showQuality ? 'bg-lime-500/20 border-lime-400/50 text-lime-400' : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white'
              }`}
            >
              <Settings className="w-4" />
            </button>

            <button
              onClick={() => setShowStats(!showStats)}
              className={`p-2 rounded-xl border transition ${
                showStats ? 'bg-lime-500/20 border-lime-400/50 text-lime-400' : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white'
              }`}
            >
              <Info className="w-4" />
            </button>

            <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-700/50 px-2.5 py-1.5 rounded-xl">
              <button onClick={handleMuteToggle} className="text-zinc-400 hover:text-white transition">
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-lime-400"
              />
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 bg-zinc-900/80 border border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition"
            >
              {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
