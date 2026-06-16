import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Tv, Radio, Search, RefreshCw, Star, Flame, Trophy, 
  HelpCircle, Languages, LayoutGrid, CheckCircle2, 
  AlertTriangle, ChevronRight, Wifi, Play, Pause, 
  Volume2, VolumeX, Maximize, Minimize, Settings, Info
} from 'lucide-react';

// ===== TYPES =====
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
}

type SportCategory = 'all' | 'running_live' | 'cricket' | 'football' | 'fifa';

// ===== VIDEO PLAYER COMPONENT =====
const VideoPlayerComponent: React.FC<{
  channel: Channel | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onNext: () => void;
  onPrev: () => void;
  onError: () => void;
}> = ({ channel, isFavorite, onToggleFavorite, onNext, onPrev, onError }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;

    setIsLoading(true);
    setError(null);

    const loadVideo = async () => {
      try {
        const Hls = (await import('hls.js')).default;
        
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxMaxBufferLength: 20,
            enableWorker: true,
            lowLatencyMode: true,
          });
          
          hls.loadSource(channel.url);
          hls.attachMedia(video);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            video.play().catch(() => {});
          });
          
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setError('স্ট্রিম লোড করা যায়নি');
              setIsLoading(false);
              onError();
            }
          });
          
          return () => {
            hls.destroy();
          };
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = channel.url;
          video.load();
          video.play().catch(() => {});
          setIsLoading(false);
        } else {
          setError('এই ব্রাউজারে স্ট্রিম 지원 করে না');
          setIsLoading(false);
        }
      } catch (err) {
        setError('প্লেয়ার লোড করতে ব্যর্থ');
        setIsLoading(false);
      }
    };

    loadVideo();
  }, [channel, onError]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(!isMuted);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
  };

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement;
    if (!container) return;
    
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (!channel) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-2xl flex items-center justify-center">
        <p className="text-zinc-400 text-sm">কোন চ্যানেল নির্বাচিত হয়নি</p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        playsInline
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="w-12 h-12 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-2" />
          <p className="text-white text-center text-sm">{error}</p>
          <button
            onClick={onNext}
            className="mt-4 px-4 py-2 bg-lime-500 text-black rounded-lg text-sm font-bold"
          >
            পরবর্তী চ্যানেল
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="p-2 bg-lime-500 rounded-full">
                {isPlaying ? <Pause className="w-4 h-4 text-black" /> : <Play className="w-4 h-4 text-black" />}
              </button>
              <button onClick={onPrev} className="p-2 bg-zinc-800 rounded-lg text-white text-xs">
                ◀
              </button>
              <button onClick={onNext} className="p-2 bg-zinc-800 rounded-lg text-white text-xs">
                ▶
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={toggleMute} className="p-2 text-white">
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolume}
                className="w-20 accent-lime-500"
              />
              <button onClick={toggleFullscreen} className="p-2 text-white">
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 right-4 flex justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center">
            {channel.logo ? (
              <img src={channel.logo} alt="" className="w-6 h-6 object-contain" />
            ) : (
              <Radio className="w-4 h-4 text-lime-400" />
            )}
          </div>
          <div>
            <p className="text-white text-sm font-bold">{channel.name}</p>
            <p className="text-zinc-400 text-xs">{channel.group}</p>
          </div>
        </div>
        <button onClick={onToggleFavorite} className="p-2">
          <Star className={`w-5 h-5 ${isFavorite ? 'fill-yellow-500 text-yellow-500' : 'text-white'}`} />
        </button>
      </div>
    </div>
  );
};

// ===== MAIN APP =====
function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('favorites') || '[]');
    } catch {
      return [];
    }
  });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SportCategory>('fifa');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBengali, setIsBengali] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChannels = async (force = false) => {
    setLoading(!force);
    setRefreshing(force);
    setError(null);

    try {
      const res = await fetch(`/api/channels${force ? '?force=true' : ''}`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      
      setChannels(data.channels || []);
      
      if (!selected && data.channels?.length > 0) {
        const fifa = data.channels.find((c: Channel) => c.isFifa);
        const live = data.channels.find((c: Channel) => c.isLive);
        setSelected(fifa || live || data.channels[0]);
      }
    } catch (err) {
      setError('চ্যানেল লোড করতে ব্যর্থ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const toggleFavorite = (id: string) => {
    const updated = favorites.includes(id)
      ? favorites.filter(f => f !== id)
      : [...favorites, id];
    setFavorites(updated);
    localStorage.setItem('favorites', JSON.stringify(updated));
  };

  const filtered = useMemo(() => {
    let list = channels.map(c => ({ ...c, isFav: favorites.includes(c.id) }));
    
    if (search) {
      list = list.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.country.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (category === 'fifa') {
      list = list.filter(c => c.isFifa);
    } else if (category === 'running_live') {
      list = list.filter(c => c.isLive);
    } else if (category === 'cricket') {
      list = list.filter(c => c.isCricket);
    } else if (category === 'football') {
      list = list.filter(c => c.isFootball);
    }
    
    return list;
  }, [channels, search, category, favorites]);

  const fifaChannels = useMemo(() => channels.filter(c => c.isFifa), [channels]);
  const liveChannels = useMemo(() => channels.filter(c => c.isLive), [channels]);
  const favChannels = useMemo(() => channels.filter(c => favorites.includes(c.id)), [channels, favorites]);

  const getFlag = (code: string) => {
    if (!code || code === 'un') return '🌐';
    try {
      return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0)));
    } catch {
      return '🌐';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Tv className="w-16 h-16 text-lime-500 animate-pulse mx-auto mb-4" />
          <p className="text-white font-bold">লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white font-bold mb-2">{error}</p>
          <button
            onClick={() => fetchChannels(true)}
            className="px-6 py-2 bg-lime-500 text-black rounded-xl font-bold"
          >
            পুনরায় চেষ্টা
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur border-b border-zinc-900 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-lime-400 to-emerald-500 p-2 rounded-xl">
              <Tv className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-lg font-black">খেলাঘর</h1>
              <p className="text-[10px] text-zinc-400">FIFA World Cup Live</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute ml-3" />
            <input
              type="text"
              placeholder={isBengali ? "চ্যানেল খুঁজুন..." : "Search channels..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 pl-9 pr-4 py-2 rounded-xl border border-zinc-800 focus:border-lime-500 outline-none text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchChannels(true)}
              disabled={refreshing}
              className="p-2 bg-zinc-900 rounded-xl hover:bg-zinc-800"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-lime-500' : ''}`} />
            </button>
            <button
              onClick={() => setIsBengali(!isBengali)}
              className="px-3 py-2 bg-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800"
            >
              {isBengali ? 'EN' : 'বাংলা'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400 bg-zinc-900/50 px-4 py-3 rounded-2xl border border-zinc-900 mb-6">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-lime-500 animate-pulse" />
              <span className="font-bold text-white">{channels.length}</span>
              <span>চ্যানেল</span>
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              {fifaChannels.length} FIFA
            </span>
          </div>
          <div className="flex gap-4">
            <span>⚡ {liveChannels.length} লাইভ</span>
            <span>⭐ {favChannels.length} প্রিয়</span>
          </div>
        </div>

        {/* Player + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Player Column */}
          <div className="lg:col-span-2 space-y-4">
            <VideoPlayerComponent
              channel={selected}
              isFavorite={selected ? favorites.includes(selected.id) : false}
              onToggleFavorite={() => selected && toggleFavorite(selected.id)}
              onNext={() => {
                const idx = filtered.findIndex(c => c.id === selected?.id);
                const next = filtered[(idx + 1) % filtered.length];
                if (next) setSelected(next);
              }}
              onPrev={() => {
                const idx = filtered.findIndex(c => c.id === selected?.id);
                const prev = filtered[(idx - 1 + filtered.length) % filtered.length];
                if (prev) setSelected(prev);
              }}
              onError={() => {
                const idx = filtered.findIndex(c => c.id === selected?.id);
                const next = filtered[(idx + 1) % filtered.length];
                if (next) setSelected(next);
              }}
            />

            {/* FIFA Hub */}
            {fifaChannels.length > 0 && (
              <div className="bg-gradient-to-br from-amber-500/10 to-zinc-900/50 p-5 rounded-2xl border border-amber-500/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold">FIFA World Cup</h3>
                  </div>
                  <button
                    onClick={() => setCategory('fifa')}
                    className="px-4 py-1.5 bg-amber-500 text-black rounded-xl text-xs font-bold"
                  >
                    সব দেখুন
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {fifaChannels.slice(0, 4).map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => setSelected(ch)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        selected?.id === ch.id
                          ? 'bg-amber-500/20 border-amber-500/50'
                          : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        <div>
                          <p className="text-xs font-bold">{ch.name}</p>
                          <p className="text-[10px] text-zinc-400">{getFlag(ch.countryCode)} {ch.country}</p>
                        </div>
                      </div>
                      {ch.isLive && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Categories */}
            <div className="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-900">
              <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">ক্যাটাগরি</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'all', label: 'সব', icon: <LayoutGrid className="w-4 h-4" /> },
                  { id: 'running_live', label: 'লাইভ', icon: <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> },
                  { id: 'cricket', label: '🏏 ক্রিকেট' },
                  { id: 'football', label: '⚽ ফুটবল' },
                  { id: 'fifa', label: '🏆 FIFA', highlight: true },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id as SportCategory)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 ${
                      category === cat.id
                        ? cat.highlight
                          ? 'bg-amber-500 text-black'
                          : 'bg-lime-500 text-black'
                        : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel List */}
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-900 overflow-hidden flex flex-col max-h-[500px]">
              <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex justify-between">
                <span className="text-xs font-bold">চ্যানেল</span>
                <span className="text-[10px] text-zinc-400">{filtered.length}</span>
              </div>
              <div className="overflow-y-auto flex-1">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-sm">
                    <Tv className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    চ্যানেল পাওয়া যায়নি
                  </div>
                ) : (
                  filtered.map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => setSelected(ch)}
                      className={`p-3 cursor-pointer transition flex items-center gap-3 ${
                        selected?.id === ch.id
                          ? 'bg-zinc-900 border-l-4 border-lime-500'
                          : 'hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                        {ch.logo ? (
                          <img src={ch.logo} alt="" className="w-7 h-7 object-contain" />
                        ) : (
                          <Radio className="w-4 h-4 text-zinc-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${selected?.id === ch.id ? 'text-lime-400' : ''}`}>
                          {ch.name}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {getFlag(ch.countryCode)} {ch.country}
                        </p>
                      </div>
                      {ch.isLive && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                      )}
                      {favorites.includes(ch.id) && (
                        <Star className="w-3 h-3 fill-yellow-500 text-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Favorites & Other Sections */}
        <div className="mt-8 space-y-6">
          {favChannels.length > 0 && (
            <div className="bg-zinc-900/30 p-5 rounded-2xl border border-rose-500/20">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 fill-rose-500 text-rose-500" />
                <h3 className="font-bold text-rose-400">প্রিয় চ্যানেল</h3>
                <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">
                  {favChannels.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {favChannels.slice(0, 4).map((ch) => (
                  <div
                    key={ch.id}
                    onClick={() => setSelected(ch)}
                    className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 cursor-pointer hover:border-rose-500/50 transition"
                  >
                    <p className="text-xs font-bold truncate">{ch.name}</p>
                    <p className="text-[10px] text-zinc-500">{getFlag(ch.countryCode)} {ch.country}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-500 bg-zinc-900/30 p-6 rounded-2xl border border-zinc-900">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-lime-500 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-300">অটো-সিঙ্ক</p>
              <p>৩ মিনিট পর পর প্লেলিস্ট আপডেট হয়</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Wifi className="w-4 h-4 text-lime-500 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-300">অ্যাডাপটিভ স্ট্রিমিং</p>
              <p>ইন্টারনেট স্পিড অনুযায়ী কোয়ালিটি অ্যাডজাস্ট</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-lime-500 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-300">অটো-প্লে</p>
              <p>লিংক ফেইল হলে পরবর্তী চ্যানেল চলে</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-900 py-4 mt-8 text-center text-xs text-zinc-500">
        <p>© 2026 Khelaghor - FIFA World Cup Edition</p>
      </footer>
    </div>
  );
}

export default App;
