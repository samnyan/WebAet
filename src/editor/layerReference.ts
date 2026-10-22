import { canReferenceComposition } from '../core/animation/compositionReference'
import type { Layer, Scene } from '../core/aet/types'
import { compositionLabels } from './compositionLabels'

export interface LayerReference {
  type: 0 | 1 | 3
  id: number
}

export function validateLayerReference(
  scene: Scene,
  owner: number,
  reference: LayerReference,
): void {
  if (reference.type === 0 && reference.id === 0) return
  if (reference.type === 1 && scene.videos.some((v) => v.offset === reference.id)) return
  if (reference.type === 3 && canReferenceComposition(scene, owner, reference.id)) return
  throw new Error('无效素材或子合成引用（目标不存在或产生循环）')
}

export function assignLayerReference(
  scene: Scene,
  owner: number,
  layer: Layer,
  reference: LayerReference,
): void {
  if (layer.flags & 32) throw new Error('锁定图层不可编辑')
  validateLayerReference(scene, owner, reference)
  layer.itemType = reference.type
  layer.item = reference.id
}

export function layerReferenceOptions(scene: Scene, owner: number) {
  const labels = compositionLabels(scene)
  return [
    { label: '独立空图层', value: '0:0' },
    ...scene.videos.map((v) => ({
      label: `素材 · ${v.sources[0]?.name || `0x${v.offset.toString(16)}`}`,
      value: `1:${v.offset}`,
    })),
    ...scene.compositions.map((c) => ({
      label: `合成 · ${labels.get(c.offset)}`,
      value: `3:${c.offset}`,
      disabled: !canReferenceComposition(scene, owner, c.offset),
    })),
  ]
}
