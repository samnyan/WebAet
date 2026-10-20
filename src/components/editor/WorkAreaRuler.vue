<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkArea } from '../../editor/workArea'
import { snapTimelineFrame } from '../../editor/timelineSnapping'
const p = defineProps<{
  captureTargets?: () => readonly number[]
  area: WorkArea | null
  start: number
  pixels: number
  scrollLeft: number
  labelsWidth: number
  snap: boolean
  disabled: boolean
  context: string
}>()
const emit = defineEmits<{ change: [start: number, end: number] }>()
const draft = ref<WorkArea | null>(null)
let drag: {
  id: number
  side: 'start' | 'end'
  x: number
  original: WorkArea
  pixels: number
  targets: readonly number[]
} | null = null
const shown = computed(() => draft.value ?? p.area)
const x = (frame: number) => (frame - p.start) * p.pixels - p.scrollLeft
function cancel() {
  drag = null
  draft.value = null
}
function down(event: PointerEvent, side: 'start' | 'end') {
  if (event.button !== 0 || p.disabled || !p.area || p.pixels <= 0) return
  event.preventDefault()
  const button = event.currentTarget as HTMLButtonElement
  button.focus()
  button.setPointerCapture(event.pointerId)
  drag = {
    id: event.pointerId,
    side,
    x: event.clientX,
    original: { ...p.area },
    pixels: p.pixels,
    targets: p.captureTargets?.() ?? [],
  }
}
function move(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return
  const { side, original } = drag
  if (Math.abs(event.clientX - drag.x) < 3) {
    draft.value = null
    return
  }
  const raw = original[side] + (event.clientX - drag.x) / drag.pixels
  const value = snapTimelineFrame(raw, drag.targets, drag.pixels, p.snap)
  if (!Number.isFinite(value)) return
  const next = { ...original, [side]: value }
  draft.value = next.end > next.start ? next : null
}
function up(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return
  move(event)
  const next = draft.value
  const original = drag.original
  cancel()
  if (next && (next.start !== original.start || next.end !== original.end))
    emit('change', next.start, next.end)
}
watch(() => [p.context, p.disabled, p.area, p.start, p.pixels], cancel, { flush: 'sync' })
</script>
<template>
  <div v-if="shown" class="work-area-ruler" :style="{ left: `${labelsWidth}px` }">
    <div
      class="work-area-band"
      :style="{ left: `${x(shown.start)}px`, width: `${(shown.end - shown.start) * pixels}px` }"
    />
    <button
      v-for="side in ['start', 'end'] as const"
      :key="side"
      :disabled="disabled"
      :aria-label="side === 'start' ? '拖动工作区间起点' : '拖动工作区间终点'"
      :title="`${side === 'start' ? '工作区间起点' : '工作区间终点'} ${shown[side]} f · Esc 取消`"
      :style="{ left: `${x(shown[side])}px` }"
      @pointerdown="down($event, side)"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
      @keydown.esc.stop.prevent="cancel"
    >
      {{ side === 'start' ? '▸' : '◂' }}
    </button>
  </div>
</template>
<style scoped>
.work-area-ruler {
  position: absolute;
  right: 0;
  top: 0;
  height: 12px;
  overflow: hidden;
  pointer-events: none;
  z-index: 6;
}
.work-area-band {
  position: absolute;
  top: 0;
  height: 5px;
  background: #dab66b88;
}
button {
  position: absolute;
  top: 0;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 0;
  transform: translateX(-50%);
  background: #dab66b;
  color: #28241b;
  cursor: ew-resize;
  pointer-events: auto;
  touch-action: none;
  font-size: 10px;
  line-height: 12px;
}
button:focus-visible {
  outline: 1px solid white;
  outline-offset: -1px;
}
button:disabled {
  pointer-events: none;
}
</style>
