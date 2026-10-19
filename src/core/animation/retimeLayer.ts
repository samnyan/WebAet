import { channels, channels3D, videoCurve, type LayerVideo } from '../aet/types'
import { retimeKeys } from './retime'

/** Validate every animated channel before publishing any changes. */
export function retimeLayer(video: LayerVideo, scale: number, shift: number): void {
  const animated = [...channels, ...channels3D].map(ch => videoCurve(video, ch)).filter(c => c && c.keys.length > 1)
  if (!animated.length) throw new Error('当前图层没有可重定时的动画轨道')
  const origin = Math.min(...animated.map(c => c!.keys[0]!.frame))
  const updates = animated.map(c => {
    const curve = c!, first = curve.keys[0]!.frame
    return { curve, keys: retimeKeys(curve.keys, scale, shift + (first - origin) * (scale - 1)) }
  })
  for (const { curve, keys } of updates) curve.keys = keys
}
