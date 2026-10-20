import type { Composition } from '../core/aet/types'
import { sampleCurve } from '../core/animation/curves'
import {
  identity4,
  layerMatrix4,
  multiply4,
  orthographicMatrix,
} from '../core/animation/transform3d'

/** Current-composition translation axes, independent of textures and DOM. */
export function translationGizmo(composition: Composition, layerId: number, frame: number) {
  const layer = composition.layers.find((layer) => layer.offset === layerId)
  if (!layer?.video || layer.flags & 32) return null
  const seen = new Set([layerId]),
    chain = []
  let parent = layer.parent
  while (parent) {
    if (seen.has(parent)) return null
    seen.add(parent)
    const ancestor = composition.layers.find((layer) => layer.offset === parent)
    if (!ancestor) return null
    chain.unshift(ancestor)
    parent = ancestor.parent
  }
  if ([layer, ...chain].some((member) => member.video?.extra)) return null
  let world = identity4()
  for (const ancestor of chain) world = multiply4(world, layerMatrix4(ancestor, frame))
  const [a, b, c, d, tx, ty] = orthographicMatrix(world)
  const determinant = a * d - b * c
  const px = sampleCurve(layer.video.curves.positionX, frame),
    py = sampleCurve(layer.video.curves.positionY, frame)
  const x = a * px + c * py + tx,
    y = b * px + d * py + ty
  if (![a, b, c, d, x, y, determinant].every(Number.isFinite) || Math.abs(determinant) < 1e-9)
    return null
  return {
    x,
    y,
    inverse: [d / determinant, -b / determinant, -c / determinant, a / determinant] as const,
  }
}
export function localTranslation(inverse: readonly number[], dx: number, dy: number) {
  return { x: inverse[0]! * dx + inverse[2]! * dy, y: inverse[1]! * dx + inverse[3]! * dy }
}
