import type { Scene, Layer } from '../core/aet/types'
import type { LayerRef } from './properties'
export interface LayerTreeRow {
  key: string
  depth: number
  layer: Layer
  ref: LayerRef
  expandable: boolean
  warning?: string
}
export function layerTreeRows(
  scene: Scene | null,
  sceneIndex: number,
  root: number,
  expanded: (key: string) => boolean,
  search = '',
): LayerTreeRow[] {
  if (!scene) return []
  const comps = new Map(scene.compositions.map((c) => [c.offset, c])),
    rows: LayerTreeRow[] = []
  const query = search.trim().toLowerCase()
  // Search matches canonical layers once, rather than exponentially expanding a shared DAG.
  if (query) {
    for (const comp of scene.compositions)
      for (const layer of comp.layers)
        if (layer.name.toLowerCase().includes(query))
          rows.push({
            key: `search:${comp.offset}:${layer.offset}`,
            depth: 0,
            layer,
            ref: { sceneIndex, compositionId: comp.offset, layerId: layer.offset },
            expandable: false,
          })
    return rows
  }
  function walk(id: number, path: string, depth: number, ancestors: Set<number>) {
    const comp = comps.get(id)
    if (!comp) return
    const next = new Set(ancestors)
    next.add(id)
    for (const layer of comp.layers) {
      const key = `${path}/${layer.offset}`,
        cycle = layer.itemType === 3 && next.has(layer.item),
        missing = layer.itemType === 3 && !comps.has(layer.item)
      const expandable = layer.itemType === 3 && !cycle && !missing
      rows.push({
        key,
        depth,
        layer,
        ref: { sceneIndex, compositionId: id, layerId: layer.offset },
        expandable,
        warning: cycle ? '循环引用' : missing ? '合成缺失' : undefined,
      })
      if (expandable && expanded(key)) walk(layer.item, key, depth + 1, next)
    }
  }
  walk(root, String(root), 0, new Set())
  return rows
}
