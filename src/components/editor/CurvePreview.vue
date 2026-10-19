<script setup lang="ts">
import { computed } from 'vue'
import type { Curve } from '../../core/aet/types'
import { sampleCurve } from '../../core/animation/curves'
const props = defineProps<{ curve?: Curve; start: number; end: number; frame: number; revision: number }>()
const graph = computed(() => {
  props.revision
  const span = props.end - props.start
  if (!props.curve?.keys.length || span <= 0) return null
  const samples = Array.from({ length: 257 }, (_, i) => ({ frame: props.start + span * i / 256, value: sampleCurve(props.curve, props.start + span * i / 256) }))
  const keys = props.curve.keys.filter(k => k.frame >= props.start && k.frame <= props.end)
  const values = [...samples, ...keys].map(k => k.value)
  const low = Math.min(...values), high = Math.max(...values), extent = high - low || 1
  const x = (f: number) => 12 + (f - props.start) / span * 576
  const y = (v: number) => 70 - (v - low) / extent * 56
  return { low, high, path: samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.frame)},${y(s.value)}`).join(' '), keys: keys.map(k => ({ x: x(k.frame), y: y(k.value), title: `${k.frame}f = ${k.value}` })), playhead: x(props.frame) }
})
</script>
<template>
  <div v-if="graph" class="curve-preview" data-testid="curve-preview">
    <svg viewBox="0 0 600 84" preserveAspectRatio="none" role="img" aria-label="当前轨道 Hermite 曲线预览">
      <path :d="graph.path" fill="none" stroke="#79c6ff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <circle v-for="(key, i) in graph.keys" :key="i" :cx="key.x" :cy="key.y" r="3" fill="#e6c36b"><title>{{ key.title }}</title></circle>
      <line v-if="frame >= start && frame <= end" :x1="graph.playhead" :x2="graph.playhead" y1="0" y2="84" stroke="#ef7885" vector-effect="non-scaling-stroke" />
    </svg>
    <small>{{ graph.low.toPrecision(5) }} … {{ graph.high.toPrecision(5) }} · 采样预览</small>
  </div>
</template>
<style scoped>
.curve-preview { position: relative; flex: 0 0 84px; min-height: 84px; background: #161b24; border-top: 1px solid #303746; }
svg { display: block; width: 100%; height: 84px; }
small { position: absolute; right: 8px; top: 2px; color: #a6b2c5; pointer-events: none; }
</style>
