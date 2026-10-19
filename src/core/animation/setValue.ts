import type { Curve, Keyframe } from '../aet/types'
import { sampleCurveTangent } from './curves'

/** Apply a property edit without mutating the source until validation succeeds. */
export function keysWithValue(curve: Curve, frame: number, value: number): Keyframe[] {
  const time = Math.fround(frame), encoded = Math.fround(value)
  if (!Number.isFinite(time) || !Number.isFinite(encoded)) throw new Error('属性值和帧时间必须是有限 float32')
  if (curve.keys.length <= 1) return [{ frame: 0, value: encoded, tangent: 0 }]
  const keys = curve.keys.map(k => ({ ...k }))
  const found = keys.find(k => Math.fround(k.frame) === time)
  if (found) found.value = encoded
  else {
    const tangent = Math.fround(sampleCurveTangent(curve, time))
    if (!Number.isFinite(tangent)) throw new Error('采样切线必须是有限 float32')
    keys.push({ frame: time, value: encoded, tangent }); keys.sort((a, b) => a.frame - b.frame)
  }
  return keys
}
