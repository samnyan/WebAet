import { cbc, ecb } from '@noble/ciphers/aes.js'
import { unpackGzip } from '../gzip'
import type { ArchiveReader } from './types'

const ftKey = Uint8Array.from([
  0x13, 0x72, 0xd5, 0x7b, 0x6e, 0x9e, 0x31, 0xeb, 0xa2, 0x39, 0xb8, 0x3c, 0x15, 0x57, 0xc6, 0xbb,
])

export class DivaFarcReader implements ArchiveReader {
  readonly name = 'DIVA FARC'

  canHandle(bytes: Uint8Array): boolean {
    if (bytes.length < 8) return false
    const signature = new TextDecoder().decode(bytes.subarray(0, 4))
    if (!['FARC', 'FArC', 'FArc'].includes(signature)) return false

    // If signature is FArc, distinguish between DIVA FArc and FGO FARc:
    // FGO FARc typically has 0x18 <= indexSize <= bytes.length, and index header offset +4 is archive flags (often 0x40 or 0x44).
    // DIVA FArc has index table starting at byte 12 with null-terminated string names.
    if (signature === 'FArc') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const archiveFlags = view.getUint32(8, false)
      // If flags has FGO encryption (0x04) or standard FGO 0x40 flag, let FgoFarcReader handle it
      if (archiveFlags === 0x40 || archiveFlags === 0x44 || archiveFlags === 0x04) {
        return false
      }
      // Check if byte 12 is printable ascii (DIVA entry name starts at 12)
      if (bytes.length > 13 && bytes[12]! >= 0x20 && bytes[12]! <= 0x7e) {
        return true
      }
    }

    return true
  }

  async unpack(bytes: Uint8Array, signal?: AbortSignal): Promise<Map<string, Uint8Array>> {
    signal?.throwIfAborted()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const be = (p: number) => view.getUint32(p, false)
    const signature = new TextDecoder().decode(bytes.subarray(0, 4))
    if (!['FARC', 'FArC', 'FArc'].includes(signature)) throw new Error('Unsupported FARC signature')
    const end = be(4) + 8
    if (end > bytes.length) throw new Error('Invalid FARC header')
    let flags = signature === 'FARC' ? be(8) : 0
    const futureTone = signature === 'FARC' && !!(flags & 4) && (be(16) & (be(16) - 1)) !== 0
    let header = bytes,
      p = signature === 'FARC' ? 28 + be(24) : 12,
      entryPadding = signature === 'FARC' ? be(20) : 0,
      count = Infinity,
      headerEnd = end
    if (futureTone) {
      const encryptedLength = Math.ceil((end - 32) / 16) * 16
      header = new Uint8Array(
        cbc(ftKey, bytes.slice(16, 32), { disablePadding: true }).decrypt(
          bytes.slice(32, 32 + encryptedLength),
        ),
      )
      const h = new DataView(header.buffer)
      const innerSize = h.getUint32(0, false),
        entrySize = h.getUint32(12, false)
      count = h.getUint32(8, false)
      if (innerSize < 16 || entrySize < 16 || innerSize > header.length)
        throw new Error('Invalid encrypted FARC header')
      p = innerSize
      entryPadding = entrySize - 16
      headerEnd = header.length
    }
    const h = new DataView(header.buffer, header.byteOffset, header.byteLength)
    const u = (q: number) => {
      if (q < 0 || q + 4 > headerEnd) throw new Error('Truncated FARC entry record')
      return h.getUint32(q, false)
    }
    if (p > headerEnd) throw new Error('Invalid FARC entry table offset')
    const entries = new Map<string, Uint8Array>()
    while (p < headerEnd && entries.size < count) {
      signal?.throwIfAborted()
      let e = p
      while (e < headerEnd && header[e]) e++
      if (e === headerEnd) throw new Error('Unterminated FARC entry name')
      const name = new TextDecoder().decode(header.subarray(p, e))
      p = e + 1
      if (entries.has(name)) throw new Error(`Duplicate FARC entry: "${name}"`)
      const offset = u(p),
        packed = u(p + 4),
        unpacked = signature === 'FArc' ? packed : u(p + 8)
      p += signature === 'FArc' ? 8 : 12
      if (futureTone) {
        flags = u(p)
        p += 4
      }
      if (signature === 'FARC') p += entryPadding
      if (p > headerEnd) throw new Error('Truncated FARC entry padding')
      const compressed =
        signature === 'FArC'
          ? unpacked !== 0
          : signature === 'FARC' && !!(flags & 2) && packed !== unpacked
      const encrypted = signature === 'FARC' && !!(flags & 4)
      const size = compressed ? packed : unpacked || packed
      const padded = encrypted
        ? Math.ceil((size - (futureTone ? 16 : 0)) / 16) * 16 + (futureTone ? 16 : 0)
        : size
      if (offset + padded > bytes.length || padded < 0)
        throw new Error('FARC entry exceeds file bounds')
      let data = bytes.slice(offset, offset + padded)
      if (encrypted)
        data = futureTone
          ? new Uint8Array(
              cbc(ftKey, data.slice(0, 16), { disablePadding: true }).decrypt(data.slice(16)),
            )
          : new Uint8Array(
              ecb(new TextEncoder().encode('project_diva.bin'), { disablePadding: true }).decrypt(
                data,
              ),
            )
      data = data.slice(0, size)
      if (futureTone && encrypted && compressed) {
        const padding = data.at(-1) ?? 0
        const end = data.length - padding
        if (
          padding > 0 &&
          padding <= 16 &&
          end >= 18 &&
          data.subarray(end).every((value) => value === padding) &&
          new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(end - 4, true) ===
            unpacked
        )
          data = data.slice(0, end)
      }
      if (compressed) {
        try {
          data = unpackGzip(data, unpacked)
        } catch (error) {
          throw new Error(
            `FARC entry "${name}": ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
      if (unpacked && data.length !== unpacked)
        throw new Error(
          `FARC entry "${name}" decompressed size mismatch: expected ${unpacked} bytes, got ${data.length}; archive may be incomplete or unsupported`,
        )
      entries.set(name, data)
    }
    if (futureTone && entries.size !== count)
      throw new Error(`FARC entry count mismatch: expected ${count}, got ${entries.size}`)
    return entries
  }
}
