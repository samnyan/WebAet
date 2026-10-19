<script setup lang="ts">
import { computed } from 'vue'
import { NInput, NInputNumber, NCheckbox, NSelect, NButton } from 'naive-ui'
import { channels, channels3D } from '../../core/aet/types'
import type { Editor } from '../../editor/state'
import SceneInspector from './SceneInspector.vue'
import { canParent } from '../../core/animation/parenting'
const { editor: e } = defineProps<{ editor: Editor }>()
const layer = computed(() => { e.version.value; return e.selected.value })
const owner = computed(() => { e.version.value; return e.scene.value?.compositions.find(c => c.layers.some(l => l.offset === layer.value?.offset)) })
const parentOptions = computed(() => {
  e.version.value
  const c = owner.value, l = layer.value
  return [{ value: 0, label: '无 / None' }, ...(c && l ? c.layers.map(p => ({ value: p.offset, label: p.name, disabled: !canParent(c, l.offset, p.offset) })) : [])]
})
function parent(value: number) {
  const c = owner.value, l = layer.value
  if (!c || !l || (l.flags & 32) || !canParent(c, l.offset, value)) return
  e.edit(() => l.parent = value)
}
const videoOptions = computed(() => { e.version.value; return e.scene.value?.videos.map((v, i) => ({ value: v.offset, label: `${i} · ${v.sources[0]?.name || '纯色'} · ${v.width}×${v.height}` })) ?? [] })
function source(value: number) {
  const l = layer.value
  if (!l || l.itemType !== 1 || (l.flags & 32) || !e.scene.value?.videos.some(v => v.offset === value)) return
  e.edit(() => l.item = value)
}
const labels = { anchorX: '锚点 X', anchorY: '锚点 Y', positionX: '位置 X', positionY: '位置 Y', rotation: '旋转 °', scaleX: '缩放 X', scaleY: '缩放 Y', opacity: '不透明度' }
function numeric(key: 'start' | 'end' | 'timeOffset' | 'timeScale', value: number | null) { if (value === null || !layer.value) return; e.edit(() => { layer.value![key] = value }) }
const matteOptions = [{ value: 0, label: '无 / None' }, { value: 1, label: 'Alpha' }, { value: 2, label: '反相 Alpha' }, { value: 3, label: '亮度 / Luma' }, { value: 4, label: '反相亮度 / NotLuma' }]
const blendOptions = [{ value: 3, label: 'Normal' }, { value: 5, label: 'Add' }, { value: 6, label: 'Multiply' }, { value: 7, label: 'Screen' }, { value: 8, label: 'Overlay' }, { value: 27, label: 'Difference' }]
</script>
<template>
  <section class="panel inspector">
    <header>属性 / Inspector</header>
    <SceneInspector :editor="e" />
    <div v-if="layer" class="property-scroll" :key="layer.offset" :data-version="e.version.value">
      <label class="field"><span>名称</span><n-input size="tiny" :value="layer.name" :disabled="!!(layer.flags & 32)" @update:value="v => e.edit(() => layer!.name = v)" /></label>
      <div class="property-group"><b>图层</b><code>0x{{ layer.offset.toString(16) }}</code>
        <label class="field"><span>可见</span><n-checkbox :checked="!!(layer.flags & 1)" @update:checked="v => e.edit(() => layer!.flags = v ? layer!.flags | 1 : layer!.flags & ~1)" /></label>
        <label class="field"><span>锁定</span><n-checkbox :checked="!!(layer.flags & 32)" @update:checked="v => e.edit(() => layer!.flags = v ? layer!.flags | 32 : layer!.flags & ~32)" /></label>
        <label v-for="key in (['start', 'end', 'timeOffset', 'timeScale'] as const)" :key="key" class="field"><span>{{ key }}</span><n-input-number size="tiny" :value="layer[key]" :disabled="!!(layer.flags & 32)" :show-button="false" @update:value="numeric(key, $event)" /></label>
        <label class="field" data-testid="layer-parent"><span>父级</span><n-select size="tiny" filterable :value="layer.parent" :options="parentOptions" :disabled="!!(layer.flags & 32)" @update:value="parent" /></label>
        <p class="muted">切换父级保留本地变换，不保持世界位置；禁止循环引用。</p>
        <n-button v-if="layer.itemType === 3" size="tiny" @click="e.compositionId.value = layer.item; e.selectedId.value = null">进入合成 ↳</n-button>
      </div>
      <div v-if="layer.itemType === 1" class="property-group"><b>素材引用</b>
        <n-select data-testid="layer-source" size="tiny" filterable :value="layer.item" :options="videoOptions" :disabled="!!(layer.flags & 32)" @update:value="source" />
        <p class="muted">仅替换当前层引用；保留变换与动画，不修改共享素材。素材尺寸和序列长度可能不同。</p>
      </div>
      <div v-if="layer.video" class="property-group"><b>变换 · {{ e.frame.value.toFixed(1) }} f</b>
        <label v-for="ch in channels" :key="ch" class="field" :data-channel="ch"><span :title="ch">{{ labels[ch] }} <small v-if="layer.video.curves[ch].keys.length > 1">◆</small></span><n-input-number size="tiny" :value="e.currentValue(ch)" :disabled="!!(layer.flags & 32)" :show-button="false" :step="ch === 'opacity' || ch.startsWith('scale') ? 0.01 : 1" @update:value="v => v !== null && e.setValue(ch, v)" /></label>
        <label class="field"><span>混合</span><n-select size="tiny" :value="layer.video.blend" :options="blendOptions" :disabled="!!(layer.flags & 32)" @update:value="v => e.edit(() => layer!.video!.blend = v)" /></label>
        <p v-if="layer.video.extra" class="warning">3D 变换使用正交投影预览，不包含相机透视。</p>
        <label class="field" data-testid="matte-mode"><span>轨道遮罩</span><n-select size="tiny" :value="layer.video.matte" :options="matteOptions" :disabled="!!(layer.flags & 32)" @update:value="v => e.edit(() => layer!.video!.matte = v)" /></label>
        <p v-if="layer.video.matte" class="warning">精灵遮罩沿递归倒序绘制与下一个精灵配对，可跨合成边界；合成层自身的遮罩标志不作为整组遮罩。亮度预览未验证游戏色彩空间一致性。</p>
      </div>
      <div v-if="layer.video?.extra" class="property-group"><b>3D 变换</b>
        <label v-for="ch in channels3D" :key="ch" class="field" :data-channel="ch"><span>{{ ch }}</span><n-input-number size="tiny" :value="e.currentValue(ch)" :disabled="!!(layer.flags & 32)" :show-button="false" :step="ch === 'scaleZ' ? 0.01 : 1" @update:value="v => v !== null && e.setValue(ch, v)" /></label>
        <p class="warning">3D 曲线参与父子矩阵计算并可导出；画布尚未应用相机 / 透视。</p>
      </div>
      <div v-if="layer.markers.length" class="property-group"><b>Markers</b>
        <div v-for="m in layer.markers" :key="m.offset" class="marker-editor" :data-marker="m.offset">
          <label class="field"><span>标记名称</span><n-input size="tiny" :value="m.name" :disabled="!!(layer.flags & 32)" @update:value="v => e.edit(() => m.name = v)" /></label>
          <label class="field"><a @click="e.frame.value = m.frame">跳到帧 ↗</a><n-input-number size="tiny" :value="m.frame" :disabled="!!(layer.flags & 32)" :show-button="false" @update:value="v => v !== null && e.edit(() => m.frame = v)" /></label>
        </div>
        <p class="warning">st_* / ed_* 成对定义预览片段；结束帧包含在播放范围中。二进制重命名仅支持可打印 ASCII。</p>
      </div>
    </div>
    <p v-else class="empty">选择一个图层查看属性</p>
  </section>
</template>
