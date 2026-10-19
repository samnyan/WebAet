import type { Scene } from '../aet/types'
import type { SpriteLibrary } from '../resources/library'
import { evaluateScene } from './evaluate'
import { drawItems } from './canvas'

/** Native-size scene frame, independent of editor selection, orbit, pan and zoom. */
export function renderSceneFrame(scene: Scene, composition: number, frame: number, library: SpriteLibrary, transparent = false) {
  const { width, height } = scene
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 16777216) throw new Error('场景 PNG 限制：单边最多 8192，最多 16777216 像素')
  if (!Number.isFinite(frame)) throw new Error('无效帧时间')
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas2D 不可用')
  if (!transparent) { ctx.fillStyle = `rgb(${scene.color[0]},${scene.color[1]},${scene.color[2]})`; ctx.fillRect(0, 0, width, height) }
  const evaluated = evaluateScene(scene, composition, frame)
  const result = drawItems(ctx, evaluated.items, library, null, false)
  return { canvas, warnings: [...new Set([...evaluated.warnings, ...result.warnings])] }
}
