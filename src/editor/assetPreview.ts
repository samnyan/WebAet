import type { Editor } from './state'
import type { PreviewTarget } from './workspaceAssets'
import { createSceneEvaluator } from '../core/render/evaluate'
import { drawItems } from '../core/render/canvas'

/** One bounded preview surface; atlas decoding stays owned by SpriteLibrary. */
export function renderAssetPreview(editor: Editor, target: PreviewTarget, size = 160) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.max(32, Math.min(1600, size))
  const ctx = canvas.getContext('2d')!
  let description = '',
    width = 0,
    height = 0
  if (target.kind === 'composition') {
    const scene = editor.doc.value?.scenes[target.sceneIndex]
    if (!scene || !scene.compositions.some((c) => c.offset === target.compositionId))
      throw new Error('合成不可用')
    width = scene.width
    height = scene.height
    const scale = Math.min(canvas.width / width, canvas.height / height)
    ctx.translate((canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2)
    ctx.scale(scale, scale)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, width, height)
    ctx.clip()
    const evaluated = createSceneEvaluator(scene)(target.compositionId, scene.start)
    // Preview is independent of editor hide/isolate/orbit state.
    const result = drawItems(ctx, evaluated.items, editor.library, null, false)
    ctx.restore()
    description = `${width} × ${height} · ${scene.start} f${result.warnings.length ? ' · 预览有限制' : ''}`
  } else {
    let entry
    if (target.kind === 'sprite') {
      const set = editor.library.sets.find((s) => s.name === target.setName),
        sprite = set?.sprites[target.spriteIndex]
      const texture = sprite && set?.textures[sprite.texture]
      if (sprite && texture) entry = { sprite, texture }
    } else {
      const video = editor.doc.value?.scenes[target.sceneIndex]?.videos.find(
        (v) => v.offset === target.videoId,
      )
      if (!video) throw new Error('素材不可用')
      if (!video.sources.length) {
        const scale = Math.min(canvas.width / video.width, canvas.height / video.height)
        width = video.width * scale
        height = video.height * scale
        ctx.fillStyle = `rgb(${video.color.slice(0, 3).join(',')})`
        ctx.fillRect((canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
        return { canvas, description: `${video.width} × ${video.height} · 纯色` }
      }
      const source = video.sources[target.sourceIndex]
      if (!source) throw new Error('当前帧无序列素材')
      entry = editor.library.find(source.name, source.id)
    }
    if (!entry) throw new Error('未解析：请加载对应 Sprite / spr_db.bin')
    const s = entry.sprite,
      scale = Math.min(canvas.width / s.width, canvas.height / s.height)
    width = s.width * scale
    height = s.height * scale
    ctx.drawImage(
      editor.library.image(entry.texture),
      s.x,
      s.y,
      s.width,
      s.height,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    )
    description = `${s.name} · ${s.width} × ${s.height}`
  }
  return { canvas, description }
}
