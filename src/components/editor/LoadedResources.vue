<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { NInput, NVirtualList, NModal, NButton } from 'naive-ui'
import type { Editor } from '../../editor/state'
import type { PreviewTarget } from '../../editor/workspaceAssets'
import { resourceRows, type ResourceNode } from '../../editor/resourceTree'
import AssetPreview from './AssetPreview.vue'
const p = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ openComposition: [sceneIndex: number, compositionId: number] }>()
const section = ref<'compositions' | 'related'>('compositions')
const search = ref(''), mode = ref<'list' | 'grid'>('list'), selected = ref<ResourceNode | null>(null), enlarged = ref(false)
const expanded = ref(new Set(['scene:0'])), host = ref<HTMLElement>(), width = ref(260)
const columns = computed(() => Math.max(1, Math.floor(width.value / 120)))
let observer: ResizeObserver
onMounted(() => { observer = new ResizeObserver(entries => width.value = entries[0]!.contentRect.width); if (host.value) observer.observe(host.value) })
onBeforeUnmount(() => observer?.disconnect())
const rows = computed(() => { p.editor.version.value; p.editor.resourceVersion.value; return resourceRows([], p.editor.doc.value, p.editor.library, expanded.value, search.value, section.value) })
// Search produces canonical resources, not every instance path. Grid never decodes offscreen entries.
const gridRows = computed(() => {
  p.editor.version.value; p.editor.resourceVersion.value
  const containers = new Set([...p.editor.doc.value?.scenes.map((_, i) => `scene:${i}`) ?? [], ...p.editor.library.sets.map(s => `sprites:${s.name}`)])
  const items = resourceRows([], p.editor.doc.value, p.editor.library, containers, search.value, section.value).filter(row => row.preview)
  const result: { key: string; items: ResourceNode[] }[] = []
  for (let i = 0; i < items.length; i += columns.value) result.push({ key: String(i), items: items.slice(i, i + columns.value) })
  return result
})
function toggle(row: ResourceNode) { const next = new Set(expanded.value); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); expanded.value = next }
function choose(row: ResourceNode, event: MouseEvent) { selected.value = row; if (row.expandable && event.detail <= 1) toggle(row) }
function showPreview(row: ResourceNode) { if (row.preview) { selected.value = row; enlarged.value = true } }
watch(section, () => { selected.value = null; enlarged.value = false })
const target = computed<PreviewTarget | null>(() => selected.value?.preview ?? null)
watch(() => p.editor.doc.value?.source, () => { selected.value = null; enlarged.value = false })
</script>
<template>
  <section ref="host" class="loaded-resources" data-testid="loaded-resources">
    <div class="resource-sections" role="tablist" aria-label="资源分类"><button role="tab" :aria-selected="section === 'compositions'" @click="section = 'compositions'">合成</button><button role="tab" :aria-selected="section === 'related'" @click="section = 'related'">关联资源</button></div>
    <div class="resource-tools"><n-input v-model:value="search" size="tiny" clearable placeholder="搜索合成 / 素材"/><button :aria-pressed="mode === 'list'" title="列表" @click="mode = 'list'">☰</button><button :aria-pressed="mode === 'grid'" title="缩略图" @click="mode = 'grid'">▦</button></div>
    <n-virtual-list v-if="mode === 'list'" class="items" :items="rows" :item-size="28" key-field="key">
      <template #default="{ item }"><div class="resource-row" :class="{ selected: selected?.key === item.key }" :style="{ paddingLeft: `${item.depth * 12 + 4}px` }" tabindex="0" @click="choose(item, $event)" @dblclick="showPreview(item)" @keydown.enter="showPreview(item)"><button :disabled="!item.expandable" @click.stop="toggle(item)" @dblclick.stop>{{ item.expandable ? expanded.has(item.key) ? '▾' : '▸' : '·' }}</button><span :title="item.label">{{ item.label }}</span></div></template>
    </n-virtual-list>
    <n-virtual-list v-else class="items" :items="gridRows" :item-size="148" key-field="key"><template #default="{ item: row }"><div class="grid-row" :style="{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }"><button v-for="item in row.items" :key="item.key" class="tile" :class="{ selected: selected?.key === item.key }" :title="item.label" @click="selected = item" @dblclick="showPreview(item)"><AssetPreview :editor="editor" :target="item.preview ?? null" :size="96"/><span>{{ item.label }}</span></button></div></template></n-virtual-list>
    <template v-if="target"><div class="preview-heading"><span>预览</span><button title="关闭预览" aria-label="关闭底部预览" @click="selected = null; enlarged = false">×</button></div><button class="preview-button" title="点击放大预览" @click="enlarged = true"><AssetPreview :editor="editor" :target="target" /></button><n-button v-if="target.kind === 'composition'" size="tiny" @click="emit('openComposition', target.sceneIndex, target.compositionId)">打开合成编辑</n-button></template>
    <n-modal v-model:show="enlarged" preset="dialog" :show-icon="false" :title="selected?.label ?? '资源预览'" class="editor-dialog resource-image-dialog" style="width:min(1100px,94vw)"><AssetPreview v-if="enlarged" :editor="editor" :target="target" :size="1400" style="--preview-height:68dvh"/><template #action><n-button @click="enlarged = false">关闭</n-button></template></n-modal>
  </section>
</template>
<style scoped>
.resource-sections{display:flex;border-bottom:1px solid #ffffff18;flex-shrink:0}.resource-sections button{flex:1;padding:5px;border:0;background:transparent;color:#9facbe;cursor:pointer;font-size:11px}.resource-sections [aria-selected=true]{color:#72c6b2;border-bottom:2px solid #72c6b2}.preview-heading{display:flex;align-items:center;justify-content:space-between;padding:2px 8px;font-size:11px;border-top:1px solid #ffffff18}.preview-heading button{width:22px;height:22px;border:0;background:transparent;color:inherit;cursor:pointer}.preview-heading button:hover{background:#ffffff18;color:#72c6b2}
.loaded-resources{display:flex;flex-direction:column;height:100%;min-height:0}.resource-tools{display:flex;gap:4px;padding:8px}.resource-tools .n-input{flex:1;min-width:0}.resource-tools button,.resource-row button{border:0;background:transparent;color:inherit;cursor:pointer}.resource-tools [aria-pressed=true]{color:#72c6b2;background:#72c6b222}.items{flex:1;min-height:0}.resource-row{display:flex;align-items:center;height:28px;cursor:pointer}.resource-row button{width:20px;flex:none}.resource-row span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.resource-row:hover,.tile:hover{background:#ffffff09}.selected{background:#385951!important}.preview-button{border:0;padding:0;background:transparent;color:inherit;cursor:zoom-in;text-align:left}.grid-row{display:grid;gap:4px;height:148px;padding:4px}.tile{min-width:0;border:1px solid #ffffff12;background:transparent;color:inherit;cursor:pointer;overflow:hidden;padding:0}.tile>span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}.tile :deep(.asset-preview){padding:3px;border:0}.tile :deep(.asset-preview small){display:none}.tile :deep(.preview-image){min-height:100px}.tile :deep(canvas){max-height:100px}
</style>
