import type { Curve } from '../aet/types'
export function sampleCurve(curve: Curve | undefined, frame: number): number {
  const k = curve?.keys ?? []
  if (!k.length) return 0
  if (k.length === 1 || frame <= k[0]!.frame) return k[0]!.value
  if (frame >= k[k.length - 1]!.frame) return k[k.length - 1]!.value
  let lo = 0, hi = k.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (k[mid]!.frame <= frame) lo = mid; else hi = mid }
  const a = k[lo]!, b = k[hi]!, df = b.frame - a.frame, t = (frame - a.frame) / df, t2 = t * t, t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * a.value + (3 * t2 - 2 * t3) * b.value + ((t3 - 2 * t2 + t) * a.tangent + (t3 - t2) * b.tangent) * df
}
/** Derivative in value/frame units; clamped regions have zero velocity. */
export function sampleCurveTangent(curve: Curve | undefined, frame: number): number {
  const k = curve?.keys ?? []
  if (k.length < 2 || frame < k[0]!.frame || frame > k[k.length - 1]!.frame) return 0
  let lo = 0, hi = k.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (k[mid]!.frame <= frame) lo = mid; else hi = mid }
  const a = k[lo]!, b = k[hi]!, df = b.frame - a.frame, t = (frame - a.frame) / df
  return (6 * t * t - 6 * t) * (a.value - b.value) / df + (3 * t * t - 4 * t + 1) * a.tangent + (3 * t * t - 2 * t) * b.tangent
}
export type Matrix = [number, number, number, number, number, number]
export const identity = (): Matrix => [1, 0, 0, 1, 0, 0]
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
}
export function point(m: Matrix, x: number, y: number) { return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] } }
