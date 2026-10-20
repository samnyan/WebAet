import { parseAet } from './reader'
import type { AetDocument } from './types'

/** Append new Video records, retaining original opaque records and remapping layer references. */
export function materializeVideos(doc: AetDocument): AetDocument {
  const original = parseAet(doc.source, doc.name)
  if (!doc.scenes.some((s, i) => s.videos.length !== original.scenes[i]?.videos.length)) return doc
  const scenes: AetDocument['scenes'] = JSON.parse(JSON.stringify(doc.scenes))
  let bytes = doc.source.slice()
  const append = (data: Uint8Array) => {
    const at = Math.ceil(bytes.length / 4) * 4,
      next = new Uint8Array(at + data.length)
    next.set(bytes)
    next.set(data, at)
    bytes = next
    return at
  }
  const u = (p: number, n: number) => new DataView(bytes.buffer).setUint32(p, n, true)
  scenes.forEach((scene, si) => {
    const old = original.scenes[si]
    if (!old || scene.videos.length < old.videos.length)
      throw new Error('Video removal is not supported')
    if (scene.videos.length === old.videos.length) return
    const table = append(new Uint8Array(scene.videos.length * 20)),
      ids = new Map<number, number>()
    scene.videos.forEach((video, i) => {
      const prior = old.videos[i],
        q = table + i * 20
      if (ids.has(video.offset)) throw new Error('Duplicate Video identity')
      ids.set(video.offset, q)
      if (prior) {
        if (video.offset !== prior.offset) throw new Error('Existing Video order changed')
        bytes.set(doc.source.subarray(prior.offset, prior.offset + 20), q)
      } else {
        if (video.offset >= 0 || video.sources.length !== 1) throw new Error('Invalid new Video')
        const source = video.sources[0]!
        if (
          !/^[\x20-\x7e]+$/.test(source.name) ||
          !Number.isInteger(source.id) ||
          source.id < 0 ||
          source.id > 0xffffffff
        )
          throw new Error('Invalid Sprite binding')
        if (
          !Number.isInteger(video.width) ||
          !Number.isInteger(video.height) ||
          video.width <= 0 ||
          video.height <= 0 ||
          video.width > 65535 ||
          video.height > 65535
        )
          throw new Error('Invalid Sprite dimensions')
        const name = append(new TextEncoder().encode(source.name + '\0'))
        const sources = append(new Uint8Array(8))
        u(sources, name)
        u(sources + 4, source.id)
        source.offset = sources
        u(q + 12, 1)
        u(q + 16, sources)
        bytes.set(video.color, q)
        const view = new DataView(bytes.buffer)
        view.setUint16(q + 4, video.width, true)
        view.setUint16(q + 6, video.height, true)
        view.setFloat32(q + 8, video.frames, true)
      }
      video.offset = q
    })
    for (const comp of scene.compositions)
      for (const layer of comp.layers)
        if (layer.itemType === 1) {
          const item = ids.get(layer.item)
          if (item === undefined) throw new Error('Missing Video reference')
          layer.item = item
          // Existing layer tables must also point at relocated records in the baseline.
          if (layer.offset >= 0) u(layer.offset + 24, item)
        }
    u(scene.offset + 40, scene.videos.length)
    u(scene.offset + 44, table)
  })
  return { ...doc, source: bytes, scenes }
}
