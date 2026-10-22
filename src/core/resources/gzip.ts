import { gunzipSync } from 'fflate'

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value >>> 0
})

/** FARC entries contain one gzip member. fflate alone does not verify its CRC. */
export function unpackGzip(bytes: Uint8Array, expectedSize: number): Uint8Array<ArrayBuffer> {
  if (bytes.length < 18) throw new Error('Truncated gzip member')
  const footer = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 8, 8)
  if (footer.getUint32(4, true) !== expectedSize) throw new Error('Gzip declared size mismatch')
  // Bound allocation by the validated archive size rather than an untrusted footer.
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 512 * 1024 * 1024)
    throw new Error('Gzip entry too large')
  const output = gunzipSync(bytes)
  if (output.length !== expectedSize) throw new Error('Gzip decompressed size mismatch')
  let crc = 0xffffffff
  for (const value of output) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 255]!
  if ((crc ^ 0xffffffff) >>> 0 !== footer.getUint32(0, true)) throw new Error('Gzip CRC32 mismatch')
  return output
}
