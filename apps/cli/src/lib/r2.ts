import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

import type { CLIConfig, Manifest } from './types.js';

const brotliCompress = promisify(zlib.brotliCompress);

export function createS3Client(config: CLIConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });
}

export async function getObject(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!resp.Body) throw new Error(`No body for ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function putObject(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  options?: { contentEncoding?: string; cacheControl?: string },
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentEncoding: options?.contentEncoding,
      CacheControl:
        options?.cacheControl ?? 'public, max-age=31536000, immutable',
    }),
  );
}

async function headObject(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function listObjects(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    if (resp.Contents) {
      for (const obj of resp.Contents) {
        if (obj.Key) keys.push(obj.Key);
      }
    }

    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function uploadLargeFile(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: metadata,
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  });
  await upload.done();
}

// Manifest helpers
function manifestKeys(variantsPrefix: string) {
  const base = variantsPrefix.replace(/^\/+|\/+$/g, '');
  return {
    compressed: `${base}/r2-manifest.json`,
    uncompressed: `${base}/r2-manifest-original.json`,
  };
}

export async function loadManifest(
  s3: S3Client,
  bucket: string,
  variantsPrefix: string,
): Promise<Manifest> {
  const keys = manifestKeys(variantsPrefix);
  try {
    const data = await getObject(s3, bucket, keys.uncompressed);
    return JSON.parse(data.toString('utf8'));
  } catch {
    return {};
  }
}

export async function saveManifest(
  s3: S3Client,
  bucket: string,
  variantsPrefix: string,
  manifest: Manifest,
): Promise<{ entries: number; originalSize: number; compressedSize: number }> {
  const keys = manifestKeys(variantsPrefix);
  const uncompressedBuf = Buffer.from(JSON.stringify(manifest, null, 2));

  // Upload uncompressed
  await putObject(
    s3,
    bucket,
    keys.uncompressed,
    uncompressedBuf,
    'application/json',
    {
      cacheControl: 'public, max-age=300, s-maxage=300',
    },
  );

  // Compress with brotli
  const compressed = await brotliCompress(uncompressedBuf, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
    },
  });

  // Upload compressed
  await putObject(s3, bucket, keys.compressed, compressed, 'application/json', {
    contentEncoding: 'br',
    cacheControl: 'public, max-age=300, s-maxage=300',
  });

  return {
    entries: Object.keys(manifest).length,
    originalSize: uncompressedBuf.length,
    compressedSize: compressed.length,
  };
}

export async function getVariantImage(
  s3: S3Client,
  bucket: string,
  variantsPrefix: string,
  uuid: string,
): Promise<Buffer | null> {
  const base = variantsPrefix.replace(/^\/+|\/+$/g, '');

  // Try 1920px first, then 1280px
  for (const width of [1920, 1280]) {
    const key = `${base}/large/jpeg/${width}/${uuid}.jpeg`;
    try {
      return await getObject(s3, bucket, key);
    } catch {
      // Try next width
    }
  }

  return null;
}
