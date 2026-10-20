<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NInput, NVirtualList } from 'naive-ui'
import type { Editor } from '../../editor/state'
import type { PreviewTarget, WorkspaceAsset } from '../../editor/workspaceAssets'
import { resourceRows, type ResourceNode } from '../../editor/resourceTree'
import AssetPreview from './AssetPreview.vue'
const p = defineProps<{ editor: Editor; assets: readonly WorkspaceAsset[] }>()
const emit = defineEmits<{ openAsset: [path: string]; openComposition: [sceneIndex: number, compositionId: number] }>()
const search = ref(''), expanded = ref(new Set<string>()), selected = ref(''), preview = ref<PreviewTarget | null>(null)
const rows = computed(() => { p.editor.version.value; p.editor.resourceVersion.value; return resourceRows(p.assets, p.editor.doc.value, p.editor.library, expanded.value, search.value) })
function toggle(row: ResourceNode) { const next = new Set(expanded.value); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); expanded.value = next }
function choose(row: ResourceNode) { selected.value = row.key; preview.value = row.preview ?? null }
function open(row: ResourceNode) {
  if (p.editor.busy.value) return
  if (row.asset) emit('openAsset', row.asset)
  else if (row.sceneIndex !== undefined && row.compositionId !== undefined) emit('openComposition', row.sceneIndex, row.compositionId)
  else if (row.expandable) toggle(row)
}
watch(() => p.editor.doc.value?.source, () => { preview.value = null; selected.value = ''; expanded.value = new Set(['scene:0']) })
</script>
<template>
  <section class="resource-library" data-testid="resource-library">
    <div class="search"><n-input v-model:value="search" size="small" clearable placeholder="搜索文件 / 合成 / 素材" /></div>
    <n-virtual-list class="resource-list" :items="rows" :item-size="28" key-field="key" role="tree">
      <template #default="{ item }"><div class="resource-row" :class="{ selected: selected === item.key }" :style="{ paddingLeft: `${item.depth * 14 + 6}px` }" role="treeitem" :aria-level="item.depth + 1" :aria-expanded="item.expandable ? expanded.has(item.key) : undefined" :aria-selected="selected === item.key" tabindex="0" @click="choose(item)" @dblclick="open(item)" @keydown.enter.prevent="open(item)" @keydown.right.prevent="item.expandable && !expanded.has(item.key) && toggle(item)" @keydown.left.prevent="expanded.has(item.key) && toggle(item)"><button class="expand" :disabled="!item.expandable" :aria-label="expanded.has(item.key) ? '收起' : '展开'" @click.stop="toggle(item)">{{ item.expandable ? expanded.has(item.key) ? '▾' : '▸' : '·' }}</button><span :title="item.label">{{ item.label }}</span></div></template>
    </n-virtual-list>
    <p v-if="!rows.length" class="empty">选择资源目录或导入文件</p>
    <AssetPreview v-if="preview" :editor="editor" :target="preview" />
  </section>
</template>
<style scoped>
.resource-library{height:100%;min-height:0;display:flex;flex-direction:column}.search{padding:8px}.resource-list{flex:1;min-height:0}.resource-row{height:28px;display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}.resource-row:hover{background:#ffffff09}.resource-row.selected{background:#385951}.resource-row>span{overflow:hidden;text-overflow:ellipsis}.expand{width:20px;flex:none;border:0;background:transparent;color:inherit;cursor:pointer}.expand:disabled{opacity:.3;cursor:default}
</style>
