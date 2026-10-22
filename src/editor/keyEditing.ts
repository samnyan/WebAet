import type { Keyframe } from '../core/aet/types'

/** Merge clipboard values without overwriting existing keys. Constant tracks need explicit conversion. */
export function pastedKeys(keys: readonly Keyframe[], incoming: readonly Keyframe[]): Keyframe[] {
  if (keys.length === 1) throw new Error('请先将目标常量轨道转换为动画轨道')
  const result = [
    ...keys.map((k) => ({ ...k })),
    ...incoming.map((k) => ({
      frame: Math.fround(k.frame),
      value: Math.fround(k.value),
      tangent: Math.fround(k.tangent),
    })),
  ].sort((a, b) => a.frame - b.frame)
  if (
    result.some(
      (k, i) =>
        ![k.frame, k.value, k.tangent].every(Number.isFinite) ||
        (i > 0 && Math.fround(k.frame) <= Math.fround(result[i - 1]!.frame)),
    )
  )
    throw new Error('粘贴的关键帧时间冲突或超出 float32 范围')
  if (result.length === 1) throw new Error('AET 单键轨道只能表示常量，不能保留粘贴时间')
  return result
}

/** Shift selected times simultaneously, allowing moves through vacated positions. */
export function shiftedKeys(
  keys: readonly Keyframe[],
  times: readonly number[],
  delta: number,
): Keyframe[] {
  if (!Number.isFinite(delta)) throw new Error('关键帧偏移必须有限')
  if (keys.length < 2) throw new Error('常量轨道不能按时间移动')
  const selected = new Set(times.map(Math.fround))
  if ([...selected].some((time) => !keys.some((k) => Math.fround(k.frame) === time)))
    throw new Error('选中的关键帧已失效')
  const result = keys.map((k) => ({
    ...k,
    frame: selected.has(Math.fround(k.frame)) ? Math.fround(k.frame + delta) : k.frame,
  }))
  result.sort((a, b) => a.frame - b.frame)
  if (
    result.some(
      (k, i) =>
        !Number.isFinite(k.frame) ||
        (i > 0 && Math.fround(k.frame) <= Math.fround(result[i - 1]!.frame)),
    )
  )
    throw new Error('移动后的关键帧时间冲突或超出 float32 范围')
  return result
}
