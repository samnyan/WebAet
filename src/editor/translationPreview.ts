import type { Composition } from '../core/aet/types'
import type { DrawItem } from '../core/render/evaluate'

/** Offset evaluated geometry only; include transform descendants and independently paired masks. */
export function previewTranslation(
  items: readonly DrawItem[],
  composition: Composition,
  layerId: number,
  dx: number,
  dy: number,
): DrawItem[] {
  const affected = new Set([layerId])
  let changed = true
  while (changed) {
    changed = false
    for (const layer of composition.layers)
      if (!affected.has(layer.offset) && affected.has(layer.parent)) {
        affected.add(layer.offset)
        changed = true
      }
  }
  function offset(item: DrawItem): DrawItem {
    const mask = item.mask ? offset(item.mask) : undefined
    if (!affected.has(item.path[0]!)) return mask === item.mask ? item : { ...item, mask }
    const matrix = [...item.matrix] as DrawItem['matrix']
    matrix[4] += dx
    matrix[5] += dy
    const world = item.world ? [...item.world] : undefined
    if (world) {
      world[12]! += dx
      world[13]! += dy
    }
    return { ...item, matrix, world, mask }
  }
  return items.map(offset)
}
