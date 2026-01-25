const SEARCH_API_URL = 'https://photography-search-api.mislavjc.workers.dev';

export interface SearchResult {
  id: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  error?: string;
}

export interface SimilarResponse {
  results: SearchResult[];
  photoId: string;
  error?: string;
}

export async function searchPhotos(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  const url = `${SEARCH_API_URL}/search?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
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
