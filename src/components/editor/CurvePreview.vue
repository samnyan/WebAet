<script setup lang="ts">
import { computed } from 'vue'
import type { Curve } from '../../core/aet/types'
import { curveGraph } from '../../core/animation/curveGraph'
const props = defineProps<{ curve?: Curve; start: number; end: number; frame: number; revision: number }>()
const emit = defineEmits<{ scrub: [frame: number]; selectKey: [index: number] }>()
function scrub(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement, bounds = svg.getBoundingClientRect()
  if (bounds.width <= 0) return
  const fraction = Math.max(0, Math.min(1, (600 * (event.clientX - bounds.left) / bounds.width - 12) / 576))
  emit('scrub', props.start + fraction * (props.end - props.start))
}
function beginScrub(event: PointerEvent) {
  if (event.button !== 0) return
  const svg = event.currentTarget as SVGSVGElement; svg.setPointerCapture(event.pointerId); scrub(event)
}
const graph = computed(() => {
  props.revision
  return curveGraph(props.curve, props.start, props.end)
})
const playhead = computed(() => 12 + (props.frame - props.start) / (props.end - props.start) * 576)
</script>
<template>
  <div v-if="graph" class="curve-preview" data-testid="curve-preview">
    <svg viewBox="0 0 600 84" preserveAspectRatio="none" role="img" aria-label="当前轨道 Hermite 曲线预览" @pointerdown="beginScrub" @pointermove="($event.buttons & 1) && scrub($event)">
      <path :d="graph.path" fill="none" stroke="#79c6ff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <circle v-for="(key, i) in graph.keys" :key="i" :cx="key.x" :cy="key.y" r="4" fill="#e6c36b" class="curve-key" @pointerdown.stop="emit('selectKey', key.index)"><title>{{ key.title }}</title></circle>
      <line v-if="frame >= start && frame <= end" :x1="playhead" :x2="playhead" y1="0" y2="84" stroke="#ef7885" vector-effect="non-scaling-stroke" />
    </svg>
    <small>{{ graph.low.toPrecision(5) }} … {{ graph.high.toPrecision(5) }} · Bézier 控制包络</small>
  </div>
</template>
<style scoped>
.curve-preview { position: relative; flex: 0 0 84px; min-height: 84px; background: #161b24; border-top: 1px solid #303746; }
svg { touch-action: none; cursor: crosshair; display: block; width: 100%; height: 84px; }
.curve-key { cursor: pointer; }
line { pointer-events: none; }
small { position: absolute; right: 8px; top: 2px; color: #a6b2c5; pointer-events: none; }
</style>
