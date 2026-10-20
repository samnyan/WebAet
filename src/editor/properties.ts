import { channels, channels3D, videoCurve, type AetDocument, type Composition, type Curve, type EditableChannel, type Layer, type Scene } from '../core/aet/types'
import { sampleCurve } from '../core/animation/curves'

export interface LayerRef {
  sceneIndex: number
  compositionId: number
  layerId: number
}

export type PropertyRef = LayerRef & (
  | { kind: 'channel'; channel: EditableChannel }
  | { kind: 'layer'; field: 'name' | 'start' | 'end' | 'timeOffset' | 'timeScale' | 'parent' | 'visible' | 'locked' }
  | { kind: 'source' }
  | { kind: 'video'; field: 'blend' | 'matte' }
  | { kind: 'marker'; markerOffset: number; field: 'name' | 'frame' }
)

export type PropertyGroupId = 'layer' | 'source' | 'transform' | 'transform3d' | 'appearance' | 'markers'

export interface PropertyDescriptor {
  id: string
  label: string
  group: PropertyGroupId
  editor: 'number' | 'text' | 'select' | 'boolean' | 'readonly'
  animated: boolean
  step?: number
  property: PropertyRef
}

export type PropertyReadResult =
  | { status: 'ok'; value: any }
  | { status: 'unavailable'; reason: string }

export interface LayerContext {
  scene: Scene
  composition: Composition
  layer: Layer
}

export const channelLabels: Record<EditableChannel, string> = {
  anchorX: '锚点 X',
  anchorY: '锚点 Y',
  positionX: '位置 X',
  positionY: '位置 Y',
  rotation: '旋转 °',
  scaleX: '缩放 X',
  scaleY: '缩放 Y',
  opacity: '不透明度',
  anchorZ: '锚点 Z',
  positionZ: '位置 Z',
  directionX: '方向 X',
  directionY: '方向 Y',
  directionZ: '方向 Z',
  rotationX: '3D 旋转 X',
  rotationY: '3D 旋转 Y',
  scaleZ: '缩放 Z',
}

export function resolveLayer(
  editor: { doc: { value: AetDocument | null } },
  ref: LayerRef | null | undefined
): Layer | undefined {
  if (!ref || !editor.doc.value) return undefined
  const scene = editor.doc.value.scenes[ref.sceneIndex]
  if (!scene) return undefined
  const comp = scene.compositions.find(c => c.offset === ref.compositionId)
  if (!comp) return undefined
  return comp.layers.find(l => l.offset === ref.layerId)
}

export function resolveLayerContext(
  editor: { doc: { value: AetDocument | null } },
  ref: LayerRef | null | undefined
): LayerContext | undefined {
  if (!ref || !editor.doc.value) return undefined
  const scene = editor.doc.value.scenes[ref.sceneIndex]
  if (!scene) return undefined
  const comp = scene.compositions.find(c => c.offset === ref.compositionId)
  if (!comp) return undefined
  const layer = comp.layers.find(l => l.offset === ref.layerId)
  if (!layer) return undefined
  return { scene, composition: comp, layer }
}

export function resolveCurve(
  editor: { doc: { value: AetDocument | null } },
  channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel }
): Curve | undefined {
  const layer = resolveLayer(editor, channelRef)
  if (!layer?.video) return undefined
  return videoCurve(layer.video, channelRef.channel)
}

export function readProperty(
  editor: { doc: { value: AetDocument | null } },
  ref: PropertyRef,
  frame: number
): PropertyReadResult {
  const layer = resolveLayer(editor, ref)
  if (!layer) return { status: 'unavailable', reason: '图层未找到' }

  switch (ref.kind) {
    case 'channel': {
      if (!layer.video) return { status: 'unavailable', reason: '图层无变换属性' }
      const curve = videoCurve(layer.video, ref.channel)
      if (!curve) return { status: 'unavailable', reason: `通道 ${ref.channel} 未定义` }
      return { status: 'ok', value: sampleCurve(curve, frame) }
    }
    case 'layer': {
      switch (ref.field) {
        case 'name': return { status: 'ok', value: layer.name }
        case 'start': return { status: 'ok', value: layer.start }
        case 'end': return { status: 'ok', value: layer.end }
        case 'timeOffset': return { status: 'ok', value: layer.timeOffset }
        case 'timeScale': return { status: 'ok', value: layer.timeScale }
        case 'parent': return { status: 'ok', value: layer.parent }
        case 'visible': return { status: 'ok', value: Boolean(layer.flags & 1) }
        case 'locked': return { status: 'ok', value: Boolean(layer.flags & 32) }
      }
      break
    }
    case 'source': {
      if (layer.itemType === 1 || layer.itemType === 3) {
        return { status: 'ok', value: layer.item }
      }
      return { status: 'unavailable', reason: '该图层类型无素材或合成引用' }
    }
    case 'video': {
      if (!layer.video) return { status: 'unavailable', reason: '图层无视频属性' }
      if (ref.field === 'blend') return { status: 'ok', value: layer.video.blend }
      if (ref.field === 'matte') return { status: 'ok', value: layer.video.matte }
      break
    }
    case 'marker': {
      const marker = layer.markers.find(m => m.offset === ref.markerOffset)
      if (!marker) return { status: 'unavailable', reason: '标记未找到' }
      if (ref.field === 'name') return { status: 'ok', value: marker.name }
      if (ref.field === 'frame') return { status: 'ok', value: marker.frame }
      break
    }
  }
  return { status: 'unavailable', reason: '未知属性类型' }
}

export function readPropertyValue(
  editor: { doc: { value: AetDocument | null } },
  ref: PropertyRef,
  frame: number
): any {
  const res = readProperty(editor, ref, frame)
  return res.status === 'ok' ? res.value : undefined
}

export function listLayerProperties(
  editor: { doc: { value: AetDocument | null } },
  ref: LayerRef
): PropertyDescriptor[] {
  const layer = resolveLayer(editor, ref)
  if (!layer) return []
  const list: PropertyDescriptor[] = []
  const baseRef = { sceneIndex: ref.sceneIndex, compositionId: ref.compositionId, layerId: ref.layerId }

  list.push({
    id: `${ref.layerId}:layer:name`,
    label: '名称',
    group: 'layer',
    editor: 'text',
    animated: false,
    property: { ...baseRef, kind: 'layer', field: 'name' }
  })
  list.push({
    id: `${ref.layerId}:layer:visible`,
    label: '可见',
    group: 'layer',
    editor: 'boolean',
    animated: false,
    property: { ...baseRef, kind: 'layer', field: 'visible' }
  })
  list.push({
    id: `${ref.layerId}:layer:locked`,
    label: '锁定',
    group: 'layer',
    editor: 'boolean',
    animated: false,
    property: { ...baseRef, kind: 'layer', field: 'locked' }
  })
  list.push({
    id: `${ref.layerId}:layer:start`,
    label: '开始帧 (start)',
    group: 'layer',
    editor: 'number',
    animated: false,
    step: 1,
    property: { ...baseRef, kind: 'layer', field: 'start' }
  })
  list.push({
    id: `${ref.layerId}:layer:end`,
    label: '结束帧 (end)',
    group: 'layer',
    editor: 'number',
    animated: false,
    step: 1,
    property: { ...baseRef, kind: 'layer', field: 'end' }
  })
  list.push({
    id: `${ref.layerId}:layer:timeOffset`,
    label: '时间偏移 (timeOffset)',
    group: 'layer',
    editor: 'number',
    animated: false,
    step: 1,
    property: { ...baseRef, kind: 'layer', field: 'timeOffset' }
  })
  list.push({
    id: `${ref.layerId}:layer:timeScale`,
    label: '时间缩放 (timeScale)',
    group: 'layer',
    editor: 'number',
    animated: false,
    step: 0.1,
    property: { ...baseRef, kind: 'layer', field: 'timeScale' }
  })
  list.push({
    id: `${ref.layerId}:layer:parent`,
    label: '父级',
    group: 'layer',
    editor: 'select',
    animated: false,
    property: { ...baseRef, kind: 'layer', field: 'parent' }
  })

  if (layer.itemType === 1 || layer.itemType === 3) {
    list.push({
      id: `${ref.layerId}:source`,
      label: layer.itemType === 3 ? '子合成引用' : '素材引用',
      group: 'source',
      editor: 'select',
      animated: false,
      property: { ...baseRef, kind: 'source' }
    })
  }

  if (layer.video) {
    for (const ch of channels) {
      list.push({
        id: `${ref.layerId}:channel:${ch}`,
        label: channelLabels[ch],
        group: 'transform',
        editor: 'number',
        animated: true,
        step: ch === 'opacity' || ch.startsWith('scale') ? 0.01 : 1,
        property: { ...baseRef, kind: 'channel', channel: ch }
      })
    }

    if (layer.video.extra) {
      for (const ch of channels3D) {
        if (layer.video.extra[ch]) {
          list.push({
            id: `${ref.layerId}:channel3d:${ch}`,
            label: channelLabels[ch] || ch,
            group: 'transform3d',
            editor: 'number',
            animated: true,
            step: ch === 'scaleZ' ? 0.01 : 1,
            property: { ...baseRef, kind: 'channel', channel: ch }
          })
        }
      }
    }

    list.push({
      id: `${ref.layerId}:video:blend`,
      label: '混合模式',
      group: 'appearance',
      editor: 'select',
      animated: false,
      property: { ...baseRef, kind: 'video', field: 'blend' }
    })
    list.push({
      id: `${ref.layerId}:video:matte`,
      label: '轨道遮罩',
      group: 'appearance',
      editor: 'select',
      animated: false,
      property: { ...baseRef, kind: 'video', field: 'matte' }
    })
  }

  if (layer.markers && layer.markers.length > 0) {
    for (const m of layer.markers) {
      list.push({
        id: `${ref.layerId}:marker:${m.offset}:name`,
        label: `标记名称 (0x${m.offset.toString(16)})`,
        group: 'markers',
        editor: 'text',
        animated: false,
        property: { ...baseRef, kind: 'marker', markerOffset: m.offset, field: 'name' }
      })
      list.push({
        id: `${ref.layerId}:marker:${m.offset}:frame`,
        label: `标记帧 (0x${m.offset.toString(16)})`,
        group: 'markers',
        editor: 'number',
        animated: false,
        step: 1,
        property: { ...baseRef, kind: 'marker', markerOffset: m.offset, field: 'frame' }
      })
    }
  }

  return list
}

export function getPropertyDescriptor(
  editor: { doc: { value: AetDocument | null } },
  ref: PropertyRef
): PropertyDescriptor | undefined {
  const layer = resolveLayer(editor, ref)
  if (!layer) return undefined

  switch (ref.kind) {
    case 'channel': {
      const is3D = (channels3D as readonly string[]).includes(ref.channel)
      return {
        id: `${ref.layerId}:${is3D ? 'channel3d' : 'channel'}:${ref.channel}`,
        label: channelLabels[ref.channel] || ref.channel,
        group: is3D ? 'transform3d' : 'transform',
        editor: 'number',
        animated: true,
        step: ref.channel === 'opacity' || ref.channel.startsWith('scale') ? 0.01 : 1,
        property: ref,
      }
    }
    case 'layer': {
      const step = ref.field === 'timeScale' ? 0.1 : 1
      const editorType = ref.field === 'name' ? 'text' : (ref.field === 'visible' || ref.field === 'locked' ? 'boolean' : (ref.field === 'parent' ? 'select' : 'number'))
      const labels: Record<typeof ref.field, string> = {
        name: '名称',
        visible: '可见',
        locked: '锁定',
        start: '开始帧 (start)',
        end: '结束帧 (end)',
        timeOffset: '时间偏移 (timeOffset)',
        timeScale: '时间缩放 (timeScale)',
        parent: '父级',
      }
      return {
        id: `${ref.layerId}:layer:${ref.field}`,
        label: labels[ref.field],
        group: 'layer',
        editor: editorType,
        animated: false,
        step,
        property: ref,
      }
    }
    case 'source': {
      return {
        id: `${ref.layerId}:source`,
        label: layer.itemType === 3 ? '子合成引用' : '素材引用',
        group: 'source',
        editor: 'select',
        animated: false,
        property: ref,
      }
    }
    case 'video': {
      return {
        id: `${ref.layerId}:video:${ref.field}`,
        label: ref.field === 'blend' ? '混合模式' : '轨道遮罩',
        group: 'appearance',
        editor: 'select',
        animated: false,
        property: ref,
      }
    }
    case 'marker': {
      return {
        id: `${ref.layerId}:marker:${ref.markerOffset}:${ref.field}`,
        label: ref.field === 'name' ? `标记名称 (0x${ref.markerOffset.toString(16)})` : `标记帧 (0x${ref.markerOffset.toString(16)})`,
        group: 'markers',
        editor: ref.field === 'name' ? 'text' : 'number',
        animated: false,
        step: 1,
        property: ref,
      }
    }
  }
}

export interface SceneOwnerIndex {
  layerToComp: Map<number, number>
  compToLayers: Map<number, Layer[]>
}

const ownerIndexCache = new WeakMap<Scene, { version: number; index: SceneOwnerIndex }>()

export function getSceneOwnerIndex(scene: Scene | null | undefined, version = 0): SceneOwnerIndex {
  const empty: SceneOwnerIndex = { layerToComp: new Map(), compToLayers: new Map() }
  if (!scene) return empty
  const cached = ownerIndexCache.get(scene)
  if (cached && cached.version === version) {
    return cached.index
  }
  const layerToComp = new Map<number, number>()
  const compToLayers = new Map<number, Layer[]>()
  for (const comp of scene.compositions) {
    compToLayers.set(comp.offset, comp.layers)
    for (const l of comp.layers) {
      layerToComp.set(l.offset, comp.offset)
    }
  }
  const index = { layerToComp, compToLayers }
  ownerIndexCache.set(scene, { version, index })
  return index
}

export function getFullRange(
  editor: { scene: { value: Scene | null }; composition: { value: Composition | null } },
  composition?: Composition | null,
  scene?: Scene | null
): { start: number; end: number } {
  const s = scene ?? editor.scene.value
  const c = composition ?? editor.composition.value
  const layers = c?.layers ?? []
  const start = Math.min(s?.start ?? 0, ...(layers.length ? layers.map(l => l.start) : [0]))
  const end = Math.max(s?.end ?? 60, ...(layers.length ? layers.map(l => l.end) : [1]), 1)
  return { start, end }
}
