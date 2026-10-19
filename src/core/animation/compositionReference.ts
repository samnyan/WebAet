import type { Scene } from '../aet/types'

/** Validate the graph reachable through a replacement composition reference. */
export function canReferenceComposition(scene: Scene, owner: number, target: number): boolean {
  const compositions = new Map(scene.compositions.map(c => [c.offset, c]))
  if (!compositions.has(owner)) return false
  const visiting = new Set([owner]), complete = new Set<number>()
  function visit(id: number): boolean {
    if (visiting.has(id)) return false
    if (complete.has(id)) return true
    const composition = compositions.get(id)
    if (!composition) return false
    visiting.add(id)
    for (const layer of composition.layers) if (layer.itemType === 3 && !visit(layer.item)) return false
    visiting.delete(id); complete.add(id)
    return true
  }
  return visit(target)
}
