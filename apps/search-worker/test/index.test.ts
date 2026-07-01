import { describe, expect, it, vi } from 'vitest';

import worker from '../src/index';
import { buildEmbeddingsBlob, uuidFromByte } from './helpers';

const PHOTO_1 = uuidFromByte(1);
const PHOTO_2 = uuidFromByte(2);

function createEnv(overrides: Record<string, unknown> = {}) {
  // photo-2 is nearly parallel to photo-1 (cos ≈ 0.98, above SIMILAR_MIN_SCORE);
  // photo-3 is orthogonal (cos 0) and must be filtered out
  const blob = buildEmbeddingsBlob([
    { lastIdByte: 1, vector: [1, 0, 0, 0] },
    { lastIdByte: 2, vector: [1, 0.2, 0, 0] },
    { lastIdByte: 3, vector: [0, 1, 0, 0] },
  ]);

  return {
    PHOTOS_BUCKET: {
      head: vi.fn(async () => ({ etag: 'test-etag' })),
      get: vi.fn(async () => ({
        etag: 'test-etag',
        arrayBuffer: async () => blob,
      })),
    },
    GEMINI_API_KEY: 'test-key',
    EMBEDDING_CACHE: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    },
    ...overrides,
  };
}

describe('search-worker', () => {
  it('returns health status with CORS headers', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/health'),
      createEnv() as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      model: 'gemini-embedding-2-preview',
    });
  });

  it('rejects search requests without a query', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/search'),
      createEnv() as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Query is required',
    });
  });

  it('rejects similar requests without a photo id', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/similar'),
      createEnv() as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Photo ID is required',
    });
  });

  it('returns similar photos without the source photo', async () => {
    const env = createEnv();
    const response = await worker.fetch(
      new Request(`https://example.com/similar?id=${PHOTO_1}`),
      env as never,
    );
    const body = (await response.json()) as {
      photoId: string;
      results: Array<{ id: string; score: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.photoId).toBe(PHOTO_1);
    // photo-1 (the source) and photo-3 (below min score) are excluded
    expect(body.results.map((r) => r.id)).toEqual([PHOTO_2]);
    expect(body.results[0]!.score).toBeGreaterThan(0.9);
  });

  it('returns 404 for a photo missing from the index', async () => {
    const response = await worker.fetch(
      new Request(`https://example.com/similar?id=${uuidFromByte(99)}`),
      createEnv() as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Photo not found in index',
      results: [],
    });
  });
});
