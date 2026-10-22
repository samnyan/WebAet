import { cbc } from '@noble/ciphers/aes.js'
import { unpackGzip } from '../gzip'
import { ensureZstd, decompressZstd } from '../zstd'
import type { ArchiveReader } from './types'

// FGO Arcade uses this key from ago.exe
const fgoKey = Uint8Array.from([
  0x62, 0xec, 0x7c, 0xd7, 0x91, 0x41, 0x69, 0x5e, 0x53, 0x59, 0x2a, 0xcc, 0x10, 0xcd, 0xc0, 0x4c,
])

const COMPRESSION_FLAG = 0x02
const ENCRYPTION_FLAG = 0x04
const CHUNKED_GZIP_FLAG = 0x12
const CHUNKED_ZSTD_FLAG = 0x30

export class FgoFarcReader implements ArchiveReader {
  readonly name = 'FGO Arcade FARc'

  canHandle(bytes: Uint8Array): boolean {
    if (bytes.length < 16) return false
    const signature = new TextDecoder().decode(bytes.subarray(0, 4))
    if (signature !== 'FARc') return false

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const indexSize = view.getUint32(4, false)
    if (indexSize < 24 || indexSize > bytes.length) return false

    // DIVA classic FArc has offset table at byte 12 where the first entry name is null-terminated string.
    // FGO FARc has uint32 innerHeaderSize at byte 16 (often 0x10).
    // If byte 12 is zero (as checksum in FGO), or if archiveFlags (byte 8) is a valid flag
    const checksum = view.getUint32(12, false)
    if (checksum === 0) return true

    const archiveFlags = view.getUint32(8, false)
    return (archiveFlags & 0x40) !== 0 || (archiveFlags & ENCRYPTION_FLAG) !== 0
  }

  async unpack(bytes: Uint8Array, signal?: AbortSignal): Promise<Map<string, Uint8Array>> {
    signal?.throwIfAborted()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const signature = new TextDecoder().decode(bytes.subarray(0, 4))
    if (signature !== 'FARc') throw new Error('Invalid FGO FArc signature (expected FARc)')

    const indexSize = view.getUint32(4, false)
    const archiveFlags = view.getUint32(8, false)

    let indexBytes: Uint8Array
    if ((archiveFlags & ENCRYPTION_FLAG) !== 0) {
      const encryptedSize = indexSize - 8
      if (encryptedSize < 0x20 || 16 + encryptedSize > bytes.length) {
        throw new Error('Encrypted FGO FArc index is truncated')
      }
      indexBytes = this.decryptAesPayload(bytes.slice(16, 16 + encryptedSize))
    } else {
      indexBytes = bytes.slice(16, 8 + indexSize)
    }

    const indexView = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength)
    const innerHeaderSize = indexView.getUint32(0, false)
    const entryCount = indexView.getUint32(8, false)
    const entrySize = indexView.getUint32(12, false)

    let cursor = innerHeaderSize
    const entries = new Map<string, Uint8Array>()

    let needsZstd = false
    const parsedEntries: {
      name: string
      offset: number
      storedSize: number
      uncompressedSize: number
      flags: number
    }[] = []

    for (let i = 0; i < entryCount; i++) {
      if (cursor >= indexBytes.length) throw new Error('Truncated FGO FArc index entries')
      let nameEnd = cursor
      while (nameEnd < indexBytes.length && indexBytes[nameEnd] !== 0) nameEnd++
      if (nameEnd === indexBytes.length) throw new Error('Unterminated FGO FArc entry name')

      const name = new TextDecoder().decode(indexBytes.subarray(cursor, nameEnd))
      cursor = nameEnd + 1

      const entryView = new DataView(indexBytes.buffer, indexBytes.byteOffset + cursor, 16)
      const offset = entryView.getUint32(0, false)
      const storedSize = entryView.getUint32(4, false)
      const uncompressedSize = entryView.getUint32(8, false)
      const flags = entryView.getUint32(12, false)

      cursor += 16
      if (entrySize > 16) {
        cursor += entrySize - 16
      }

      if ((flags & CHUNKED_ZSTD_FLAG) === CHUNKED_ZSTD_FLAG) {
        needsZstd = true
      }

      parsedEntries.push({ name, offset, storedSize, uncompressedSize, flags })
    }

    if (needsZstd) {
      await ensureZstd()
    }

    for (const entry of parsedEntries) {
      signal?.throwIfAborted()
      if (entry.offset + entry.storedSize > bytes.length) {
        throw new Error(`FGO FArc entry '${entry.name}' points outside archive`)
      }

      let payload: Uint8Array = bytes.subarray(entry.offset, entry.offset + entry.storedSize)
      if ((entry.flags & ENCRYPTION_FLAG) !== 0) {
        payload = this.decryptAesPayload(payload)
      }

      let extracted: Uint8Array
      if ((entry.flags & CHUNKED_ZSTD_FLAG) === CHUNKED_ZSTD_FLAG) {
        extracted = this.extractChunked(payload, true, entry.uncompressedSize)
      } else if ((entry.flags & CHUNKED_GZIP_FLAG) === CHUNKED_GZIP_FLAG) {
        extracted = this.extractChunked(payload, false, entry.uncompressedSize)
      } else if ((entry.flags & COMPRESSION_FLAG) !== 0) {
        // Gzip payload may have alignment zero-padding at the end.
        // Trim to the 4-byte ISIZE footer before calling unpackGzip.
        let trimmedPayload = payload
        if (entry.uncompressedSize > 0 && payload.length >= 18) {
          const target = entry.uncompressedSize >>> 0
          const pView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
          for (let end = payload.length; end >= Math.max(18, payload.length - 16); end--) {
            if (pView.getUint32(end - 4, true) === target) {
              trimmedPayload = payload.subarray(0, end)
              break
            }
          }
        }
        extracted = unpackGzip(trimmedPayload, entry.uncompressedSize)
      } else {
        extracted = entry.uncompressedSize > 0 ? payload.slice(0, entry.uncompressedSize) : payload
      }

      entries.set(entry.name, extracted)
    }

    return entries
  }

  private decryptAesPayload(encryptedPayload: Uint8Array): Uint8Array {
    if (encryptedPayload.length < 0x20 || (encryptedPayload.length - 0x10) % 16 !== 0) {
      throw new Error('Encrypted FGO FArc index has invalid AES block length')
    }
    const iv = encryptedPayload.slice(0, 16)
    const ciphertext = encryptedPayload.slice(16)
    return new Uint8Array(cbc(fgoKey, iv, { disablePadding: true }).decrypt(ciphertext))
  }

  private extractChunked(
    data: Uint8Array,
    useZstd: boolean,
    totalUncompressedSize: number,
  ): Uint8Array {
    if (data.length < 8) {
      throw new Error('FGO FArc chunk table is truncated')
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    let cursor = 4
    const chunkSizes: number[] = []

    while (cursor + 4 <= data.length) {
      const size = view.getUint32(cursor, true) // Little-endian chunk sizes
      // 0x08088B1F is gzip header in LE, 0xFD2FB528 is zstd magic in LE
      if (size === 0x08088b1f || size === 0xfd2fb528) break
      if (size === 0 || size > 0x7fffffff) {
        throw new Error(`Invalid FGO FArc chunk size 0x${size.toString(16)}`)
      }
      chunkSizes.push(size)
      cursor += 4
    }

    if (chunkSizes.length === 0) {
      throw new Error('FGO FArc chunk table has no chunks')
    }

    let dataOffset = cursor
    const totalChunkBytes = chunkSizes.reduce((a, b) => a + b, 0)
    if (dataOffset + totalChunkBytes > data.length) {
      throw new Error('FGO FArc chunk data is truncated')
    }

    const out = new Uint8Array(totalUncompressedSize)
    let outOffset = 0

    for (const chunkSize of chunkSizes) {
      const chunk = data.slice(dataOffset, dataOffset + chunkSize)
      dataOffset += chunkSize

      const decompressed = useZstd ? decompressZstd(chunk) : unpackGzip(chunk, 0)
      out.set(decompressed, outOffset)
      outOffset += decompressed.length
    }

    return out
  }
}
