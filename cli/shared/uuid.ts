import { Effect } from 'effect';
import crypto from 'node:crypto';
import fs from 'node:fs';

// ----------------------- File Hashing -----------------------
export const sha256File = (file: string) =>
  Effect.tryPromise<string, Error>({
    try: () =>
      new Promise<string>((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file)
          .on('data', (d) => h.update(d))
          .on('end', () => resolve(h.digest('hex')))
          .on('error', reject);
      }),
    catch: (e) => new Error(`SHA256 failed for ${file}: ${e}`),
  });

export const sha256Buffer = (buffer: Buffer): string => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

export const statFile = (file: string) =>
  Effect.tryPromise<fs.Stats, Error>({
    try: () => fs.promises.stat(file),
    catch: (e) => new Error(`stat failed for ${file}: ${e}`),
  });

// ----------------------- UUIDv7 Generation -----------------------
/** Build a deterministic UUIDv7 from (timestampMs, sha256). */
export function uuidv7FromHash(tsMs: number, hash: Buffer): string {
  const h =
    hash.length >= 16
      ? hash
      : crypto.createHash('sha256').update(hash).digest();
  const ts =
    BigInt(Math.max(0, Math.floor(tsMs))) &
    (BigInt(1) << (BigInt(48) - BigInt(1))); // 48-bit
  const bytes = Buffer.alloc(16);

  // timestamp (ms) big-endian
  bytes[0] = Number((ts >> BigInt(40)) & BigInt(0xff));
  bytes[1] = Number((ts >> BigInt(32)) & BigInt(0xff));
  bytes[2] = Number((ts >> BigInt(24)) & BigInt(0xff));
  bytes[3] = Number((ts >> BigInt(16)) & BigInt(0xff));
  bytes[4] = Number((ts >> BigInt(8)) & BigInt(0xff));
  bytes[5] = Number(ts & BigInt(0xff));

  // version 7 + 12 bits rand
  const randA = ((h[0] << 8) | h[1]) & 0x0fff;
  bytes[6] = 0x70 | ((randA >> 8) & 0x0f);
  bytes[7] = randA & 0xff;

  // variant + 62 bits rand
  const rb = Buffer.from(h.slice(2, 10)); // 8 bytes
  bytes[8] = (rb[0] & 0x3f) | 0x80; // 10xxxxxx
  bytes[9] = rb[1];
  bytes[10] = rb[2];
  bytes[11] = rb[3];
  bytes[12] = rb[4];
  bytes[13] = rb[5];
  bytes[14] = rb[6];
  bytes[15] = rb[7];

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const fileTimestampMs = (st: fs.Stats, exifDate?: string | null) => {
  // Prefer EXIF (DateTimeOriginal/CreateDate/ModifyDate) if parseable
  if (exifDate) {
    const d = new Date(exifDate);
    const t = d.getTime();
    if (!Number.isNaN(t) && t > 0) return t;
  }
  return Math.floor(st.mtimeMs || Date.now());
};
