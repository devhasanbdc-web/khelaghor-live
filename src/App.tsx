import React, { useEffect, useState, useMemo } from 'react';
import { 
  Tv, Radio, Search, RefreshCw, Star, Flame, Trophy, 
  HelpCircle, Languages, LayoutGrid, CheckCircle2, AlertTriangle, ChevronRight, Activity, Shield
} from 'lucide-react';
import { Channel, SportCategory } from './types';
import VideoPlayer from './components/VideoPlayer';

export default function App() {
  // Core states
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
  const [playlistLastUpdatedBn, setPlaylistLastUpdatedBn] = useState<string>('');
  const [commitSha, setCommitSha] = useState<string>('');

  // Track dead links
  const [deadLinks, setDeadLinks] = useState<Set<string>>(new Set());

  // FIFA Match List
  const [fifaMatches, setFifaMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(false);

  const fetchFifaMatches = async (force = false) => {
    setLoadingMatches(true);
    try {
      const resp = await fetch(`/api/fifa-schedule${force ? '?force=true' : ''}`);
      if (resp.ok) {
        const data = await resp.json();
        setFifaMatches(data.matches || []);
      }
    } catch (err) {
      console.error("Failed to fetch real-time FIFA matches:", err);
    } finaly {
      setLoadingMatches(false);
    }
  };

  // Load Channels from Express server API
  const fetchChannels = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      await fetchFifaMatches(forceRefresh);

      const response = await fetch(`/api/channels${forceRefresh ? '?force=true' : ''}`);
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.statusText}`);
      }
      const data = await response.json();
      const fetchedChannels = data.channels || [];
      
      setChannels(fetchedChannels);
      setCachedAt(data.cachedAt || Date.now());
      setPlaylistLastUpdated(data.playlistLastUpdated || '');
      setPlaylistLastUpdatedBn(data.playlistLastUpdatedBn || '');
      setCommitSha(data.commitSha || '');
      setDeadLinks(new Set());

      // AUTO PLAY: Open app and play first available FIFA or Live channel instantly
      const initialChannel = findBestInitialChannel(fetchedChannels);
      if (initialChannel) {
        setSelectedChannel(initialChannel);
        if (initialChannel.isFifa) {
          setActiveCategory('fifa');
        }
      }
    } catch (err: any) {
      console.error("Fetch channels error:", err);
      setError("চ্যানেল তালিকা লোড করতে ব্যর্থ হয়েছে। দয়া করে পুনঃচেষ্টা করুন।");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Helper to find the absolute best channel on app launch
  const findBestInitialChannel = (channelList: Channel[]) => {
    const fifaLive = channelList.find(ch => ch.isFifa && ch.isLive);
    if (fifaLive) return fifaLive;

    const fifaAny = channelList.find(ch => ch.isFifa);
    if (fifaAny) return fifaAny;

    const generalLive = channelList.find(ch => ch.isLive);
    if (generalLive) return generalLive;

    return channelList[0] || null;
  };

  // Function to mark a channel as dead and auto play the next valid stream
  const markChannelAsDead = (channelId: string) => {
    setDeadLinks(prev => {
      const updated = new Set(prev);
      updated.add(channelId);
      return updated;
    });
  };

  // Effect to perform sequential auto-switching when selectedChannel becomes dead
  useEffect(() => {
    if (selectedChannel && deadLinks.has(selectedChannel.id)) {
      // Find next best matching channel that is NOT dead
      const nextChannel = processedChannels.find(ch => !deadLinks.has(ch.id) && ch.id !== selectedChannel.id);
      if (nextChannel) {
        setSelectedChannel(nextChannel);
        if (nextChannel.isFifa) setActiveCategory('fifa');
        console.log(`Auto-switched stream to fallback: ${nextChannel.name}`);
      }
    }
  }, [deadLinks, selectedChannel]);

  useEffect(() => {
    fetchChannels();
    const timer = setInterval(() => {
      fetchFifaMatches();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Handlers for manual channel switching
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

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(id) ? prev.filter((favId) => favId !== id) : [...prev, id];
      localStorage.setItem('khelaghor_favorites', JSON.stringify(updated));
      return updated;
    });
  };

  // Dynamic processed channels logic - CRITICAL: Dead links always forced to absolute bottom
  const processedChannels = useMemo(() => {
    const list = channels.map(ch => ({
      ...ch,
      isFav: favorites.includes(ch.id),
      isDead: deadLinks.has(ch.id)
    }));

    return [...list].sort((a, b) => {
      // Rule 1: Dead links always go to the absolute bottom
      if (a.isDead && !b.isDead) return 1;
      if (!a.isDead && b.isDead) return -1;

      // Rule 2: Non-dead FIFA channels get top priority
      if (a.isFifa && !b.isFifa) return -1;
      if (!a.isFifa && b.isFifa) return 1;

      // Rule 3: Prioritize active running live feeds
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;

      return a.name.localeCompare(b.name);
    });
  }, [channels, favorites, deadLinks]);

  // Filter channels based on UI Category tabs
  const filteredChannels = useMemo(() => {
    return processedChannels.filter((ch) => {
      const matchesSearch = 
        ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ch.group && ch.group.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (activeCategory === 'running_live') return ch.isLive && !ch.isDead;
      if (activeCategory === 'cricket') return ch.isCricket && !ch.isDead;
      if (activeCategory === 'football') return ch.isFootball && !ch.isDead;
      if (activeCategory === 'fifa') return ch.isFifa && !ch.isDead;
      if (activeCategory === 'other') return !ch.isCricket && !ch.isFootball && !ch.isFifa && !ch.isDead;
      return true; 
    });
  }, [processedChannels, activeCategory, searchQuery]);

  // Bento Box Grid helpers (Excluding Dead Links)
  const hotLiveChannels = useMemo(() => processedChannels.filter(ch => ch.isLive && !ch.isDead).slice(0, 10), [processedChannels]);
  const fifaChannels = useMemo(() => processedChannels.filter(ch => ch.isFifa && !ch.isDead), [processedChannels]);
  const cricketChannels = useMemo(() => processedChannels.filter(ch => ch.isCricket && !ch.isFifa && !ch.isDead), [processedChannels]);
  const footballChannels = useMemo(() => processedChannels.filter(ch => ch.isFootball && !ch.isFifa && !ch.isDead), [processedChannels]);
  const otherChannels = useMemo(() => processedChannels.filter(ch => !ch.isCricket && !ch.isFootball && !ch.isFifa && !ch.isDead), [processedChannels]);
  const favoriteChannels = useMemo(() => processedChannels.filter(ch => ch.isFav && !ch.isDead), [processedChannels]);

  const getCountryEmoji = (code: string) => {
    if (!code || code === 'un') return '🌐';
    try {
      return String.fromCodePoint(...code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0)));
    } catch { return '🌐'; }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <div className="w-full bg-gradient-to-r from-amber-500 via-lime-500 to-emerald-500 h-1" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900 px-4 py-3.5 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-500 to-lime-500 p-2.5 rounded-2xl shadow">
              <Tv className="w-6 h-6 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl lg:text-2xl font-black bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                  {isBengali ? "খেলাঘর লাইভ" : "KHELAGHOR LIVE"}
                </h1>
                <span className="text-[9px] font-black bg-amber-500/20 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded uppercase">
                  WORLD CUP AUTO-PLAY
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center w-full sm:w-auto gap-2.5">
            <div className="relative flex-grow sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder={isBengali ? "চ্যানেল খুঁজুন..." : "Search channels..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 text-sm pl-10 pr-4 py-2 rounded-xl border border-zinc-800 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={() => fetchChannels(true)}
              className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={() => setIsBengali(!isBengali)}
              className="px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300"
            >
              {isBengali ? "English" : "বাংলা"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Panel */}
      <main className="max-w-7xl mx-auto px-4 py-6 lg:px-8 flex-grow w-full flex flex-col gap-6">
        
        {loading ? (
          <div className="w-full flex flex-col items-center justify-center p-32">
            <div className="w-16 h-16 border-t-2 border-amber-500 rounded-full animate-spin mb-4" />
            <p className="text-zinc-400 font-mono text-sm uppercase tracking-wider">Loading Live Stadium Feeds...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Screen Area */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {selectedChannel ? (
                  <div className="space-y-3">
                    <VideoPlayer 
                      channel={selectedChannel}
                      isFavorite={favorites.includes(selectedChannel.id)}
                      onToggleFavorite={() => handleToggleFavorite(selectedChannel.id)}
                      onNextChannel={playNextChannel}
                      onPrevChannel={playPrevChannel}
                      onStreamError={(id) => markChannelAsDead(id)}
                    />
                    
                    <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-900 flex justify-between items-center flex-wrap">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                          {selectedChannel.isFifa ? "🏆 FIFA World Cup Feed" : "📺 Live Broadcasting"}
                        </span>
                        <h2 className="text-lg font-bold text-white mt-2">{selectedChannel.name}</h2>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 block font-mono">CATEGORY</span>
                        <span className="text-xs text-zinc-300 font-bold bg-zinc-850 px-3 py-1 rounded-lg border border-zinc-800 block mt-1">
                          {selectedChannel.group}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center p-6 text-zinc-400">
                    <Tv className="w-12 h-12 mb-2 text-zinc-700" />
                    <p>No active channel running.</p>
                  </div>
                )}
              </div>

              {/* Sidebar Channels List */}
              <div className="flex flex-col gap-4">
                <div className="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-900 flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">Categories</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setActiveCategory('fifa')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border ${activeCategory === 'fifa' ? 'bg-amber-500 text-zinc-950 border-amber-400' : 'bg-zinc-950 text-amber-500 border-amber-500/20'}`}
                    >
                      <Trophy className="w-3.5 h-3.5" /> <span>FIFA World Cup</span>
                    </button>
                    <button
                      onClick={() => setActiveCategory('all')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold ${activeCategory === 'all' ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-950 text-zinc-400'}`}
                    >
                      All Feeds
                    </button>
                  </div>
                </div>

                {/* Directory List View */}
                <div className="bg-zinc-900/50 rounded-2xl border border-zinc-900 overflow-hidden flex flex-col h-[400px]">
                  <div className="p-3 bg-zinc-900 border-b border-zinc-850 text-xs font-bold flex justify-between items-center">
                    <span>Live Directory</span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Active: {filteredChannels.filter(c => !c.isDead).length}</span>
                  </div>
                  
                  <div className="overflow-y-auto divide-y divide-zinc-950/80 flex-grow custom-scrollbar">
                    {filteredChannels.map((ch) => {
                      const isPlaying = selectedChannel?.id === ch.id;
                      return (
                        <div
                          key={ch.id}
                          onClick={() => !ch.isDead && setSelectedChannel(ch)}
                          className={`p-3 transition flex items-center justify-between cursor-pointer ${ch.isDead ? 'opacity-40 bg-zinc-950/20' : isPlaying ? 'bg-zinc-900 border-l-4 border-amber-500' : 'hover:bg-zinc-900/30'}`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span className="text-sm shrink-0">{getCountryEmoji(ch.countryCode)}</span>
                            <span className={`text-xs font-bold truncate ${isPlaying ? 'text-amber-400' : 'text-zinc-200'}`}>{ch.name}</span>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${ch.isDead ? 'bg-red-950 text-red-500' : ch.isLive ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-800 text-zinc-500'}`}>
                            {ch.isDead ? 'Dead' : ch.isLive ? 'Live' : 'Ready'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-sections Bento Deck (FIFA First) */}
            <div className="space-y-6 pt-4 border-t border-zinc-900">
              <div className="bg-gradient-to-br from-amber-500/10 via-zinc-900/40 to-zinc-950 p-5 rounded-3xl border border-amber-500/20">
                <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider mb-3">🏆 Dedicated FIFA World Cup Streaming Deck</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {fifaChannels.map(ch => (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedChannel(ch)}
                      className={`p-3 rounded-xl border bg-zinc-900/40 transition cursor-pointer flex justify-between items-center ${selectedChannel?.id === ch.id ? 'border-amber-500 bg-amber-500/5' : 'border-zinc-800 hover:border-amber-500/30'}`}
                    >
                      <span className="text-xs font-bold text-zinc-200 truncate">{ch.name}</span>
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
