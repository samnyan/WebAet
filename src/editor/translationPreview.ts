import type { Composition } from '../core/aet/types'
import type { DrawItem } from '../core/render/evaluate'

/** Offset evaluated geometry only; include transform descendants and independently paired masks. */
export function previewTranslation(
  items: readonly DrawItem[],
  composition: Composition,
  layerId: number,
  dx: number,
  dy: number,
  linear: readonly number[] = [1, 0, 0, 1],
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
    const [a, b, c, d] = linear as readonly [number, number, number, number]
    const original = item.matrix
    matrix[0] = a * original[0] + c * original[1]
    matrix[1] = b * original[0] + d * original[1]
    matrix[2] = a * original[2] + c * original[3]
    matrix[3] = b * original[2] + d * original[3]
    matrix[4] = a * original[4] + c * original[5] + dx
    matrix[5] = b * original[4] + d * original[5] + dy
    const world = item.world ? [...item.world] : undefined
    if (world) {
      for (const column of [0, 4, 8, 12]) {
        const x = item.world![column]!,
          y = item.world![column + 1]!
        world[column] = a * x + c * y + (column === 12 ? dx : 0)
        world[column + 1] = b * x + d * y + (column === 12 ? dy : 0)
      }
    }
    return { ...item, matrix, world, mask }
  }
  return items.map(offset)
}
