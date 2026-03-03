import { describe, expect, it, vi } from 'vitest';

import worker from '../src/index';

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    VECTORIZE: {
      getByIds: vi.fn(async () => [{ id: 'photo-1', values: [0.1, 0.2, 0.3] }]),
      query: vi.fn(async () => ({
        matches: [
          { id: 'photo-1', score: 1 },
          { id: 'photo-2', score: 0.9 },
          { id: 'photo-3', score: 0.34 },
        ],
      })),
    },
    REPLICATE_API_TOKEN: 'test-token',
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
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
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
      new Request('https://example.com/similar?id=photo-1'),
      env as never,
    );
    const body = (await response.json()) as {
      results: Array<{ id: string; score: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.results).toEqual([{ id: 'photo-2', score: 0.9 }]);

    expect(env.VECTORIZE.getByIds).toHaveBeenCalledWith(['photo-1']);
    expect(env.VECTORIZE.query).toHaveBeenCalledWith([0.1, 0.2, 0.3], {
      topK: 7,
      returnMetadata: 'none',
    });
  });
});
