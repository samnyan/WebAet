import type { EditableChannel, Keyframe } from '../core/aet/types'
import { videoCurve } from '../core/aet/types'
import { parseAet } from '../core/aet/reader'
import { sampleCurve } from '../core/animation/curves'
import { reverseKeys } from '../core/animation/reverse'
import { offsetKeyValues } from '../core/animation/offsetValues'
import { retimeKeys } from '../core/animation/retime'
import { retimeLayer as retimeLayerCore } from '../core/animation/retimeLayer'
import { resolveCurve, resolveLayerContext, type LayerRef, type PropertyRef } from './properties'
import type { Editor } from './state'

export interface CopiedCurveData {
  channel: EditableChannel
  keys: Keyframe[]
}

let clipboard: CopiedCurveData | null = null
let clipboardDocSession = -1

export function getCopiedCurve(editor?: Editor): CopiedCurveData | null {
  if (editor && clipboardDocSession !== editor.workspace.docSession.value) {
    clipboard = null
  }
  return clipboard
    ? { channel: clipboard.channel, keys: clipboard.keys.map((k) => ({ ...k })) }
    : null
}

export function clearClipboard(): void {
  clipboard = null
  clipboardDocSession = -1
}

export function copyCurve(editor: Editor, ref: PropertyRef): boolean {
  if (ref.kind !== 'channel') return false
  const curve = resolveCurve(editor, ref)
  if (!curve || !curve.keys.length) return false

  clipboard = {
    channel: ref.channel,
    keys: curve.keys.map((k) => ({ ...k })),
  }
  clipboardDocSession = editor.workspace.docSession.value
  return true
}

export function canPasteCurve(editor: Editor, ref: PropertyRef): boolean {
  if (ref.kind !== 'channel') return false
  if (!clipboard || clipboardDocSession !== editor.workspace.docSession.value) return false
  if (ref.channel !== clipboard.channel) return false

  const ctx = resolveLayerContext(editor, ref)
  if (!ctx || ctx.layer.flags & 32 || editor.busy.value) return false
  return true
}

export function pasteCurve(editor: Editor, ref: PropertyRef): boolean {
  if (!canPasteCurve(editor, ref)) return false
  if (ref.kind !== 'channel') return false

  editor.workspace.requestPause()
  const curve = resolveCurve(editor, ref)
  if (!curve) return false

  const keysToPaste = clipboard!.keys.map((k) => ({ ...k }))
  editor.edit(() => {
    curve.keys = keysToPaste
  })
  editor.workspace.activeKey.value = null
  return true
}

export function restoreCurve(editor: Editor, ref: PropertyRef): boolean {
  if (ref.kind !== 'channel') return false
  editor.workspace.requestPause()
  if (editor.busy.value) return false

  const ctx = resolveLayerContext(editor, ref)
  if (!ctx || ctx.layer.flags & 32) return false

  const current = editor.doc.value
  if (!current) return false

  try {
    const originalDoc = parseAet(current.source, current.name)
    const originalLayer = originalDoc.scenes[ref.sceneIndex]?.compositions
      .flatMap((c) => c.layers)
      .find((x) => x.offset === ref.layerId)
    const target = resolveCurve(editor, ref)
    const source = videoCurve(originalLayer?.video, ref.channel)
    if (!target || !source) {
      editor.error.value = `原始数据中未找到通道 ${ref.channel}`
      return false
    }

    const restoredKeys = source.keys.map((k) => ({ ...k }))
    editor.edit(() => {
      target.keys = restoredKeys
    })
    editor.workspace.activeKey.value = null
    return true
  } catch (err) {
    editor.error.value = String(err)
    return false
  }
}

export function makeConstant(editor: Editor, ref: PropertyRef, value?: number): boolean {
  if (ref.kind !== 'channel') return false
  editor.workspace.requestPause()
  if (editor.busy.value) return false

  const ctx = resolveLayerContext(editor, ref)
  if (!ctx || ctx.layer.flags & 32) return false

  const curve = resolveCurve(editor, ref)
  if (!curve || curve.keys.length < 2) return false

  const targetValue = value !== undefined ? value : sampleCurve(curve, editor.frame.value)
  const encoded = Math.fround(targetValue)
  if (!Number.isFinite(encoded)) {
    editor.error.value = '常量数值必须是有限 float32'
    return false
  }

  editor.edit(() => {
    curve.keys = [{ frame: 0, value: encoded, tangent: 0 }]
  })
  editor.workspace.activeKey.value = { property: ref, frame: 0 }
  return true
}

export function reverseCurve(editor: Editor, ref: PropertyRef): boolean {
  if (ref.kind !== 'channel') return false
  editor.workspace.requestPause()
  if (editor.busy.value) return false

  const ctx = resolveLayerContext(editor, ref)
  if (!ctx || ctx.layer.flags & 32) return false

  const curve = resolveCurve(editor, ref)
  if (!curve || curve.keys.length < 2) return false

  editor.edit(() => {
    curve.keys = reverseKeys(curve.keys)
  })
  editor.workspace.activeKey.value = null
  return true
}

export function offsetValues(editor: Editor, ref: PropertyRef, delta: number): boolean {
  if (ref.kind !== 'channel') return false
  editor.workspace.requestPause()
  if (editor.busy.value) return false

  const ctx = resolveLayerContext(editor, ref)
  if (!ctx || ctx.layer.flags & 32) return false

  const encodedDelta = Math.fround(delta)
  if (!Number.isFinite(encodedDelta)) {
    editor.error.value = '偏移数值必须是有限 float32'
    return false
  }

  const curve = resolveCurve(editor, ref)
  if (!curve || !curve.keys.length) return false

  editor.edit(() => {
    curve.keys = offsetKeyValues(curve.keys, encodedDelta)
  })
  return true
}

export function retimeCurve(
  editor: Editor,
  ref: PropertyRef,
  scale: number,
  shift: number,
): boolean {
  if (ref.kind !== 'channel') return false
  editor.workspace.requestPause()
  if (editor.busy.value) return false

  const ctx = resolveLayerContext(editor, ref)
  if (!ctx || ctx.layer.flags & 32) return false

  const encodedScale = Math.fround(scale)
  const encodedShift = Math.fround(shift)
  if (!Number.isFinite(encodedScale) || encodedScale <= 0) {
    editor.error.value = '重定时倍率必须大于 0'
    return false
  }
  if (!Number.isFinite(encodedShift)) {
    editor.error.value = '重定时偏移必须是有限 float32'
    return false
  }

  const curve = resolveCurve(editor, ref)
  if (!curve || curve.keys.length < 2) return false

  editor.edit(() => {
    curve.keys = retimeKeys(curve.keys, encodedScale, encodedShift)
  })
  editor.workspace.activeKey.value = null
  return true
}

export function retimeLayer(editor: Editor, ref: LayerRef, scale: number, shift: number): boolean {
  editor.workspace.requestPause()
  if (editor.busy.value) return false

  const ctx = resolveLayerContext(editor, ref)
  if (!ctx || !ctx.layer.video || ctx.layer.flags & 32) return false

  const encodedScale = Math.fround(scale)
  const encodedShift = Math.fround(shift)
  if (!Number.isFinite(encodedScale) || encodedScale <= 0) {
    editor.error.value = '重定时倍率必须大于 0'
    return false
  }
  if (!Number.isFinite(encodedShift)) {
    editor.error.value = '重定时偏移必须是有限 float32'
    return false
  }

  editor.edit(() => {
    retimeLayerCore(ctx.layer.video!, encodedScale, encodedShift)
  })
  editor.workspace.activeKey.value = null
  return true
}
