<script setup lang="ts">
import { NInput, NInputNumber } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { sampleCurve } from '../../core/animation/curves'
import { keysWithValue } from '../../core/animation/setValue'
function eye(index: number, value: number | null) {
  const curve = e.scene.value?.camera[index]
  if (!curve || value === null) return
  e.edit(() => { curve.keys = keysWithValue(curve, e.frame.value, value) })
}
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
    <template v-if="e.scene.value.camera.length">
      <b>场景相机 Eye · {{ e.frame.value.toFixed(2) }} f</b>
      <label v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis" class="field" :data-camera-eye="axis"><span>Eye {{ axis }}</span><n-input-number size="tiny" :value="sampleCurve(e.scene.value.camera[i], e.frame.value)" :show-button="false" @update:value="eye(i, $event)" /></label>
      <p class="warning">Eye 位移已按 ReDIVA 运行时应用；动画曲线在当前帧更新 / 插键，常量直接修改。其他相机通道保留，完整相机透视尚未实现。</p>
    </template>
    <p v-else class="muted">此场景无 AET 相机记录；3D 观察相机不写入资源。</p>
  </details>
</template>
