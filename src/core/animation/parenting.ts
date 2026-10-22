import type { Composition } from '../aet/types'

/** Parent references are local to a composition. Reject existing broken chains too. */
export function canParent(composition: Composition, layer: number, parent: number): boolean {
  if (!composition.layers.some((l) => l.offset === layer)) return false
  const seen = new Set([layer])
  while (parent) {
    if (seen.has(parent)) return false
    seen.add(parent)
    const next = composition.layers.find((l) => l.offset === parent)
    if (!next) return false
    parent = next.parent
  }
  return true
}
