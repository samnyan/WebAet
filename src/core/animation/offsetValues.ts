import type { Keyframe } from '../aet/types'

/** Translate the value axis without changing timing or derivatives. */
export function offsetKeyValues(keys: readonly Keyframe[], delta: number): Keyframe[] {
  if (!Number.isFinite(delta)) throw new Error('数值偏移必须有限')
  return keys.map((key) => {
    const value = Math.fround(key.value + delta)
    if (!Number.isFinite(value)) throw new Error('偏移后关键帧数值超出有限 float32 范围')
    return { ...key, value }
  })
}
