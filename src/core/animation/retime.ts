import type { Keyframe } from '../aet/types'

/** Scale about the first key, then translate. Tangents are value/frame derivatives. */
export function retimeKeys(keys: readonly Keyframe[], scale: number, shift: number): Keyframe[] {
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(shift))
    throw new Error('时间缩放必须为正数，偏移必须有限')
  if (keys.length < 2) throw new Error('常量曲线没有可重定时的动画区间')
  const origin = keys[0]!.frame
  const result = keys.map((k) => ({
    frame: Math.fround(origin + (k.frame - origin) * scale + shift),
    value: k.value,
    tangent: Math.fround(k.tangent / scale),
  }))
  if (
    result.some(
      (k, i) =>
        !Number.isFinite(k.frame) ||
        !Number.isFinite(k.tangent) ||
        (i > 0 && k.frame <= result[i - 1]!.frame),
    )
  )
    throw new Error('重定时后关键帧溢出或重叠')
  return result
}
