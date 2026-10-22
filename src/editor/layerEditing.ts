import { channels, type AetDocument, type Composition, type Layer } from '../core/aet/types'

/** Negative IDs are editor-only; the writer allocates real record addresses. */
export function createIndependentLayer(doc: AetDocument, start: number, end: number): Layer {
  let id = -1
  for (const s of doc.scenes)
    for (const c of s.compositions) for (const l of c.layers) id = Math.min(id, l.offset - 1)
  return {
    offset: id,
    name: 'New Layer',
    start,
    end,
    timeOffset: 0,
    timeScale: 1,
    flags: 1,
    quality: 0,
    itemType: 0,
    item: 0,
    parent: 0,
    markers: [],
    video: {
      offset: id,
      blend: 0,
      transferFlags: 0,
      matte: 0,
      extra: null,
      curves: Object.fromEntries(
        channels.map((ch) => [
          ch,
          {
            offset: id,
            keys: [
              {
                frame: 0,
                value: ch === 'scaleX' || ch === 'scaleY' || ch === 'opacity' ? 1 : 0,
                tangent: 0,
              },
            ],
          },
        ]),
      ) as NonNullable<Layer['video']>['curves'],
    },
    audio: [],
  }
}

/** Clone instance-owned data, while keeping shared content and parent references. */
export function duplicateLayer(doc: AetDocument, layer: Layer): Layer {
  return cloneLayer(layer, createIndependentLayer(doc, layer.start, layer.end).offset)
}

function cloneLayer(layer: Layer, id: number): Layer {
  const copy: Layer = JSON.parse(JSON.stringify(layer))
  copy.originalRecord = layer.originalRecord ?? (layer.offset > 0 ? layer.offset : undefined)
  copy.offset = id
  copy.name = /^[\x20-\x7e]*$/.test(layer.name) ? `${layer.name} Copy` : layer.name
  return copy
}

/** Duplicate a selection as a contiguous block above its first member.
 * Internal parent edges follow the copies; external parents and content stay shared.
 * Build everything before mutating the composition so failure cannot insert a partial group.
 */
export function duplicateLayers(
  doc: AetDocument,
  composition: Composition,
  ids: Set<number>,
): Layer[] {
  const originals = composition.layers.filter((l) => ids.has(l.offset))
  if (!originals.length || originals.some((l) => l.flags & 32)) return []
  let nextId = createIndependentLayer(doc, 0, 1).offset
  const copies = originals.map((layer) => cloneLayer(layer, nextId--))
  const remap = new Map(originals.map((layer, i) => [layer.offset, copies[i]!.offset]))
  for (const copy of copies) copy.parent = remap.get(copy.parent) ?? copy.parent
  const index = composition.layers.indexOf(originals[0]!)
  composition.layers.splice(index, 0, ...copies)
  return copies
}

/** Reorder one instance in painter order; resources, parents and curves keep their identities.
 * Matte pairing follows adjacency, so reordering intentionally changes that relationship too.
 */
export function reorderLayer(composition: Composition, id: number, target: number): boolean {
  const index = composition.layers.findIndex((l) => l.offset === id)
  if (
    index < 0 ||
    !Number.isInteger(target) ||
    target < 0 ||
    target >= composition.layers.length ||
    index === target
  )
    return false
  if (composition.layers[index]!.flags & 32) return false
  const [layer] = composition.layers.splice(index, 1)
  composition.layers.splice(target, 0, layer!)
  return true
}

export type LayerOrderDirection = 'up' | 'down' | 'top' | 'bottom'

/** Stable selection reorder; return a proposal so no-op commands need no history. */
export function reorderedLayers(
  composition: Composition,
  ids: Set<number>,
  direction: LayerOrderDirection,
): Layer[] {
  const before = composition.layers
  if (before.some((l) => ids.has(l.offset) && l.flags & 32)) return before
  const next = [...before]
  if (direction === 'top' || direction === 'bottom') {
    const selected = before.filter((l) => ids.has(l.offset)),
      rest = before.filter((l) => !ids.has(l.offset))
    return direction === 'top' ? [...selected, ...rest] : [...rest, ...selected]
  }
  if (direction === 'up') {
    for (let i = 1; i < next.length; i++) {
      if (ids.has(next[i]!.offset) && !ids.has(next[i - 1]!.offset))
        [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
    }
  } else if (direction === 'down') {
    for (let i = next.length - 2; i >= 0; i--) {
      if (ids.has(next[i]!.offset) && !ids.has(next[i + 1]!.offset))
        [next[i], next[i + 1]] = [next[i + 1]!, next[i]!]
    }
  }
  return next
}

/** Validate the whole group before any deletion: locked members reject the transaction. */
export function removeLayers(composition: Composition, ids: Set<number>): void {
  if (composition.layers.some((l) => ids.has(l.offset) && l.flags & 32))
    throw new Error('Locked layer cannot be deleted')
  composition.layers = composition.layers.filter((l) => !ids.has(l.offset))
  for (const layer of composition.layers) if (ids.has(layer.parent)) layer.parent = 0
}

/** Remove an instance, not its shared composition/video definition. */
export function removeLayer(composition: Composition, id: number) {
  const index = composition.layers.findIndex((l) => l.offset === id)
  if (index < 0) return
  if (composition.layers[index]!.flags & 32) throw new Error('Locked layer cannot be deleted')
  composition.layers.splice(index, 1)
  for (const layer of composition.layers) if (layer.parent === id) layer.parent = 0
}
