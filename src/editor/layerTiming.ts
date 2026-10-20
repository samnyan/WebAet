import { channels, type Composition, type Layer } from '../core/aet/types'

export type LayerTimeEdit = 'trim-start' | 'trim-end' | 'layer-move'
export interface LayerTimeSnapshot { start: number; end: number; timeOffset: number }

/** Snap the intended boundary, retaining the original duration for body moves. */
export function layerTimeDragDelta(before: LayerTimeSnapshot, mode: LayerTimeEdit, movement: number, snap: boolean): number {
  const boundary = mode === 'trim-end' ? before.end : before.start
  let target = snap ? Math.round(boundary + movement) : boundary + movement
  if (mode === 'trim-start') target = Math.min(target, snap ? Math.ceil(before.end) - 1 : before.end - Math.min(1, (before.end - before.start) / 2))
  if (mode === 'trim-end') target = Math.max(target, snap ? Math.floor(before.start) + 1 : before.start + Math.min(1, (before.end - before.start) / 2))
  return target - boundary
}

/** Preflight all members on copies before publishing a group move. */
export function movedLayers(composition: Composition, ids: Set<number>, delta: number): Layer[] | null {
  const selected = composition.layers.filter(l => ids.has(l.offset))
  if (!delta || !Number.isFinite(delta) || !selected.length || selected.some(l => l.flags & 32)) return null
  const proposals = new Map(selected.map(layer => {
    const copy: Layer = JSON.parse(JSON.stringify(layer))
    applyLayerTimeEdit(copy, layer, 'layer-move', delta)
    for (const value of [copy.start, copy.end, copy.timeOffset]) if (!Number.isFinite(Math.fround(value))) throw new Error('Group time exceeds float32 range')
    const curves = [...Object.values(copy.video?.curves ?? {}), ...Object.values(copy.video?.extra ?? {}), ...copy.audio]
    for (const curve of curves) for (let i = 0; i < curve.keys.length; i++) {
      const frame = Math.fround(curve.keys[i]!.frame)
      if (!Number.isFinite(frame) || (i > 0 && frame <= Math.fround(curve.keys[i - 1]!.frame))) throw new Error('Group move collapses key times')
    }
    return [layer.offset, copy] as const
  }))
  return composition.layers.map(layer => proposals.get(layer.offset) ?? layer)
}

/** Slip source sampling only: local(t) gains sourceDelta; own transforms/range remain fixed. */
export function slippedLayer(layer: Layer, sourceDelta: number): Layer {
  if (![1, 3].includes(layer.itemType)) throw new Error('仅素材或合成引用支持滑移')
  if (layer.flags & 32) throw new Error('图层已锁定')
  const offset = Math.fround(layer.timeOffset + sourceDelta)
  if (!Number.isFinite(sourceDelta) || !Number.isFinite(offset)) throw new Error('素材帧偏移超出 float32 范围')
  return { ...layer, timeOffset: offset }
}

/** Own transforms sample composition time; referenced content samples local time. */
export function applyLayerTimeEdit(layer: Layer, before: LayerTimeSnapshot, mode: LayerTimeEdit, delta: number) {
  const start = before.start + (mode === 'trim-end' ? 0 : delta)
  const end = before.end + (mode === 'trim-start' ? 0 : delta)
  if (!Number.isFinite(start) || !Number.isFinite(end) || Math.fround(start) >= Math.fround(end)) throw new Error('Invalid layer range')
  layer.start = start; layer.end = end
  if (mode === 'trim-start') layer.timeOffset = before.timeOffset + delta * layer.timeScale
  if (mode === 'layer-move') {
    const curves = layer.video ? [...channels.map(c => layer.video!.curves[c]), ...Object.values(layer.video.extra ?? {})] : []
    for (const curve of [...curves, ...layer.audio]) if (curve.keys.length > 1) for (const key of curve.keys) key.frame = Math.fround(key.frame + delta)
  }
}
