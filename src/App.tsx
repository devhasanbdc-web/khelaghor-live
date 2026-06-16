import React, { useEffect, useState, useMemo } from 'react';
import { 
  Tv, Radio, Search, RefreshCw, Star, Flame, Trophy, 
  HelpCircle, Languages, LayoutGrid, CheckCircle2, AlertTriangle, Shield
} from 'lucide-react';
import { Channel, SportCategory } from './types';
import VideoPlayer from './components/VideoPlayer';

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
  const [activeCategory, setActiveCategory] = useState<SportCategory>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [isBengali, setIsBengali] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [playlistLastUpdated, setPlaylistLastUpdated] = useState<string>('');
  const [playlistLastUpdatedBn, setPlaylistLastUpdatedBn] = useState<string>('');
  const [commitSha, setCommitSha] = useState<string>('');

  // Fetch Channels
  const fetchChannels = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const response = await fetch(`/api/channels${forceRefresh ? '?force=true' : ''}`);
      if (!response.ok) throw new Error('Failed to load channels');

      const data = await response.json();
      setChannels(data.channels || []);
      setCachedAt(data.cachedAt || Date.now());
      setPlaylistLastUpdated(data.playlistLastUpdated || '');
      setPlaylistLastUpdatedBn(data.playlistLastUpdatedBn || '');
      setCommitSha(data.commitSha || '');

      // 🔥 AUTO START WITH FIFA WORLD CUP (Priority)
      if (data.channels && data.channels.length > 0 && !selectedChannel) {
        const fifaLive = data.channels.find((ch: Channel) => ch.isFifa && ch.isLive);
        const anyFifa = data.channels.find((ch: Channel) => ch.isFifa);
        const liveFootball = data.channels.find((ch: Channel) => ch.isFootball && ch.isLive);
        
        const defaultCh = fifaLive || anyFifa || liveFootball || data.channels[0];
        setSelectedChannel(defaultCh);
      }
    } catch (err: any) {
      console.error(err);
      setError(isBengali ? "চ্যানেল লোড করতে সমস্যা হয়েছে" : "Failed to load channels");
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
        ? prev.filter(f => f !== id) 
        : [...prev, id];
      localStorage.setItem('khelaghor_favorites', JSON.stringify(updated));
      return updated;
    });
  };

  const playNextChannel = () => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    const currentIndex = filteredChannels.findIndex(ch => ch.id === selectedChannel.id);
    const nextIndex = (currentIndex + 1) % filteredChannels.length;
    setSelectedChannel(filteredChannels[nextIndex]);
  };

  const playPrevChannel = () => {
    if (!selectedChannel || filteredChannels.length <= 1) return;
    const currentIndex = filteredChannels.findIndex(ch => ch.id === selectedChannel.id);
    const prevIndex = (currentIndex - 1 + filteredChannels.length) % filteredChannels.length;
    setSelectedChannel(filteredChannels[prevIndex]);
  };

  // Processed Channels
  const processedChannels = useMemo(() => {
    return channels.map(ch => ({
      ...ch,
      isFav: favorites.includes(ch.id)
    })).sort((a, b) => {
      let scoreA = 0, scoreB = 0;
      if (a.isFifa) scoreA += 100000;
      if (b.isFifa) scoreB += 100000;
      if (a.isLive) scoreA += 10000;
      if (b.isLive) scoreB += 10000;
      return scoreB - scoreA || a.name.localeCompare(b.name);
    });
  }, [channels, favorites]);

  const filteredChannels = useMemo(() => {
    return processedChannels.filter((ch) => {
      const matchesSearch = 
        ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

  const hotLiveChannels = processedChannels.filter(ch => ch.isLive).slice(0, 8);
  const fifaChannels = processedChannels.filter(ch => ch.isFifa);
  const cricketChannels = processedChannels.filter(ch => ch.isCricket);
  const footballChannels = processedChannels.filter(ch => ch.isFootball);
  const otherChannels = processedChannels.filter(ch => !ch.isCricket && !ch.isFootball && !ch.isFifa);
  const favoriteChannels = processedChannels.filter(ch => ch.isFav);

  const getCountryEmoji = (code: string) => {
    if (!code || code === 'un') return '🌐';
    try {
      const codePoints = code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🌐';
    }
  };

  const getRelativeFetchTime = () => {
    if (!cachedAt) return '';
    const minutes = Math.floor((Date.now() - cachedAt) / 60000);
    return minutes < 1 ? 'Just now' : `${minutes} min ago`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-lime-500 rounded-xl flex items-center justify-center">
              <Tv className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter">KhelaGhor LIVE</h1>
              <p className="text-xs text-zinc-500 -mt-1">Sports TV • FIFA World Cup</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchChannels(true)}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 rounded-xl border border-zinc-800 hover:border-lime-500/30 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </button>

            <button
              onClick={() => setIsBengali(!isBengali)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 rounded-xl border border-zinc-800 text-sm font-medium"
            >
              {isBengali ? "English" : "বাংলা"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder={isBengali ? "চ্যানেল বা দেশ খুঁজুন..." : "Search channels or country..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 pl-11 py-3 rounded-2xl focus:border-lime-500 outline-none"
            />
          </div>
        </div>

        {/* Player Section */}
        {selectedChannel ? (
          <div className="mb-10">
            <VideoPlayer 
              channel={selectedChannel}
              isFavorite={favorites.includes(selectedChannel.id)}
              onToggleFavorite={() => handleToggleFavorite(selectedChannel.id)}
              onNextChannel={playNextChannel}
              onPrevChannel={playPrevChannel}
              onChannelError={() => console.log(`Auto next from: ${selectedChannel.name}`)}
            />
          </div>
        ) : (
          <div className="aspect-video bg-zinc-900 rounded-3xl flex items-center justify-center mb-10">
            <p className="text-zinc-500">No channel selected</p>
          </div>
        )}

        {/* Categories */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {(['all', 'running_live', 'fifa', 'cricket', 'football'] as SportCategory[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`py-3 px-4 rounded-2xl font-medium transition-all ${
                activeCategory === cat 
                  ? 'bg-lime-500 text-black font-bold' 
                  : 'bg-zinc-900 hover:bg-zinc-800'
              }`}
            >
              {cat === 'all' && (isBengali ? 'সব চ্যানেল' : 'All')}
              {cat === 'running_live' && (isBengali ? 'লাইভ' : 'Live Now')}
              {cat === 'fifa' && 'FIFA World Cup'}
              {cat === 'cricket' && 'Cricket'}
              {cat === 'football' && 'Football'}
            </button>
          ))}
        </div>

        {/* Channel Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredChannels.map(ch => (
            <div
              key={ch.id}
              onClick={() => setSelectedChannel(ch)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] ${
                selectedChannel?.id === ch.id 
                  ? 'border-lime-500 bg-zinc-900' 
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg leading-tight">{ch.name}</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    {getCountryEmoji(ch.countryCode)} {ch.country}
                  </p>
                </div>
                {ch.isLive && <span className="text-red-500 text-xs font-bold">LIVE</span>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
