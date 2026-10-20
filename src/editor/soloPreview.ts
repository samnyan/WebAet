import type { DrawItem } from '../core/render/evaluate'

/** Preview-only filter after matte pairing. IDs belong to the current composition. */
export function soloPreview(items: DrawItem[], solo: ReadonlySet<number>): DrawItem[] {
  if (!solo.size) return items
  return items.filter(
    (item) => solo.has(item.path[0]!) || (item.mask && solo.has(item.mask.path[0]!)),
  )
}
