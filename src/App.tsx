import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Tv, Radio, Search, RefreshCw, Star, Flame, Trophy, 
  HelpCircle, Languages, LayoutGrid, CheckCircle2, AlertTriangle, ChevronRight, Wifi
} from 'lucide-react';

// Types
interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  country: string;
  countryCode: string;
  isLive: boolean;
  isCricket: boolean;
  isFootball: boolean;
  isFifa: boolean;
  isFav?: boolean;
}

type SportCategory = 'all' | 'running_live' | 'cricket' | 'football' | 'fifa' | 'other';

// VideoPlayer Component (inline to avoid import issues)
const VideoPlayer = ({ 
  channel, 
  isFavorite, 
  onToggleFavorite,
  onNextChannel,
  onPrevChannel,
  onChannelError,
  autoQuality = true,
  internetSpeed = 5
}: any) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const hlsRef = React.useRef<any>(null);

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
  const [retryCount, setRetryCount] = useState<number>(0);

  const controlsTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

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

    const streamUrl = channel?.url;

    if (!streamUrl) {
      setErrorMsg("কোন স্ট্রিমিং লিঙ্ক পাওয়া যায়নি");
      setIsLoading(false);
      return;
    }

    video.muted = isMuted;

    // Dynamic import for HLS
    import('hls.js').then((HlsModule) => {
      const Hls = HlsModule.default;
      
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxMaxBufferLength: 20,
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 15
        });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          video.play().then(() => setIsPlaying(true)).catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().then(() => setIsPlaying(true));
          });
        });

        hls.on(Hls.Events.ERROR, (event: any, data: any) => {
          console.warn("HLS Error:", data);
          if (data.fatal) {
            if (retryCount < 3) {
              setRetryCount(prev => prev + 1);
              setTimeout(() => {
                hls.loadSource(streamUrl);
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
        video.src = streamUrl;
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
    }).catch((err) => {
      console.error("HLS import error:", err);
      setErrorMsg("HLS লাইব্রেরি লোড করা যায়নি");
      setIsLoading(false);
    });

  }, [channel?.url, autoQuality, internetSpeed, currentQuality, retryCount, onChannelError]);

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
    const streamUrl = channel?.url;
    if (streamUrl) {
      import('hls.js').then((HlsModule) => {
        const Hls = HlsModule.default;
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

  if (!channel) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <p className="text-zinc-400">কোন চ্যানেল নির্বাচিত হয়নি</p>
      </div>
    );
  }

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
              <RefreshCw className="w-4 h-4" /> পুনরায় চেষ্টা
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
            <Star className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
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
          {['Auto', '1080p', '720p', '480p', '360p'].map((q) => (
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
              <RefreshCw className="w-4.5 h-4.5" />
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
              <HelpCircle className="w-4" />
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
};

// Main App Component
export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('khelaghor_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<SportCategory>('fifa');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [isBengali, setIsBengali] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [playlistLastUpdated, setPlaylistLastUpdated] = useState<string>('');
  const [internetSpeed, setInternetSpeed] = useState<number>(5);
  const [autoQuality] = useState<boolean>(true);

  const [fifaMatches] = useState<any[]>([]);

  // Load Channels from API
  const fetchChannels = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const response = await fetch(`/api/channels${forceRefresh ? '?force=true' : ''}`);
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.statusText}`);
      }
      const data = await response.json();
      setChannels(data.channels || []);
      setCachedAt(data.cachedAt || Date.now());
      setPlaylistLastUpdated(data.playlistLastUpdated || '');

      if (data.channels && data.channels.length > 0 && !selectedChannel) {
        const fifaChannels = data.channels.filter((ch: Channel) => ch.isFifa);
        const liveFifaChannels = fifaChannels.filter((ch: Channel) => ch.isLive);
        
        let defaultCh;
        if (liveFifaChannels.length > 0) {
          defaultCh = liveFifaChannels[0];
        } else if (fifaChannels.length > 0) {
          defaultCh = fifaChannels[0];
        } else {
          defaultCh = data.channels.find((ch: Channel) => ch.isLive) || data.channels[0];
        }
        setSelectedChannel(defaultCh);
      }
    } catch (err: any) {
      console.error("Fetch channels error:", err);
      setError("চ্যানেল তালিকা লোড করতে ব্যর্থ হয়েছে।");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(id) 
        ? prev.filter((favId) => favId !== id) 
        : [...prev, id];
      localStorage.setItem('khelaghor_favorites', JSON.stringify(updated));
      return updated;
    });
  };

  const handleChannelError = useCallback(() => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    
    const currentIndex = filteredChannels.findIndex(ch => ch.id === selectedChannel.id);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % filteredChannels.length;
      setSelectedChannel(filteredChannels[nextIndex]);
    }
  }, [selectedChannel, filteredChannels]);

  const playNextChannel = () => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    const currentIndex = filteredChannels.findIndex(ch => ch.id === selectedChannel.id);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % filteredChannels.length;
      setSelectedChannel(filteredChannels[nextIndex]);
    }
  };

  const playPrevChannel = () => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    const currentIndex = filteredChannels.findIndex(ch => ch.id === selectedChannel.id);
    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + filteredChannels.length) % filteredChannels.length;
      setSelectedChannel(filteredChannels[prevIndex]);
    }
  };

  const processedChannels = useMemo(() => {
    const list = channels.map(ch => ({
      ...ch,
      isFav: favorites.includes(ch.id)
    }));

    return [...list].sort((a, b) => {
      const getScore = (ch: Channel) => {
        let score = 0;
        if (ch.isFifa) score += 50000;
        if (ch.isLive) score += 10000;
        return score;
      };

      const scoreA = getScore(a);
      const scoreB = getScore(b);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return a.name.localeCompare(b.name);
    });
  }, [channels, favorites]);

  const filteredChannels = useMemo(() => {
    return processedChannels.filter((ch) => {
      const matchesSearch = 
        ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ch.group && ch.group.toLowerCase().includes(searchQuery.toLowerCase())) ||
        ch.country.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (activeCategory === 'running_live') return ch.isLive;
      if (activeCategory === 'cricket') return ch.isCricket;
      if (activeCategory === 'football') return ch.isFootball;
      if (activeCategory === 'fifa') return ch.isFifa;
      if (activeCategory === 'other') return !ch.isCricket && !ch.isFootball && !ch.isFifa;
      return true;
    });
  }, [processedChannels, activeCategory, searchQuery]);

  const hotLiveChannels = useMemo(() => {
    return processedChannels.filter(ch => ch.isLive && (ch.isCricket || ch.isFootball || ch.isFifa)).slice(0, 10);
  }, [processedChannels]);

  const fifaChannels = useMemo(() => {
    return processedChannels.filter(ch => ch.isFifa);
  }, [processedChannels]);

  const cricketChannels = useMemo(() => {
    return processedChannels.filter(ch => ch.isCricket && !ch.isFifa);
  }, [processedChannels]);

  const footballChannels = useMemo(() => {
    return processedChannels.filter(ch => ch.isFootball && !ch.isFifa);
  }, [processedChannels]);

  const favoriteChannels = useMemo(() => {
    return processedChannels.filter(ch => ch.isFav);
  }, [processedChannels]);

  const getCountryEmoji = (code: string) => {
    if (!code || code === 'un') return '🌐';
    const codePoints = code
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🌐';
    }
  };

  const getRelativeFetchTime = () => {
    if (!cachedAt) return "";
    const secondsAgo = Math.floor((Date.now() - cachedAt) / 1000);
    if (secondsAgo < 60) {
      return isBengali ? "এইমাত্র" : "Just now";
    }
    const minutesAgo = Math.floor(secondsAgo / 60);
    return isBengali ? `${minutesAgo} মিনিট আগে` : `${minutesAgo}m ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative flex items-center justify-center mb-6">
            <div className="w-20 h-20 rounded-full border-t-2 border-lime-500 border-r-2 animate-spin"></div>
            <Tv className="absolute w-8 h-8 text-lime-400 animate-pulse" />
          </div>
          <h3 className="text-xl font-black text-white mb-2">লোড হচ্ছে...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">এরর!</h2>
          <p className="text-zinc-400 text-sm mb-4">{error}</p>
          <button 
            onClick={() => fetchChannels(true)}
            className="px-6 py-2 bg-lime-500 text-zinc-950 rounded-xl font-bold hover:bg-lime-400 transition"
          >
            পুনরায় চেষ্টা করুন
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      
      <div className="w-full bg-gradient-to-r from-lime-500 via-emerald-500 to-indigo-500 h-1.5" />

      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900 px-4 py-3.5 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center bg-gradient-to-br from-lime-400 to-emerald-500 p-2.5 rounded-2xl">
              <Tv className="w-6 h-6 text-zinc-950" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-black text-white">
                {isBengali ? "খেলাঘর" : "KHELAGHOR"}
              </h1>
              <p className="text-[10px] text-zinc-400">
                {isBengali ? "ফিফা বিশ্বকাপ লাইভ" : "FIFA World Cup Live"}
              </p>
            </div>
          </div>

          <div className="flex items-center w-full sm:w-auto gap-2.5">
            <div className="flex items-center gap-1.5 bg-zinc-900/80 px-3 py-1.5 rounded-xl border border-zinc-800">
              <Wifi className={`w-4 h-4 ${internetSpeed > 5 ? 'text-lime-400' : 'text-yellow-400'}`} />
              <span className="text-[10px] font-mono text-zinc-300">{internetSpeed} Mbps</span>
            </div>

            <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder={isBengali ? "চ্যানেল খুঁজুন..." : "Search channels..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/95 text-sm pl-10 pr-4 py-2 rounded-xl border border-zinc-800 focus:border-lime-400/50 focus:outline-none text-white placeholder-zinc-500"
              />
            </div>

            <button
              onClick={() => fetchChannels(true)}
              disabled={isRefreshing}
              className="p-2.5 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-lime-400' : ''}`} />
            </button>

            <button
              onClick={() => setIsBengali(!isBengali)}
              className="px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-bold"
            >
              <Languages className="w-4 h-4 inline mr-1 text-lime-400" />
              {isBengali ? "EN" : "বাংলা"}
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 lg:px-8 flex-grow w-full">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-zinc-400 bg-zinc-900/35 px-4 py-3 rounded-2xl border border-zinc-900/80 mb-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
            </span>
            <span className="font-bold text-zinc-300">
              {isBengali ? "ফিফা বিশ্বকাপ লাইভ" : "FIFA World Cup Live"}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-zinc-400">
              {isBengali ? "চ্যানেল:" : "Channels:"}{" "}
              <span className="text-lime-400 font-extrabold text-xs">{channels.length}</span>
            </span>
            {cachedAt && (
              <span className="text-zinc-500 text-[10px]">{getRelativeFetchTime()}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 flex flex-col gap-4">
            
            {selectedChannel ? (
              <div className="space-y-3">
                <VideoPlayer 
                  channel={selectedChannel}
                  isFavorite={favorites.includes(selectedChannel.id)}
                  onToggleFavorite={() => handleToggleFavorite(selectedChannel.id)}
                  onNextChannel={playNextChannel}
                  onPrevChannel={playPrevChannel}
                  onChannelError={handleChannelError}
                  autoQuality={autoQuality}
                  internetSpeed={internetSpeed}
                />
                
                <div className="p-4 bg-zinc-900/65 rounded-2xl border border-zinc-900 flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-extrabold text-lime-400 bg-lime-500/10 px-2 py-0.5 rounded-lg">
                        {isBengali ? "বর্তমানে:" : "Now:"}
                      </span>
                      <span className="text-xs bg-zinc-800 px-2.5 py-1.5 text-zinc-300 rounded-lg">
                        {getCountryEmoji(selectedChannel.countryCode)} {selectedChannel.country}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-white mt-2">{selectedChannel.name}</h2>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-xs text-zinc-400 block">{selectedChannel.group}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <p className="text-zinc-400">কোন চ্যানেল নির্বাচিত হয়নি</p>
              </div>
            )}

            {/* FIFA World Cup Hub */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-600/5 to-zinc-950 border border-amber-500/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-amber-500" />
                  <h3 className="text-base font-black text-white">
                    {isBengali ? "ফিফা বিশ্বকাপ" : "FIFA World Cup"}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveCategory('fifa')}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-black text-xs rounded-xl"
                >
                  {isBengali ? "বিশ্বকাপ চ্যানেল" : "World Cup"}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fifaChannels.length > 0 ? (
                  fifaChannels.slice(0, 4).map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedChannel(ch)}
                      className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                        selectedChannel?.id === ch.id
                          ? 'bg-amber-500/10 border-amber-500/60'
                          : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🏆</span>
                        <div>
                          <h4 className="text-xs font-black text-zinc-200">{ch.name}</h4>
                          <p className="text-[10px] text-zinc-500">{getCountryEmoji(ch.countryCode)} {ch.country}</p>
                        </div>
                      </div>
                      {ch.isLive && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="sm:col-span-2 p-4 bg-zinc-900/20 border border-zinc-900/65 rounded-2xl text-center">
                    <p className="text-[10px] text-zinc-500">
                      {isBengali ? "কোন ফিফা চ্যানেল পাওয়া যায়নি" : "No FIFA channels available"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Hot Live Channels */}
            {hotLiveChannels.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-3.5">
                  <Flame className="w-5 h-5 text-red-500 fill-current animate-pulse" />
                  <h3 className="text-md font-black text-white">
                    {isBengali ? "হট লাইভ" : "Hot Live"}
                  </h3>
                </div>
                
                <div className="flex gap-3 overflow-x-auto pb-3">
                  {hotLiveChannels.map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedChannel(ch)}
                      className={`flex-shrink-0 w-52 snap-start p-3 rounded-xl border cursor-pointer transition ${
                        selectedChannel?.id === ch.id 
                          ? 'bg-zinc-900 border-lime-500/70' 
                          : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <span className="text-xs bg-zinc-850/90 px-2 py-1 rounded-md text-zinc-300 border border-zinc-800">
                          {getCountryEmoji(ch.countryCode)}
                        </span>
                        <span className="flex items-center gap-1.5 bg-red-600/10 border border-red-500/30 px-2 py-0.5 rounded text-[9px] text-red-400 font-bold uppercase">
                          <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
                          LIVE
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white line-clamp-2">{ch.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            
            <div className="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-900">
              <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">
                {isBengali ? "ক্যাটাগরি" : "Categories"}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveCategory('all')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    activeCategory === 'all'
                      ? 'bg-lime-500 text-zinc-950'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                  }`}
                >
                  {isBengali ? "সব" : "All"}
                </button>
                <button
                  onClick={() => setActiveCategory('running_live')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    activeCategory === 'running_live'
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                  }`}
                >
                  {isBengali ? "লাইভ" : "Live"}
                </button>
                <button
                  onClick={() => setActiveCategory('cricket')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    activeCategory === 'cricket'
                      ? 'bg-lime-500 text-zinc-950'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                  }`}
                >
                  🏏 {isBengali ? "ক্রিকেট" : "Cricket"}
                </button>
                <button
                  onClick={() => setActiveCategory('football')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    activeCategory === 'football'
                      ? 'bg-lime-500 text-zinc-950'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                  }`}
                >
                  ⚽ {isBengali ? "ফুটবল" : "Football"}
                </button>
                <button
                  onClick={() => setActiveCategory('fifa')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition col-span-2 ${
                    activeCategory === 'fifa'
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-900 border border-amber-500/20 text-amber-400'
                  }`}
                >
                  <Trophy className="w-4 h-4 inline mr-1" />
                  {isBengali ? "ফিফা বিশ্বকাপ" : "FIFA World Cup"}
                  {fifaChannels.length > 0 && (
                    <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                      {fifaChannels.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Channel List */}
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-900 overflow-hidden flex flex-col flex-grow min-h-[420px] max-h-[580px]">
              
              <div className="p-3 bg-zinc-900 border-b border-zinc-850 flex items-center justify-between">
                <span className="text-xs font-bold text-white">
                  {isBengali ? "চ্যানেল" : "Channels"}
                </span>
                <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                  {filteredChannels.length}
                </span>
              </div>

              <div className="overflow-y-auto divide-y divide-zinc-950 flex-grow">
                {filteredChannels.length === 0 ? (
                  <div className="p-10 text-center">
                    <Tv className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <h4 className="text-zinc-500 text-xs">চ্যানেল পাওয়া যায়নি</h4>
                  </div>
                ) : (
                  filteredChannels.map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedChannel(ch)}
                      className={`p-3 transition cursor-pointer ${
                        selectedChannel?.id === ch.id 
                          ? 'bg-zinc-900 border-l-4 border-lime-500' 
                          : 'hover:bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-900/90 border border-zinc-800 p-1 flex items-center justify-center overflow-hidden">
                          {ch.logo ? (
                            <img src={ch.logo} alt={ch.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <Radio className="w-5 h-5 text-zinc-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-xs font-bold truncate ${selectedChannel?.id === ch.id ? 'text-lime-400' : 'text-zinc-200'}`}>
                            {ch.name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-500">
                            <span>{getCountryEmoji(ch.countryCode)}</span>
                            <span>{ch.country}</span>
                          </div>
                        </div>
                        {ch.isLive && (
                          <span className="flex items-center gap-1 bg-red-600 px-1.5 py-0.5 rounded text-[8px] text-white font-bold uppercase animate-pulse">
                            LIVE
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>

          </div>
          
        </div>

        {/* Bottom Sections */}
        <div className="space-y-4 pt-4 border-t border-zinc-900 mt-6">
          
          {favoriteChannels.length > 0 && (
            <div className="bg-zinc-950/20 p-5 rounded-2xl border border-rose-950/20">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-rose-500 fill-rose-500" />
                <h3 className="text-base font-black text-rose-400">
                  {isBengali ? "প্রিয় চ্যানেল" : "Favorites"}
                </h3>
                <span className="text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2.5 py-0.5 rounded-full">
                  {favoriteChannels.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {favoriteChannels.slice(0, 4).map(ch => (
                  <div 
                    key={ch.id}
                    onClick={() => {
                      setSelectedChannel(ch);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      selectedChannel?.id === ch.id 
                        ? 'bg-zinc-900 border-rose-500/60' 
                        : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-900 p-1 border border-zinc-800 flex items-center justify-center">
                        {ch.logo ? <img src={ch.logo} className="w-full h-full object-contain" alt="" referrerPolicy="no-referrer" /> : <Tv className="w-5 h-5 text-rose-400" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white line-clamp-1">{ch.name}</h4>
                        <p className="text-[10px] text-zinc-500">{getCountryEmoji(ch.countryCode)} {ch.country}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="bg-zinc-900/25 p-5 rounded-2xl border border-zinc-900">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🏏</span>
                  <h3 className="text-sm font-black text-white">
                    {isBengali ? "ক্রিকেট" : "Cricket"}
                  </h3>
                </div>
                <span className="text-xs font-bold text-lime-400">{cricketChannels.length}</span>
              </div>

              {cricketChannels.length === 0 ? (
                <div className="p-6 text-center text-zinc-600 text-xs">
                  {isBengali ? "কোন ক্রিকেট চ্যানেল নেই" : "No Cricket channels"}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                  {cricketChannels.slice(0, 6).map(ch => (
                    <div
                      key={ch.id}
                      onClick={() => {
                        setSelectedChannel(ch);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`p-2.5 rounded-xl border cursor-pointer transition ${
                        selectedChannel?.id === ch.id 
                          ? 'bg-lime-500/10 border-lime-500/50' 
                          : 'bg-zinc-950/60 hover:bg-zinc-900 border-zinc-900'
                      }`}
                    >
                      <h4 className="text-[11px] font-bold text-zinc-200 truncate">{ch.name}</h4>
                      <div className="flex items-center justify-between mt-1 text-[9px] text-zinc-500">
                        <span>{getCountryEmoji(ch.countryCode)} {ch.country}</span>
                        {ch.isLive && <span className="text-red-400 font-bold">🔴 LIVE</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900/25 p-5 rounded-2xl border border-zinc-900">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">⚽</span>
                  <h3 className="text-sm font-black text-white">
                    {isBengali ? "ফুটবল" : "Football"}
                  </h3>
                </div>
                <span className="text-xs font-bold text-lime-400">{footballChannels.length}</span>
              </div>

              {footballChannels.length === 0 ? (
                <div className="p-6 text-center text-zinc-600 text-xs">
                  {isBengali ? "কোন ফুটবল চ্যানেল নেই" : "No Football channels"}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                  {footballChannels.slice(0, 6).map(ch => (
                    <div
                      key={ch.id}
                      onClick={() => {
                        setSelectedChannel(ch);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`p-2.5 rounded-xl border cursor-pointer transition ${
                        selectedChannel?.id === ch.id 
                          ? 'bg-lime-500/10 border-lime-500/50' 
                          : 'bg-zinc-950/60 hover:bg-zinc-900 border-zinc-900'
                      }`}
                    >
                      <h4 className="text-[11px] font-bold text-zinc-200 truncate">{ch.name}</h4>
                      <div className="flex items-center justify-between mt-1 text-[9px] text-zinc-500">
                        <span>{getCountryEmoji(ch.countryCode)} {ch.country}</span>
                        {ch.isLive && <span className="text-red-400 font-bold">🔴 LIVE</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </main>

      <footer className="bg-zinc-950 border-t border-zinc-900 py-6 mt-12 text-center text-xs text-zinc-500 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} KhelaGhor Live TV</p>
          <div className="flex gap-4">
            <button onClick={() => setIsBengali(!isBengali)} className="hover:text-lime-400 transition">
              {isBengali ? "English" : "বাংলা"}
            </button>
            <span>|</span>
            <span>FIFA World Cup v2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
