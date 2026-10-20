<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NInputNumber } from 'naive-ui'
import type { Editor } from '../../editor/state'
const { editor: e } = defineProps<{ editor: Editor }>()
const duration = ref<number | null>(null)
const layer = computed(() => { e.version.value; return e.selected.value })
watch([() => e.workspace.docSession.value, () => e.sceneIndex.value, () => e.compositionId.value, () => e.selectedId.value, () => e.version.value], () => { duration.value = layer.value ? layer.value.end - layer.value.start : null }, { immediate: true, flush: 'sync' })
function apply() { if (layer.value && duration.value !== null) e.stretchLayer(layer.value.offset, duration.value) }
</script>
<template>
  <details v-if="layer" class="stretch-control">
    <summary>时间拉伸</summary>
    <p>固定起点，缩放本层动画和标记、反向调整素材速率。保留素材偏移，不修改共享子合成；不等同于裁剪。</p>
    <div class="stretch-row">
      <NInputNumber v-model:value="duration" data-testid="stretch-duration" size="small" aria-label="拉伸后时长（帧）" :disabled="e.busy.value || !!(layer.flags & 32)" />
      <NButton data-testid="apply-stretch" size="small" :disabled="e.busy.value || !!(layer.flags & 32) || duration === null || duration <= 0 || duration === layer.end - layer.start" @click="apply">应用拉伸</NButton>
    </div>
  </details>
</template>
<style scoped>
.stretch-control{padding:6px;font-size:12px}.stretch-control p{color:#8695a7;font-size:11px}.stretch-row{display:flex;gap:6px}.stretch-row .n-input-number{min-width:0;flex:1}
</style>
