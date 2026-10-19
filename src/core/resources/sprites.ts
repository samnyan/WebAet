import { decodeBC1, decodeBC2, decodeBC3, decodeBC4, decodeBC5, decodeBC7 } from '@bis-toolkit/bcn'
import { BinaryReader } from '../aet/reader'
export interface Texture { width: number; height: number; format: number; data: Uint8Array; chroma?: Texture }
export interface Sprite { name: string; texture: number; x: number; y: number; width: number; height: number }
export interface SpriteSet { name: string; sprites: Sprite[]; textures: Texture[] }
export function parseSpriteSet(bytes: Uint8Array, name: string): SpriteSet {
  const r = new BinaryReader(bytes), base = r.u32(4)
  if (r.u32(base) !== 0x03505854) throw new Error('Expected classic sprite TXP3 texture set')
  const textures = r.array(r.u32(base + 4), base + 12, 4, q => {
    const p = base + r.u32(q), sig = r.u32(p)
    if (sig !== 0x04505854 && sig !== 0x05505854) throw new Error('Expected TXP4/5 texture')
    const s = p + r.u32(p + 12)
    if (r.u32(s) !== 0x02505854) throw new Error('Expected TXP2 subtexture')
    const width = r.u32(s + 4), height = r.u32(s + 8), format = r.u32(s + 12), size = r.u32(s + 20)
    if (!width || !height || width * height > 67108864) throw new Error('Invalid texture dimensions')
    r.check(s + 24, size)
    const texture: Texture = { width, height, format, data: bytes.subarray(s + 24, s + 24 + size) }
    if (format === 11 && (r.u32(p + 8) & 0xffff) === 0x0102) {
      const c = p + r.u32(p + 16), size = r.u32(c + 20)
      r.check(c + 24, size)
      texture.chroma = { width: r.u32(c + 4), height: r.u32(c + 8), format: r.u32(c + 12), data: bytes.subarray(c + 24, c + 24 + size) }
    }
    return texture
  })
  const names = r.u32(24)
  const sprites = r.array(r.u32(12), r.u32(16), 40, (p, i) => ({ name: r.string(r.u32(names + i * 4)), texture: r.u32(p), x: r.f32(p + 24), y: r.f32(p + 28), width: r.f32(p + 32), height: r.f32(p + 36) }))
  return { name, textures, sprites }
}
function validateTexture(t: Texture): void {
  const { width, height, format, data } = t
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 67108864) throw new Error('Invalid texture dimensions')
  const bytesPerPixel: Record<number, number> = { 0: 1, 1: 3, 2: 4, 3: 2, 4: 2, 5: 2, 12: 1, 13: 2 }
  const blockBytes: Record<number, number> = { 6: 8, 7: 8, 8: 16, 9: 16, 10: 8, 11: 16, 15: 16 }
  const pixel = bytesPerPixel[format], block = blockBytes[format]
  if (!pixel && !block) throw new Error(`Unsupported TXP format ${format}`)
  const required = pixel ? width * height * pixel : Math.ceil(width / 4) * Math.ceil(height / 4) * block!
  if (data.length < required) throw new Error(`Truncated TXP format ${format}: expected at least ${required} bytes, got ${data.length}`)
}
export function decodeTexture(t: Texture): Uint8ClampedArray {
  validateTexture(t)
  if (t.chroma) {
    validateTexture(t.chroma)
    if (t.format !== 11 || t.chroma.format !== 11) throw new Error('YCbCr textures require BC5 luma and chroma')
  }
  const { width: w, height: h, format: f, data: d } = t
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  if (t.chroma) {
    const lum = decodeBC5(v, w, h), c = t.chroma, chroma = decodeBC5(new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength), c.width, c.height)
    const out = new Uint8ClampedArray(w * h * 4)
    const sample = (x: number, y: number, channel: number) => {
      const fx = (x + 0.5) * c.width / w - 0.5, fy = (y + 0.5) * c.height / h - 0.5
      const ix = Math.floor(fx), iy = Math.floor(fy), dx = fx - ix, dy = fy - iy
      const at = (a: number, b: number) => chroma[(Math.max(0, Math.min(c.height - 1, b)) * c.width + Math.max(0, Math.min(c.width - 1, a))) * 4 + channel]! / 255
      return (at(ix, iy) * (1 - dx) + at(ix + 1, iy) * dx) * (1 - dy) + (at(ix, iy + 1) * (1 - dx) + at(ix + 1, iy + 1) * dx) * dy
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4, l = lum[p]! / 255, cb = sample(x, y, 0) * 1.003922 - 0.503929, cr = sample(x, y, 1) * 1.003922 - 0.503929
      // Direct clamped writes preserve conversion rounding without allocating
      // a temporary four-element array for every decoded pixel.
      out[p] = (l + 1.5748 * cr) * 255
      out[p + 1] = (l - 0.1873 * cb - 0.4681 * cr) * 255
      out[p + 2] = (l + 1.8556 * cb) * 255
      out[p + 3] = lum[p + 1]!
    }
    return out
  }
  if ([6, 7, 8, 9, 10, 11, 15].includes(f)) {
    const result = f === 6 || f === 7 ? decodeBC1(v, w, h, f === 7) : f === 8 ? decodeBC2(v, w, h) : f === 9 ? decodeBC3(v, w, h) : f === 10 ? decodeBC4(v, w, h) : f === 11 ? decodeBC5(v, w, h) : decodeBC7(v, w, h)
    return new Uint8ClampedArray(result)
  }
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const p = i * 4
    if (f === 2) { out.set(d.subarray(p, p + 4), p); continue }
    if (f === 1) { out.set([d[i * 3]!, d[i * 3 + 1]!, d[i * 3 + 2]!, 255], p); continue }
    if (f === 0) { out.set([255, 255, 255, d[i]!], p); continue }
    if (f === 12 || f === 13) { const l = d[i * (f === 13 ? 2 : 1)]!; out.set([l, l, l, f === 13 ? d[i * 2 + 1]! : 255], p); continue }
    if ([3, 4, 5].includes(f)) { const n = v.getUint16(i * 2, true); out.set(f === 5 ? [((n >> 12) & 15) * 17, ((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [((n >> 11) & 31) * 255 / 31, ((n >> (f === 3 ? 5 : 6)) & (f === 3 ? 63 : 31)) * 255 / (f === 3 ? 63 : 31), ((n >> (f === 3 ? 0 : 1)) & 31) * 255 / 31, f === 3 || (n & 1) ? 255 : 0], p); continue }
    throw new Error(`Unsupported TXP format ${f}`)
  }
  return out
}
export function spriteAliases(name: string) { const n = name.toUpperCase(); return [n, n.replace(/^SPR_/, '')] }
