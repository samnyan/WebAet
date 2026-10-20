import type { Composition, Scene } from '../core/aet/types'
import {
  listLayerProperties,
  resolveCurve,
  type LayerRef,
  type PropertyDescriptor,
  type PropertyRef,
} from './properties'
import type { WorkspaceState } from './workspaceState'

export const TIMELINE_ROW_HEIGHT = 28
export const TIMELINE_RULER_HEIGHT = 28
export const TIMELINE_DEFAULT_LABELS_WIDTH = 340
export const TIMELINE_MIN_LABELS_WIDTH = 200

export type TimelineRow =
  | {
      id: string
      kind: 'layer'
      layer: LayerRef
      depth: 0
      layerName: string
      start: number
      end: number
      locked: boolean
      visible: boolean
      itemType: number
      item?: number
    }
  | {
      id: string
      kind: 'group'
      layer: LayerRef
      group: string
      groupLabel: string
      depth: number
      parentGroupId?: string
    }
  | {
      id: string
      kind: 'property'
      property: PropertyRef
      depth: number
      descriptor: PropertyDescriptor
      groupId: string
    }

export const groupLabels: Record<string, string> = {
  layer: '图层属性',
  source: '素材引用',
  transform: '变换',
  transform3d: '3D 变换',
  appearance: '外观',
  markers: '标记',
}

export interface TimelineEditorContext {
  doc: { value: any }
  sceneIndex: { value: number }
  compositionId: { value: number }
  scene: { value: Scene | null }
  composition: { value: Composition | null }
  version: { value: number }
  workspace: WorkspaceState
}

export function buildTimelineRows(
  editor: TimelineEditorContext,
  options?: { filterAnimated?: boolean }
): TimelineRow[] {
  const comp = editor.composition.value
  if (!comp) return []

  const filterAnimated = Boolean(options?.filterAnimated)
  const rows: TimelineRow[] = []
  const sceneIndex = editor.sceneIndex.value
  const compId = editor.compositionId.value

  for (const layer of comp.layers) {
    const layerRef: LayerRef = {
      sceneIndex,
      compositionId: compId,
      layerId: layer.offset,
    }

    const descriptors = listLayerProperties(editor, layerRef)
    const layerRowId = `layer:${layer.offset}`

    // If filterAnimated is enabled, check if layer has any animated channel (>1 keys)
    if (filterAnimated) {
      const hasAnimated = descriptors.some(desc => {
        if (!desc.animated || desc.property.kind !== 'channel') return false
        const curve = resolveCurve(editor, desc.property)
        return Boolean(curve && curve.keys.length > 1)
      })
      if (!hasAnimated) continue
    }

    rows.push({
      id: layerRowId,
      kind: 'layer',
      layer: layerRef,
      depth: 0,
      layerName: layer.name,
      start: layer.start,
      end: layer.end,
      locked: Boolean(layer.flags & 32),
      visible: Boolean(layer.flags & 1),
      itemType: layer.itemType,
      item: layer.item,
    })

    if (!editor.workspace.isExpanded(layerRowId, 'timeline')) {
      continue
    }

    // Layer is expanded: collect properties and groups
    // Group ordering: layer, source, transform (contains transform3d), appearance, markers
    const groupMap = new Map<string, PropertyDescriptor[]>()
    for (const desc of descriptors) {
      if (filterAnimated) {
        if (!desc.animated || desc.property.kind !== 'channel') continue
        const curve = resolveCurve(editor, desc.property)
        if (!curve || curve.keys.length <= 1) continue
      }
      const list = groupMap.get(desc.group) ?? []
      list.push(desc)
      groupMap.set(desc.group, list)
    }

    const orderedGroups: string[] = ['layer', 'source', 'transform', 'appearance', 'markers']

    for (const group of orderedGroups) {
      const isTransform = group === 'transform'
      const propsInGroup = groupMap.get(group) ?? []
      const propsIn3D = groupMap.get('transform3d') ?? []

      // If group has no props and is not transform with 3D, skip
      if (propsInGroup.length === 0 && (!isTransform || propsIn3D.length === 0)) {
        continue
      }

      const groupId = `group:${layer.offset}:${group}`
      rows.push({
        id: groupId,
        kind: 'group',
        layer: layerRef,
        group,
        groupLabel: groupLabels[group] || group,
        depth: 1,
      })

      if (!editor.workspace.isExpanded(groupId, 'timeline')) {
        continue
      }

      // Group is expanded: render its properties
      for (const desc of propsInGroup) {
        rows.push({
          id: `prop:${desc.id}`,
          kind: 'property',
          property: desc.property,
          depth: 2,
          descriptor: desc,
          groupId: group,
        })
      }

      // Nest transform3d as a sub-group within transform
      if (isTransform && propsIn3D.length > 0) {
        const subGroupId = `group:${layer.offset}:transform3d`
        rows.push({
          id: subGroupId,
          kind: 'group',
          layer: layerRef,
          group: 'transform3d',
          groupLabel: groupLabels['transform3d'] || '3D 变换',
          depth: 2,
          parentGroupId: group,
        })

        if (editor.workspace.isExpanded(subGroupId, 'timeline')) {
          for (const desc of propsIn3D) {
            rows.push({
              id: `prop:${desc.id}`,
              kind: 'property',
              property: desc.property,
              depth: 3,
              descriptor: desc,
              groupId: 'transform3d',
            })
          }
        }
      }
    }
  }

  return rows
}
