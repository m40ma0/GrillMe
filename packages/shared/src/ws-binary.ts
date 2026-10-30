// Binary frames: [1 byte kind][8 byte big-endian timestamp ms][payload].
// Audio (kind 1): PCM16, 16 kHz, mono.
// Frame (kind 2): [8 byte dHash of a 9x8 grayscale thumbnail][JPEG]. The browser hashes frames so it can
// skip unchanged ones and the server can measure how much the screen changed without decoding JPEG.

export const BinaryKind = { audio: 1, frame: 2 } as const;
export type BinaryKind = (typeof BinaryKind)[keyof typeof BinaryKind];
export const HEADER_BYTES = 9;
export const FRAME_HASH_BYTES = 8;

export function encodeBinary(kind: BinaryKind, timestampMs: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, kind);
  view.setBigUint64(1, BigInt(Math.max(0, Math.floor(timestampMs))));
  out.set(payload, HEADER_BYTES);
  return out;
}

export function decodeBinary(data: Uint8Array): { kind: BinaryKind; timestampMs: number; payload: Uint8Array } {
  if (data.byteLength < HEADER_BYTES) throw new Error("Binary message is shorter than its header.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const kind = view.getUint8(0);
  if (kind !== BinaryKind.audio && kind !== BinaryKind.frame) throw new Error(`Unknown binary kind ${kind}.`);
  return { kind, timestampMs: Number(view.getBigUint64(1)), payload: data.subarray(HEADER_BYTES) };
}

export function encodeFrame(timestampMs: number, hash: bigint, jpeg: Uint8Array): Uint8Array {
  const payload = new Uint8Array(FRAME_HASH_BYTES + jpeg.byteLength);
  new DataView(payload.buffer).setBigUint64(0, BigInt.asUintN(64, hash));
  payload.set(jpeg, FRAME_HASH_BYTES);
  return encodeBinary(BinaryKind.frame, timestampMs, payload);
}

export function splitFramePayload(payload: Uint8Array): { hash: bigint; jpeg: Uint8Array } {
  if (payload.byteLength < FRAME_HASH_BYTES) throw new Error("Frame payload is shorter than its hash.");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { hash: view.getBigUint64(0), jpeg: payload.subarray(FRAME_HASH_BYTES) };
}

/** Difference hash of a 9x8 grayscale image (72 luminance values, row-major). */
export function dHash(gray9x8: ArrayLike<number>): bigint {
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = gray9x8[y * 9 + x] ?? 0;
      const right = gray9x8[y * 9 + x + 1] ?? 0;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

export function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}
