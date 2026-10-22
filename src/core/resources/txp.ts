import { BinaryReader } from '../aet/reader'
import type { Texture } from './sprites'

export function parseTxp3TextureSet(bytes: Uint8Array): Texture[] {
  const r = new BinaryReader(bytes)
  const base = r.u32(0) === 0x03505854 ? 0 : r.u32(4)
  if (r.u32(base) !== 0x03505854) throw new Error('Expected TXP3 texture set')

  return r.array(r.u32(base + 4), base + 12, 4, (q) => {
    const p = base + r.u32(q)
    const sig = r.u32(p)
    if (sig !== 0x04505854 && sig !== 0x05505854) throw new Error('Expected TXP4/5 texture')
    const s = p + r.u32(p + 12)
    if (r.u32(s) !== 0x02505854) throw new Error('Expected TXP2 subtexture')
    const width = r.u32(s + 4)
    const height = r.u32(s + 8)
    let format = r.u32(s + 12)
    // FGO Arcade uses 130 and 131 for BC7
    if (format === 130 || format === 131) {
      format = 15
    }
    const size = r.u32(s + 20)
    if (!width || !height || width * height > 67108864)
      throw new Error('Invalid texture dimensions')
    r.check(s + 24, size)
    const texture: Texture = { width, height, format, data: bytes.subarray(s + 24, s + 24 + size) }
    if (format === 11 && (r.u32(p + 8) & 0xffff) === 0x0102) {
      const c = p + r.u32(p + 16)
      const cSize = r.u32(c + 20)
      r.check(c + 24, cSize)
      texture.chroma = {
        width: r.u32(c + 4),
        height: r.u32(c + 8),
        format: r.u32(c + 12),
        data: bytes.subarray(c + 24, c + 24 + cSize),
      }
    }
    return texture
  })
}
