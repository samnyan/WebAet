import type { Editor } from './state'
import type { LayerRef } from './properties'
import { resolveLayer } from './properties'
import { assignLayerReference } from './layerReference'
import type { MaterialItem } from './materialPicker'

export function createSpriteRecord(
  e: Editor,
  sceneIndex: number,
  item: MaterialItem,
  target?: LayerRef | null,
) {
  const scene = e.doc.value?.scenes[sceneIndex],
    sprite = item.set.sprites[item.index]
  if (!scene || !sprite || e.busy.value) throw new Error('场景或贴图不可用')
  const binding = e.library.sourceFor(item.set.name, item.index)
  if (!binding) throw new Error('请先加载对应 spr_db.bin，以获取可导出的精确贴图 ID')
  const layer = target ? resolveLayer(e, target) : null
  if (target && (!layer || target.sceneIndex !== sceneIndex || layer.flags & 32))
    throw new Error('目标图层不可编辑')
  const id = Math.min(0, ...scene.videos.map((v) => v.offset)) - 1
  e.workspace.requestPause()
  e.library.add(item.set)
  e.resourceVersion.value++
  e.edit(() => {
    scene.videos.push({
      offset: id,
      width: sprite.width,
      height: sprite.height,
      color: [255, 255, 255, 255],
      frames: 1,
      sources: [{ offset: id, name: binding.name, id: binding.id }],
    })
    if (target && layer) assignLayerReference(scene, target.compositionId, layer, { type: 1, id })
  })
  return id
}
