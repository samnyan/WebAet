import { localTranslation } from './translationGizmo'
/** Parent-space angle avoids distortion from nonuniform parent scale. */
export function pointerAngle(inverse: readonly number[], x: number, y: number) {
  const local = localTranslation(inverse, x, y)
  return (Math.atan2(local.y, local.x) * 180) / Math.PI
}
export function angleDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180
}
export function rotationPreview(
  parent: readonly number[],
  inverse: readonly number[],
  degrees: number,
  x: number,
  y: number,
) {
  const c = Math.cos((degrees * Math.PI) / 180),
    s = Math.sin((degrees * Math.PI) / 180)
  const [a, b, d, e] = parent as readonly [number, number, number, number]
  const [i, j, k, l] = inverse as readonly [number, number, number, number]
  const linear = [
    a * c * i - a * s * j + d * s * i + d * c * j,
    b * c * i - b * s * j + e * s * i + e * c * j,
    a * c * k - a * s * l + d * s * k + d * c * l,
    b * c * k - b * s * l + e * s * k + e * c * l,
  ]
  return {
    linear,
    dx: x - linear[0]! * x - linear[2]! * y,
    dy: y - linear[1]! * x - linear[3]! * y,
  }
}
