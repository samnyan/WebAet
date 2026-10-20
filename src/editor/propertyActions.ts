import { watch } from 'vue'
import { pastedKeys, shiftedKeys } from './keyEditing'
import type { EditableChannel } from '../core/aet/types'
import { videoCurve } from '../core/aet/types'
import { keysWithValue } from '../core/animation/setValue'
import { insertSampledKey } from '../core/animation/insertKey'
import { adjacentKey } from '../core/animation/keySearch'
import { canParent } from '../core/animation/parenting'
import { canReferenceComposition } from '../core/animation/compositionReference'
import {
  getFullRange,
  resolveCurve,
  resolveLayerContext,
  type LayerRef,
  type PropertyRef,
} from './properties'
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
  updateKey(keyRef: KeyRef, frame: number, value: number, tangent: number): void
  setKeyValue(keyRef: KeyRef, value: number): void
  setKeyTangent(keyRef: KeyRef, value: number): void
  jumpKey(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
    direction: -1 | 1,
  ): void
  copySelectedKeys(): void
  pasteSelectedKeys(target?: LayerRef): void
  selectKeys(keys: KeyRef[]): void
  moveSelectedKeys(delta: number): void
  toggleKey(keyRef: KeyRef): void
  removeSelectedKeys(): void
  selectKey(keyRef: KeyRef | null): void
  setPreviewVisible(layerRef: LayerRef, visible: boolean): void
  selectLayer(layerRef: LayerRef | null): void
  enterComposition(layerRef: LayerRef): void
  openComposition(sceneIndex: number, id: number): void
  hasKeyAtCurrentFrame(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
  ): boolean
  canJumpKey(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
    direction: -1 | 1,
  ): boolean
}

export function createPropertyActions(
  editor: PropertyActionsEditorContext,
  workspace: WorkspaceState,
): PropertyActions {
  function setValue(ref: PropertyRef, value: any): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, ref)
    if (!ctx) return

    if (ref.kind === 'layer' && ref.field === 'locked') {
      const lk = Boolean(value)
      editor.edit(() => {
        ctx.layer.flags = lk ? ctx.layer.flags | 32 : ctx.layer.flags & ~32
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
            ctx.layer.flags = v ? ctx.layer.flags | 1 : ctx.layer.flags & ~1
          })
        } else if (
          ref.field === 'start' ||
          ref.field === 'end' ||
          ref.field === 'timeOffset' ||
          ref.field === 'timeScale'
        ) {
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
        const m = ctx.layer.markers.find((x) => x.offset === ref.markerOffset)
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
    if (!ctx || ctx.layer.flags & 32) return
    const curve = resolveCurve(editor, channelRef)
    if (!curve) return

    const targetFrame = Math.round(editor.frame.value)
    if (curve.keys.length > 1) {
      const existing = curve.keys.find((k) => Math.fround(k.frame) === Math.fround(targetFrame))
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
    if (!ctx || ctx.layer.flags & 32) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const time = Math.fround(keyRef.frame)
    const idx = curve.keys.findIndex((k) => Math.fround(k.frame) === time)
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
    if (!ctx || ctx.layer.flags & 32) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const fromTime = Math.fround(keyRef.frame)
    const toTime = Math.fround(nextFrame)
    if (!Number.isFinite(toTime)) {
      editor.error.value = '关键帧时间必须是有限 float32'
      return
    }
    if (fromTime === toTime) return

    if (curve.keys.some((k) => Math.fround(k.frame) === toTime)) {
      editor.error.value = `目标帧 ${toTime} 已存在关键帧，禁止时间冲突`
      return
    }

    const idx = curve.keys.findIndex((k) => Math.fround(k.frame) === fromTime)
    if (idx < 0) return

    editor.edit(() => {
      const keys = curve.keys.map((k) => ({ ...k }))
      keys[idx]!.frame = toTime
      keys.sort((a, b) => a.frame - b.frame)
      curve.keys = keys
    })
    workspace.activeKey.value = { property: keyRef.property, frame: toTime }
  }

  function updateKey(keyRef: KeyRef, frame: number, value: number, tangent: number): void {
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, keyRef.property),
      curve = resolveCurve(editor, keyRef.property)
    if (!ctx || !curve || ctx.layer.flags & 32) return
    const index = curve.keys.findIndex((k) => Math.fround(k.frame) === Math.fround(keyRef.frame))
    if (index < 0) {
      editor.error.value = '关键帧已失效'
      return
    }
    const next = {
      frame: Math.fround(frame),
      value: Math.fround(value),
      tangent: Math.fround(tangent),
    }
    if (!Object.values(next).every(Number.isFinite)) {
      editor.error.value = '关键帧参数必须是有限 float32'
      return
    }
    if (curve.keys.length === 1 && next.frame !== curve.keys[index]!.frame) {
      editor.error.value = '常量轨道不能修改关键帧时间'
      return
    }
    if (curve.keys.some((k, i) => i !== index && Math.fround(k.frame) === next.frame)) {
      editor.error.value = '目标时间已有关键帧'
      return
    }
    workspace.requestPause()
    editor.edit(() => {
      curve.keys = curve.keys
        .map((k, i) => (i === index ? next : k))
        .sort((a, b) => a.frame - b.frame)
    })
    selectKeys([{ property: keyRef.property, frame: next.frame }])
  }

  function setKeyValue(keyRef: KeyRef, value: number): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, keyRef.property)
    if (!ctx || ctx.layer.flags & 32) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const encoded = Math.fround(value)
    if (!Number.isFinite(encoded)) {
      editor.error.value = '关键帧数值必须是有限 float32'
      return
    }
    const time = Math.fround(keyRef.frame)
    const key = curve.keys.find((k) => Math.fround(k.frame) === time)
    if (!key) return

    editor.edit(() => {
      key.value = encoded
    })
  }

  function setKeyTangent(keyRef: KeyRef, value: number): void {
    workspace.requestPause()
    if (editor.busy.value) return
    const ctx = resolveLayerContext(editor, keyRef.property)
    if (!ctx || ctx.layer.flags & 32) return
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return

    const encoded = Math.fround(value)
    if (!Number.isFinite(encoded)) {
      editor.error.value = '关键帧切线必须是有限 float32'
      return
    }
    const time = Math.fround(keyRef.frame)
    const key = curve.keys.find((k) => Math.fround(k.frame) === time)
    if (!key) return

    editor.edit(() => {
      key.tangent = encoded
    })
  }

  function jumpKey(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
    direction: -1 | 1,
  ): void {
    workspace.requestPause()
    const curve = resolveCurve(editor, channelRef)
    if (!curve || curve.keys.length < 2) return
    const ctx = resolveLayerContext(editor, channelRef)
    if (!ctx) return

    const fullRange = getFullRange(editor, ctx.composition, ctx.scene)
    const targetIdx = adjacentKey(
      curve.keys,
      editor.frame.value,
      fullRange.start,
      fullRange.end,
      direction,
    )
    if (targetIdx >= 0) {
      const targetKey = curve.keys[targetIdx]!
      workspace.seek(targetKey.frame)
      workspace.activeProperty.value = channelRef
      workspace.activeKey.value = { property: channelRef, frame: targetKey.frame }
    }
  }

  let clipboard: { ref: KeyRef; value: number; tangent: number }[] = []
  watch(
    () => editor.doc.value?.source,
    () => {
      clipboard = []
    },
    { flush: 'sync' },
  )
  function copySelectedKeys(): void {
    const copied: typeof clipboard = []
    for (const ref of workspace.selectedKeys.value) {
      const curve = resolveCurve(editor, ref.property)
      const key = curve?.keys.find((k) => Math.fround(k.frame) === Math.fround(ref.frame))
      if (!key) {
        editor.error.value = '选中的关键帧已失效'
        return
      }
      if (curve!.keys.length < 2) {
        editor.error.value = '常量轨道没有可复制的时间关键帧'
        return
      }
      copied.push({
        ref: { property: { ...ref.property }, frame: key.frame },
        value: key.value,
        tangent: key.tangent,
      })
    }
    if (copied.length) clipboard = copied
  }
  function pasteSelectedKeys(target?: LayerRef): void {
    if (editor.busy.value || !clipboard.length) return
    try {
      if (
        target &&
        new Set(
          clipboard.map(
            (k) =>
              `${k.ref.property.sceneIndex}:${k.ref.property.compositionId}:${k.ref.property.layerId}`,
          ),
        ).size !== 1
      )
        throw new Error('跨图层粘贴只接受来自同一图层的关键帧')
      if (
        target &&
        (target.sceneIndex !== editor.sceneIndex.value ||
          target.compositionId !== editor.compositionId.value)
      )
        throw new Error('粘贴目标不在当前合成')
      const entries = clipboard.map((k) =>
        target ? { ...k, ref: { ...k.ref, property: { ...k.ref.property, ...target } } } : k,
      )
      const delta = editor.frame.value - Math.min(...entries.map((k) => k.ref.frame))
      const groups = new Map<
        string,
        { ref: KeyRef; keys: { frame: number; value: number; tangent: number }[] }
      >()
      for (const entry of entries) {
        if (
          entry.ref.property.sceneIndex !== editor.sceneIndex.value ||
          entry.ref.property.compositionId !== editor.compositionId.value
        )
          throw new Error('请返回复制关键帧的原合成粘贴')
        const id = keyIdentity({ ...entry.ref, frame: 0 })
        const group = groups.get(id) ?? { ref: entry.ref, keys: [] }
        group.keys.push({
          frame: Math.fround(entry.ref.frame + delta),
          value: entry.value,
          tangent: entry.tangent,
        })
        groups.set(id, group)
      }
      const proposals = [...groups.values()].map((group) => {
        const ctx = resolveLayerContext(editor, group.ref.property),
          curve = resolveCurve(editor, group.ref.property)
        if (!ctx || !curve || ctx.layer.flags & 32) throw new Error('粘贴目标已失效或包含锁定图层')
        return { curve, keys: pastedKeys(curve.keys, group.keys) }
      })
      workspace.requestPause()
      editor.edit(() => {
        for (const proposal of proposals) proposal.curve.keys = proposal.keys
      })
      selectKeys(
        entries.map((k) => ({ property: k.ref.property, frame: Math.fround(k.ref.frame + delta) })),
      )
    } catch (cause) {
      editor.error.value = String(cause)
    }
  }

  const keyIdentity = (key: KeyRef) =>
    `${key.property.sceneIndex}:${key.property.compositionId}:${key.property.layerId}:${key.property.channel}:${Math.fround(key.frame)}`
  function selectKeys(keys: KeyRef[]): void {
    const unique = new Map<string, KeyRef>()
    for (const key of keys) {
      if (
        key.property.sceneIndex !== editor.sceneIndex.value ||
        key.property.compositionId !== editor.compositionId.value
      )
        continue
      const curve = resolveCurve(editor, key.property)
      if (curve?.keys.some((k) => Math.fround(k.frame) === Math.fround(key.frame)))
        unique.set(keyIdentity(key), key)
    }
    const next = [...unique.values()],
      primary = next.at(-1)
    workspace.selectLayer(primary?.property ?? null)
    workspace.selectedKeys.value = next
    workspace.activeKey.value = primary ?? null
    workspace.activeProperty.value = primary?.property ?? null
  }

  function toggleKey(keyRef: KeyRef): void {
    const ctx = resolveLayerContext(editor, keyRef.property)
    const curve = resolveCurve(editor, keyRef.property)
    if (!ctx || !curve?.keys.some((k) => Math.fround(k.frame) === Math.fround(keyRef.frame))) return
    const previous = [...workspace.selectedKeys.value]
    const identity = keyIdentity(keyRef)
    const next = previous.some((k) => keyIdentity(k) === identity)
      ? previous.filter((k) => keyIdentity(k) !== identity)
      : [...previous, keyRef]
    const primary = next.at(-1)
    workspace.selectLayer(primary?.property ?? null)
    workspace.selectedKeys.value = next
    workspace.activeProperty.value = primary?.property ?? null
    workspace.activeKey.value = primary ?? null
  }

  function moveSelectedKeys(delta: number): void {
    if (editor.busy.value || !delta || !workspace.selectedKeys.value.length) return
    const selected = [...workspace.selectedKeys.value]
    try {
      const groups = new Map<string, { key: KeyRef; times: number[] }>()
      for (const key of selected) {
        const id = keyIdentity({ ...key, frame: 0 })
        const group = groups.get(id) ?? { key, times: [] }
        group.times.push(key.frame)
        groups.set(id, group)
      }
      const proposals = [...groups.values()].map(({ key, times }) => {
        const ctx = resolveLayerContext(editor, key.property),
          curve = resolveCurve(editor, key.property)
        if (!ctx || !curve || ctx.layer.flags & 32)
          throw new Error('选中的关键帧已失效或包含锁定图层')
        return { curve, keys: shiftedKeys(curve.keys, times, delta) }
      })
      workspace.requestPause()
      editor.edit(() => {
        for (const proposal of proposals) proposal.curve.keys = proposal.keys
      })
      const next = selected.map((key) => ({ ...key, frame: Math.fround(key.frame + delta) }))
      workspace.selectedKeys.value = next
      workspace.activeKey.value = next.at(-1) ?? null
      workspace.activeProperty.value = next.at(-1)?.property ?? null
    } catch (cause) {
      editor.error.value = String(cause)
    }
  }

  function removeSelectedKeys(): void {
    if (editor.busy.value || !workspace.selectedKeys.value.length) return
    // Resolve the complete group before mutation; stale or locked members reject atomically.
    const targets = workspace.selectedKeys.value.map((key) => ({
      key,
      ctx: resolveLayerContext(editor, key.property),
      curve: resolveCurve(editor, key.property),
    }))
    if (
      targets.some(
        (t) =>
          !t.ctx ||
          t.ctx.layer.flags & 32 ||
          !t.curve?.keys.some((k) => Math.fround(k.frame) === Math.fround(t.key.frame)),
      )
    ) {
      editor.error.value = '选中的关键帧已失效或包含锁定图层'
      return
    }
    workspace.requestPause()
    editor.edit(() => {
      for (const { key, curve } of targets)
        curve!.keys = curve!.keys.filter((k) => Math.fround(k.frame) !== Math.fround(key.frame))
    })
    workspace.selectedKeys.value = []
    workspace.activeKey.value = null
  }

  function selectKey(keyRef: KeyRef | null): void {
    workspace.selectedKeys.value = []
    if (!keyRef) {
      workspace.activeKey.value = null
      return
    }
    const curve = resolveCurve(editor, keyRef.property)
    if (!curve) return
    const found = curve.keys.find((k) => Math.fround(k.frame) === Math.fround(keyRef.frame))
    if (!found) return

    workspace.activeProperty.value = keyRef.property
    workspace.activeKey.value = { property: keyRef.property, frame: found.frame }
    workspace.selectedKeys.value = [workspace.activeKey.value]
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

  function enterComposition(layerRef: LayerRef): void {
    if (!editor.busy.value) workspace.enterComposition(layerRef)
  }

  function openComposition(sceneIndex: number, id: number): void {
    workspace.openComposition(sceneIndex, id)
  }

  function hasKeyAtCurrentFrame(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
  ): boolean {
    const curve = resolveCurve(editor, channelRef)
    if (!curve || curve.keys.length <= 1) return false
    const targetFrame = Math.round(editor.frame.value)
    return curve.keys.some((k) => Math.fround(k.frame) === Math.fround(targetFrame))
  }

  function canJumpKey(
    channelRef: LayerRef & { kind: 'channel'; channel: EditableChannel },
    direction: -1 | 1,
  ): boolean {
    const curve = resolveCurve(editor, channelRef)
    if (!curve || curve.keys.length < 2) return false
    const ctx = resolveLayerContext(editor, channelRef)
    if (!ctx) return false
    const fullRange = getFullRange(editor, ctx.composition, ctx.scene)
    return (
      adjacentKey(curve.keys, editor.frame.value, fullRange.start, fullRange.end, direction) >= 0
    )
  }

  return {
    updateKey,
    copySelectedKeys,
    pasteSelectedKeys,
    selectKeys,
    moveSelectedKeys,
    toggleKey,
    removeSelectedKeys,
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
    enterComposition,
    openComposition,
    hasKeyAtCurrentFrame,
    canJumpKey,
  }
}
