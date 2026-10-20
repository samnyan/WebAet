import { parseAet } from './reader'
import { canReferenceComposition } from '../animation/compositionReference'
import { channels, channels3D, type AetDocument } from './types'

/** Relocate only changed layer tables; retain opaque bytes and shared resources. */
export function materializeLayers(doc: AetDocument): AetDocument {
  const original = parseAet(doc.source, doc.name)
  if (doc.scenes.length !== original.scenes.length) return doc
  const changed = doc.scenes.some((s, i) => s.compositions.some((c, j) => {
    const old = original.scenes[i]?.compositions[j]
    return old && (c.layers.length !== old.layers.length || c.layers.some((l, k) => l.offset !== old.layers[k]?.offset))
  }))
  if (!changed) return doc
  const scenes: AetDocument['scenes'] = JSON.parse(JSON.stringify(doc.scenes))
  let bytes = doc.source.slice()
  const append = (data: Uint8Array) => {
    const offset = Math.ceil(bytes.length / 4) * 4, next = new Uint8Array(offset + data.length)
    next.set(bytes); next.set(data, offset); bytes = next; return offset
  }
  const u = (p: number, n: number) => new DataView(bytes.buffer).setUint32(p, n, true)
  for (const [si, s] of scenes.entries()) for (const [ci, c] of s.compositions.entries()) {
    const old = original.scenes[si]?.compositions[ci]
    if (!old || c.offset !== old.offset) throw new Error('Composition structure changed')
    if (c.layers.length === old.layers.length && c.layers.every((l, i) => l.offset === old.layers[i]?.offset)) continue
    const records = new Map(old.layers.map(l => [l.offset, l]))
    const table = append(new Uint8Array(c.layers.length * 48)), ids = new Map<number, number>()
    for (const [i, l] of c.layers.entries()) {
      if (ids.has(l.offset)) throw new Error('Duplicate layer identity')
      ids.set(l.offset, table + i * 48)
    }
    for (const [i, l] of c.layers.entries()) {
      const q = table + i * 48, prior = records.get(l.offset)
      if (prior) bytes.set(doc.source.subarray(prior.offset, prior.offset + 48), q)
      else {
        if (l.offset >= 0) throw new Error('Unsupported new layer identity')
        const template = l.originalRecord === undefined ? undefined : records.get(l.originalRecord)
        if (l.originalRecord !== undefined && !template) throw new Error('Invalid duplicate provenance')
        if (template) bytes.set(doc.source.subarray(template.offset, template.offset + 48), q)
        const validReference = (template && l.itemType === template.itemType && l.item === template.item)
          || (l.itemType === 0 && l.item === 0)
          || (l.itemType === 1 && s.videos.some(v => v.offset === l.item))
          || (l.itemType === 3 && canReferenceComposition(s, c.offset, l.item))
        if (!validReference) throw new Error('Invalid new layer reference')
        // Seed independent record headers; writeAet then writes edited values/keys.
        // Keep raw names for unchanged Shift-JIS identifiers, which cannot be re-encoded.
        u(q, template ? new DataView(doc.source.buffer, doc.source.byteOffset).getUint32(template.offset, true) : append(new Uint8Array([0])))
        new DataView(bytes.buffer).setFloat32(q + 8, 1, true)
        new DataView(bytes.buffer).setFloat32(q + 16, 1, true)
        if (l.video) {
          const video = append(template?.video ? doc.source.slice(template.video.offset, template.video.offset + 72) : new Uint8Array(72))
          u(q + 40, video); l.video.offset = video
          for (const [index, channel] of channels.entries()) l.video.curves[channel].offset = video + 4 + index * 8
          if (l.video.extra) {
            if (Object.keys(l.video.extra).length !== channels3D.length || channels3D.some(ch => !l.video!.extra![ch])) throw new Error('Incomplete 3D channels')
            const extra = append(new Uint8Array(64)); u(video + 68, extra)
            channels3D.forEach((ch, i) => { l.video!.extra![ch]!.offset = extra + i * 8 })
          } else u(video + 68, 0)
          // Never share curve headers, even when initial key payloads are unchanged.
          for (const ch of channels) { u(l.video.curves[ch].offset, 0); u(l.video.curves[ch].offset + 4, 0) }
        } else u(q + 40, 0)
        if (l.audio.length !== 0 && l.audio.length !== 4) throw new Error('Invalid audio channels')
        const audio = l.audio.length ? append(new Uint8Array(32)) : 0
        u(q + 44, audio); l.audio.forEach((curve, i) => { curve.offset = audio + i * 8 })
        const markers = l.markers.length ? append(new Uint8Array(l.markers.length * 8)) : 0
        u(q + 32, l.markers.length); u(q + 36, markers)
        l.markers.forEach((marker, i) => {
          marker.offset = markers + i * 8
          const oldMarker = template?.markers[i]
          u(marker.offset + 4, oldMarker ? new DataView(doc.source.buffer, doc.source.byteOffset).getUint32(oldMarker.offset + 4, true) : append(new Uint8Array([0])))
        })
      }
      const parent = l.parent ? ids.get(l.parent) : 0
      if (parent === undefined) throw new Error('Deleted parent still referenced')
      u(q + 28, parent)
      l.offset = q; l.parent = parent
    }
    u(c.offset, c.layers.length); u(c.offset + 4, c.layers.length ? table : 0)
  }
  return { ...doc, source: bytes, scenes }
}
