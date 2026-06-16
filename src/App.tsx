import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Tv, Radio, Search, RefreshCw, Star, Flame, Trophy, 
  HelpCircle, Languages, LayoutGrid, CheckCircle2, AlertTriangle, ChevronRight, Activity, Shield, Wifi, Signal
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
  const [activeCategory, setActiveCategory] = useState<SportCategory>('fifa'); // Default to FIFA
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [isBengali, setIsBengali] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [playlistLastUpdated, setPlaylistLastUpdated] = useState<string>('');
  const [playlistLastUpdatedBn, setPlaylistLastUpdatedBn] = useState<string>('');
  const [commitSha, setCommitSha] = useState<string>('');
  const [internetSpeed, setInternetSpeed] = useState<number>(0);
  const [autoQuality, setAutoQuality] = useState<boolean>(true);

  // FIFA Match Interface definition and reactive lists
  const [fifaMatches, setFifaMatches] = useState<Array<{
    id: string;
    homeTeam: string;
    homeTeamBn: string;
    homeFlag: string;
    awayTeam: string;
    awayTeamBn: string;
    awayFlag: string;
    matchType: string;
    matchTypeBn: string;
    dateTime: string;
    dateTimeBn: string;
    dateLabel: string;
    dateLabelBn: string;
    status: 'live' | 'upcoming' | 'completed';
    homeScore?: number;
    awayScore?: number;
    timeRemaining?: string;
    timeRemainingBn?: string;
    sortTimestamp?: number;
  }>>([]);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(false);

  // Measure internet speed
  const measureInternetSpeed = useCallback(async () => {
    try {
      const startTime = Date.now();
      const response = await fetch('/api/channels?t=' + Date.now(), {
        cache: 'no-store'
      });
      const endTime = Date.now();
      const dataSize = response.headers.get('content-length') || '100000';
      const sizeInBits = parseInt(dataSize as string) * 8;
      const timeInSeconds = (endTime - startTime) / 1000;
      const speed = sizeInBits / timeInSeconds / 1000000; // Mbps
      setInternetSpeed(Math.round(speed));
    } catch {
      setInternetSpeed(0);
    }
  }, []);

  // Determine quality based on internet speed
  const getAutoQuality = useCallback((speed: number) => {
    if (speed > 20) return '4K';
    if (speed > 10) return '1080p';
    if (speed > 5) return '720p';
    if (speed > 2) return '480p';
    return '360p';
  }, []);

  // Load Channels from Express server API
  const fetchChannels = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      // Measure internet speed
      await measureInternetSpeed();

      // Concurrently parse the real fixtures!
      fetchFifaMatches(forceRefresh);

      // Direct call to our custom premium server endpoint
      const response = await fetch(`/api/channels${forceRefresh ? '?force=true' : ''}`);
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.statusText}`);
      }
      const data = await response.json();
      setChannels(data.channels || []);
      setCachedAt(data.cachedAt || Date.now());
      setPlaylistLastUpdated(data.playlistLastUpdated || '');
      setPlaylistLastUpdatedBn(data.playlistLastUpdatedBn || '');
      setCommitSha(data.commitSha || '');

      // Set default video - prioritize FIFA World Cup channels
      if (data.channels && data.channels.length > 0 && !selectedChannel) {
        // First try to find FIFA World Cup channels
        const fifaChannels = data.channels.filter((ch: Channel) => ch.isFifa);
        const liveFifaChannels = fifaChannels.filter((ch: Channel) => ch.isLive);
        
        let defaultCh;
        if (liveFifaChannels.length > 0) {
          defaultCh = liveFifaChannels[0];
        } else if (fifaChannels.length > 0) {
          defaultCh = fifaChannels[0];
        } else {
          // Fallback to any live channel
          defaultCh = data.channels.find((ch: Channel) => ch.isLive) || data.channels[0];
        }
        setSelectedChannel(defaultCh);
      }
    } catch (err: any) {
      console.error("Fetch channels error:", err);
      setError("চ্যানেল তালিকা লোড করতে ব্যর্থ হয়েছে। দয়া করে পুনঃচেষ্টা করুন। (Could not load IPTV playlist)");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChannels();

    // Auto update live scores every 60 seconds
    const timer = setInterval(() => {
      fetchFifaMatches();
      measureInternetSpeed(); // Re-measure speed periodically
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Sync favorites with localStorage
  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(id) 
        ? prev.filter((favId) => favId !== id) 
        : [...prev, id];
      localStorage.setItem('khelaghor_favorites', JSON.stringify(updated));
      return updated;
    });
  };

  // Auto play next channel if current channel fails
  const handleChannelError = useCallback(() => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    
    const currentIndex = filteredChannels.findIndex(ch => ch.id === selectedChannel.id);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % filteredChannels.length;
      setSelectedChannel(filteredChannels[nextIndex]);
    }
  }, [selectedChannel, filteredChannels]);

  // Switch to next/previous channel
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

  // FIFA matches fetching
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
    } finally {
      setLoadingMatches(false);
    }
  };

  // Dynamically sorted schedule list
  const sortedFifaMatches = useMemo(() => {
    return [...fifaMatches].sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (a.status !== 'live' && b.status === 'live') return 1;
      if (a.status === 'upcoming' && b.status === 'completed') return -1;
      if (a.status === 'completed' && b.status === 'upcoming') return 1;

      const tsA = a.sortTimestamp ?? Infinity;
      const tsB = b.sortTimestamp ?? Infinity;
      if (a.status === 'upcoming' && b.status === 'upcoming') {
        return tsA - tsB;
      }
      if (a.status === 'completed' && b.status === 'completed') {
        return tsB - tsA;
      }
      return tsA - tsB;
    });
  }, [fifaMatches]);

  // Helpers to structure channels based on user filters
  const processedChannels = useMemo(() => {
    const list = channels.map(ch => ({
      ...ch,
      isFav: favorites.includes(ch.id)
    }));

    // Auto-sort to guarantee LIVE FIFA matches are ALWAYS at the top
    return [...list].sort((a, b) => {
      const getScore = (ch: typeof a) => {
        let score = 0;

        // 0. FIFA World Cup channels get the absolute highest priority
        if (ch.isFifa) {
          score += 50000;
        }

        // 1. Live status gets highest sorting weight
        if (ch.isLive) {
          score += 10000;
        }

        const gLower = (ch.group || "").toLowerCase();
        const nLower = (ch.name || "").toLowerCase();

        // 2. High priority match play and live event packages
        if (gLower.includes("live event") || gLower.includes("bdix") || gLower.includes("fifa")) {
          score += 5000;
        }

        // 3. Premium targeted live sports channels
        if (nLower.includes("[bd]") || nLower.includes("sports hd") || nLower.includes("t sports") || nLower.toLowerCase().includes("btv")) {
          score += 3000;
        }

        // 4. Any general cricket or football tag
        if (ch.isCricket || ch.isFootball || ch.isFifa) {
          score += 1000;
        }

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

  // Filters by Category & Search query matching
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

  // Split matches for layout sections
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

  const otherChannels = useMemo(() => {
    return processedChannels.filter(ch => !ch.isCricket && !ch.isFootball && !ch.isFifa);
  }, [processedChannels]);

  const favoriteChannels = useMemo(() => {
    return processedChannels.filter(ch => ch.isFav);
  }, [processedChannels]);

  // Get flag/emoji of country code
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

  // Convert last fetched to neat counter format
  const getRelativeFetchTime = () => {
    if (!cachedAt) return "";
    const secondsAgo = Math.floor((Date.now() - cachedAt) / 1000);
    if (secondsAgo < 60) {
      return isBengali ? "এইমাত্র আপডেট করা হয়েছে" : "Just now";
    }
    const minutesAgo = Math.floor(secondsAgo / 60);
    return isBengali 
      ? `${minutesAgo} মিনিট আগে আপডেট হয়েছে` 
      : `${minutesAgo}m ago`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-lime-500 selection:text-zinc-950">
      
      <div className="w-full bg-gradient-to-r from-lime-500 via-emerald-500 to-indigo-500 h-1.5 shadow-md shadow-lime-500/10" />

      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900 px-4 py-3.5 lg:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center bg-gradient-to-br from-lime-400 to-emerald-500 p-2.5 rounded-2xl shadow-lg shadow-lime-500/10 active:scale-95 transition-all">
              <Tv className="w-6 h-6 text-zinc-950" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-zinc-950" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl lg:text-2xl font-black bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent tracking-wide">
                  {isBengali ? "খেলাঘর" : "KHELAGHOR"}
                </h1>
                <span className="font-mono text-[9px] font-extrabold bg-lime-500/15 border border-lime-500/30 text-lime-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  FIFA WORLD CUP
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium font-sans">
                {isBengali ? "ফিফা বিশ্বকাপ লাইভ স্ট্রিম" : "FIFA World Cup Live Streams"}
              </p>
            </div>
          </div>

          <div className="flex items-center w-full sm:w-auto gap-2.5">
            {/* Internet Speed Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 bg-zinc-900/80 px-3 py-1.5 rounded-xl border border-zinc-800">
              <Wifi className={`w-4 h-4 ${internetSpeed > 5 ? 'text-lime-400' : internetSpeed > 2 ? 'text-yellow-400' : 'text-red-400'}`} />
              <span className="text-[10px] font-mono text-zinc-300">
                {internetSpeed > 0 ? `${internetSpeed} Mbps` : '...'}
              </span>
              <span className="text-[8px] text-zinc-500 font-mono">
                {autoQuality ? `Auto: ${getAutoQuality(internetSpeed)}` : 'Manual'}
              </span>
            </div>

            <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                id="search-box"
                type="text"
                placeholder={isBengali ? "চ্যানেল বা দেশের নাম দিয়ে খুঁজুন..." : "Filter sports, country..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/95 text-sm pl-10 pr-4 py-2 rounded-xl border border-zinc-800 focus:border-lime-400/50 focus:outline-none focus:ring-1 focus:ring-lime-500/30 text-white placeholder-zinc-500 transition duration-150"
              />
            </div>

            <button
              id="refresh-iptv-trigger"
              onClick={() => fetchChannels(true)}
              disabled={isRefreshing}
              className="p-2.5 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700/80 rounded-xl text-zinc-400 hover:text-white transition duration-200 active:scale-95 flex items-center gap-1.5"
              title={isBengali ? "স্ট্রিমিং লিঙ্ক রিফ্রেশ করুন" : "Refresh M3U source"}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-lime-400' : ''}`} />
            </button>

            <button
              id="lang-switcher"
              onClick={() => setIsBengali(!isBengali)}
              className="px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl hover:text-white transition duration-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Languages className="w-4 h-4 text-lime-400" />
              <span>{isBengali ? "English" : "বাংলা"}</span>
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 lg:px-8 flex-grow w-full flex flex-col gap-6">
        
        {error && (
          <div className="w-full bg-red-950/20 border border-red-500/30 text-red-400 p-4 rounded-2xl flex items-center gap-3 animate-fade-in shadow-lg">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-grow text-xs font-medium">
              {error}
            </div>
            <button 
              onClick={() => fetchChannels()}
              className="px-4 py-1.5 bg-red-500 text-zinc-950 font-bold hover:bg-red-400 text-[10px] rounded-lg cursor-pointer transition active:scale-95"
            >
              পুনরায় চেষ্টা করুন (Retry)
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-zinc-400 bg-zinc-900/35 px-4.5 py-3 rounded-2xl border border-zinc-900/80 shadow-inner">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
              </span>
              <span className="font-bold text-zinc-300">
                {isBengali 
                  ? `ফিফা বিশ্বকাপ লাইভ স্ট্রিম (অটো-সিঙ্ক)` 
                  : `FIFA World Cup Live Streams (Auto-synced)`}
              </span>
            </div>
            
            {(playlistLastUpdated || playlistLastUpdatedBn) && (
              <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 pl-4 flex-wrap">
                <Shield className="w-3 h-3 text-lime-500/85" />
                <span>
                  {isBengali 
                    ? `সর্বশেষ গিটহাব আপডেট: ${playlistLastUpdatedBn || playlistLastUpdated}` 
                    : `Latest GitHub Commit: ${playlistLastUpdated || playlistLastUpdatedBn}`}
                </span>
              </div>
            )}
          </div>
          
          <div className="font-mono text-[10px] flex items-center justify-between md:justify-end gap-3 border-t border-zinc-900 md:border-t-0 pt-2 md:pt-0">
            <span className="text-zinc-400">
              {isBengali ? "মোট উপলব্ধ চ্যানেল:" : "Total Live Channels:"}{" "}
              <span className="text-lime-400 font-extrabold text-xs">{channels.length}</span>
            </span>
            {cachedAt && (
              <span className="text-zinc-500 pl-3 border-l border-zinc-800/80 text-[10px]">
                {getRelativeFetchTime()}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="w-full flex flex-col items-center justify-center p-16 md:p-32 bg-zinc-950/20 border border-zinc-900/80 rounded-3xl backdrop-blur relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-lime-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative flex items-center justify-center mb-6">
              <div className="w-20 h-20 rounded-full border-t-2 border-lime-500 border-r-2 animate-spin"></div>
              <Tv className="absolute w-8 h-8 text-lime-400 animate-pulse" />
            </div>
            
            <h3 className="text-xl font-black text-white mb-2 font-sans select-none animate-pulse text-center tracking-tight">
              {isBengali ? "ফিফা বিশ্বকাপ প্রস্তুত করা হচ্ছে..." : "Preparing FIFA World Cup..."}
            </h3>
            
            <p className="text-xs text-zinc-400 max-w-md text-center mb-6 leading-relaxed">
              {isBengali 
                ? "ফিফা বিশ্বকাপের লাইভ স্ট্রিমিং চ্যানেলগুলি লোড করা হচ্ছে..." 
                : "Loading FIFA World Cup live streaming channels..."}
            </p>
          </div>
        ) : (
          <>
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
                          <span className="text-xs uppercase font-extrabold tracking-wider text-lime-400 bg-lime-500/10 border border-lime-500/25 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            {selectedChannel.isLive && <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse inline-block" />}
                            {isBengali ? "বর্তমানে খেলছেনঃ" : "Now Watching:"}
                          </span>
                          <span className="text-xs bg-zinc-800 px-2.5 py-1.5 text-zinc-300 rounded-lg flex items-center gap-1">
                            {getCountryEmoji(selectedChannel.countryCode)} <span className="font-semibold">{selectedChannel.country}</span>
                          </span>
                        </div>
                        <h2 className="text-lg font-bold text-white mt-2 flex items-center gap-2">
                          {selectedChannel.name}
                          {selectedChannel.isFifa && <Trophy className="w-5 h-5 text-amber-500" />}
                        </h2>
                      </div>
                      
                      <div className="text-right">
                        <span className="text-xs text-zinc-400 block font-mono">GROUP / CATEGORY</span>
                        <span className="text-xs text-lime-400 font-bold bg-zinc-850 px-3 py-1.5 rounded-xl border border-zinc-800 block mt-1">
                          {selectedChannel.group}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center p-6 text-center">
                    <Tv className="w-12 h-12 text-zinc-600 mb-3" />
                    <p className="text-sm text-zinc-400 font-medium">কোন চ্যানেল নির্বাচিত হয়নি (No Channel Selected)</p>
                    <p className="text-xs text-zinc-500 mt-1">নীচের লাইভ তালিকা থেকে একটি বেছে নিন</p>
                  </div>
                )}

                {/* FIFA World Cup Live Match Hub Banner */}
                <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-600/5 to-zinc-950 border border-amber-500/20 shadow-xl relative overflow-hidden">
                  <div className="absolute top-2 right-2 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4 scale-150">
                    <Trophy className="w-48 h-48 text-amber-500" />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                        <span className="text-[10px] font-mono font-extrabold uppercase text-amber-400 tracking-widest bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                          FIFA World Cup • ফিফা বিশ্বকাপ
                        </span>
                      </div>
                      <h3 className="text-base lg:text-lg font-black tracking-tight text-white flex items-center gap-2 mt-1">
                        🏆 {isBengali ? "ফিফা বিশ্বকাপ সরাসরি সম্প্রচার কেন্দ্র" : "FIFA World Cup Live Broadcast Hub"}
                      </h3>
                      <p className="text-xs text-zinc-400 max-w-xl">
                        {isBengali
                          ? "ফিফা ওয়ার্ল্ড কাপের সমস্ত ম্যাচ, সরাসরি সম্প্রচার, কাস্টম ফিড ও বিশেষ স্পোর্টস টিভি চ্যানেলগুলি ট্র্যাকার। এক ক্লিকে খেলা উপভোগ করুন!"
                          : "All FIFA World Cup matches, live coverages, custom feeds, and exclusive TV channels aggregated in real-time."}
                      </p>
                    </div>

                    <button
                      id="view-fifa-filter"
                      onClick={() => setActiveCategory('fifa')}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/10 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer self-start sm:self-center"
                    >
                      {isBengali ? "বিশ্বকাপ চ্যানেলগুলো দেখুন" : "View World Cup Feeds"}
                    </button>
                  </div>

                  <div className="mt-4 pt-4 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                    {fifaChannels.length > 0 ? (
                      fifaChannels.map((ch) => {
                        const isSelected = selectedChannel?.id === ch.id;
                        return (
                          <div
                            id={`fifa-hub-${ch.id}`}
                            key={ch.id}
                            onClick={() => {
                              setSelectedChannel(ch);
                              window.scrollTo({ top: 120, behavior: 'smooth' });
                            }}
                            className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                              isSelected
                                ? 'bg-amber-500/10 border-amber-500/60 text-amber-300'
                                : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900/60 hover:border-amber-500/20'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl">🏆</span>
                              <div>
                                <h4 className="text-xs font-black line-clamp-1 text-zinc-200">{ch.name}</h4>
                                <p className="text-[10px] text-zinc-500 mt-0.5">{getCountryEmoji(ch.countryCode)} {ch.country} • Live Stream</p>
                              </div>
                            </div>
                            <span className="flex h-2 w-2 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="sm:col-span-2 p-4 bg-zinc-900/20 border border-zinc-900/65 rounded-2xl text-center flex flex-col items-center justify-center">
                        <div className="flex items-center gap-2 text-amber-500 font-bold text-xs mb-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
                          <span>{isBengali ? "লাইভ বিশ্বকাপ ম্যাচ শুরু হওয়ার অপেক্ষা" : "Awaiting Kickoff of Live Match"}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed max-w-lg">
                          {isBengali
                            ? "বর্তমানে সরাসরি কোনো ফিফা নির্দিষ্ট ম্যাচ শুরু হয়নি। তবে নিচে খেলাঘরের প্রধান ফুটবল চ্যানেলগুলোর সাহায্যে বিশ্বকাপ প্রস্তুতি ম্যাচ বা অন্যান্য লীগের লাইভ খেলা এখনি দেখতে পারেন!"
                            : "No active FIFA matches are live streaming at this second. Feeds activate on demand as per schedule."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* HORIZONTAL CAROUSEL - "HOT 🔴" LIVE MATCHES */}
                {hotLiveChannels.length > 0 && (
                  <div className="mt-2 text-zinc-100">
                    <div className="flex items-center gap-2 mb-3.5 px-1">
                      <Flame className="w-5 h-5 text-red-500 fill-current animate-pulse" />
                      <h3 className="text-md font-black tracking-wide uppercase flex items-center gap-1.5">
                        <span>{isBengali ? "চলতি হট খেলা" : "Hot Live Actions"}</span>
                        <span className="bg-red-500 text-white font-mono font-black text-[9px] px-1.5 py-0.5 rounded tracking-widest animate-pulse">HOT</span>
                      </h3>
                    </div>
                    
                    <div className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar snap-x scroll-smooth">
                      {hotLiveChannels.map((ch) => {
                        const isSelected = selectedChannel?.id === ch.id;
                        return (
                          <div
                            id={`hot-ch-${ch.id}`}
                            key={ch.id}
                            onClick={() => setSelectedChannel(ch)}
                            className={`flex-shrink-0 w-52 snap-start p-3 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                              isSelected 
                                ? 'bg-gradient-to-br from-zinc-900 to-lime-950/20 border-lime-500/70 shadow-lg shadow-lime-500/5' 
                                : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900 hover:border-zinc-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1 mb-2">
                              <span className="text-xs bg-zinc-850/90 px-2 py-1 rounded-md text-zinc-300 border border-zinc-800 flex items-center gap-1" title={ch.country}>
                                <span>{getCountryEmoji(ch.countryCode)}</span>
                                <span className="font-sans text-[10px] text-zinc-400 font-semibold uppercase">{ch.countryCode}</span>
                              </span>

                              <span className="flex items-center gap-1.5 bg-red-600/10 border border-red-500/30 px-2 py-0.5 rounded text-[9px] text-red-400 font-bold uppercase animate-pulse">
                                <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
                                <span>LIVE</span>
                              </span>
                            </div>

                            <p className="text-xs font-bold text-white line-clamp-2 min-h-8 mb-2 tracking-wide font-sans">
                              {ch.name}
                            </p>

                            <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500 font-mono">
                              <span>{ch.isCricket ? "🏏 CRICKET" : "⚽ FOOTBALL"}</span>
                              <ChevronRight className={`w-3 h-3 ${isSelected ? 'text-lime-400 translate-x-0.5' : 'text-zinc-600'} transition-transform`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

              <div className="flex flex-col gap-4">
                
                <div className="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-900">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-2 px-1 font-mono tracking-wider">
                    {isBengali ? "সম্প্রচার ক্যাটাগরি" : "Filter Sports Feed"}
                  </span>
                  <div className="grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                    
                    <button
                      id="cat-all"
                      onClick={() => setActiveCategory('all')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition duration-150 ${
                        activeCategory === 'all'
                          ? 'bg-lime-500 text-zinc-950 font-black shadow-lg shadow-lime-500/10'
                          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span>{isBengali ? "অ্যাকশন অল" : "All Channels"}</span>
                    </button>

                    <button
                      id="cat-live"
                      onClick={() => setActiveCategory('running_live')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition duration-150 ${
                        activeCategory === 'running_live'
                          ? 'bg-red-600 text-white font-black shadow-lg shadow-red-500/10 animate-pulse'
                          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      <span>{isBengali ? "হট লাইভ" : "Running Live"}</span>
                    </button>

                    <button
                      id="cat-cricket"
                      onClick={() => setActiveCategory('cricket')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition duration-150 ${
                        activeCategory === 'cricket'
                          ? 'bg-lime-500 text-zinc-950 font-black shadow-lg shadow-lime-500/10'
                          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                      }`}
                    >
                      <span className="text-sm">🏏</span>
                      <span>{isBengali ? "ক্রিকেট সরাসরি" : "Cricket"}</span>
                    </button>

                    <button
                      id="cat-football"
                      onClick={() => setActiveCategory('football')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition duration-150 ${
                        activeCategory === 'football'
                          ? 'bg-lime-500 text-zinc-950 font-black shadow-lg shadow-lime-500/10'
                          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                      }`}
                    >
                      <span className="text-sm">⚽</span>
                      <span>{isBengali ? "ফুটবল সরাসরি" : "Football"}</span>
                    </button>

                    <button
                      id="cat-fifa"
                      onClick={() => setActiveCategory('fifa')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition duration-150 col-span-2 lg:col-span-1 xl:col-span-2 ${
                        activeCategory === 'fifa'
                          ? 'bg-amber-500 text-zinc-950 font-black shadow-lg shadow-amber-500/20'
                          : 'bg-zinc-900 border border-amber-500/20 text-amber-400 hover:bg-amber-950/20'
                      }`}
                    >
                      <Trophy className="w-4 h-4 text-amber-500 fill-amber-500/25" />
                      <span>{isBengali ? "ফিফা বিশ্বকাপ" : "FIFA World Cup"}</span>
                      {fifaChannels.length > 0 && (
                        <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                          {fifaChannels.length} Live
                        </span>
                      )}
                    </button>

                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-zinc-850">
                    <button
                      id="cat-other"
                      onClick={() => setActiveCategory('other')}
                      className={`px-2 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition duration-150 ${
                        activeCategory === 'other'
                          ? 'bg-zinc-800 text-lime-400 border border-lime-500/20'
                          : 'bg-zinc-950/50 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>{isBengali ? "অন্যান্য টিভি" : "Others"}</span>
                    </button>

                    <button
                      id="cat-favorites"
                      onClick={() => {
                        setActiveCategory('all');
                        setSearchQuery('');
                        const el = document.getElementById('favs-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="px-2 py-2 bg-zinc-950/50 hover:bg-zinc-850 text-zinc-400 hover:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span>{isBengali ? "প্রিয় তালিকা" : "Favorites"} ({favorites.length})</span>
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-900/50 rounded-2xl border border-zinc-900 overflow-hidden flex flex-col flex-grow min-h-[420px] max-h-[580px]">
                  
                  <div className="p-3 bg-zinc-900 border-b border-zinc-850 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-lime-400" />
                      <span className="text-xs font-bold font-sans">
                        {isBengali ? "চ্যানেল ডিরেক্টরি" : "Match Channels"}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                      {filteredChannels.length} / {channels.length}
                    </span>
                  </div>

                  <div className="overflow-y-auto divide-y divide-zinc-950 flex-grow custom-scrollbar">
                    {filteredChannels.length === 0 ? (
                      <div className="p-10 text-center flex flex-col items-center justify-center">
                        <Tv className="w-8 h-8 text-zinc-700 mb-2" />
                        <h4 className="text-zinc-500 text-xs font-bold">চ্যানেল পাওয়া যায়নি</h4>
                        <p className="text-[10px] text-zinc-600 mt-1">অন্য ক্যাটাগরি বা কীওয়ার্ড চেষ্টা করুন</p>
                      </div>
                    ) : (
                      filteredChannels.map((ch) => {
                        const isPlayingNow = selectedChannel?.id === ch.id;
                        return (
                          <div
                            id={`dir-ch-${ch.id}`}
                            key={ch.id}
                            onClick={() => setSelectedChannel(ch)}
                            className={`p-3 transition-all duration-150 flex items-center justify-between cursor-pointer ${
                              isPlayingNow 
                                ? 'bg-zinc-900 border-l-4 border-lime-500' 
                                : 'hover:bg-zinc-900/40 bg-zinc-950/25'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-zinc-900/90 border border-zinc-800 p-1 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                                {ch.logo ? (
                                  <img 
                                    src={ch.logo} 
                                    alt={ch.name} 
                                    className="w-full h-full object-contain" 
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = "";
                                    }}
                                  />
                                ) : (
                                  <Radio className="w-5 h-5 text-zinc-600" />
                                )}
                                {ch.isFav && (
                                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 rounded-full border border-zinc-950" />
                                )}
                              </div>
                              
                              <div>
                                <h4 className={`text-xs font-bold leading-tight transition ${isPlayingNow ? 'text-lime-400' : 'text-zinc-200'}`}>
                                  {ch.name}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-1 font-sans text-[10px] text-zinc-500">
                                  <span>{getCountryEmoji(ch.countryCode)} {ch.country}</span>
                                  <span className="text-zinc-700">•</span>
                                  <span className="uppercase text-[9px] font-mono tracking-wider">{ch.group}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {ch.isLive ? (
                                <span className="flex items-center gap-1 bg-red-600 px-1.5 py-0.5 rounded text-[8px] text-white font-extrabold tracking-wider animate-pulse uppercase">
                                  <span>LIVE</span>
                                </span>
                              ) : (
                                <span className="bg-zinc-900 border border-zinc-800 text-[8px] text-zinc-500 px-1.5 py-0.5 rounded uppercase font-bold">
                                  OFFLINE
                                </span>
                              )}
                              <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider font-mono">
                                {ch.isFifa ? "🏆 FIFA" : ch.isCricket ? "🏏 Cricket" : ch.isFootball ? "⚽ Football" : "📺 General"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                </div>

              </div>
              
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-900">
              
              {favoriteChannels.length > 0 && (
                <div id="favs-section" className="bg-zinc-950/20 p-5 rounded-2xl border border-rose-950/20 shadow-md">
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="w-5 h-5 text-rose-500 fill-rose-500" />
                    <h3 className="text-base font-black uppercase text-rose-400">
                      {isBengali ? "আপনার প্রিয় চ্যানেল সমূহ" : "Your Favorite Channels"}
                    </h3>
                    <span className="text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2.5 py-0.5 rounded-full font-bold">
                      {favoriteChannels.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {favoriteChannels.map(ch => (
                      <div 
                        id={`fav-card-${ch.id}`}
                        key={ch.id}
                        onClick={() => {
                          setSelectedChannel(ch);
                          window.scrollTo({ top: 120, behavior: 'smooth' });
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between ${
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
                            <p className="text-[10px] text-zinc-500 mt-0.5">{getCountryEmoji(ch.countryCode)} {ch.country}</p>
                          </div>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-zinc-950 p-6 rounded-3xl border border-amber-500/20 shadow-md">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-900">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl animate-bounce self-center">🏆</span>
                    <div>
                      <h3 className="text-sm font-black uppercase text-amber-400 tracking-wide flex items-center gap-2">
                        {isBengali ? "ফিফা বিশ্বকাপ ডেডিকেটেড সম্প্রচার" : "FIFA World Cup Streams"}
                        <span className="bg-red-500 text-white font-mono text-[9px] px-1.5 py-0.5 rounded animate-pulse">DIRECT</span>
                      </h3>
                      <p className="text-[10px] text-zinc-400 font-sans">
                        {isBengali ? "সরাসরি মাঠ থেকে লাইভ হাই ডেফিনিশন ফিড ও পার্টনার টিভি চ্যানেল সমূহ" : "High-definition camera streams & official broadcasting partners"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    {fifaChannels.length > 0 ? `${fifaChannels.length} Feeds Match` : "Broadcast Tracker Live"}
                  </span>
                </div>

                {fifaChannels.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-900/10 border border-zinc-900/60 rounded-2xl flex flex-col items-center justify-center">
                    <Trophy className="w-8 h-8 text-amber-500/30 mb-2" />
                    <h4 className="text-xs text-zinc-300 font-bold">{isBengali ? "ফিফা বিশ্বকাপের সরাসরি স্ট্রিমসমূহ" : "FIFA Streaming Channels Ready"}</h4>
                    <p className="text-[10px] text-zinc-500 mt-1 max-w-xl">
                      {isBengali 
                        ? "এই মুহূর্তে সরাসরি ফিফা বিশ্বকাপ শুরু হয়নি। তবে নিচে খেলাঘরের প্রধান ফুটবল চ্যানেলগুলোর সাহায্যে বিশ্বকাপ প্রস্তুতি ম্যাচ বা অন্যান্য লীগের লাইভ খেলা এখনি দেখতে পারেন!" 
                        : "No active FIFA feeds parsed right now. Broadcast triggers as soon as the matches go live on the official channels."}
                    </p>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 w-full">
                      {processedChannels.filter(ch => ch.isFootball).slice(0, 4).map(ch => (
                        <div
                          id={`fifa-bento-fb-${ch.id}`}
                          key={ch.id}
                          onClick={() => {
                            setSelectedChannel(ch);
                            window.scrollTo({ top: 120, behavior: 'smooth' });
                          }}
                          className="p-2.5 bg-zinc-900 hover:bg-zinc-850 rounded-xl text-center border border-zinc-800/60 cursor-pointer transition text-[11px] font-bold text-zinc-300 hover:text-white truncate"
                        >
                          <span className="mr-1">⚽</span> {ch.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {fifaChannels.map(ch => (
                      <div
                        id={`fifa-grid-ch-${ch.id}`}
                        key={ch.id}
                        onClick={() => {
                          setSelectedChannel(ch);
                          window.scrollTo({ top: 120, behavior: 'smooth' });
                        }}
                        className={`p-3.5 rounded-2xl border text-left cursor-pointer transition flex items-center justify-between ${
                          selectedChannel?.id === ch.id 
                            ? 'bg-amber-500/10 border-amber-500 text-amber-400' 
                            : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900 hover:border-amber-500/25'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 items-center justify-center bg-zinc-950 p-1 rounded-xl flex border border-zinc-800 flex-shrink-0">
                            {ch.logo ? <img src={ch.logo} className="w-full h-full object-contain" alt="" referrerPolicy="no-referrer" /> : <Trophy className="w-4 h-4 text-amber-500" />}
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-zinc-200 line-clamp-1">{ch.name}</h4>
                            <p className="text-[10px] text-zinc-500 mt-0.5">{getCountryEmoji(ch.countryCode)} {ch.country}</p>
                          </div>
                        </div>
                        <span className="animate-ping w-1.5 h-1.5 rounded-full bg-red-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="bg-zinc-900/25 p-5 rounded-2xl border border-zinc-900">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-900">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🏏</span>
                      <div>
                        <h3 className="text-sm font-black uppercase text-white tracking-wide">
                          {isBengali ? "ক্রিকেট সম্প্রচার সরাসরি" : "Cricket Sports Cast"}
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-sans">
                          {isBengali ? "বিশ্বকাপ, লাইভ সিরিজ ও খেলার চ্যানেল" : "Live Series, T20s and Sports TV"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-lime-400 bg-lime-500/10 px-2.5 py-1 rounded-lg">
                      {cricketChannels.length} TV
                    </span>
                  </div>

                  {cricketChannels.length === 0 ? (
                    <div className="p-10 text-center text-zinc-600 text-xs">
                      {isBengali ? "কোন ক্রিকেট চ্যানেল তথ্য নেই" : "No Cricket channels found"}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1.5 custom-scrollbar">
                      {cricketChannels.map(ch => (
                        <div
                          id={`cricket-grid-ch-${ch.id}`}
                          key={ch.id}
                          onClick={() => {
                            setSelectedChannel(ch);
                            window.scrollTo({ top: 120, behavior: 'smooth' });
                          }}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                            selectedChannel?.id === ch.id 
                              ? 'bg-lime-500/10 border-lime-500/50 text-lime-400' 
                              : 'bg-zinc-950/60 hover:bg-zinc-900 border-zinc-900 hover:border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-[11px] font-bold text-zinc-200 line-clamp-1">{ch.name}</h4>
                            <span className="text-[11px] flex-shrink-0" title={ch.country}>{getCountryEmoji(ch.countryCode)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[9px] text-zinc-500">
                            <span>{ch.country}</span>
                            {ch.isLive && <span className="text-red-400 font-bold tracking-wider uppercase">🔴 LIVE</span>}
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
                      <div>
                        <h3 className="text-sm font-black uppercase text-white tracking-wide">
                          {isBengali ? "ফুটবল সম্প্রচার সরাসরি" : "Football Sports Cast"}
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-sans">
                          {isBengali ? "প্রিমিয়ার লীগ, লা লিগা ও ফুটবল বিশ্ব টিভি" : "Leagues, Champions Cup and football feeds"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-lime-400 bg-lime-500/10 px-2.5 py-1 rounded-lg">
                      {footballChannels.length} TV
                    </span>
                  </div>

                  {footballChannels.length === 0 ? (
                    <div className="p-10 text-center text-zinc-600 text-xs">
                      {isBengali ? "কোন ফুটবল চ্যানেল তথ্য নেই" : "No Football channels found"}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1.5 custom-scrollbar">
                      {footballChannels.map(ch => (
                        <div
                          id={`foot-grid-ch-${ch.id}`}
                          key={ch.id}
                          onClick={() => {
                            setSelectedChannel(ch);
                            window.scrollTo({ top: 120, behavior: 'smooth' });
                          }}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                            selectedChannel?.id === ch.id 
                              ? 'bg-lime-500/10 border-lime-500/50 text-lime-400' 
                              : 'bg-zinc-950/60 hover:bg-zinc-900 border-zinc-900 hover:border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-[11px] font-bold text-zinc-200 line-clamp-1">{ch.name}</h4>
                            <span className="text-[11px] flex-shrink-0" title={ch.country}>{getCountryEmoji(ch.countryCode)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[9px] text-zinc-500">
                            <span>{ch.country}</span>
                            {ch.isLive && <span className="text-red-400 font-bold tracking-wider uppercase">🔴 LIVE</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {otherChannels.length > 0 && (
                <div className="bg-zinc-900/10 p-5 rounded-2xl border border-zinc-900">
                  <div className="flex items-center gap-2 mb-3">
                    <Radio className="w-5 h-5 text-lime-400" />
                    <h3 className="text-sm font-black uppercase text-white">
                      {isBengali ? "অন্যান্য বিনোদন ও সংবাদ টিভি" : "Other Entertainment & News Streams"}
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {otherChannels.slice(0, 24).map(ch => (
                      <div
                        id={`other-grid-ch-${ch.id}`}
                        key={ch.id}
                        onClick={() => {
                          setSelectedChannel(ch);
                          window.scrollTo({ top: 120, behavior: 'smooth' });
                        }}
                        className={`p-2 rounded-xl text-center cursor-pointer border text-xs truncate ${
                          selectedChannel?.id === ch.id
                            ? 'bg-lime-500 text-zinc-950 font-bold border-lime-500'
                            : 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900 hover:-translate-y-0.5 transition duration-150'
                        }`}
                        title={ch.name}
                      >
                        <span className="mr-1">{getCountryEmoji(ch.countryCode)}</span> {ch.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </>
        )}

        <div className="mt-8 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-400">
          <div className="space-y-2">
            <h4 className="text-white font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-lime-400" />
              {isBengali ? "স্বয়ংক্রিয় লাইভ সিঙ্ক" : "Continuous Auto Sync"}
            </h4>
            <p className="leading-relaxed">
              {isBengali 
                ? "আমাদের সার্ভারে ৩ মিনিট পর পর abusaeeidx-এর আসল গিটহাব রিপোজিটরি থেকে প্লেলিস্ট রিলোড করা হয়। তাই কোন লিঙ্ক পরিবর্তন বা আপডেট হলে আপনার পেইজে সেটি স্বয়ংক্রিয়ভাবে কার্যকর হবে।" 
                : "The website connects to our Express compiler which pulls and parses the GitHub IPTV playlist dynamically every 3 minutes. Auto updates are instant and completely secure."}
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-white font-bold flex items-center gap-2">
              <Shield className="w-4 h-4 text-lime-400" />
              {isBengali ? "অ্যাডাপটিভ স্ট্রিমিং" : "Adaptive Streaming"}
            </h4>
            <p className="leading-relaxed">
              {isBengali 
                ? "ইন্টারনেট স্পিড অনুযায়ী স্বয়ংক্রিয়ভাবে ভিডিও কোয়ালিটি অ্যাডজাস্ট হয়। ম্যানুয়ালি কোয়ালিটি সেট করার সুযোগও রয়েছে।" 
                : "Video quality automatically adjusts based on internet speed. Manual quality settings are also available for fine-tuning."}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-white font-bold flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-lime-400" />
              {isBengali ? "অটো-প্লে নেক্সট চ্যানেল" : "Auto-Play Next Channel"}
            </h4>
            <p className="leading-relaxed">
              {isBengali 
                ? "যদি কোনো চ্যানেলের লিংক কাজ না করে, তাহলে স্বয়ংক্রিয়ভাবে পরবর্তী চ্যানেলটি প্লে হবে।" 
                : "If a channel link fails, the app will automatically play the next available channel."}
            </p>
          </div>
        </div>

      </main>

      <footer className="bg-zinc-950 border-t border-zinc-900 py-6 mt-12 text-center text-xs text-zinc-500 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono">
            &copy; {new Date().getFullYear()} KhelaGhor Live TV. FIFA World Cup Edition.
          </p>
          <div className="flex gap-4">
            <a href="#" onClick={() => setIsBengali(!isBengali)} className="hover:text-lime-400 transition">
              {isBengali ? "ভাষা বদলান (English)" : "Switch Language (বাংলা)"}
            </a>
            <span>|</span>
            <span>FIFA World Cup Stream v2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
