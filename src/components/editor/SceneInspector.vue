<script setup lang="ts">
import { NInput, NInputNumber } from 'naive-ui'
import type { Editor } from '../../editor/state'
const { editor: e } = defineProps<{ editor: Editor }>()
function number(key: 'width' | 'height' | 'fps' | 'start' | 'end', value: number | null) {
  const scene = e.scene.value
  if (!scene || value === null || !Number.isFinite(value)) return
  if ((key === 'width' || key === 'height') && (!Number.isInteger(value) || value < 1 || value > 65535)) return
  if (key === 'fps' && value <= 0) return
  if (key === 'start' && value >= scene.end || key === 'end' && value <= scene.start) return
  e.edit(() => scene[key] = value)
}
</script>
<template>
  <details v-if="e.scene.value" class="property-group" data-testid="scene-inspector" :data-version="e.version.value">
    <summary>场景 / Scene</summary>
    <label class="field"><span>名称</span><n-input size="tiny" :value="e.scene.value.name" @update:value="v => e.edit(() => e.scene.value!.name = v)" /></label>
    <label v-for="key in (['width', 'height', 'fps', 'start', 'end'] as const)" :key="key" class="field" :data-scene-field="key"><span>{{ key }}</span><n-input-number size="tiny" :value="e.scene.value[key]" :show-button="false" @update:value="number(key, $event)" /></label>
    <p class="warning">修改场景尺寸不会自动缩放图层。时间范围必须 start &lt; end，帧率与尺寸必须为正数。</p>
    <p class="muted">{{ e.scene.value.camera.length ? '包含 AET 相机曲线；尚未应用相机透视。' : '此场景无 AET 相机记录；3D 观察相机不写入资源。' }}</p>
  </details>
</template>
