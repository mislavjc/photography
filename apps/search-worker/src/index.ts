interface Env {
  PHOTOS_BUCKET: R2Bucket;
  GEMINI_API_KEY: string;
  EMBEDDING_CACHE: KVNamespace;
}

interface SearchResult {
  id: string;
  score: number;
}

const GEMINI_MODEL = 'gemini-embedding-2-preview';
const EMBEDDINGS_KEY = 'variants/embeddings.bin';
const HEADER_SIZE = 8;
const UUID_BYTES = 16;
// Must match the CLI's OUTPUT_DIMS; kept here to avoid a store round-trip
// before we can embed the query.
const QUERY_DIMS = 3072;

const SIMILAR_COUNT = 6;
const SIMILAR_MIN_SCORE = 0.55;

// Text→image search tuning. The Gemini text/image modality gap squashes every
// cosine into a narrow, query-dependent band (~0.24 baseline, ~0.34-0.42 for a
// strong match), so absolute thresholds are meaningless — a common concept like
// "sunset" lands every photo near the same score. Instead we anchor to each
// query's OWN best match:
//   • TOP_SCORE_FLOOR — if even the best match is this weak, the concept isn't
//     in the collection (gibberish tops out ~0.32; real queries reach ≥0.34).
//   • CUTOFF_FRACTION — keep results scoring in the upper part of the gap between
//     the distribution mean and the top score. Adapts automatically and is
//     self-limiting: a sharp peak (one car photo) returns a tight set; a generic
//     query has a tight distribution so the cutoff lands several std out and keeps
//     few; only a genuinely well-represented concept (night city) returns many.
//     This is the ONLY filter — there's no fixed result cap, so the count reflects
//     real relevance density (a handful to a few hundred) instead of a constant.
// These constants are specific to gemini-embedding-2-preview; retune if the
// embedding model changes.
const TOP_SCORE_FLOOR = 0.33;
const CUTOFF_FRACTION = 0.65;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface VectorStore {
  etag: string;
  dims: number;
  count: number;
  /** Packed matrix: count * dims Float32 values, row-major. */
  matrix: Float32Array;
  /** UUID strings in the same order as rows in `matrix`. */
  ids: string[];
  /** uuid -> row index */
  idToRow: Map<string, number>;
  /** Precomputed L2 norms per row (for cosine). */
  norms: Float32Array;
}

// Module-scoped cache; survives across requests inside the same isolate.
let cached: VectorStore | null = null;
let lastHeadCheckMs = 0;
const HEAD_CHECK_INTERVAL_MS = 60_000;

function bytesToUuid(bytes: Uint8Array, offset: number): string {
  const hex = Array.from(bytes.subarray(offset, offset + UUID_BYTES))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseStore(ab: ArrayBuffer, etag: string): VectorStore {
  if (ab.byteLength < HEADER_SIZE) {
    throw new Error('embeddings blob too small');
  }
  const view = new DataView(ab);
  const count = view.getUint32(0, true);
  const dims = view.getUint32(4, true);
  const recSize = UUID_BYTES + dims * 4;
  const expected = HEADER_SIZE + count * recSize;
  if (ab.byteLength !== expected) {
    throw new Error(
      `embeddings blob size ${ab.byteLength} != expected ${expected}`,
    );
  }

  const bytes = new Uint8Array(ab);
  const matrix = new Float32Array(count * dims);
  const ids: string[] = new Array(count);
  const idToRow = new Map<string, number>();
  const norms = new Float32Array(count);

  // HEADER_SIZE + k*(UUID_BYTES + dims*4) is always 4-aligned given dims >= 1,
  // so we can Float32Array-view the backing buffer directly.
  let off = HEADER_SIZE;
  for (let i = 0; i < count; i++) {
    ids[i] = bytesToUuid(bytes, off);
    idToRow.set(ids[i]!, i);
    off += UUID_BYTES;
    const rowOff = i * dims;
    matrix.set(new Float32Array(ab, off, dims), rowOff);
    let sum = 0;
    for (let j = 0; j < dims; j++) {
      const v = matrix[rowOff + j]!;
      sum += v * v;
    }
    norms[i] = Math.sqrt(sum);
    off += dims * 4;
  }

  return { etag, dims, count, matrix, ids, idToRow, norms };
}

async function getStore(bucket: R2Bucket): Promise<VectorStore> {
  const now = Date.now();
  // Skip the HEAD round-trip if we just checked — ETag-vs-cache is racey
  // but manifest writes are rare and /api/revalidate handles hot invalidation.
  if (cached && now - lastHeadCheckMs < HEAD_CHECK_INTERVAL_MS) return cached;

  const head = await bucket.head(EMBEDDINGS_KEY);
  if (!head) {
    throw new Error(`embeddings blob not found at ${EMBEDDINGS_KEY}`);
  }
  lastHeadCheckMs = now;
  if (cached && cached.etag === head.etag) return cached;

  const obj = await bucket.get(EMBEDDINGS_KEY);
  if (!obj) {
    throw new Error(`embeddings blob vanished between head and get`);
  }
  const ab = await obj.arrayBuffer();
  cached = parseStore(ab, obj.etag);
  return cached;
}

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string };
}

async function getTextEmbedding(
  text: string,
  apiKey: string,
  cache: KVNamespace,
  dims: number,
  ctx: ExecutionContext,
): Promise<{ embedding: Float32Array; cached: boolean }> {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const cacheKey = `emb:g2:${dims}:${normalized}`;

  const hit = await cache.get(cacheKey, 'arrayBuffer');
  if (hit && hit.byteLength === dims * 4) {
    return { embedding: new Float32Array(hit), cached: true };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: dims,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Gemini API error: ${response.status} - ${await response.text()}`,
    );
  }

  const body = (await response.json()) as GeminiEmbedResponse;
  const values = body.embedding?.values ?? body.embeddings?.[0]?.values;
  if (!values || values.length !== dims) {
    throw new Error(
      `Gemini returned ${values?.length ?? 'no'} dims, expected ${dims}`,
    );
  }

  const vec = new Float32Array(values);
  // waitUntil keeps the KV write alive past response return.
  ctx.waitUntil(
    cache.put(cacheKey, vec.buffer, { expirationTtl: CACHE_TTL_SECONDS }),
  );
  return { embedding: vec, cached: false };
}

/** Cosine similarity of `query` against every row of the store (one score per row). */
function cosineScores(store: VectorStore, query: Float32Array): Float32Array {
  const { dims, count, matrix, norms } = store;
  let qNorm = 0;
  for (let j = 0; j < dims; j++) qNorm += query[j]! * query[j]!;
  qNorm = Math.sqrt(qNorm);

  const scores = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const rowOff = i * dims;
    let dot = 0;
    for (let j = 0; j < dims; j++) dot += matrix[rowOff + j]! * query[j]!;
    const denom = qNorm * norms[i]!;
    scores[i] = denom > 0 ? dot / denom : 0;
  }
  return scores;
}

function topKCosine(
  store: VectorStore,
  query: Float32Array,
  k: number,
): Array<{ row: number; score: number }> {
  const scores = cosineScores(store, query);
  const indices = Array.from({ length: store.count }, (_, i) => i);
  indices.sort((a, b) => scores[b]! - scores[a]!);
  return indices.slice(0, k).map((row) => ({ row, score: scores[row]! }));
}

// Note: at 30K+ vectors a bounded min-heap or quickselect beats full sort;
// not worth the complexity until the index grows past ~10K.

/**
 * Cross-modal (text→image) ranking. Cosine scores live in a compressed,
 * query-dependent band, so we anchor the cutoff to this query's own
 * distribution rather than an absolute threshold. See TOP_SCORE_FLOOR /
 * CUTOFF_FRACTION for the reasoning.
 */
function searchWithCutoff(
  store: VectorStore,
  query: Float32Array,
): SearchResult[] {
  const { count, ids } = store;
  const scores = cosineScores(store, query);

  // Cheap O(count) reduction (negligible next to the O(count·dims) scan above)
  // to derive the query's own mean and best match for the adaptive cutoff.
  let sum = 0;
  let top = 0;
  for (let i = 0; i < count; i++) {
    const s = scores[i]!;
    sum += s;
    if (s > top) top = s;
  }

  // Best match too weak → the concept isn't represented; return nothing rather
  // than surfacing the least-irrelevant noise.
  if (top < TOP_SCORE_FLOOR) return [];

  const mean = sum / count;
  const cutoff = mean + CUTOFF_FRACTION * (top - mean);

  const picked: SearchResult[] = [];
  for (let i = 0; i < count; i++) {
    if (scores[i]! >= cutoff) picked.push({ id: ids[i]!, score: scores[i]! });
  }
  picked.sort((a, b) => b.score - a.score);
  return picked;
}

async function handleSearch(
  query: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Fetch the vector store and embed the query in parallel — they're independent
  // and the store fetch ETag check would otherwise serialize behind Gemini.
  const [store, textRes] = await Promise.all([
    getStore(env.PHOTOS_BUCKET),
    // getTextEmbedding needs the store's dim. We know it's 3072 (the only
    // value we ever write), so don't wait just to discover that.
    getTextEmbedding(
      query,
      env.GEMINI_API_KEY,
      env.EMBEDDING_CACHE,
      QUERY_DIMS,
      ctx,
    ),
  ]);
  const { embedding, cached } = textRes;

  if (store.dims !== embedding.length) {
    throw new Error(
      `store dims ${store.dims} mismatch with query dims ${embedding.length}`,
    );
  }

  const results = searchWithCutoff(store, embedding);

  return Response.json({ results, query, cached }, { headers: CORS_HEADERS });
}

async function handleSimilar(photoId: string, env: Env): Promise<Response> {
  const store = await getStore(env.PHOTOS_BUCKET);
  const row = store.idToRow.get(photoId);
  if (row === undefined) {
    return Response.json(
      { error: 'Photo not found in index', results: [] },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const query = store.matrix.subarray(row * store.dims, (row + 1) * store.dims);
  const hits = topKCosine(store, query, SIMILAR_COUNT + 1);
  const results: SearchResult[] = hits
    .filter((h) => store.ids[h.row] !== photoId && h.score >= SIMILAR_MIN_SCORE)
    .slice(0, SIMILAR_COUNT)
    .map((h) => ({ id: store.ids[h.row]!, score: h.score }));

  return Response.json({ results, photoId }, { headers: CORS_HEADERS });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      const store = cached;
      return Response.json(
        {
          status: 'ok',
          model: GEMINI_MODEL,
          dims: store?.dims ?? null,
          vectors: store?.count ?? null,
          etag: store?.etag ?? null,
        },
        { headers: CORS_HEADERS },
      );
    }

    if (url.pathname === '/search') {
      try {
        let query: string | null = null;

        if (request.method === 'POST') {
          const body = (await request.json()) as { query?: string };
          query = body.query || null;
        } else if (request.method === 'GET') {
          query = url.searchParams.get('q');
        }

        if (!query) {
          return Response.json(
            { error: 'Query is required' },
            { status: 400, headers: CORS_HEADERS },
          );
        }

        return await handleSearch(query, env, ctx);
      } catch (error) {
        console.error('Search error:', error);
        return Response.json(
          { error: error instanceof Error ? error.message : 'Search failed' },
          { status: 500, headers: CORS_HEADERS },
        );
      }
    }

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
