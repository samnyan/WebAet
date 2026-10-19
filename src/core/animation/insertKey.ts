import type { Keyframe } from '../aet/types'
import { sampleCurve, sampleCurveTangent } from './curves'

/** Insert a sampled key using the same precision as the AET binary. */
export function insertSampledKey(keys: readonly Keyframe[], frame: number, start: number): { keys: Keyframe[]; index: number } {
  const time = Math.fround(frame)
  if (!Number.isFinite(time)) throw new Error('关键帧时间必须是有限 float32')
  const result = keys.map(k => ({ ...k }))
  if (result.length === 1 && time !== Math.fround(start)) result[0]!.frame = Math.fround(start)
  const existing = result.findIndex(k => Math.fround(k.frame) === time)
  if (existing >= 0) return { keys: result, index: existing }
  const curve = { offset: 0, keys: [...keys] }
  const value = Math.fround(sampleCurve(curve, time)), tangent = Math.fround(sampleCurveTangent(curve, time))
  if (!Number.isFinite(value) || !Number.isFinite(tangent) || result.some(k => !Number.isFinite(k.frame))) throw new Error('采样关键帧参数必须是有限 float32')
  result.push({ frame: time, value, tangent })
  result.sort((a, b) => a.frame - b.frame)
  return { keys: result, index: result.findIndex(k => k.frame === time) }
}
