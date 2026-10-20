import type { Layer } from '../core/aet/types'
import { sampleCurve } from '../core/animation/curves'
import { keysWithValue } from '../core/animation/setValue'
/** Current-frame axis/uniform scale; preflight all affected channels before history. Positive factors retain mirroring. */
export function scaledChannels(
  layer: Layer,
  frame: number,
  factor: number,
  axis: 'both' | 'x' | 'y' = 'both',
) {
  if (!layer.video || layer.flags & 32) return null
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('缩放倍率必须为有限正数')
  if (factor === 1) return null
  const proposals = (['scaleX', 'scaleY'] as const)
    .filter((channel) => axis === 'both' || channel === (axis === 'x' ? 'scaleX' : 'scaleY'))
    .map((channel) => {
      const curve = layer.video!.curves[channel]
      const value = Math.fround(sampleCurve(curve, frame) * factor)
      return [channel, { ...curve, keys: keysWithValue(curve, frame, value) }] as const
    })
  if (
    proposals.every(
      ([channel, curve]) =>
        JSON.stringify(curve.keys) === JSON.stringify(layer.video!.curves[channel].keys),
    )
  )
    return null
  return Object.fromEntries(proposals)
}
export function scalePreview(factor: number, x: number, y: number) {
  return { linear: [factor, 0, 0, factor], dx: x * (1 - factor), dy: y * (1 - factor) }
}
