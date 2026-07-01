import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from '../src/index';
import { buildEmbeddingsBlob, uuidFromByte } from './helpers';

// Lives in its own file (not index.test.ts) on purpose: the worker keeps a
// module-scoped VectorStore cache that survives across tests within a file, and
// the /similar tests there seed it with a 4-dim store. The query path needs a
// real-size 3072-dim store (matching the Gemini embedding), so it gets a fresh
// module instance here.
const DIMS = 3072;

const PHOTO_1 = uuidFromByte(1);
const PHOTO_2 = uuidFromByte(2);

function sparseVec(entries: Record<number, number>): number[] {
  const v = new Array<number>(DIMS).fill(0);
  for (const [i, val] of Object.entries(entries)) v[Number(i)] = val;
  return v;
}

/** Stubs global fetch so getTextEmbedding returns the given query vector. */
function stubEmbedding(values: number[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ embedding: { values } }),
    })),
  );
}

function searchEnv() {
  // row1 aligns perfectly with the query axis, row2 nearly so (both kept);
  // row3/row4 are orthogonal (cosine 0) and fall below the cutoff.
  const blob = buildEmbeddingsBlob([
    { lastIdByte: 1, vector: sparseVec({ 0: 1 }) },
    { lastIdByte: 2, vector: sparseVec({ 0: 0.9, 1: 0.1 }) },
    { lastIdByte: 3, vector: sparseVec({ 1: 1 }) },
    { lastIdByte: 4, vector: sparseVec({ 2: 1 }) },
  ]);

  return {
    PHOTOS_BUCKET: {
      head: vi.fn(async () => ({ etag: 'search-etag' })),
      get: vi.fn(async () => ({
        etag: 'search-etag',
        arrayBuffer: async () => blob,
      })),
    },
    GEMINI_API_KEY: 'test-key',
    EMBEDDING_CACHE: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    },
  };
}

const noopCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

describe('search-worker /search', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the cluster near the query, dropping orthogonal photos', async () => {
    stubEmbedding(sparseVec({ 0: 1 })); // query on the same axis as row1/row2

    const response = await worker.fetch(
      new Request('https://example.com/search?q=anything'),
      searchEnv() as never,
      noopCtx as never,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      results: Array<{ id: string; score: number }>;
    };
    // row1 (cos 1) and row2 (cos ~0.99) clear the top-anchored cutoff; the two
    // orthogonal rows do not.
    expect(body.results.map((r) => r.id)).toEqual([PHOTO_1, PHOTO_2]);
    expect(body.results[0]!.score).toBeGreaterThan(0.99);
  });

  it('returns no results when the best match is below the floor', async () => {
    // Query on an axis no photo occupies → every cosine is 0, below the floor.
    stubEmbedding(sparseVec({ 5: 1 }));

    const response = await worker.fetch(
      new Request('https://example.com/search?q=spaceship'),
      searchEnv() as never,
      noopCtx as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ results: [] });
  });
});
