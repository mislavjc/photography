/**
 * Binary format for the all-photo embeddings blob shipped to R2.
 *
 * Layout (little-endian):
 *   0  .. 4   u32  count
 *   4  .. 8   u32  dims
 *   8  .. N   count records, each:
 *               16 bytes UUID (raw, no hyphens)
 *               dims * 4 bytes Float32 vector
 */

export const HEADER_SIZE = 8;
export const UUID_BYTES = 16;

/** Total file size for a blob with `count` records at `dims` dimensions. */
export function recordSize(count: number, dims: number): number {
  return HEADER_SIZE + count * (UUID_BYTES + dims * 4);
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(buf: Buffer, offset: number): string {
  const h = buf.subarray(offset, offset + UUID_BYTES).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface EmbeddingsFile {
  dims: number;
  byId: Map<string, Float32Array>;
}

export function encode(file: EmbeddingsFile): Buffer {
  const out = Buffer.alloc(recordSize(file.byId.size, file.dims));
  out.writeUInt32LE(file.byId.size, 0);
  out.writeUInt32LE(file.dims, 4);
  const vecBytes = file.dims * 4;
  let off = HEADER_SIZE;
  for (const [uuid, vec] of file.byId) {
    if (vec.length !== file.dims) {
      throw new Error(
        `dim mismatch for ${uuid}: ${vec.length} vs ${file.dims}`,
      );
    }
    uuidToBytes(uuid).copy(out, off);
    off += UUID_BYTES;
    out.set(new Uint8Array(vec.buffer, vec.byteOffset, vecBytes), off);
    off += vecBytes;
  }
  return out;
}

export function decode(buf: Buffer): EmbeddingsFile {
  if (buf.length < HEADER_SIZE) throw new Error('embeddings file too small');
  const count = buf.readUInt32LE(0);
  const dims = buf.readUInt32LE(4);
  const recSize = UUID_BYTES + dims * 4;
  const expected = HEADER_SIZE + count * recSize;
  if (buf.length !== expected) {
    throw new Error(
      `embeddings file size ${buf.length} != expected ${expected} (count=${count}, dims=${dims})`,
    );
  }
  const byId = new Map<string, Float32Array>();
  let off = HEADER_SIZE;
  for (let i = 0; i < count; i++) {
    const uuid = bytesToUuid(buf, off);
    off += UUID_BYTES;
    const vec = new Float32Array(
      buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + dims * 4),
    );
    byId.set(uuid, vec);
    off += dims * 4;
  }
  return { dims, byId };
}

export const EMBEDDINGS_KEY = 'variants/embeddings.bin';
