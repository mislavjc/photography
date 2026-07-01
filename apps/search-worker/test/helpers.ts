// Shared test helpers for the embeddings blob format the worker parses.

// IDs are stored as 16 raw bytes and parsed back into UUID strings.
export function uuidFromByte(n: number): string {
  const hex = n.toString(16).padStart(2, '0');
  return `00000000-0000-0000-0000-0000000000${hex}`;
}

/** Builds a blob in the worker's packed format: u32 count, u32 dims, then per record 16 UUID bytes + dims float32s. */
export function buildEmbeddingsBlob(
  entries: Array<{ lastIdByte: number; vector: number[] }>,
): ArrayBuffer {
  const dims = entries[0]!.vector.length;
  const recSize = 16 + dims * 4;
  const ab = new ArrayBuffer(8 + entries.length * recSize);
  const view = new DataView(ab);
  view.setUint32(0, entries.length, true);
  view.setUint32(4, dims, true);
  const bytes = new Uint8Array(ab);
  let off = 8;
  for (const { lastIdByte, vector } of entries) {
    bytes[off + 15] = lastIdByte;
    off += 16;
    new Float32Array(ab, off, dims).set(vector);
    off += dims * 4;
  }
  return ab;
}
