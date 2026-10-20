import type { Layer } from '../core/aet/types'
import { sampleCurve } from '../core/animation/curves'
import { keysWithValue } from '../core/animation/setValue'

/** Move the pivot in parent space while preserving the current-frame layer matrix. */
export function anchoredChannels(layer: Layer, frame: number, dx: number, dy: number) {
  if (!layer.video || layer.flags & 32) return null
  if (![dx, dy].every(Number.isFinite)) throw new Error('锚点位移无效')
  if (!dx && !dy) return null
  const curves = layer.video.curves
  const value = (channel: keyof typeof curves) => sampleCurve(curves[channel], frame)
  const angle = (value('rotation') * Math.PI) / 180
  const c = Math.cos(angle),
    s = Math.sin(angle)
  const sx = value('scaleX'),
    sy = value('scaleY')
  if (![sx, sy].every(Number.isFinite) || Math.abs(sx) < 1e-9 || Math.abs(sy) < 1e-9)
    throw new Error('零缩放图层无法反算锚点')
  const ax = Math.fround(value('anchorX') + (c * dx + s * dy) / sx)
  const ay = Math.fround(value('anchorY') + (-s * dx + c * dy) / sy)
  // Compensate from the actual float32 anchor delta, not the unrounded pointer delta.
  const da = ax - value('anchorX'),
    db = ay - value('anchorY')
  const proposals = (
    [
      ['anchorX', ax],
      ['anchorY', ay],
      ['positionX', Math.fround(value('positionX') + c * sx * da - s * sy * db)],
      ['positionY', Math.fround(value('positionY') + s * sx * da + c * sy * db)],
    ] as const
  )
    .filter(([channel, v]) => v !== value(channel))
    .map(
      ([channel, v]) =>
        [channel, { ...curves[channel], keys: keysWithValue(curves[channel], frame, v) }] as const,
    )
  return proposals.length ? Object.fromEntries(proposals) : null
}
