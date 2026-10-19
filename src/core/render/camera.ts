import type { Scene } from '../aet/types'
import { sampleCurve } from '../animation/curves'
import { identity4, type Matrix4 } from '../animation/transform3d'

/** ReDIVA AetObj::Disp root translation, before composition/parent transforms.
 * Other serialized camera channels do not participate in this runtime path.
 * This is not an implementation of AE camera perspective.
 */
export function sceneCameraMatrix(scene: Scene, frame: number): Matrix4 {
  const matrix = identity4()
  if (scene.camera.length) {
    matrix[12] = scene.width / 2 - sampleCurve(scene.camera[0], frame)
    matrix[13] = scene.height / 2 - sampleCurve(scene.camera[1], frame)
    matrix[14] = -sampleCurve(scene.camera[2], frame)
  }
  return matrix
}
