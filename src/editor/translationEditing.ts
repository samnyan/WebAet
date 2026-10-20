import type { Layer } from '../core/aet/types'

/** Preflight both position tracks before publishing either. Preserve untouched channels exactly. */
export function translatedPosition(layer: Layer, dx: number, dy: number) {
  if (!layer.video || layer.flags & 32) return null
  if (![dx, dy].every(Number.isFinite)) throw new Error('平移量无效')
  if (dx === 0 && dy === 0) return null
  const proposals: Partial<Pick<typeof layer.video.curves, 'positionX' | 'positionY'>> = {}
  for (const [channel, delta] of [
    ['positionX', dx],
    ['positionY', dy],
  ] as const) {
    if (delta === 0) continue
    const curve = layer.video.curves[channel]
    const keys = curve.keys.length
      ? curve.keys.map((key) => ({ ...key, value: Math.fround(key.value + delta) }))
      : [{ frame: 0, value: Math.fround(delta), tangent: 0 }]
    if (keys.some((key) => !Number.isFinite(key.value)))
      throw new Error('平移后数值超出 float32 范围')
    if (
      keys.length !== curve.keys.length ||
      keys.some((key, i) => key.value !== curve.keys[i]!.value)
    )
      proposals[channel] = { ...curve, keys }
  }
  return Object.keys(proposals).length ? proposals : null
}
