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

/** Screen-space tolerance, binary nearest lookup; magnetic targets take precedence over the frame grid. */
export function snapTimelineFrame(
  value: number,
  targets: readonly number[],
  pixels: number,
  enabled: boolean,
  tolerance = 7,
): number {
  if (!enabled) return value
  if (!Number.isFinite(value) || !Number.isFinite(pixels) || pixels <= 0) return Math.round(value)
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
  return nearest ?? Math.round(value)
}
