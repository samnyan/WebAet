<script setup lang="ts">
import { computed } from 'vue'
import type { Curve } from '../../core/aet/types'
import { curveGraph } from '../../core/animation/curveGraph'
const props = defineProps<{ curve?: Curve; start: number; end: number; frame: number; revision: number }>()
const graph = computed(() => {
  props.revision
  return curveGraph(props.curve, props.start, props.end)
})
const playhead = computed(() => 12 + (props.frame - props.start) / (props.end - props.start) * 576)
</script>
<template>
  <div v-if="graph" class="curve-preview" data-testid="curve-preview">
    <svg viewBox="0 0 600 84" preserveAspectRatio="none" role="img" aria-label="当前轨道 Hermite 曲线预览">
      <path :d="graph.path" fill="none" stroke="#79c6ff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <circle v-for="(key, i) in graph.keys" :key="i" :cx="key.x" :cy="key.y" r="3" fill="#e6c36b"><title>{{ key.title }}</title></circle>
      <line v-if="frame >= start && frame <= end" :x1="playhead" :x2="playhead" y1="0" y2="84" stroke="#ef7885" vector-effect="non-scaling-stroke" />
    </svg>
    <small>{{ graph.low.toPrecision(5) }} … {{ graph.high.toPrecision(5) }} · Bézier 控制包络</small>
  </div>
</template>
<style scoped>
.curve-preview { position: relative; flex: 0 0 84px; min-height: 84px; background: #161b24; border-top: 1px solid #303746; }
svg { display: block; width: 100%; height: 84px; }
small { position: absolute; right: 8px; top: 2px; color: #a6b2c5; pointer-events: none; }
</style>
