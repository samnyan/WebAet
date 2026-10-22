<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NInputNumber } from 'naive-ui'
import type { Editor } from '../../editor/state'
const { editor: e } = defineProps<{ editor: Editor }>()
const delta = ref<number | null>(0)
const layer = computed(() => {
  e.version.value
  return e.selected.value
})
watch(
  [
    () => e.workspace.docSession.value,
    () => e.sceneIndex.value,
    () => e.compositionId.value,
    () => e.selectedId.value,
    () => e.version.value,
  ],
  () => {
    delta.value = 0
  },
  { flush: 'sync' },
)
function apply() {
  if (layer.value && delta.value !== null) e.slipLayer(layer.value.offset, delta.value)
}
</script>
<template>
  <details v-if="layer && [1, 3].includes(layer.itemType)" class="slip-control">
    <summary>素材滑移</summary>
    <p>只改变素材采样时间，不移动图层区间或本层动画。正值向后采样；单位为素材帧，不乘播放速率。</p>
    <div class="slip-row">
      <NInputNumber
        v-model:value="delta"
        data-testid="slip-delta"
        size="small"
        aria-label="素材帧偏移"
        :disabled="e.busy.value || !!(layer.flags & 32)"
      />
      <NButton
        data-testid="apply-slip"
        size="small"
        :disabled="e.busy.value || !!(layer.flags & 32) || !delta"
        @click="apply"
        >应用滑移</NButton
      >
    </div>
  </details>
</template>
<style scoped>
.slip-control {
  padding: 6px;
  font-size: 12px;
}
.slip-control p {
  color: #8695a7;
  font-size: 11px;
}
.slip-row {
  display: flex;
  gap: 6px;
}
.slip-row .n-input-number {
  min-width: 0;
  flex: 1;
}
</style>
