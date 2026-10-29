// Binary frames: [1 byte kind][8 byte big-endian timestamp ms][payload].
// Audio is PCM16, 16 kHz, mono. Frames are JPEG.

export const BinaryKind = { audio: 1, frame: 2 } as const;
export type BinaryKind = (typeof BinaryKind)[keyof typeof BinaryKind];
export const HEADER_BYTES = 9;

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
