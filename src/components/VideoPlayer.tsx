import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, 
  RotateCcw, Shield, Radio, Tv, Settings, Info, Heart, Wifi
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
  internetSpeed = 0
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // States
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
  const [availableQualities, setAvailableQualities] = useState<string[]>(['Auto', '4K', '1080p', '720p', '480p', '360p']);
  const [retryCount, setRetryCount] = useState<number>(0);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide controls handler
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

  // Determine quality based on internet speed
  const getAutoQuality = (speed: number) => {
    if (speed > 20) return '4K';
    if (speed > 10) return '1080p';
    if (speed > 5) return '720p';
    if (speed > 2) return '480p';
    return '360p';
  };

  // Handle HLS stream loading and native fallback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset state
    setIsLoading(true);
    setErrorMsg(null);
    setIsPlaying(true);
    setRetryCount(0);

    // Destroy existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = channel.url;

    if (!streamUrl) {
      setErrorMsg("কোন স্ট্রিমিং লিঙ্ক পাওয়া যায়নি (No stream URL found)");
      setIsLoading(false);
      return;
    }

    // Match HTML video audio status immediately
    video.muted = isMuted;

    // Set quality based on auto or manual
    let quality = autoQuality ? getAutoQuality(internetSpeed) : currentQuality;
    
    // If quality is not Auto, we can add quality parameters to the URL if supported
    let finalStreamUrl = streamUrl;
    if (quality !== 'Auto' && quality !== '4K') {
      // Some streams support quality parameters
      // This is a simplified example - actual implementation depends on stream provider
      const qualityMap: {[key: string]: string} = {
        '1080p': '1080',
        '720p': '720',
        '480p': '480',
        '360p': '360'
      };
      if (qualityMap[quality]) {
        finalStreamUrl = streamUrl.includes('?') 
          ? `${streamUrl}&quality=${qualityMap[quality]}`
          : `${streamUrl}?quality=${qualityMap[quality]}`;
      }
    }

    // 1. Robust Chrome/Firefox cross-browser HLS support (Prefer Hls.js first)
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
        video.play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch((playErr) => {
            console.warn("Autoplay blocked, trying automatic muted play:", playErr);
            video.muted = true;
            setIsMuted(true);
            video.play()
              .then(() => {
                setIsPlaying(true);
              })
              .catch((muteErr) => {
                console.warn("Muted play also blocked. Awaiting user tap:", muteErr);
                setIsPlaying(false);
              });
          });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn("HLS Error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("Fatal network error, trying helper recovery...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("Fatal media error, trying helper recovery...");
              hls.recoverMediaError();
              break;
            default:
              // Try to recover by reloading
              if (retryCount < 3) {
                setRetryCount(prev => prev + 1);
                console.log(`Retry attempt ${retryCount + 1}/3`);
                setTimeout(() => {
                  hls.loadSource(finalStreamUrl);
                  hls.attachMedia(video);
                }, 2000);
              } else {
                setErrorMsg("লাইভ সম্প্রচারটি সাময়িকভাবে অনুপলব্ধ। স্বয়ংক্রিয়ভাবে পরবর্তী চ্যানেল খোলা হচ্ছে...");
                setIsLoading(false);
                // Call onChannelError to auto-play next channel
                if (onChannelError) {
                  setTimeout(onChannelError, 3000);
                }
                hls.destroy();
              }
              break;
          }
        }
      });

      // Stats monitoring
      const statsInterval = setInterval(() => {
        if (video) {
          setStats({
            fps: (video as any).webkitDecodedFrameCount ? Math.round(((video as any).webkitDecodedFrameCount) / video.currentTime) : 30,
            dropped: (video as any).webkitDroppedFrameCount || 0,
            height: video.videoHeight || 0,
            width: video.videoWidth || 0
          });
          
          // Update quality based on internet speed if auto is enabled
          if (autoQuality && internetSpeed > 0) {
            const newQuality = getAutoQuality(internetSpeed);
            setCurrentQuality(newQuality);
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
    } 
    // 2. Safari / iOS / Native HTML5 player (Fallback secondary preference)
    else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = finalStreamUrl;
      video.load();
      video.play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch((err) => {
          console.warn("Native play blocked, attempting muted mode:", err);
          video.muted = true;
          setIsMuted(true);
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
            })
            .catch((muteErr) => {
              console.warn("Native muted autoplay also blocked:", muteErr);
              setIsPlaying(false);
              setIsLoading(false);
              // Try next channel if error persists
              if (onChannelError) {
                setTimeout(onChannelError, 3000);
              }
            });
        });
    } else {
      setErrorMsg("আপনার ব্রাউজারে এই লাইভ স্ট্রিম প্লে করা সম্ভব নয়। অন্য ব্রাউজারে চেষ্টা করুন।");
      setIsLoading(false);
    }
  }, [channel.url, autoQuality, internetSpeed, currentQuality, retryCount]);

  // Video Action handlers
  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play()
        .then(() => {
          setIsPlaying(true);
          setErrorMsg(null);
        })
        .catch(() => {
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
    if (!newMute && volume === 0) {
      video.volume = 0.5;
      setVolume(0.5);
    }
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
      container.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(err => console.error("Error going fullscreen:", err));
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(err => console.error("Error exiting fullscreen:", err));
    }
    resetControlsTimeout();
  };

  // Monitor fullscreen change events
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
    // Reload stream with new quality
    if (hlsRef.current) {
      const video = videoRef.current;
      if (!video) return;
      
      const streamUrl = channel.url;
      const qualityMap: {[key: string]: string} = {
        '1080p': '1080',
        '720p': '720',
        '480p': '480',
        '360p': '360'
      };
      
      let finalStreamUrl = streamUrl;
      if (quality !== 'Auto' && quality !== '4K' && qualityMap[quality]) {
        finalStreamUrl = streamUrl.includes('?') 
          ? `${streamUrl}&quality=${qualityMap[quality]}`
          : `${streamUrl}?quality=${qualityMap[quality]}`;
      }
      
      hlsRef.current.loadSource(finalStreamUrl);
      hlsRef.current.attachMedia(video);
    }
  };

  const getCountryEmoji = (code: string) => {
    if (!code || code === 'un') return '🌐';
    const codePoints = code
      .toUpperCase()
      .split('')
      .map(char =>  127397 + char.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🌐';
    }
  };

  return (
    <div 
      ref={containerRef}
      id="live-stadium-canvas"
      className="relative w-full aspect-video rounded-2xl bg-zinc-950 overflow-hidden shadow-2xl border border-zinc-800 focus:outline-none group"
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Actual HTML Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain pointer-events-auto cursor-pointer"
        onClick={handlePlayPause}
        playsInline
        muted={isMuted}
      />

      {/* Centered Floating Play Button Overlay */}
      {!isPlaying && !isLoading && !errorMsg && (
        <div 
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-zinc-950/45 cursor-pointer z-10 hover:bg-zinc-950/30 transition-all duration-300"
        >
          <div className="p-5 bg-lime-500 hover:bg-lime-400 text-zinc-950 hover:scale-110 active:scale-95 rounded-full shadow-2xl shadow-lime-500/30 transition duration-300 flex items-center justify-center relative">
            <Play className="w-8 h-8 fill-current translate-x-0.5" />
            <span className="absolute -inset-2 rounded-full border border-lime-500/35 animate-ping duration-1000" />
          </div>
          <span className="absolute bottom-1/4 text-xs font-mono tracking-wider font-extrabold text-lime-400 bg-zinc-950/80 border border-zinc-800 px-3 py-1.5 rounded-xl uppercase">
            অনলাইনে দেখতে এখানে ক্লিক করুন (Tap to Play Live Feed)
          </span>
        </div>
      )}

      {/* Loading Overlay / Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 z-20 backdrop-blur-sm animate-fade-in">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-20 h-20 rounded-full border-4 border-lime-500/20 border-t-lime-400 border-r-lime-400 animate-spin" />
            <Radio className="w-8 h-8 text-lime-400 animate-pulse duration-1000" />
          </div>
          <p className="mt-5 text-lime-400 font-mono text-sm tracking-widest animate-pulse">
            LOADING STADIUM FEED...
          </p>
          <span className="text-zinc-500 text-xs mt-1 font-sans">
            চ্যানেল লোড হচ্ছে, দয়া করে অপেক্ষা করুন...
          </span>
          {internetSpeed > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-400">
              <Wifi className={`w-3 h-3 ${internetSpeed > 5 ? 'text-lime-400' : 'text-yellow-400'}`} />
              <span>{internetSpeed} Mbps • Quality: {currentQuality}</span>
            </div>
          )}
        </div>
      )}

      {/* Error / Offline Overlay */}
      {errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 z-20 px-6 text-center">
          <div className="p-3 bg-red-950/50 rounded-full border border-red-500/30 text-red-400 mb-4 animate-bounce">
            <Tv className="w-8 h-8" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2 Bengali-heading">
            লাইভ সম্প্রচার লোড করা যায়নি
          </h3>
          <p className="text-zinc-400 text-sm max-w-md font-sans mb-5">
            {errorMsg}
          </p>
          <div className="flex gap-3">
            <button
              id="retry-stream"
              onClick={handleRefresh}
              className="flex items-center gap-2 px-5 py-2.5 bg-lime-500 text-zinc-950 rounded-xl hover:bg-lime-400 active:scale-95 font-semibold text-xs transition duration-200 shadow-lg shadow-lime-500/20"
            >
              <RotateCcw className="w-4 h-4" /> পুনরায় চেষ্টা করুন (Retry Feed)
            </button>
            {onNextChannel && (
              <button
                id="next-channel"
                onClick={onNextChannel}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-95 font-semibold text-xs transition duration-200"
              >
                <ChevronRight className="w-4 h-4" /> পরবর্তী চ্যানেল (Next)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Overlay Header Information */}
      <div 
        className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-all duration-300 z-10 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900/90 border border-zinc-700 p-1 flex items-center justify-center overflow-hidden">
            {channel.logo ? (
              <img 
                src={channel.logo} 
                alt={channel.name} 
                className="w-full h-full object-contain" 
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "";
                }}
              />
            ) : (
              <Radio className="w-5 h-5 text-lime-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-white font-semibold text-base tracking-wide flex items-center gap-1.5">
                {channel.name}
                {channel.isFifa && <Trophy className="w-4 h-4 text-amber-500" />}
              </h4>
              <span className="text-sm shadow-md" title={channel.country}>
                {getCountryEmoji(channel.countryCode)}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono tracking-wide">
              {channel.group || 'Live Sports TV'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quality Indicator */}
          <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded-lg border border-zinc-700/50">
            <Wifi className={`w-3 h-3 ${internetSpeed > 5 ? 'text-lime-400' : internetSpeed > 2 ? 'text-yellow-400' : 'text-red-400'}`} />
            <span className="text-[9px] font-mono text-zinc-300">{currentQuality}</span>
          </div>

          {/* Favorite Button */}
          <button
            id={`fav-btn-${channel.id}`}
            onClick={onToggleFavorite}
            className={`p-2.5 rounded-xl border transition-all duration-200 ${
              isFavorite 
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-md shadow-rose-950/50' 
                : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
            title={isFavorite ? "পছন্দের তালিকা থেকে বাদ দিন" : "পছন্দের তালিকায় রাখুন"}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500' : ''}`} />
          </button>

          {/* Live Status */}
          <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-lg border border-red-500 shadow-lg text-white font-bold text-xs uppercase tracking-widest animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {/* Advanced Stream Stats Panel Overlay */}
      {showStats && (
        <div className="absolute left-4 top-16 p-3 bg-zinc-950/90 backdrop-blur-md rounded-xl border border-lime-500/30 text-[10px] text-lime-400 font-mono space-y-1 z-10 w-48 shadow-lg">
          <p className="text-zinc-400 font-bold border-b border-zinc-800 pb-1 mb-1">STREAM DIAGNOSTICS</p>
          <p>Resolution: {stats.width}x{stats.height}</p>
          <p>Target FPS: {stats.fps}</p>
          <p>Frame Drops: {stats.dropped}</p>
          <p>Internet: {internetSpeed} Mbps</p>
          <p>Quality: {currentQuality}</p>
          <p>Decoder: {Hls.isSupported() ? 'Hls.js Engine' : 'HTML5 Native'}</p>
        </div>
      )}

      {/* Quality Settings Modal */}
      {showQuality && (
        <div className="absolute right-4 bottom-24 p-3 bg-zinc-950/95 backdrop-blur-md rounded-xl border border-lime-500/30 z-10 w-40 shadow-lg">
          <p className="text-zinc-400 font-bold text-[10px] border-b border-zinc-800 pb-1 mb-1">QUALITY</p>
          <div className="space-y-1">
            {availableQualities.map((q) => (
              <button
                key={q}
                onClick={() => handleQualityChange(q)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                  q === currentQuality 
                    ? 'bg-lime-500/20 text-lime-400 font-bold' 
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Media Controller Overlay Bar */}
      <div 
        className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/45 to-transparent flex flex-col gap-3 transition-all duration-300 z-10 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              id="player-play-pause"
              onClick={handlePlayPause}
              className="p-3 bg-lime-500 text-zinc-950 hover:bg-lime-400 rounded-full transition duration-150 transform active:scale-90"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              id="player-refresh"
              onClick={handleRefresh}
              className="p-2 bg-zinc-900/80 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl transition duration-150"
              title="রিফ্রেশ করুন (Reload Feed)"
            >
              <RotateCcw className="w-4.5 h-4.5" />
            </button>

            {onPrevChannel && (
              <button
                id="player-prev-ch"
                onClick={onPrevChannel}
                className="p-2 bg-zinc-900/80 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl transition duration-150 text-xs font-mono"
                title="পূর্ববর্তী চ্যানেল (Previous Channel)"
              >
                ◀ PREV
              </button>
            )}
            {onNextChannel && (
              <button
                id="player-next-ch"
                onClick={onNextChannel}
                className="p-2 bg-zinc-900/80 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl transition duration-150 text-xs font-mono"
                title="পরবর্তী চ্যানেল (Next Channel)"
              >
                NEXT ▶
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Quality Settings */}
            <button
              id="player-quality"
              onClick={() => setShowQuality(!showQuality)}
              className={`p-2 rounded-xl border transition-all duration-150 ${
                showQuality 
                  ? 'bg-lime-500/20 border-lime-400/50 text-lime-400' 
                  : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white'
              }`}
              title="কোয়ালিটি সেটিংস (Quality Settings)"
            >
              <Settings className="w-4 text-center block" />
            </button>

            {/* Stats toggle */}
            <button
              id="player-diagnostics"
              onClick={() => setShowStats(!showStats)}
              className={`p-2 rounded-xl border transition-all duration-150 ${
                showStats 
                  ? 'bg-lime-500/20 border-lime-400/50 text-lime-400' 
                  : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white'
              }`}
              title="স্ট্রিম ডায়াগনস্টিক তথ্য দেখুন"
            >
              <Info className="w-4 text-center block" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2 group/volume bg-zinc-900/80 border border-zinc-700/50 px-2.5 py-1.5 rounded-xl">
              <button
                id="player-mute"
                onClick={handleMuteToggle}
                className="text-zinc-400 hover:text-white transition duration-150"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                id="volume-slider"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-lime-400 group-hover/volume:w-20 transition-all duration-300"
              />
            </div>

            {/* Fullscreen Button */}
            <button
              id="player-fullscreen"
              onClick={toggleFullscreen}
              className="p-2 bg-zinc-900/80 border border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition duration-150"
            >
              {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
