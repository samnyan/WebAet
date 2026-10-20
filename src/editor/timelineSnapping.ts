import type { Composition } from '../core/aet/types'

/** Immutable sorted targets captured once at gesture start; moving members cannot snap to themselves. */
export function timelineSnapTargets(
  composition: Composition,
  excludedLayers: ReadonlySet<number>,
  excludedKeys: ReadonlyMap<object, ReadonlySet<number>> = new Map(),
): number[] {
  const times = new Set<number>()
  for (const layer of composition.layers) {
    if (excludedLayers.has(layer.offset)) continue
    times.add(layer.start)
    times.add(layer.end)
    for (const marker of layer.markers) times.add(marker.frame)
    for (const curve of [
      ...Object.values(layer.video?.curves ?? {}),
      ...Object.values(layer.video?.extra ?? {}),
      ...layer.audio,
    ]) {
      if (curve.keys.length < 2) continue
      const excluded = excludedKeys.get(curve)
      for (const key of curve.keys) if (!excluded?.has(Math.fround(key.frame))) times.add(key.frame)
    }
  }
  return [...times].filter(Number.isFinite).sort((a, b) => a - b)
}

function nearestTarget(
  value: number,
  targets: readonly number[],
  pixels: number,
  tolerance = 7,
): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(pixels) || pixels <= 0) return undefined
  let low = 0,
    high = targets.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (targets[mid]! < value) low = mid + 1
    else high = mid
  }
  let nearest: number | undefined
  for (const index of [low - 1, low]) {
    const target = targets[index]
    if (
      target !== undefined &&
      Math.abs(target - value) * pixels <= tolerance &&
      (nearest === undefined || Math.abs(target - value) < Math.abs(nearest - value))
    )
      nearest = target
  }
  return nearest
}

/** Screen-space tolerance, binary nearest lookup; magnetic targets take precedence over the frame grid. */
export function snapTimelineFrame(
  value: number,
  targets: readonly number[],
  pixels: number,
  enabled: boolean,
  tolerance = 7,
): number {
  return enabled ? (nearestTarget(value, targets, pixels, tolerance) ?? Math.round(value)) : value
}

/** A guide is shown only for an exact candidate match, not a grid-only result. */
export function timelineSnapGuide(
  values: readonly number[],
  targets: readonly number[],
): number | undefined {
  for (const value of values) {
    const target = nearestTarget(value, targets, 1, 1e-7)
    if (target !== undefined) return target
  }
  return undefined
}

/** Compare both moving edges; start wins equal-distance ties. Keep one delta for the whole group. */
export function snapTimelineMove(
  start: number,
  end: number,
  movement: number,
  targets: readonly number[],
  pixels: number,
  enabled: boolean,
): number {
  if (!enabled) return movement
  let correction: number | undefined
  for (const edge of [start, end]) {
    const target = nearestTarget(edge + movement, targets, pixels)
    if (target === undefined) continue
    const delta = target - edge - movement
    if (correction === undefined || Math.abs(delta) < Math.abs(correction)) correction = delta
  }
  return correction === undefined ? Math.round(start + movement) - start : movement + correction
}
