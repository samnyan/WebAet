import type { EditableChannel } from '../core/aet/types'
import { videoCurve } from '../core/aet/types'
import { keysWithValue } from '../core/animation/setValue'
import { insertSampledKey } from '../core/animation/insertKey'
import { adjacentKey } from '../core/animation/keySearch'
import { canParent } from '../core/animation/parenting'
import { canReferenceComposition } from '../core/animation/compositionReference'
import { getFullRange, resolveCurve, resolveLayerContext, type LayerRef, type PropertyRef } from './properties'
import type { WorkspaceState } from './workspaceState'

export interface KeyRef {
  property: LayerRef & { kind: 'channel'; channel: EditableChannel }
  frame: number // float32 时间，不用会因插入/排序变动的数组下标
}

export interface PropertyActionsEditorContext {
  doc: { value: any }
  sceneIndex: { value: number }
  compositionId: { value: number }
  frame: { value: number }
  version: { value: number }
  busy: { value: boolean }
  error: { value: string }
  hidden: { value: Set<number> }
  scene: { value: any }
  composition: { value: any }
  edit(action: () => void): void
}

export interface PropertyActions {
  setValue(ref: PropertyRef, value: any): void
  addKey(channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel }): void
  removeKey(keyRef: KeyRef): void
  moveKey(keyRef: KeyRef, nextFrame: number): void
  setKeyValue(keyRef: KeyRef, value: number): void
  setKeyTangent(keyRef: KeyRef, value: number): void
  jumpKey(channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel }, direction: -1 | 1): void
  selectKey(keyRef: KeyRef | null): void
  setPreviewVisible(layerRef: LayerRef, visible: boolean): void
  selectLayer(layerRef: LayerRef | null): void
  openComposition(sceneIndex: number, id: number): void
  hasKeyAtCurrentFrame(channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel }): boolean
  canJumpKey(channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel }, direction: -1 | 1): boolean
}

export function createPropertyActions(
  editor: PropertyActionsEditorContext,
  workspace: WorkspaceState
): PropertyActions {
  function setValue(ref: PropertyRef, value: any): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, ref)
    if (!ctx) return

    if (ref.kind === 'layer' && ref.field === 'locked') {
      const lk = Boolean(value)
      editor.edit(() => {
        ctx.layer.flags = lk ? (ctx.layer.flags | 32) : (ctx.layer.flags & ~32)
      })
      return
    }

    if (ctx.layer.flags & 32) return

    switch (ref.kind) {
      case 'channel': {
        const curve = videoCurve(ctx.layer.video, ref.channel)
        if (!curve) return
        editor.edit(() => {
          curve.keys = keysWithValue(curve, editor.frame.value, Number(value))
        })
        break
      }
      case 'layer': {
        if (ref.field === 'name') {
          editor.edit(() => {
            ctx.layer.name = String(value)
          })
        } else if (ref.field === 'visible') {
          const v = Boolean(value)
          editor.edit(() => {
            ctx.layer.flags = v ? (ctx.layer.flags | 1) : (ctx.layer.flags & ~1)
          })
        } else if (ref.field === 'start' || ref.field === 'end' || ref.field === 'timeOffset' || ref.field === 'timeScale') {
          const num = Math.fround(Number(value))
          if (!Number.isFinite(num)) {
            editor.error.value = '图层时间参数必须是有限 float32'
            return
          }
          if (ref.field === 'start' && !(num < Math.fround(ctx.layer.end))) {
            editor.error.value = '图层时间范围必须在 float32 精度下 start < end'
            return
          }
          if (ref.field === 'end' && !(Math.fround(ctx.layer.start) < num)) {
            editor.error.value = '图层时间范围必须在 float32 精度下 start < end'
            return
          }
          const field = ref.field
          editor.edit(() => {
            ctx.layer[field] = num
          })
        } else if (ref.field === 'parent') {
          const p = Number(value)
          if (!canParent(ctx.composition, ctx.layer.offset, p)) return
          editor.edit(() => {
            ctx.layer.parent = p
          })
        }
        break
      }
      case 'source': {
        const target = Number(value)
        if (ctx.layer.itemType === 1) {
          if (!ctx.scene.videos.some((v: any) => v.offset === target)) return
          editor.edit(() => {
            ctx.layer.item = target
          })
        } else if (ctx.layer.itemType === 3) {
          if (!canReferenceComposition(ctx.scene, ctx.composition.offset, target)) return
          editor.edit(() => {
            ctx.layer.item = target
          })
        }
        break
      }
      case 'video': {
        if (!ctx.layer.video) return
        editor.edit(() => {
          ctx.layer.video![ref.field] = Number(value)
        })
        break
      }
      case 'marker': {
        const m = ctx.layer.markers.find(x => x.offset === ref.markerOffset)
        if (!m) return
        if (ref.field === 'name') {
          editor.edit(() => {
            m.name = String(value)
          })
        } else if (ref.field === 'frame') {
          const f = Math.fround(Number(value))
          if (Number.isFinite(f)) {
            editor.edit(() => {
              m.frame = f
            })
          }
        }
        break
      }
    }
  }

  function addKey(channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel }): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, channelRef)
    if (!ctx || (ctx.layer.flags & 32)) return
    const curve = resolveCurve(editor, channelRef)
    if (!curve) return

    const targetFrame = Math.round(editor.frame.value)
    if (curve.keys.length > 1) {
      const existing = curve.keys.find(k => Math.fround(k.frame) === Math.fround(targetFrame))
      if (existing) {
        selectKey({ property: channelRef, frame: existing.frame })
        return
      }
    }

    const fullRange = getFullRange(editor, ctx.composition, ctx.scene)
    const inserted = insertSampledKey(curve.keys, targetFrame, fullRange.start)
    editor.edit(() => {
      curve.keys = inserted.keys
    })
    workspace.activeProperty.value = channelRef
    workspace.activeKey.value = { property: channelRef, frame: targetFrame }
  }

  function removeKey(keyRef: KeyRef): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, keyRef.property)
    if (!ctx || (ctx.layer.flags & 32)) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const time = Math.fround(keyRef.frame)
    const idx = curve.keys.findIndex(k => Math.fround(k.frame) === time)
    if (idx < 0) return

    editor.edit(() => {
      curve.keys.splice(idx, 1)
    })

    if (
      workspace.activeKey.value &&
      workspace.activeKey.value.property.layerId === keyRef.property.layerId &&
      workspace.activeKey.value.property.channel === keyRef.property.channel &&
      Math.fround(workspace.activeKey.value.frame) === time
    ) {
      workspace.activeKey.value = null
    }
  }

  function moveKey(keyRef: KeyRef, nextFrame: number): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, keyRef.property)
    if (!ctx || (ctx.layer.flags & 32)) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const fromTime = Math.fround(keyRef.frame)
    const toTime = Math.fround(nextFrame)
    if (!Number.isFinite(toTime)) {
      editor.error.value = '关键帧时间必须是有限 float32'
      return
    }
    if (fromTime === toTime) return

    if (curve.keys.some(k => Math.fround(k.frame) === toTime)) {
      editor.error.value = `目标帧 ${toTime} 已存在关键帧，禁止时间冲突`
      return
    }

    const idx = curve.keys.findIndex(k => Math.fround(k.frame) === fromTime)
    if (idx < 0) return

    editor.edit(() => {
      const keys = curve.keys.map(k => ({ ...k }))
      keys[idx]!.frame = toTime
      keys.sort((a, b) => a.frame - b.frame)
      curve.keys = keys
    })
    workspace.activeKey.value = { property: keyRef.property, frame: toTime }
  }

  function setKeyValue(keyRef: KeyRef, value: number): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, keyRef.property)
    if (!ctx || (ctx.layer.flags & 32)) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const encoded = Math.fround(value)
    if (!Number.isFinite(encoded)) {
      editor.error.value = '关键帧数值必须是有限 float32'
      return
    }
    const time = Math.fround(keyRef.frame)
    const key = curve.keys.find(k => Math.fround(k.frame) === time)
    if (!key) return

    editor.edit(() => {
      key.value = encoded
    })
  }

  function setKeyTangent(keyRef: KeyRef, value: number): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, keyRef.property)
    if (!ctx || (ctx.layer.flags & 32)) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const encoded = Math.fround(value)
    if (!Number.isFinite(encoded)) {
      editor.error.value = '关键帧切线必须是有限 float32'
      return
    }
    const time = Math.fround(keyRef.frame)
    const key = curve.keys.find(k => Math.fround(k.frame) === time)
    if (!key) return

    editor.edit(() => {
      key.tangent = encoded
    })
  }

  function jumpKey(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
    direction: -1 | 1
  ): void {
    workspace.requestPause()
    const curve = resolveCurve(editor, channelRef)
    if (!curve || curve.keys.length < 2) return
    const ctx = resolveLayerContext(editor, channelRef)
    if (!ctx) return

    const fullRange = getFullRange(editor, ctx.composition, ctx.scene)
    const targetIdx = adjacentKey(curve.keys, editor.frame.value, fullRange.start, fullRange.end, direction)
    if (targetIdx >= 0) {
      const targetKey = curve.keys[targetIdx]!
      workspace.seek(targetKey.frame)
      workspace.activeProperty.value = channelRef
      workspace.activeKey.value = { property: channelRef, frame: targetKey.frame }
    }
  }

  function selectKey(keyRef: KeyRef | null): void {
    if (!keyRef) {
      workspace.activeKey.value = null
      return
    }
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return
    const found = curve.keys.find(k => Math.fround(k.frame) === Math.fround(keyRef.frame))
    if (!found) return

    workspace.activeProperty.value = keyRef.property
    workspace.activeKey.value = { property: keyRef.property, frame: found.frame }
  }

  function setPreviewVisible(layerRef: LayerRef, visible: boolean): void {
    const next = new Set(editor.hidden.value)
    if (visible) next.delete(layerRef.layerId)
    else next.add(layerRef.layerId)
    editor.hidden.value = next
  }

  function selectLayer(layerRef: LayerRef | null): void {
    workspace.selectLayer(layerRef)
  }

  function openComposition(sceneIndex: number, id: number): void {
    workspace.openComposition(sceneIndex, id)
  }

  function hasKeyAtCurrentFrame(channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel }): boolean {
    const curve = resolveCurve(editor, channelRef)
    if (!curve || curve.keys.length <= 1) return false
    const targetFrame = Math.round(editor.frame.value)
    return curve.keys.some(k => Math.fround(k.frame) === Math.fround(targetFrame))
  }

  function canJumpKey(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
    direction: -1 | 1
  ): boolean {
    const curve = resolveCurve(editor, channelRef)
    if (!curve || curve.keys.length < 2) return false
    const ctx = resolveLayerContext(editor, channelRef)
    if (!ctx) return false
    const fullRange = getFullRange(editor, ctx.composition, ctx.scene)
    return adjacentKey(curve.keys, editor.frame.value, fullRange.start, fullRange.end, direction) >= 0
  }

  return {
    setValue,
    addKey,
    removeKey,
    moveKey,
    setKeyValue,
    setKeyTangent,
    jumpKey,
    selectKey,
    setPreviewVisible,
    selectLayer,
    openComposition,
    hasKeyAtCurrentFrame,
    canJumpKey,
  }
}
