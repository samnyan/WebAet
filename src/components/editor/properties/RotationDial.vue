<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Editor } from '../../../editor/state'
import { readPropertyValue, type PropertyRef } from '../../../editor/properties'
const p = defineProps<{ editor: Editor; property: PropertyRef; disabled: boolean }>()
const draft = ref<number | null>(null)
let drag: { id: number; x: number; value: number } | null = null
const value = computed(() => {
  p.editor.version.value
  return Number(readPropertyValue(p.editor, p.property, p.editor.frame.value)) || 0
})
const shown = computed(() => draft.value ?? value.value)
function cancel() {
  drag = null
  draft.value = null
}
function down(event: PointerEvent) {
  if (p.disabled || event.button !== 0) return
  event.preventDefault()
  p.editor.workspace.requestPause()
  const button = event.currentTarget as HTMLButtonElement
  button.focus()
  button.setPointerCapture(event.pointerId)
  drag = { id: event.pointerId, x: event.clientX, value: value.value }
}
function move(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return
  const raw = drag.value + event.clientX - drag.x
  draft.value = Math.fround(event.shiftKey ? Math.round(raw / 15) * 15 : raw)
}
function up(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return
  move(event)
  const next = draft.value,
    changed = Math.abs(event.clientX - drag.x) >= 3
  cancel()
  if (changed && next !== null && next !== value.value && Number.isFinite(next))
    p.editor.actions.setValue(p.property, next)
}
watch(
  () => [
    JSON.stringify(p.property),
    p.editor.workspace.docSession.value,
    p.editor.version.value,
    p.editor.frame.value,
    p.editor.workspace.activeLayerRef.value,
    p.disabled,
  ],
  cancel,
  { flush: 'sync' },
)
</script>
<template>
  <button
    class="rotation-dial"
    :disabled="disabled"
    aria-label="拖动旋转角度"
    :title="`${shown}° · 左右拖动，Shift 15°吸附，Esc取消`"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
    @keydown.esc.stop.prevent="cancel"
  >
    <span :style="{ transform: `rotate(${shown}deg)` }">↑</span>
    <output v-if="draft !== null">{{ shown }}°</output>
  </button>
</template>
<style scoped>
.rotation-dial {
  position: relative;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #64738a;
  border-radius: 50%;
  background: #222833;
  color: #79c6ff;
  cursor: ew-resize;
  touch-action: none;
}
.rotation-dial span {
  display: block;
}
.rotation-dial:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
output {
  position: absolute;
  bottom: 26px;
  right: 0;
  padding: 2px 5px;
  background: #222833;
  color: #ddd;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
</style>
