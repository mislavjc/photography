import { SEARCH_CATEGORIES } from './search-categories';

const SEARCH_API_URL =
  process.env.NEXT_PUBLIC_SEARCH_API_URL ||
  'https://photos-search-api.mislavjc.workers.dev';

let warmedUp = false;

/**
 * On idle, pre-run the suggested-category searches. The expensive part of a
 * search is the Gemini text-embedding round-trip (~1s for a first-time query;
 * ~0.2s once the worker has it KV-cached). Pre-fetching warms both the client
 * result cache (so clicking a category is instant) and the worker's global
 * embedding cache, and the first request also wakes the worker isolate +
 * vector store. Staggered so it doesn't fire as a burst.
 */
export function warmupSearchWorker(): void {
  if (typeof window === 'undefined' || warmedUp) return;
  warmedUp = true;
  const schedule =
    typeof requestIdleCallback !== 'undefined'
      ? (fn: () => void) => requestIdleCallback(fn, { timeout: 1500 })
      : (fn: () => void) => setTimeout(fn, 800);
  schedule(() => {
    SEARCH_CATEGORIES.forEach((cat, i) => {
      setTimeout(() => {
        // Reuse searchPhotos so the result lands in the client cache too.
        searchPhotos(cat.query).catch(() => {});
      }, i * 250);
    });
  });
}

export interface SearchResult {
  id: string;
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  error?: string;
}

interface SimilarResponse {
  results: SearchResult[];
  photoId: string;
  error?: string;
}

// Per-session cache of search results, so repeat / back-and-forth queries are
// instant (no ~800ms worker round-trip). The index is effectively static within
// a session, so cached results stay valid.
const searchCache = new Map<string, SearchResult[]>();

export async function searchPhotos(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const cacheKey = trimmed.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${SEARCH_API_URL}/search?q=${encodeURIComponent(trimmed)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Search API error:', response.status, text);
    throw new Error(`Search failed: ${response.status} - ${text}`);
  }

  const data: SearchResponse = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  searchCache.set(cacheKey, data.results);
  return data.results;
}

export async function getSimilarPhotos(
  photoId: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const url = `${SEARCH_API_URL}/similar?id=${encodeURIComponent(photoId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Similar API error:', response.status, text);
    return [];
  }

  const data: SimilarResponse = await response.json();

  if (data.error) {
    console.error('Similar API error:', data.error);
    return [];
  }

  return data.results;
}
