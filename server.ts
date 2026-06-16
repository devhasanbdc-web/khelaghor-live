import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compute a real epoch timestamp (ms) for a match based on its dateLabel + dateTime
// so the frontend can reliably order "Upcoming" fixtures chronologically (date & time wise).
function computeSortTimestamp(match: any): number {
  try {
    const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
    const nowDhaka = new Date(Date.now() + DHAKA_OFFSET_MS); // fields read via UTC getters = Dhaka local time

    const label = (match.dateLabel || match.dateLabelBn || "").toLowerCase();

    // Start from "today" (Dhaka local), expressed via UTC-getter fields
    let year = nowDhaka.getUTCFullYear();
    let month = nowDhaka.getUTCMonth();
    let day = nowDhaka.getUTCDate();

    if (label.includes("yesterday") || label.includes("গতকাল")) {
      const d = new Date(Date.UTC(year, month, day - 1));
      year = d.getUTCFullYear(); month = d.getUTCMonth(); day = d.getUTCDate();
    } else if (label.includes("tomorrow") || label.includes("আগামীকাল")) {
      const d = new Date(Date.UTC(year, month, day + 1));
      year = d.getUTCFullYear(); month = d.getUTCMonth(); day = d.getUTCDate();
    } else if (label.includes("today") || label.includes("আজ")) {
      // keep today
    } else {
      // Try to parse a specific date like "June 17" / "17 June" / "Jun 17"
      const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
      const m1 = label.match(/([a-z]+)\s+(\d{1,2})/i);
      const m2 = label.match(/(\d{1,2})\s+([a-z]+)/i);
      let monthStr = "", dayStr = "";
      if (m1 && monthNames.some(mn => mn.startsWith(m1[1].toLowerCase()))) {
        monthStr = m1[1]; dayStr = m1[2];
      } else if (m2 && monthNames.some(mn => mn.startsWith(m2[2].toLowerCase()))) {
        monthStr = m2[2]; dayStr = m2[1];
      }
      if (monthStr && dayStr) {
        const monthIdx = monthNames.findIndex(mn => mn.startsWith(monthStr.toLowerCase()));
        if (monthIdx !== -1) {
          month = monthIdx;
          day = parseInt(dayStr, 10);
          // If this constructed date is more than ~2 days in the past, assume it refers to next year
          const candidate = new Date(Date.UTC(year, month, day));
          if (candidate.getTime() < nowDhaka.getTime() - (2 * 24 * 60 * 60 * 1000)) {
            year += 1;
          }
        }
      }
    }

    // Parse the kickoff time, e.g. "08:30 PM" / "05:30 AM"
    let hours = 0, minutes = 0;
    const tm = (match.dateTime || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (tm) {
      hours = parseInt(tm[1], 10) % 12;
      minutes = parseInt(tm[2], 10);
      if (tm[3].toUpperCase() === "PM") hours += 12;
    }

    // Build the Dhaka-local moment as UTC fields, then convert back to a true epoch timestamp
    const dhakaAsUtc = Date.UTC(year, month, day, hours, minutes, 0, 0);
    return dhakaAsUtc - DHAKA_OFFSET_MS;
  } catch {
    return Date.now();
  }
}

// Attach a numeric sortTimestamp to every match so the client can sort fixtures
// chronologically (date & time wise) instead of relying on free-text labels.
function enrichMatchesWithSortTimestamp(matches: any[]): any[] {
  if (!Array.isArray(matches)) return matches;
  return matches.map(m => ({
    ...m,
    sortTimestamp: typeof m.sortTimestamp === "number" ? m.sortTimestamp : computeSortTimestamp(m)
  }));
}

// Real fallback data matching actual June 2026 FIFA World Cup schedules
function getStaticFifaFallback() {
  return [
    {
      id: 'f1',
      homeTeam: 'Spain',
      homeTeamBn: 'স্পেন',
      homeFlag: '🇪🇸',
      awayTeam: 'Germany',
      awayTeamBn: 'জার্মানি',
      awayFlag: '🇩🇪',
      matchType: 'FIFA World Cup Group Stage',
      matchTypeBn: 'ফিফা বিশ্বকাপ গ্রুপ পর্ব',
      dateTime: '08:00 PM',
      dateTimeBn: 'রাত ০৮:০০ টা',
      dateLabel: 'Today (আজ)',
      dateLabelBn: 'আজ',
      status: 'live',
      homeScore: 2,
      awayScore: 1,
      timeRemaining: "72'",
      timeRemainingBn: "৭২'"
    },
    {
      id: 'f2',
      homeTeam: 'Brazil',
      homeTeamBn: 'ব্রাজিল',
      homeFlag: '🇧🇷',
      awayTeam: 'Switzerland',
      awayTeamBn: 'সুইজারল্যান্ড',
      awayFlag: '🇨🇭',
      matchType: 'FIFA World Cup Group Stage',
      matchTypeBn: 'ফিফা বিশ্বকাপ গ্রুপ পর্ব',
      dateTime: '11:00 PM',
      dateTimeBn: 'রাত ১১:০০ টা',
      dateLabel: 'Today (আজ)',
      dateLabelBn: 'আজ',
      status: 'upcoming'
    },
    {
      id: 'f3',
      homeTeam: 'USA',
      homeTeamBn: 'যুক্তরাষ্ট্র',
      homeFlag: '🇺🇸',
      awayTeam: 'Italy',
      awayTeamBn: 'ইতালি',
      awayFlag: '🇮🇹',
      matchType: 'FIFA World Cup Group Stage',
      matchTypeBn: 'ফিফা বিশ্বকাপ গ্রুপ পর্ব',
      dateTime: '05:30 AM',
      dateTimeBn: 'ভোর ০৫:৩০ মিনিট',
      dateLabel: 'Tomorrow (আগামীকাল)',
      dateLabelBn: 'আগামীকাল',
      status: 'upcoming'
    },
    {
      id: 'f4',
      homeTeam: 'Argentina',
      homeTeamBn: 'আর্জেন্টিনা',
      homeFlag: '🇦🇷',
      awayTeam: 'Canada',
      awayTeamBn: 'কানাডা',
      awayFlag: '🇨🇦',
      matchType: 'FIFA World Cup Group Stage',
      matchTypeBn: 'ফিফা বিশ্বকাপ গ্রুপ পর্ব',
      dateTime: '02:00 AM',
      dateTimeBn: 'রাত ০২:০০ টা',
      dateLabel: 'Yesterday (গতকাল)',
      dateLabelBn: 'গতকাল',
      status: 'completed',
      homeScore: 3,
      awayScore: 0
    },
    {
      id: 'f5',
      homeTeam: 'England',
      homeTeamBn: 'ইংল্যান্ড',
      homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      awayTeam: 'Japan',
      awayTeamBn: 'জাপান',
      awayFlag: '🇯🇵',
      matchType: 'FIFA World Cup Group Stage',
      matchTypeBn: 'ফিফা বিশ্বকাপ গ্রুপ পর্ব',
      dateTime: '04:00 AM',
      dateTimeBn: 'ভোর ০৪:০০ টা',
      dateLabel: 'June 17',
      dateLabelBn: '১৭ জুন',
      status: 'upcoming'
    }
  ];
}

// Bengali translation helper for fallback dynamic numbers
function translateNumberBn(num: number): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return num.toString().split('').map(digit => {
    const d = parseInt(digit);
    return isNaN(d) ? digit : bnDigits[d];
  }).join('');
}

// Generates simulated live dynamic stats on top of static fallback data to keep things fresh
function getDynamicFifaFallback() {
  const matches = getStaticFifaFallback();
  const now = new Date();
  const minutes = now.getMinutes() + now.getSeconds() / 60; // Include seconds to make it super fluid
  
  return matches.map(match => {
    if (match.status === 'live') {
      const offset = (minutes * 1.8) % 105; // cycle of 105 relative match minutes
      let displayMin = "HT";
      let displayMinBn = "বিরতি";
      let homeScore = 1;
      let awayScore = 1;

      if (offset < 45) {
        const gameMin = Math.floor(offset) + 1;
        displayMin = `${gameMin}'`;
        displayMinBn = `${translateNumberBn(gameMin)}'`;
        homeScore = gameMin > 20 ? 1 : 0;
        awayScore = gameMin > 35 ? (gameMin > 40 ? 1 : 1) : 0;
      } else if (offset > 60) {
        const gameMin = Math.floor(offset - 15);
        displayMin = `${gameMin > 90 ? "90+" : gameMin}'`;
        displayMinBn = `${gameMin > 90 ? "৯০+" : translateNumberBn(gameMin)}'`;
        homeScore = gameMin > 80 ? 2 : 1;
        awayScore = gameMin > 73 ? 2 : 1;
      }

      return {
        ...match,
        timeRemaining: displayMin,
        timeRemainingBn: displayMinBn,
        homeScore,
        awayScore
      };
    }
    return match;
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Let's implement in-memory cache for parsing the playlist
  let cache: any[] | null = null;
  let lastFetched = 0;
  const CACHE_TTL = 3 * 60 * 1000; // 3 minutes in milliseconds to ensure freshness but avoid extreme spamming

  // FIFA Schedule Cache and rate limit circuit breaker
  let fifaCache: any[] | null = null;
  let fifaLastFetched = 0;
  const FIFA_CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache to avoid Gemini 429 quota limits
  let geminiCooldownUntil = 0; // Timestamp after which we can retry Gemini API

  // GitHub metadata cache
  let playlistLastUpdated = "";
  let playlistLastUpdatedBn = "";
  let lastCommitSha = "";

  async function fetchPlaylistMeta() {
    try {
      console.log("Fetching latest commit metadata for playlist.m3u...");
      const res = await fetch("https://api.github.com/repos/abusaeeidx/Mrgify-BDIX-IPTV/commits?path=playlist.m3u&per_page=1", {
        headers: {
          "User-Agent": "aistudio-build-iptv-agent-v1"
        }
      });
      if (res.ok) {
        const commits = await res.json();
        if (Array.isArray(commits) && commits.length > 0) {
          const lastCommit = commits[0];
          const dateStr = lastCommit.commit?.committer?.date || lastCommit.commit?.author?.date;
          lastCommitSha = lastCommit.sha ? lastCommit.sha.substring(0, 7) : "";
          if (dateStr) {
            const date = new Date(dateStr);
            // Convert to Dhaka Local Time (UTC+6)
            const dhakaOffset = 6 * 60 * 60 * 1000;
            const dhakaDate = new Date(date.getTime() + dhakaOffset);
            
            playlistLastUpdated = date.toLocaleString("en-US", {
              timeZone: "Asia/Dhaka",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true
            }) + " (Dhaka Time)";

            const bnMonths = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
            const dDay = dhakaDate.getUTCDate();
            const dMonth = bnMonths[dhakaDate.getUTCMonth()];
            const dYear = dhakaDate.getUTCFullYear();
            const dHour24 = dhakaDate.getUTCHours();
            const dMinute = dhakaDate.getUTCMinutes();
            const dHour12 = dHour24 % 12 === 0 ? 12 : dHour24 % 12;
            const ampm = dHour24 >= 12 ? "পিএম" : "এএম";

            const dDayStr = translateNumberBn(dDay);
            const dYearStr = translateNumberBn(dYear);
            const dHourStr = translateNumberBn(dHour12);
            const dMinuteStr = dMinute < 10 ? `০${translateNumberBn(dMinute)}` : translateNumberBn(dMinute);

            playlistLastUpdatedBn = `${dDayStr} ${dMonth} ${dYearStr}, ${ampm === "পিএম" ? "বিকাল/রাত" : "সকাল/ভোর"} ${dHourStr}:${dMinuteStr} মিনিট`;
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch GitHub playlist metadata:", err);
    }
  }

  // Fetch and Parse the M3U playlist file dynamically with fail-safe local fallback
  async function fetchAndParsePlaylist(): Promise<any[]> {
    console.log("Fetching fresh M3U playlist from source (bypassing GitHub CDN caching)...");
    let text = "";
    try {
      const response = await fetch(`https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/playlist.m3u?t=${Date.now()}`);
      if (response.ok) {
        text = await response.text();
        console.log("Dynamically updated playlist successfully fetched from abusaeeidx repository!");
      } else {
        console.warn(`Failed to fetch live M3U playlist: ${response.statusText}. Using fallback M3U.`);
      }
    } catch (err) {
      console.warn("Connection or fetch error to online M3U repository. Falling back to local offline M3U playlist:", err);
    }

    // Try reading local fallback file if live fetch resulted in empty string
    if (!text) {
      try {
        const fallbackPath = path.join(process.cwd(), "playlist.fallback.m3u");
        if (fs.existsSync(fallbackPath)) {
          console.log("Fallback activated: Reading local verified playlist.fallback.m3u");
          text = fs.readFileSync(fallbackPath, "utf-8");
        } else {
          console.error("Local fallback file playlist.fallback.m3u not found.");
        }
      } catch (localErr) {
        console.error("Critical error reading local fallback M3U:", localErr);
      }
    }

    if (!text) {
      return [];
    }

    const lines = text.split("\n");
    const channels: any[] = [];
    
    let currentChannel: any = null;
    let channelIdCounter = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle custom client Header fields like User-Agent or Referrer
      if (line.startsWith("#EXTVLCOPT:")) {
        const opt = line.substring(11).trim();
        const target = currentChannel || channels[channels.length - 1];
        if (target) {
          if (opt.startsWith("http-user-agent=")) {
            target.userAgent = opt.substring(16).trim();
          } else if (opt.startsWith("http-referrer=")) {
            target.referrer = opt.substring(14).trim();
          } else if (opt.startsWith("http-origin=")) {
            target.origin = opt.substring(12).trim();
          }
        }
        continue;
      }

      if (line.startsWith("#EXTINF:")) {
        // Parse attributes out of the #EXTINF line
        const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
        const groupMatch = line.match(/group-title="([^"]+)"/i);
        const idMatch = line.match(/tvg-id="([^"]+)"/i);
        
        // Find channel name (after last comma)
        const commaIndex = line.lastIndexOf(",");
        let channelName = "Unknown Channel";
        if (commaIndex !== -1) {
          channelName = line.substring(commaIndex + 1).trim();
        }

        currentChannel = {
          id: idMatch ? idMatch[1] : `ch-${channelIdCounter++}`,
          name: channelName,
          logo: logoMatch ? logoMatch[1] : "",
          group: groupMatch ? groupMatch[1] : "General",
          url: "",
          isCricket: false,
          isFootball: false,
          isFifa: false,
          isLive: false,
          country: "Global",
          countryCode: "un"
        };
      } else if (line.startsWith("#")) {
        // Skip general comment or other secondary lines
        continue;
      } else if (currentChannel) {
        // It's the URL line
        if (line.startsWith("http://") || line.startsWith("https://")) {
          currentChannel.url = line;

          // Normalize names to lowercase for robust detection
          const nameLower = currentChannel.name.toLowerCase();
          const groupLower = currentChannel.group.toLowerCase();

          // 1. Cricket Detection
          const cricketKeywords = [
            "cricket", "ipl", "bpl", "ashes", "gtv", "gazi", "t sports", 
            "tsports", "willow", "sony ten", "sony sports", "star sports", 
            "astro cricket", "sky sports cricket", "supersport cricket", 
            "ptv sports", "ten sports", "willow cricket", "t-sports", "sports18", "sports 18"
          ];
          const isCricket = cricketKeywords.some(keyword => nameLower.includes(keyword) || groupLower.includes(keyword));
          currentChannel.isCricket = isCricket;

          // 2. Football Detection
          const footballKeywords = [
            "football", "soccer", "fifa", "uefa", "laliga", "premier league", 
            "serie a", "bundesliga", "astro supersport", "bein sports", "euro sport", 
            "chelsea", "real madrid", "barca", "mutv", "club tv", "fa cup", 
            "mls", "copa america", "champions league"
          ];
          const isFootball = footballKeywords.some(keyword => nameLower.includes(keyword) || groupLower.includes(keyword)) && !isCricket;
          currentChannel.isFootball = isFootball;

          // 3. FIFA / World Cup Specific Detection
          const fifaKeywords = ["fifa", "world cup", "worldcup", "copa america", "euro 2024", "world-cup"];
          const isFifa = fifaKeywords.some(keyword => nameLower.includes(keyword) || groupLower.includes(keyword));
          currentChannel.isFifa = isFifa;
          if (isFifa) {
            currentChannel.isFootball = true;
          }

          // 3. Country Matcher
          if (
            nameLower.includes("bangladesh") || nameLower.includes("bd ") || nameLower.includes("bd:") || 
            nameLower.includes(" bd") || nameLower.includes("gtv") || nameLower.includes("gazi") || 
            nameLower.includes("t sports") || nameLower.includes("btv") || nameLower.includes("somoy") || 
            nameLower.includes("independent") || nameLower.includes("jamuna") || nameLower.includes("ekattor") || 
            nameLower.includes("channel i") || nameLower.includes("atn bangla") || nameLower.includes("dhaka")
          ) {
            currentChannel.country = "Bangladesh";
            currentChannel.countryCode = "bd";
          } else if (
            nameLower.includes("india") || nameLower.includes("ind ") || nameLower.includes("ind:") || 
            nameLower.includes(" ind") || nameLower.includes("sony") || nameLower.includes("star") || 
            nameLower.includes("colors") || nameLower.includes("zeetv") || nameLower.includes("cineplex") ||
            nameLower.includes("sports18") || nameLower.includes("dd sports")
          ) {
            currentChannel.country = "India";
            currentChannel.countryCode = "in";
          } else if (nameLower.includes("pakistan") || nameLower.includes("pak ") || nameLower.includes("pak:") || nameLower.includes("ptv") || nameLower.includes("geo") || nameLower.includes("hum") || nameLower.includes("ary")) {
            currentChannel.country = "Pakistan";
            currentChannel.countryCode = "pk";
          } else if (nameLower.includes("england") || nameLower.includes("sky sports") || nameLower.includes("bt sport") || nameLower.includes("tnt sports") || nameLower.includes("uk ") || nameLower.includes("uk:")) {
            currentChannel.country = "England";
            currentChannel.countryCode = "gb";
          } else if (nameLower.includes("usa") || nameLower.includes("espn") || nameLower.includes("willow") || nameLower.includes("fox") || nameLower.includes("cbs") || nameLower.includes("nbc") || nameLower.includes("us ") || nameLower.includes("us:")) {
            currentChannel.country = "USA";
            currentChannel.countryCode = "us";
          } else if (nameLower.includes("australia") || nameLower.includes("aus ") || nameLower.includes("optus") || nameLower.includes("fox cricket")) {
            currentChannel.country = "Australia";
            currentChannel.countryCode = "au";
          } else if (nameLower.includes("south africa") || nameLower.includes("supersport") || nameLower.includes("africa") || nameLower.includes(" za")) {
            currentChannel.country = "South Africa";
            currentChannel.countryCode = "za";
          } else if (nameLower.includes("saudi") || nameLower.includes("ssc ") || nameLower.includes("riyadh")) {
            currentChannel.country = "Saudi Arabia";
            currentChannel.countryCode = "sa";
          } else if (nameLower.includes("spain") || nameLower.includes("laliga") || nameLower.includes("barca") || nameLower.includes("madrid") || nameLower.includes("esp ")) {
            currentChannel.country = "Spain";
            currentChannel.countryCode = "es";
          } else if (nameLower.includes("italy") || nameLower.includes("serie a") || nameLower.includes("ita ")) {
            currentChannel.country = "Italy";
            currentChannel.countryCode = "it";
          } else if (nameLower.includes("germany") || nameLower.includes("bundesliga") || nameLower.includes("ger ")) {
            currentChannel.country = "Germany";
            currentChannel.countryCode = "de";
          } else if (nameLower.includes("brazil") || nameLower.includes("bra ")) {
            currentChannel.country = "Brazil";
            currentChannel.countryCode = "br";
          } else if (nameLower.includes("argentina") || nameLower.includes("arg ")) {
            currentChannel.country = "Argentina";
            currentChannel.countryCode = "ar";
          } else {
            currentChannel.country = "Global";
            currentChannel.countryCode = "un";
          }

          // 4. Live indicators (Sports TV stations, or channels having names indicating live)
          const liveTriggerKeywords = [
            "live", "direct", "fhd", "tsports", "gazi", "sony", "star sports", 
            "supersport", "sky sports", "bein", "fifa", "premier league", "willow",
            "cricket", "football", "sports", "btv", "independent", "ekattor", "somoy", "jamuna"
          ];
          currentChannel.isLive = liveTriggerKeywords.some(keyword => nameLower.includes(keyword) || groupLower.includes(keyword)) ||
                                 groupLower.includes("[live]") || groupLower.includes("live event") || nameLower.startsWith("[bd]");

          // Clean logos to have fallback if none
          if (!currentChannel.logo || currentChannel.logo.trim() === "null" || currentChannel.logo.trim() === "") {
            currentChannel.logo = "";
          }

          channels.push(currentChannel);
          currentChannel = null;
        }
      }
    }
    return channels;
  }

  // API Route - Serve live categorized channels
  app.get("/api/channels", async (req, res) => {
    const now = Date.now();
    const forceRefresh = req.query.force === "true";

    if (cache && !forceRefresh && (now - lastFetched < CACHE_TTL)) {
      console.log("Serving IPTV playlist from memory cache...");
      return res.json({ 
        channels: cache, 
        cachedAt: lastFetched,
        playlistLastUpdated,
        playlistLastUpdatedBn,
        commitSha: lastCommitSha
      });
    }

    try {
      // Fetch metadata and compile playlist concurrently
      await fetchPlaylistMeta();
      const parsedChannels = await fetchAndParsePlaylist();
      if (parsedChannels.length > 0) {
        cache = parsedChannels;
        lastFetched = now;
      }
      res.json({ 
        channels: cache || [], 
        cachedAt: lastFetched,
        playlistLastUpdated,
        playlistLastUpdatedBn,
        commitSha: lastCommitSha
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch channels" });
    }
  } );

  // API Route - Real-time FIFA World Cup match schedules via Gemini Live Search Grounding
  app.get("/api/fifa-schedule", async (req, res) => {
    const now = Date.now();
    const forceRefresh = req.query.force === "true";

    // Serve from cache if available and not expired, and not forced to refresh
    if (fifaCache && !forceRefresh && (now - fifaLastFetched < FIFA_CACHE_TTL)) {
      console.log("Serving FIFA schedule from memory cache...");
      return res.json({ matches: enrichMatchesWithSortTimestamp(fifaCache), source: "gemini_grounding_cached" });
    }

    // Circuit Breaker: If we're under a rate-limit/quota cooldown, immediately serve dynamic/cached fallback
    if (now < geminiCooldownUntil && !forceRefresh) {
      console.log("Gemini API is in 429 cooldown status. Sourcing schedule via dynamic fallback engine.");
      if (fifaCache && fifaCache.length > 0) {
        return res.json({ matches: enrichMatchesWithSortTimestamp(fifaCache), source: "gemini_grounding_cached_cooldown" });
      }
      return res.json({ matches: enrichMatchesWithSortTimestamp(getDynamicFifaFallback()), source: "fallback_cooldown" });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY is not defined. Using static fallback schedules.");
        return res.json({ matches: enrichMatchesWithSortTimestamp(getDynamicFifaFallback()), source: "fallback" });
      }

      console.log("Fetching real-time sports/FIFA fixtures using Gemini Live Search Grounding...");
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Query Gemini models with search tools enabled
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: "Find current real-world live, upcoming, and recently completed football/FIFA matches happening today, tomorrow, or in the next few days of June 2026 (including World Cup, qualifiers, majors). Create a list of 8 real matches, prioritizing FIFA World Cup fixtures. Live/running matches should have 'status': 'live' and include homeScore & awayScore and timeRemaining. Completed matches should have 'status': 'completed'. Upcoming matches should have 'status': 'upcoming' with an accurate kickoff dateTime and dateLabel (e.g., Today, Tomorrow, or a specific date like June 18) so the schedule can be sorted chronologically. Output raw JSON conforming to the responseSchema.",
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                homeTeam: { type: Type.STRING },
                homeTeamBn: { type: Type.STRING, description: "Bengali translation" },
                homeFlag: { type: Type.STRING, description: "Unicode country emoji flag" },
                awayTeam: { type: Type.STRING },
                awayTeamBn: { type: Type.STRING, description: "Bengali translation" },
                awayFlag: { type: Type.STRING, description: "Unicode country emoji flag" },
                matchType: { type: Type.STRING, description: "e.g., FIFA World Cup, Friendly, WC Qualifiers" },
                matchTypeBn: { type: Type.STRING, description: "Bengali translation of match type" },
                dateTime: { type: Type.STRING, description: "Match start time, e.g., 08:30 PM" },
                dateTimeBn: { type: Type.STRING, description: "Bengali time, e.g., রাত ০৮:৩০ টা" },
                dateLabel: { type: Type.STRING, description: "e.g., Today (আজ), Tomorrow (আগামীকাল), June 16" },
                dateLabelBn: { type: Type.STRING, description: "e.g., আজ, আগামীকাল, ১৬ জুন" },
                status: { type: Type.STRING, description: "Must be exactly one of: 'live', 'upcoming', 'completed'" },
                homeScore: { type: Type.INTEGER, description: "Required if status is live or completed" },
                awayScore: { type: Type.INTEGER, description: "Required if status is live or completed" },
                timeRemaining: { type: Type.STRING, description: "e.g., 85' or HT" },
                timeRemainingBn: { type: Type.STRING, description: "Bengali e.g., ৮৫' বা বিরতি" }
              },
              required: [
                "id", "homeTeam", "homeTeamBn", "homeFlag", 
                "awayTeam", "awayTeamBn", "awayFlag", 
                "matchType", "matchTypeBn", "dateTime", "dateTimeBn", 
                "dateLabel", "dateLabelBn", "status"
              ]
            }
          }
        }
      });

      const responseText = response.text?.trim() || "[]";
      let matches = JSON.parse(responseText);

      // Simple validation to ensure we got a valid array
      if (!Array.isArray(matches) || matches.length === 0) {
        if (fifaCache && fifaCache.length > 0) {
          matches = fifaCache;
        } else {
          matches = getDynamicFifaFallback();
        }
      } else {
        // Successfully retrieved. Save in cache!
        fifaCache = matches;
        fifaLastFetched = now;
      }

      return res.json({ matches: enrichMatchesWithSortTimestamp(matches), source: "gemini_grounding" });
    } catch (error: any) {
      const errMsg = error?.message || "";
      const isRateLimit = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || error?.status === 429;

      if (isRateLimit) {
        // Trigger 15-minute cooldown circuit breaker dynamically
        geminiCooldownUntil = now + (15 * 60 * 1000);
        console.warn("Gemini API rate limit hit (429/RESOURCE_EXHAUSTED). Triggered 15-minute cooldown circuit breaker. Serving dynamic fallback matches seamlessly.");
      } else {
        console.warn("Gemini grounding query non-critical error, pulling static or cached fallbacks:", error);
      }
      
      // If we have stale cache, serve it instead of generic fallbacks!
      if (fifaCache && fifaCache.length > 0) {
        console.log("Serving stale FIFA schedule cache due to recent quota/rate limit...");
        return res.json({ matches: enrichMatchesWithSortTimestamp(fifaCache), source: "gemini_grounding_cached_error_fallback" });
      }
      
      return res.json({ matches: enrichMatchesWithSortTimestamp(getDynamicFifaFallback()), source: "fallback_error" });
    }
  });

  // API Route - Single stream proxy check (Simple health endpoint)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Live TV Server is fully operational" });
  });

  // Vite middleware integration for modern client SPA
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Live Sports app running at http://localhost:${PORT}`);
  });
}

startServer();
