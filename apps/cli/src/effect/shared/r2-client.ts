import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Effect } from 'effect';
import fs from 'node:fs';

// ----------------------- Helpers -----------------------
export const cleanPrefix = (p: string) => p.replace(/^\/+|\/+$/g, '');

// ----------------------- S3 Operations -----------------------
export const headObject = (s3: S3Client, Bucket: string, Key: string) =>
  Effect.tryPromise({
    try: () => s3.send(new HeadObjectCommand({ Bucket, Key })),
    catch: () => new Error('notfound'),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

export const getObject = (s3: S3Client, Bucket: string, Key: string) =>
  Effect.tryPromise<Buffer, Error>({
    try: async () => {
      const out = await s3.send(new GetObjectCommand({ Bucket, Key }));
      if (!out.Body) {
        throw new Error(`No body returned for ${Key}`);
      }
      const chunks: Buffer[] = [];
      const stream = out.Body as NodeJS.ReadableStream;
      return new Promise<Buffer>((res, rej) => {
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => res(Buffer.concat(chunks)));
        stream.on('error', rej);
      });
    },
    catch: (e) => new Error(`getObject failed for ${Key}: ${e}`),
  });

// Helper for retry with exponential backoff
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const errMsg = String(err);
      // Retry on EPIPE, ECONNRESET, or timeout errors
      if (
        errMsg.includes('EPIPE') ||
        errMsg.includes('ECONNRESET') ||
        errMsg.includes('socket hang up') ||
        errMsg.includes('timeout')
      ) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
};

export const putObject = (
  s3: S3Client,
  Bucket: string,
  Key: string,
  Body: Buffer | fs.ReadStream,
  ContentType: string,
  Metadata?: Record<string, string>,
  options?: { contentEncoding?: string; cacheControl?: string },
) =>
  Effect.tryPromise({
    try: () =>
      withRetry(() =>
        s3.send(
          new PutObjectCommand({
            Bucket,
            Key,
            Body,
            ContentType,
            CacheControl:
              options?.cacheControl || 'public, max-age=31536000, immutable',
            Metadata,
            ...(options?.contentEncoding && {
              ContentEncoding: options.contentEncoding,
            }),
          }),
        ),
      ),
    catch: (e) => new Error(`putObject failed for ${Key}: ${e}`),
  });

export const putSentinel = (
  s3: S3Client,
  Bucket: string,
  hash: string,
  key: string,
) =>
  putObject(s3, Bucket, `dedup/${hash}`, Buffer.from(''), 'text/plain', {
    sha256: hash,
    key,
  });

export const uploadLargeFile = (
  s3: S3Client,
  Bucket: string,
  Key: string,
  Body: fs.ReadStream,
  ContentType: string,
  Metadata?: Record<string, string>,
) =>
  Effect.tryPromise({
    try: () =>
      withRetry(
        () => {
          const up = new Upload({
            client: s3,
            params: {
              Bucket,
              Key,
              Body,
              ContentType,
              CacheControl: 'public, max-age=31536000, immutable',
              Metadata,
            },
            queueSize: 2, // Reduced from 4 to prevent connection exhaustion
            partSize: 8 * 1024 * 1024,
            leavePartsOnError: false,
          });
          return up.done();
        },
        3,
        1000,
      ),
    catch: (e) => new Error(`upload failed for ${Key}: ${e}`),
  });

// List all objects under a prefix
export const listObjects = (
  s3: S3Client,
  Bucket: string,
  Prefix: string,
  maxKeys = 1000,
) =>
  Effect.tryPromise<string[], Error>({
    try: async () => {
      const keys: string[] = [];
      let continuationToken: string | undefined;

      do {
        const response = await s3.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix,
            MaxKeys: maxKeys,
            ContinuationToken: continuationToken,
          }),
        );

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key) {
              keys.push(obj.Key);
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return keys;
    },
    catch: (e) => new Error(`listObjects failed for ${Prefix}: ${e}`),
  });

// Batch HEAD requests for checking multiple keys
export const batchHeadObjects = (
  s3: S3Client,
  Bucket: string,
  Keys: string[],
) =>
  Effect.tryPromise<Map<string, boolean>, Error>({
    try: async () => {
      const results = new Map<string, boolean>();
      const checks = Keys.map(async (key) => {
        try {
          await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
          results.set(key, true);
        } catch {
          results.set(key, false);
        }
      });
      await Promise.all(checks);
      return results;
    },
    catch: (e) => new Error(`batchHeadObjects failed: ${e}`),
  });

// Manifest keys helper
export const manifestKeys = (variantsPrefix: string) => {
  const base = cleanPrefix(variantsPrefix);
  return {
    compressed: `${base}/r2-manifest.json`,
    uncompressed: `${base}/r2-manifest-original.json`,
  };
};
