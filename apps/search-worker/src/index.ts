interface Env {
  VECTORIZE: VectorizeIndex;
  REPLICATE_API_TOKEN: string;
  EMBEDDING_CACHE: KVNamespace;
}

interface SearchResult {
  id: string;
  score: number;
}

const IMAGEBIND_VERSION =
  '0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304';
const MAX_RESULTS = 100; // Vectorize limit without metadata
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MIN_SCORE = 0.2; // Filter out weak/random matches
const MIN_SCORE_SPREAD = 0.04; // Minimum spread to consider results meaningful

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ReplicatePrediction {
  id: string;
  status: string;
  output?: number[];
  error?: string;
}

function getCacheKey(text: string): string {
  // Normalize: lowercase, trim, collapse whitespace
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return `emb:${normalized}`;
}

async function getTextEmbedding(
  text: string,
  apiToken: string,
  cache: KVNamespace,
): Promise<{ embedding: number[]; cached: boolean }> {
  const cacheKey = getCacheKey(text);

  // Check cache first
  const cached = await cache.get(cacheKey, 'json');
  if (cached && Array.isArray(cached)) {
    return { embedding: cached as number[], cached: true };
  }

  // Fetch from Replicate
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      version: IMAGEBIND_VERSION,
      input: { text_input: text, modality: 'text' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error: ${response.status} - ${error}`);
  }

  const prediction = (await response.json()) as ReplicatePrediction;

  if (prediction.status === 'failed') {
    throw new Error(`Replicate prediction failed: ${prediction.error}`);
  }

  let embedding: number[];

  if (prediction.output) {
    embedding = prediction.output;
  } else {
    // Poll if not ready (rare with Prefer: wait)
    let result = prediction;
    for (
      let i = 0;
      i < 30 && result.status !== 'succeeded' && result.status !== 'failed';
      i++
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${result.id}`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
      );
      result = (await pollResponse.json()) as ReplicatePrediction;
    }

    if (result.status !== 'succeeded') {
      throw new Error(
        `Replicate prediction failed: ${result.error || result.status}`,
      );
    }

    embedding = result.output!;
  }

  // Store in cache (don't await, fire and forget)
  cache.put(cacheKey, JSON.stringify(embedding), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return { embedding, cached: false };
}

async function handleSearch(
  query: string,
  minScore: number,
  env: Env,
): Promise<Response> {
  const { embedding, cached } = await getTextEmbedding(
    query,
    env.REPLICATE_API_TOKEN,
    env.EMBEDDING_CACHE,
  );

  const results = await env.VECTORIZE.query(embedding, {
    topK: MAX_RESULTS,
    returnMetadata: 'none',
  });

  // Check if we got any results at all
  if (!results.matches || results.matches.length === 0) {
    return Response.json(
      { results: [], query, cached },
      { headers: CORS_HEADERS },
    );
  }

  // Check score spread on ALL results first - if too narrow, query is meaningless
  const allScores = results.matches.map((m) => m.score);
  const maxScore = Math.max(...allScores);
  const minScoreInAll = Math.min(...allScores);
  const spread = maxScore - minScoreInAll;

  let searchResults: SearchResult[] = [];

  if (spread >= MIN_SCORE_SPREAD) {
    // Good spread = meaningful query, apply minScore filter
    searchResults = results.matches
      .filter((m) => m.score >= minScore)
      .map((m) => ({ id: m.id, score: m.score }));
  }
  // else: low spread = random/meaningless query, return empty

  return Response.json(
    { results: searchResults, query, cached },
    { headers: CORS_HEADERS },
  );
}

const SIMILAR_MIN_SCORE = 0.35; // Higher threshold for similar photos
const SIMILAR_COUNT = 6; // Number of similar photos to return

async function handleSimilar(photoId: string, env: Env): Promise<Response> {
  // Get the embedding for this photo from the vector index
  const vectors = await env.VECTORIZE.getByIds([photoId]);

  if (!vectors || vectors.length === 0) {
    return Response.json(
      { error: 'Photo not found in index', results: [] },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const photoVector = vectors[0];
  if (!photoVector?.values) {
    return Response.json(
      { error: 'Photo embedding not available', results: [] },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // Query for similar photos (get extra to filter out self)
  const results = await env.VECTORIZE.query(photoVector.values, {
    topK: SIMILAR_COUNT + 1,
    returnMetadata: 'none',
  });

  if (!results.matches || results.matches.length === 0) {
    return Response.json({ results: [], photoId }, { headers: CORS_HEADERS });
  }

  // Filter out the photo itself and apply minimum score
  const similarResults: SearchResult[] = results.matches
    .filter((m) => m.id !== photoId && m.score >= SIMILAR_MIN_SCORE)
    .slice(0, SIMILAR_COUNT)
    .map((m) => ({ id: m.id, score: m.score }));

  return Response.json(
    { results: similarResults, photoId },
    { headers: CORS_HEADERS },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' }, { headers: CORS_HEADERS });
    }

    // Search endpoint
    if (url.pathname === '/search') {
      try {
        let query: string | null = null;
        let minScore = DEFAULT_MIN_SCORE;

        if (request.method === 'POST') {
          const body = (await request.json()) as {
            query?: string;
            minScore?: number;
          };
          query = body.query || null;
          if (body.minScore !== undefined) minScore = body.minScore;
        } else if (request.method === 'GET') {
          query = url.searchParams.get('q');
          const minScoreParam = url.searchParams.get('minScore');
          if (minScoreParam) minScore = parseFloat(minScoreParam);
        }

        if (!query) {
          return Response.json(
            { error: 'Query is required' },
            { status: 400, headers: CORS_HEADERS },
          );
        }

        return await handleSearch(query, minScore, env);
      } catch (error) {
        console.error('Search error:', error);
        return Response.json(
          { error: error instanceof Error ? error.message : 'Search failed' },
          { status: 500, headers: CORS_HEADERS },
        );
      }
    }

    // Similar photos endpoint
    if (url.pathname === '/similar') {
      try {
        const photoId = url.searchParams.get('id');

        if (!photoId) {
          return Response.json(
            { error: 'Photo ID is required' },
            { status: 400, headers: CORS_HEADERS },
          );
        }

        return await handleSimilar(photoId, env);
      } catch (error) {
        console.error('Similar error:', error);
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : 'Similar search failed',
          },
          { status: 500, headers: CORS_HEADERS },
        );
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS },
    );
  },
};
