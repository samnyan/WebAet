import type { Layer } from '../aet/types'
import { sampleCurve, type Matrix } from './curves'

/** Column-major homogeneous matrices; independent of DOM and renderer. */
export type Matrix4 = number[]
export const identity4 = (): Matrix4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
export function multiply4(a: Matrix4, b: Matrix4): Matrix4 {
  const result = Array<number>(16).fill(0)
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) result[col * 4 + row]! += a[k * 4 + row]! * b[col * 4 + k]!
  return result
}
function translation(x: number, y: number, z: number): Matrix4 {
  const m = identity4(); m[12] = x; m[13] = y; m[14] = z; return m
}
function rotation(axis: 'x' | 'y' | 'z', angle: number): Matrix4 {
  const c = Math.cos(angle), s = Math.sin(angle)
  if (axis === 'x') return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]
  if (axis === 'y') return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}
/** ReDIVA AetObj::CalcMat: T(posX,posY,-posZ) · direction · rotation · S · T(-anchor). */
export function layerMatrix4(layer: Layer, frame: number): Matrix4 {
  if (!layer.video) return identity4()
  const video = layer.video
  const s = (key: keyof typeof video.curves) => sampleCurve(video.curves[key], frame)
  const extra = (key: string, fallback = 0) => video.extra?.[key] ? sampleCurve(video.extra[key], frame) : fallback
  const rad = Math.PI / 180
  let m = translation(s('positionX'), s('positionY'), -extra('positionZ'))
  for (const [axis, angle] of [
    ['x', -extra('directionX')], ['y', -extra('directionY')], ['z', extra('directionZ')],
    ['x', -extra('rotationX')], ['y', -extra('rotationY')], ['z', s('rotation')],
  ] as const) m = multiply4(m, rotation(axis, angle * rad))
  const scale = identity4(); scale[0] = s('scaleX'); scale[5] = s('scaleY'); scale[10] = extra('scaleZ', 1)
  return multiply4(multiply4(m, scale), translation(-s('anchorX'), -s('anchorY'), -extra('anchorZ')))
}
/** Project only after the complete 3D hierarchy; sprite geometry lies on local Z=0. */
export function orthographicMatrix(m: Matrix4): Matrix { return [m[0]!, m[1]!, m[4]!, m[5]!, m[12]!, m[13]!] }
