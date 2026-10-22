import type { Keyframe } from '../aet/types'
/** First key at or after frame (or strictly after with inclusive=false). */
export function keyBound(keys: readonly Keyframe[], frame: number, inclusive = true): number {
  let lo = 0,
    hi = keys.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (inclusive ? keys[mid]!.frame < frame : keys[mid]!.frame <= frame) lo = mid + 1
    else hi = mid
  }
  return lo
}
export function adjacentKey(
  keys: readonly Keyframe[],
  frame: number,
  start: number,
  end: number,
  direction: -1 | 1,
): number {
  if (keys.length < 2) return -1
  const index =
    direction < 0
      ? keyBound(keys, Math.min(frame - 0.0001, end)) - 1
      : keyBound(keys, Math.max(frame + 0.0001, start), frame + 0.0001 < start ? true : false)
  const key = keys[index]
  return key && key.frame >= start && key.frame < end ? index : -1
}
