import { parseAet } from './reader'
import { materializeLayers } from './layerStructure'
import { canParent } from '../animation/parenting'
import { canReferenceComposition } from '../animation/compositionReference'
import { channels, type AetDocument, type Curve } from './types'

/** Patch original records; append changed variable-length data without relocating unknown records. */
export function writeAet(doc: AetDocument): Uint8Array {
  doc = materializeLayers(doc)
  const original = parseAet(doc.source, doc.name)
  let buffer = new Uint8Array(doc.source.length + 4096)
  buffer.set(doc.source)
  let length = doc.source.length
  const view = () => new DataView(buffer.buffer)
  const append = (data: Uint8Array) => {
    const p = Math.ceil(length / 4) * 4
    if (p + data.length > buffer.length) { const next = new Uint8Array(Math.max(buffer.length * 2, p + data.length)); next.set(buffer); buffer = next }
    buffer.set(data, p); length = p + data.length; return p
  }
  const finiteFloat = (n: number) => { if (!Number.isFinite(n) || !Number.isFinite(Math.fround(n))) throw new Error('Value cannot be represented as finite float32') }
  const integer = (n: number, max: number, label: string) => { if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`Invalid ${label}`) }
  const f = (p: number, n: number) => { finiteFloat(n); view().setFloat32(p, n, true) }
  const u = (p: number, n: number) => { if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error('Invalid unsigned integer'); view().setUint32(p, n, true) }
  const text = (p: number, value: string, before: string) => {
    if (value === before) return
    if (!/^[\x20-\x7e]*$/.test(value)) throw new Error('Renamed binary identifiers currently require printable ASCII; original Shift-JIS strings are preserved')
    u(p, append(new TextEncoder().encode(value + '\0')))
  }
  const color = (p: number, a: number[]) => {
    if (!Array.isArray(a) || a.length !== 4) throw new Error('Color requires exactly four byte components')
    for (const v of a) integer(v, 255, 'byte color')
    buffer.set(a, p)
  }
  const curve = (c: Curve, before: Curve) => {
    if (!before || c.offset !== before.offset) throw new Error('Curve record address changed')
    if (JSON.stringify(c.keys) === JSON.stringify(before.keys)) return
    const keys = c.keys
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!
      for (const value of [k.frame, k.value, k.tangent]) finiteFloat(value)
      if (![k.frame, k.value, k.tangent].every(Number.isFinite) || (i > 0 && Math.fround(k.frame) <= Math.fround(keys[i - 1]!.frame))) throw new Error('Keyframes require finite values and strictly increasing frames')
    }
    const bytes = new Uint8Array(keys.length === 1 ? 4 : keys.length * 12)
    const v = new DataView(bytes.buffer)
    if (keys.length === 1) v.setFloat32(0, keys[0]!.value, true)
    else keys.forEach((k, i) => { v.setFloat32(i * 4, k.frame, true); v.setFloat32(keys.length * 4 + i * 8, k.value, true); v.setFloat32(keys.length * 4 + i * 8 + 4, k.tangent, true) })
    const address = keys.length ? append(bytes) : 0
    u(c.offset, keys.length); u(c.offset + 4, address)
  }
  if (doc.scenes.length !== original.scenes.length) throw new Error('Scene creation/deletion is not supported')
  doc.scenes.forEach((s, si) => {
    const old = original.scenes[si]!, p = s.offset
    if (p !== old.offset || s.compositions.length !== old.compositions.length || s.videos.length !== old.videos.length) throw new Error('Structural AET modifications are not supported')
    if (s.width !== old.width || s.height !== old.height) {
      integer(s.width, 32768, 'scene width'); integer(s.height, 32768, 'scene height')
      if (!s.width || !s.height) throw new Error('Scene dimensions must be positive')
    }
    if (s.fps !== old.fps && !(Math.fround(s.fps) > 0 && Math.fround(s.fps) <= 1000)) throw new Error('Scene fps must be within (0, 1000] in float32')
    if ((s.start !== old.start || s.end !== old.end) && !(Math.fround(s.start) < Math.fround(s.end))) throw new Error('Scene start must precede end in float32')
    text(p, s.name, old.name); f(p + 4, s.start); f(p + 8, s.end); f(p + 12, s.fps); color(p + 16, s.color); u(p + 20, s.width); u(p + 24, s.height)
    if (s.camera.length !== old.camera.length) throw new Error('Camera structure changed')
    s.camera.forEach((c, i) => curve(c, old.camera[i]!))
    s.videos.forEach((v, vi) => {
      const before = old.videos[vi]!
      if (v.offset !== before.offset || v.sources.length !== before.sources.length) throw new Error('Video structure changed')
      integer(v.width, 65535, 'video width'); integer(v.height, 65535, 'video height')
      color(v.offset, v.color); view().setUint16(v.offset + 4, v.width, true); view().setUint16(v.offset + 6, v.height, true); f(v.offset + 8, v.frames)
      v.sources.forEach((source, i) => { if (source.offset !== before.sources[i]!.offset) throw new Error('Source record address changed'); text(source.offset, source.name, before.sources[i]!.name); u(source.offset + 4, source.id) })
    })
    s.compositions.forEach((c, ci) => {
      const before = old.compositions[ci]!
      if (c.offset !== before.offset || c.layers.length !== before.layers.length) throw new Error('Layer creation/deletion is not supported')
      c.layers.forEach((l, li) => {
        const b = before.layers[li]!, q = l.offset
        if (q !== b.offset || l.markers.length !== b.markers.length || !!l.video !== !!b.video) throw new Error('Layer structure changed')
        if (l.audio.length !== b.audio.length || l.audio.some((a, i) => a.offset !== b.audio[i]!.offset)) throw new Error('Audio structure changed')
        if (l.parent !== b.parent) {
          integer(l.parent, 0xffffffff, 'layer parent')
          if (!canParent(c, l.offset, l.parent)) throw new Error(`Invalid layer parent: ${l.name} (cycle or reference outside composition)`)
        }
        const referenceChanged = l.item !== b.item || l.itemType !== b.itemType
        if (referenceChanged && ![0, 1, 3].includes(l.itemType)) throw new Error('Unsupported layer reference type')
        if (referenceChanged && l.itemType === 0 && l.item !== 0) throw new Error('Null layer cannot reference an item')
        if (referenceChanged && l.itemType === 3 && !canReferenceComposition(s, c.offset, l.item)) throw new Error(`Invalid composition reference: ${l.name} (cycle or missing target)`)
        if (referenceChanged && l.itemType === 1 && !s.videos.some(v => v.offset === l.item)) throw new Error(`Invalid video reference: ${l.name}`)
        if ((l.start !== b.start || l.end !== b.end) && !(Math.fround(l.start) < Math.fround(l.end))) throw new Error(`Layer start must precede end in float32: ${l.name}`)
        integer(l.flags, 65535, 'layer flags'); integer(l.quality, 255, 'layer quality'); integer(l.itemType, 255, 'item type')
        text(q, l.name, b.name); f(q + 4, l.start); f(q + 8, l.end); f(q + 12, l.timeOffset); f(q + 16, l.timeScale)
        view().setUint16(q + 20, l.flags, true); buffer[q + 22] = l.quality; buffer[q + 23] = l.itemType; u(q + 24, l.item); u(q + 28, l.parent)
        l.markers.forEach((m, i) => { if (m.offset !== b.markers[i]!.offset) throw new Error('Marker record address changed'); f(m.offset, m.frame); text(m.offset + 4, m.name, b.markers[i]!.name) })
        if (l.video && b.video) {
          if (l.video.offset !== b.video.offset || !!l.video.extra !== !!b.video.extra || JSON.stringify(Object.keys(l.video.extra ?? {}).sort()) !== JSON.stringify(Object.keys(b.video.extra ?? {}).sort())) throw new Error('Video channel structure changed')
          integer(l.video.blend, 255, 'blend mode'); integer(l.video.transferFlags, 255, 'transfer flags'); integer(l.video.matte, 255, 'matte mode')
          buffer[l.video.offset] = l.video.blend; buffer[l.video.offset + 1] = l.video.transferFlags; buffer[l.video.offset + 2] = l.video.matte
          for (const ch of channels) curve(l.video.curves[ch], b.video.curves[ch])
          for (const [key, value] of Object.entries(l.video.extra ?? {})) curve(value, b.video.extra![key]!)
        }
        l.audio.forEach((a, i) => curve(a, b.audio[i]!))
      })
    })
  })
  const result = buffer.slice(0, length)
  parseAet(result, doc.name) // Validate all patched references before returning any downloadable bytes.
  return result
}
