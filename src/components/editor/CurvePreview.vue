<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { Editor } from '../../editor/state'
import type { KeyRef } from '../../editor/propertyActions'
import type { Curve } from '../../core/aet/types'
import { curveGraph } from '../../core/animation/curveGraph'
import { zoomGraph, panGraph, type GraphBounds } from '../../editor/graphViewport'
const props = defineProps<{ editor: Editor; snap?: boolean; curve?: Curve; start: number; end: number; frame: number; revision: number }>()
const emit = defineEmits<{ scrub: [frame: number]; selectKey: [index: number] }>()
const drag = shallowRef<{ mode: 'key' | 'tangent'; dt: number; id: number; ref: KeyRef; index: number; x: number; y: number; low: number; high: number; frame: number; value: number; tangent: number; moved: boolean } | null>(null)
const view = shallowRef<GraphBounds | null>(null)
let pan: { id: number; y: number; height: number; bounds: GraphBounds } | null = null
function resetView() { cancel(); view.value = null }
watch([() => props.editor.workspace.docSession.value, () => props.editor.sceneIndex.value, () => props.editor.compositionId.value, () => props.editor.workspace.activeProperty.value], resetView, { flush: 'sync' })
function wheel(event: WheelEvent) {
  if (drag.value || pan || !graph.value) return
  const r = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  if (!r.height) return
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? r.height : 1
  view.value = zoomGraph(graph.value, (event.clientY - r.top) / r.height * 84, event.deltaY * unit)
}
function pointerMove(event: PointerEvent) {
  if (pan?.id === event.pointerId) { view.value = panGraph(pan.bounds, (event.clientY - pan.y) / pan.height * 84); return }
  if (drag.value) moveKey(event)
  else if (seeking && (event.buttons & 1)) scrub(event)
}
let seeking = false
function cancel() { drag.value = null; seeking = false; pan = null }
watch([() => props.editor.workspace.docSession.value, () => props.editor.sceneIndex.value, () => props.editor.compositionId.value, () => props.editor.workspace.activeProperty.value, () => props.revision, () => props.editor.busy.value, () => props.start, () => props.end], cancel, { flush: 'sync' })
function beginKey(event: PointerEvent, index: number, mode: 'key' | 'tangent' = 'key', dt = 0) {
  if (event.button !== 0) return
  emit('selectKey', index)
  const e = props.editor, ref = e.workspace.activeKey.value, key = props.curve?.keys[index], g = graph.value
  if (!ref || !key || !g || props.curve!.keys.length < 2 || e.busy.value || (e.selected.value?.flags ?? 32) & 32) return
  e.workspace.requestPause()
  const svg = (event.currentTarget as SVGElement).ownerSVGElement!
  svg.focus(); svg.setPointerCapture(event.pointerId)
  drag.value = { mode, dt, id: event.pointerId, ref: { ...ref, property: { ...ref.property } }, index, x: event.clientX, y: event.clientY, low: g.low, high: g.high, frame: key.frame, value: key.value, tangent: key.tangent, moved: false }
}
function moveKey(event: PointerEvent) {
  const d = drag.value
  if (!d || d.id !== event.pointerId) return
  const r = (event.currentTarget as SVGSVGElement).getBoundingClientRect(), key = props.curve?.keys[d.index]
  if (!key || !r.width || !r.height) return
  if (d.mode === 'tangent') {
    const scale = d.high === d.low ? 1 : (d.high - d.low) / 56
    const tangent = Math.fround(key.tangent - (event.clientY - d.y) / r.height * 84 * scale / d.dt)
    drag.value = { ...d, tangent, moved: Math.abs(event.clientY - d.y) > 3 }
    return
  }
  const raw = key.frame + (event.clientX - d.x) / r.width * 600 / 576 * (props.end - props.start)
  const frame = Math.fround(props.snap === false ? raw : Math.round(raw))
  const scale = d.high === d.low ? 1 : (d.high - d.low) / 56
  const value = Math.fround(key.value - (event.clientY - d.y) / r.height * 84 * scale)
  drag.value = { ...d, frame, value, moved: Math.abs(event.clientX - d.x) > 3 || Math.abs(event.clientY - d.y) > 3 }
}
function release(event: PointerEvent) {
  if (pan?.id === event.pointerId) { pointerMove(event); pan = null; return }
  if (drag.value?.id !== event.pointerId) return
  moveKey(event)
  const d = drag.value!
  cancel()
  if (d.moved) props.editor.actions.updateKey(d.ref, d.frame, d.value, d.tangent)
}
function scrub(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement, bounds = svg.getBoundingClientRect()
  if (bounds.width <= 0) return
  const fraction = Math.max(0, Math.min(1, (600 * (event.clientX - bounds.left) / bounds.width - 12) / 576))
  emit('scrub', props.start + fraction * (props.end - props.start))
}
function beginScrub(event: PointerEvent) {
  if (event.button === 1 && graph.value) {
    event.preventDefault()
    const svg = event.currentTarget as SVGSVGElement
    svg.focus(); svg.setPointerCapture(event.pointerId)
    pan = { id: event.pointerId, y: event.clientY, height: svg.getBoundingClientRect().height, bounds: { low: graph.value.low, high: graph.value.high } }
    return
  }
  if (event.button !== 0) return
  seeking = true
  const svg = event.currentTarget as SVGSVGElement; svg.setPointerCapture(event.pointerId); scrub(event)
}
const graph = computed(() => {
  props.revision
  const d = drag.value
  const curve = d && props.curve ? { ...props.curve, keys: props.curve.keys.map((k, i) => i === d.index ? { ...k, frame: d.frame, value: d.value, tangent: d.tangent } : k).sort((a, b) => a.frame - b.frame) } : props.curve
  return curveGraph(curve, props.start, props.end, d ?? view.value ?? undefined)
})
const handles = computed(() => {
  props.revision
  const ref = props.editor.workspace.activeKey.value, g = graph.value
  if (!ref || !g || !props.curve || props.curve.keys.length < 2) return []
  const index = drag.value?.index ?? props.curve.keys.findIndex(k => Math.fround(k.frame) === Math.fround(ref.frame))
  const original = props.curve.keys[index]
  if (!original) return []
  const k = drag.value ?? original
  const x = 12 + (k.frame - props.start) / (props.end - props.start) * 576
  const scale = g.high === g.low ? 1 : (g.high - g.low) / 56
  const y = g.high === g.low ? 42 : 70 - (k.value - g.low) / scale
  return [-1, 1].map(side => {
    const dt = side * (props.end - props.start) / 16
    return { index, dt, x, y, hx: x + side * 36, hy: y - k.tangent * dt / scale }
  })
})
const playhead = computed(() => 12 + (props.frame - props.start) / (props.end - props.start) * 576)
</script>
<template>
  <div v-if="graph" class="curve-preview" data-testid="curve-preview">
    <svg viewBox="0 0 600 84" preserveAspectRatio="none" role="img" tabindex="0" aria-label="当前轨道 Hermite 曲线预览" @keydown.esc.stop.prevent="cancel" @pointercancel="cancel" @lostpointercapture="cancel" @pointerup="release($event); seeking = false" @pointerdown="beginScrub" @pointermove="pointerMove" @wheel.prevent.stop="wheel" @dblclick.self="resetView">
      <path :d="graph.path" fill="none" style="pointer-events:none" stroke="#79c6ff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <g v-for="handle in handles" :key="handle.dt">
        <line :x1="handle.x" :y1="handle.y" :x2="handle.hx" :y2="handle.hy" stroke="#8bdac2" vector-effect="non-scaling-stroke" />
        <circle class="tangent-handle" :cx="handle.hx" :cy="handle.hy" r="4" fill="#8bdac2" @pointerdown.stop="beginKey($event, handle.index, 'tangent', handle.dt)"><title>AET 共用切线（值/帧）· 上下拖动</title></circle>
      </g>
      <circle v-for="(key, i) in graph.keys" :key="i" :cx="key.x" :cy="key.y" r="4" fill="#e6c36b" class="curve-key" @pointerdown.stop="beginKey($event, key.index)"><title>{{ key.title }}</title></circle>
      <line v-if="frame >= start && frame <= end" :x1="playhead" :x2="playhead" y1="0" y2="84" stroke="#ef7885" vector-effect="non-scaling-stroke" />
    </svg>
    <small>{{ graph.low.toPrecision(5) }} … {{ graph.high.toPrecision(5) }} · 滚轮缩放值轴 / 中键平移 / 双击复位</small>
  </div>
  <div v-else class="curve-preview curve-empty" data-testid="curve-preview">
    <span class="empty-text">选择含关键帧的动画属性通道以预览 Hermite 曲线</span>
  </div>
</template>
<style scoped>
.curve-preview { position: relative; flex: 0 0 84px; min-height: 84px; background: #161b24; border-top: 1px solid #303746; }
svg { touch-action: none; cursor: crosshair; display: block; width: 100%; height: 84px; }
.curve-key { cursor: pointer; }
.tangent-handle { cursor: ns-resize; }
line { pointer-events: none; }
small { position: absolute; right: 8px; top: 2px; color: #a6b2c5; pointer-events: none; }
.curve-empty { display: flex; align-items: center; justify-content: center; }
.empty-text { font-size: 11px; color: #6a778a; user-select: none; }
</style>
