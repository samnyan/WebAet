<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { WorkArea } from '../../editor/workArea'
const p = defineProps<{ area: WorkArea | null; frame: number; start: number; end: number; disabled: boolean }>()
const emit = defineEmits<{ set: [start: number, end: number]; clear: [] }>()
function boundary(which: 'start' | 'end') {
  emit('set', which === 'start' ? p.frame : p.area?.start ?? p.start, which === 'end' ? p.frame : p.area?.end ?? p.end)
}
</script>
<template>
  <div class="work-area" title="仅预览工作区间，不写入 AET；出点不包含在播放范围内">
    <span>工作区</span>
    <NButton data-testid="work-in" size="tiny" :disabled="disabled || frame >= (area?.end ?? end)" @click="boundary('start')">入点</NButton>
    <span data-testid="work-range">{{ area ? `${area.start}–${area.end} f` : '未设置' }}</span>
    <NButton data-testid="work-out" size="tiny" :disabled="disabled || frame <= (area?.start ?? start)" @click="boundary('end')">出点</NButton>
    <NButton data-testid="work-clear" size="tiny" :disabled="disabled || !area" @click="emit('clear')">清除</NButton>
  </div>
</template>
<style scoped>
.work-area{display:flex;align-items:center;gap:5px;font-size:11px;color:#a4b1bf}
</style>
