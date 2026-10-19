import { channels, channels3D, type AetDocument, type Curve, type Layer, type Scene } from './types'

/** Classic little-endian 32-bit AET. All offsets are absolute file addresses. */
export class BinaryReader {
  readonly view: DataView
  readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) }
  check(p: number, n = 4) { if (!Number.isSafeInteger(p) || p < 0 || p + n > this.bytes.length) throw new Error(`Invalid binary range 0x${p.toString(16)} + ${n}`) }
  u32(p: number) { this.check(p); return this.view.getUint32(p, true) }
  f32(p: number) { this.check(p); const v = this.view.getFloat32(p, true); if (!Number.isFinite(v)) throw new Error(`Non-finite float at ${p}`); return v }
  u16(p: number) { this.check(p, 2); return this.view.getUint16(p, true) }
  u8(p: number) { this.check(p, 1); return this.view.getUint8(p) }
  string(p: number) { if (!p) return ''; this.check(p, 1); let e = p; while (e < this.bytes.length && this.bytes[e]) e++; if (e === this.bytes.length) throw new Error('Unterminated string'); return new TextDecoder('shift-jis').decode(this.bytes.subarray(p, e)) }
  array<T>(count: number, p: number, stride: number, fn: (p: number, i: number) => T): T[] { if (count > 1000000) throw new Error('Unreasonable record count'); if (count) { if (!p) throw new Error('Null array pointer'); this.check(p, count * stride) }; return Array.from({ length: count }, (_, i) => fn(p + i * stride, i)) }
}
export function parseAet(source: Uint8Array, name = 'untitled.bin'): AetDocument {
  const r = new BinaryReader(source)
  if (['AETC', 'FArc', 'FArC', 'FARC'].includes(new TextDecoder().decode(source.subarray(0, 4)))) throw new Error('Expected classic AET .bin; unpack the archive first')
  const curve = (p: number): Curve => {
    const n = r.u32(p), d = r.u32(p + 4)
    const keys = r.array(n, d, n === 1 ? 4 : 12, (_, i) => n === 1
      ? { frame: 0, value: r.f32(d), tangent: 0 }
      : { frame: r.f32(d + i * 4), value: r.f32(d + n * 4 + i * 8), tangent: r.f32(d + n * 4 + i * 8 + 4) })
    if (keys.some((k, i) => i > 0 && k.frame <= keys[i - 1]!.frame)) throw new Error('Curve keys must be ordered')
    return { offset: p, keys }
  }
  const layer = (p: number): Layer => {
    const v = r.u32(p + 40), a = r.u32(p + 44)
    return { offset: p, name: r.string(r.u32(p)), start: r.f32(p + 4), end: r.f32(p + 8), timeOffset: r.f32(p + 12), timeScale: r.f32(p + 16), flags: r.u16(p + 20), quality: r.u8(p + 22), itemType: r.u8(p + 23), item: r.u32(p + 24), parent: r.u32(p + 28),
      markers: r.array(r.u32(p + 32), r.u32(p + 36), 8, q => ({ offset: q, frame: r.f32(q), name: r.string(r.u32(q + 4)) })),
      video: v ? { offset: v, blend: r.u8(v), transferFlags: r.u8(v + 1), matte: r.u8(v + 2), curves: Object.fromEntries(channels.map((key, i) => [key, curve(v + 4 + i * 8)])) as Record<typeof channels[number], Curve>, extra: r.u32(v + 68) ? Object.fromEntries(channels3D.map((key, i) => [key, curve(r.u32(v + 68) + i * 8)])) : null } : null,
      audio: a ? Array.from({ length: 4 }, (_, i) => curve(a + i * 8)) : [],
    }
  }
  const scenes: Scene[] = []
  for (let table = 0; table < source.length; table += 4) {
    const p = r.u32(table); if (!p) break
    if (scenes.length > 4096) throw new Error('Invalid scene table')
    r.check(p, 64)
    const camera = r.u32(p + 28)
    const scene: Scene = { offset: p, name: r.string(r.u32(p)), start: r.f32(p + 4), end: r.f32(p + 8), fps: r.f32(p + 12), color: Array.from({ length: 4 }, (_, i) => r.u8(p + 16 + i)), width: r.u32(p + 20), height: r.u32(p + 24), camera: camera ? Array.from({ length: 13 }, (_, i) => curve(camera + i * 8)) : [],
      compositions: r.array(r.u32(p + 32), r.u32(p + 36), 8, q => ({ offset: q, layers: r.array(r.u32(q), r.u32(q + 4), 48, layer) })),
      videos: r.array(r.u32(p + 40), r.u32(p + 44), 20, q => ({ offset: q, color: Array.from({ length: 4 }, (_, i) => r.u8(q + i)), width: r.u16(q + 4), height: r.u16(q + 6), frames: r.f32(q + 8), sources: r.array(r.u32(q + 12), r.u32(q + 16), 8, t => ({ offset: t, name: r.string(r.u32(t)), id: r.u32(t + 4) })) })),
    }
    if (!scene.width || !scene.height || scene.width > 32768 || scene.height > 32768 || scene.fps <= 0 || scene.fps > 1000) throw new Error('Unsupported AET scene header')
    const videos = new Set(scene.videos.map(v => v.offset))
    const compositions = new Set(scene.compositions.map(c => c.offset))
    for (const c of scene.compositions) {
      const layers = new Map(c.layers.map(l => [l.offset, l]))
      for (const l of c.layers) {
        if (l.parent && !layers.has(l.parent)) throw new Error('Unresolved parent layer')
        const items = l.itemType === 1 ? videos : l.itemType === 3 ? compositions : null
        if (items && l.item && !items.has(l.item)) throw new Error('Unresolved layer item')
      }
      // Complete each chain once; shared ancestors need not be walked again.
      const complete = new Set<number>()
      for (const l of c.layers) {
        const chain = new Set<number>()
        let current: Layer | undefined = l
        while (current && !complete.has(current.offset)) {
          if (chain.has(current.offset)) throw new Error(`Cyclic parent layer: ${current.name}`)
          chain.add(current.offset)
          current = layers.get(current.parent)
        }
        for (const offset of chain) complete.add(offset)
      }
    }
    scenes.push(scene)
  }
  if (!scenes.length) throw new Error('No AET scenes found')
  return { name, source: source.slice(), scenes }
}
