import { toIsoDate } from "../utils/formatting";

const HISTORY_CACHE_PREFIX = "chess-rapid-history-v3";

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function getUtcRefreshKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function getMonthUrlsFromJoined(username, joinedEpoch) {
  if (!Number.isFinite(joinedEpoch)) return [];

  const start = new Date(joinedEpoch * 1000);
  const current = new Date();
  const urls = [];

  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;

  const endYear = current.getUTCFullYear();
  const endMonth = current.getUTCMonth() + 1;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const mm = String(month).padStart(2, "0");
    urls.push(`https://api.chess.com/pub/player/${username}/games/${year}/${mm}`);

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return urls;
}

async function fetchMonthlyArchives(monthUrls, chunkSize = 8) {
  const chunks = [];
  for (let i = 0; i < monthUrls.length; i += chunkSize) {
    chunks.push(monthUrls.slice(i, i + chunkSize));
  }

  const allGames = [];

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(chunk.map((url) => fetchJson(url)));
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const games = Array.isArray(result.value?.games) ? result.value.games : [];
      allGames.push(...games);
    }
  }

  return allGames;
}

export async function fetchRapidHistory(username) {
  const normalizedUsername = username.toLowerCase();
  const cacheKey = `${HISTORY_CACHE_PREFIX}:${normalizedUsername}`;
  const refreshKey = getUtcRefreshKey();

  try {
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.refreshKey === refreshKey && Array.isArray(cached?.history)) {
        return cached.history;
      }
    }
  } catch {
    // Ignore cache issues and fetch fresh data.
  }

  const profileData = await fetchJson(`https://api.chess.com/pub/player/${normalizedUsername}`);
  const monthUrls = getMonthUrlsFromJoined(normalizedUsername, profileData?.joined);

  const fallbackArchives =
    monthUrls.length > 0
      ? monthUrls
      : (await fetchJson(`https://api.chess.com/pub/player/${normalizedUsername}/games/archives`))
          .archives || [];

  const monthlyGames = await fetchMonthlyArchives(fallbackArchives);

  const historyMap = new Map();

  const rapidGames = monthlyGames
    .filter((game) => game.time_class === "rapid" && game.rated)
    .sort((a, b) => a.end_time - b.end_time);

  for (const game of rapidGames) {
    const isWhite = game.white?.username?.toLowerCase() === normalizedUsername;
    const isBlack = game.black?.username?.toLowerCase() === normalizedUsername;
    const color = isWhite ? "white" : isBlack ? "black" : null;
    if (!color) continue;

    const rating = game[color]?.rating;
    if (typeof rating !== "number") continue;

    const date = toIsoDate(game.end_time);
    const previous = historyMap.get(date);
    if (!previous || game.end_time > previous.epoch) {
      historyMap.set(date, { date, rating, epoch: game.end_time });
    }
  }

  const history = [...historyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({ refreshKey, history, savedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore cache write issues.
  }

  return history;
}
// ... existing imports and code ...

/**
 * Fetches all games played between two specific usernames.
 */
export async function fetchGamesBetween(player1, player2) {
  const p1 = player1.toLowerCase();
  const p2 = player2.toLowerCase();
  
  // 1. Get archives for Player 1 (Matt)
  const profileData = await fetchJson(`https://api.chess.com/pub/player/${p1}`);
  
  // Reuse existing logic to get month URLs
  const monthUrls = getMonthUrlsFromJoined(p1, profileData?.joined);
  
  const archives = monthUrls.length > 0 
    ? monthUrls 
    : (await fetchJson(`https://api.chess.com/pub/player/${p1}/games/archives`)).archives || [];

  // 2. Fetch all games from those archives
  const allGames = await fetchMonthlyArchives(archives);

  // 3. Filter for games ONLY against Player 2 (Addi)
  const mutualGames = allGames.filter(game => {
    // Only count Rapid & Rated games
    if (game.time_class !== 'rapid' || !game.rated) return false;

    const white = game.white.username.toLowerCase();
    const black = game.black.username.toLowerCase();

    return (white === p1 && black === p2) || (white === p2 && black === p1);
  });

  // 4. Sort by newest first
  return mutualGames.sort((a, b) => b.end_time - a.end_time);
}
