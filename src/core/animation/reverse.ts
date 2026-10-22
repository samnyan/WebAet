import type { Keyframe } from '../aet/types'

/** Mirror time within the existing endpoints; derivatives change sign. */
export function reverseKeys(keys: readonly Keyframe[]): Keyframe[] {
  if (keys.length < 2) throw new Error('常量曲线没有可反转的动画区间')
  const start = keys[0]!.frame,
    end = keys.at(-1)!.frame
  if (
    keys.some(
      (k, i) =>
        !Number.isFinite(k.frame) ||
        !Number.isFinite(k.value) ||
        !Number.isFinite(k.tangent) ||
        (i > 0 && k.frame <= keys[i - 1]!.frame),
    )
  )
    throw new Error('反转需要有限且时间递增的关键帧')
  const result = [...keys].reverse().map((k) => ({
    frame: Math.fround(start + (end - k.frame)),
    value: k.value,
    tangent: Math.fround(-k.tangent),
  }))
  if (
    result.some(
      (k, i) =>
        !Number.isFinite(k.frame) ||
        !Number.isFinite(k.tangent) ||
        (i > 0 && k.frame <= result[i - 1]!.frame),
    )
  )
    throw new Error('反转后关键帧溢出或重叠')
  return result
}
