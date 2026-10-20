<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import MaterialPickerDialog from './MaterialPickerDialog.vue'
import type { Editor } from '../../editor/state'
import { listLayerProperties, type PropertyGroupId } from '../../editor/properties'
import type { PreviewTarget } from '../../editor/workspaceAssets'
import SceneInspector from './SceneInspector.vue'
import PropertyEditorRow from './properties/PropertyEditorRow.vue'
import LayerReferenceSelect from './LayerReferenceSelect.vue'
import LayerSlipControl from './LayerSlipControl.vue'
import LayerStretchControl from './LayerStretchControl.vue'
import AssetPreview from './AssetPreview.vue'
const { editor: e } = defineProps<{ editor: Editor }>()
const showMaterialPicker = ref(false)
const layer = computed(() => { e.version.value; return e.selected.value })
const properties = computed(() => { e.version.value; const ref = e.workspace.activeLayerRef.value; return ref ? listLayerProperties(e, ref) : [] })
const groups: { id: PropertyGroupId; label: string }[] = [{ id: 'layer', label: '图层' }, { id: 'source', label: '素材引用' }, { id: 'transform', label: '变换' }, { id: 'appearance', label: '外观' }, { id: 'markers', label: 'Markers' }]
const inGroup = (id: PropertyGroupId) => properties.value.filter(p => p.group === id && !(p.property.kind === 'layer' && p.property.field === 'name'))
const name = computed(() => properties.value.find(p => p.property.kind === 'layer' && p.property.field === 'name'))
const sourceDetails = computed(() => {
  e.version.value; e.resourceVersion.value
  const l = layer.value, video = l?.itemType === 1 ? e.scene.value?.videos.find(v => v.offset === l.item) : undefined
  return video?.sources.map((s, index) => ({ ...s, index, resolved: !!e.library.find(s.name, s.id) })) ?? []
})
const preview = computed<PreviewTarget | null>(() => {
  e.version.value
  const l = layer.value, sceneIndex = e.sceneIndex.value
  if (!l) return null
  if (l.itemType === 3) return { kind: 'composition', sceneIndex, compositionId: l.item }
  if (l.itemType !== 1) return null
  const video = e.scene.value?.videos.find(v => v.offset === l.item)
  if (!video) return null
  const index = video.sources.length <= 1 ? 0 : Math.trunc(((e.frame.value - l.start) * l.timeScale + l.timeOffset) * video.frames + .0001)
  return { kind: 'source', sceneIndex, videoId: video.offset, sourceIndex: index }
})
const renaming = ref(false), nameDraft = ref(''), nameInput = ref<HTMLInputElement>()
async function rename() { if (!layer.value || e.busy.value || (layer.value.flags & 32)) return; nameDraft.value = layer.value.name; renaming.value = true; await nextTick(); nameInput.value?.focus(); nameInput.value?.select() }
function commitName() { if (!renaming.value) return; renaming.value = false; if (name.value && nameDraft.value.trim()) e.actions.setValue(name.value.property, nameDraft.value) }
watch(() => [e.workspace.activeLayerRef.value, e.version.value], () => renaming.value = false)
const expanded = (id: string) => !['layer', 'markers'].includes(id) && !e.workspace.isExpanded(`closed:${id}`, 'inspector') || ['layer', 'markers'].includes(id) && e.workspace.isExpanded(`closed:${id}`, 'inspector')
const toggle = (id: string) => e.workspace.toggleExpanded(`closed:${id}`, 'inspector')
</script>
<template>
  <section class="panel inspector" data-testid="layer-inspector">
    <div class="inspector-tabs" role="tablist" aria-label="属性面板"><button role="tab" :aria-selected="e.workspace.rightTab.value === 'scene'" @click="e.workspace.rightTab.value = 'scene'">场景 / Scene</button><button role="tab" :aria-selected="e.workspace.rightTab.value === 'inspector'" @click="e.workspace.rightTab.value = 'inspector'">效果 / Effects</button></div>
    <div v-if="e.workspace.rightTab.value === 'scene'" class="inspector-scroll"><SceneInspector :editor="e" /></div>
    <template v-else-if="layer">
      <div class="sticky-layer"><input v-if="renaming" ref="nameInput" v-model="nameDraft" aria-label="图层名称" @blur="commitName" @keydown.enter.prevent="commitName" @keydown.esc.prevent="renaming = false" /><strong v-else :title="`${layer.name} · 双击重命名 · 0x${layer.offset.toString(16)}`" tabindex="0" @dblclick="rename" @keydown.f2.prevent="rename">{{ layer.name }} <small>{{ layer.itemType === 3 ? 'Comp' : 'Layer' }}</small></strong></div>
      <div class="inspector-scroll">
        <LayerReferenceSelect :editor="e" />
        <LayerSlipControl :editor="e" />
        <LayerStretchControl :editor="e" />
        <section v-for="group in groups.filter(g => inGroup(g.id).length)" :key="group.id" class="inspector-group"><button class="group-heading" :aria-expanded="expanded(group.id)" @click="toggle(group.id)">{{ expanded(group.id) ? '▾' : '▸' }} {{ group.label }}</button>
          <div v-if="expanded(group.id)">
            <PropertyEditorRow v-for="p in inGroup(group.id)" :key="p.id" :editor="e" :property="p.property" />
            <template v-if="group.id === 'source'"><button v-if="layer.itemType === 1" data-testid="browse-material" class="group-heading" :disabled="e.busy.value || !!(layer.flags & 32)" @click="showMaterialPicker = true">浏览并选择贴图…</button><AssetPreview :editor="e" :target="preview" /><button v-if="layer.itemType === 3" class="group-heading" @click="e.workspace.activeLayerRef.value && e.actions.enterComposition(e.workspace.activeLayerRef.value)">进入合成 ↳</button><details v-if="sourceDetails.length"><summary>Sprite 引用（{{ sourceDetails.length }}）</summary><div class="source-list"><p v-for="source in sourceDetails.slice(0, 100)" :key="source.index">{{ source.index }} · {{ source.name }} · ID {{ source.id }} · {{ source.resolved ? '已解析' : '未解析' }}</p><small v-if="sourceDetails.length > 100">仅显示前 100 项</small></div></details><p class="muted">替换引用保留本地变换和动画，不保持原布局。</p></template>
            <template v-if="group.id === 'transform' && inGroup('transform3d').length"><button class="group-heading nested" :aria-expanded="expanded('transform3d')" @click="toggle('transform3d')">{{ expanded('transform3d') ? '▾' : '▸' }} 3D 变换</button><div v-if="expanded('transform3d')"><PropertyEditorRow v-for="p in inGroup('transform3d')" :key="p.id" :editor="e" :property="p.property" /><p class="warning">3D 曲线可编辑导出；预览尚不包含完整游戏相机透视。</p></div></template>
            <p v-if="group.id === 'layer'" class="muted">可见开关写入资源；左侧眼睛只控制预览。切换父级保留本地变换。</p>
            <p v-if="group.id === 'appearance' && layer.video?.matte" class="warning">遮罩按递归倒序精灵配对；亮度色彩空间未验证游戏一致性。</p>
          </div>
        </section>
      </div>
    </template><p v-else class="empty">选择一个图层查看效果控制</p>
    <MaterialPickerDialog :editor="e" v-model:show="showMaterialPicker" />
  </section>
</template>
<style scoped>
.inspector{min-width:0}.inspector-tabs{display:flex;flex:none;height:35px;border-bottom:1px solid #383f49}.inspector-tabs button{flex:1;border:0;border-bottom:2px solid transparent;background:transparent;color:#9facbe;cursor:pointer}.inspector-tabs [aria-selected=true]{color:#a0f2db;border-bottom-color:#72c6b2}.inspector-scroll{flex:1;min-height:0;overflow:auto;padding:6px}.sticky-layer{flex:none;padding:8px;background:#292e36;border-bottom:1px solid #383f49}.sticky-layer strong{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.sticky-layer small{color:#8695a7}.inspector-group{margin-bottom:8px;background:#1d212844}.group-heading{width:100%;text-align:left;background:#ffffff05;border:0;color:#c7d2e3;padding:7px;cursor:pointer}.nested{padding-left:16px}.inspector-group p{padding:0 6px;font-size:11px}.source-list{max-height:180px;overflow:auto;overflow-wrap:anywhere}summary{cursor:pointer;padding:6px}
</style>
