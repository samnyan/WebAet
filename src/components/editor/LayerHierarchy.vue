<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NInput, NSelect, NCheckbox, NVirtualList } from 'naive-ui'
import { compositionLabels } from '../../editor/compositionLabels'
import type { Editor } from '../../editor/state'
import { menuCharacterBranches, menuCharacterVisibility } from '../../editor/menuCharacterPreview'
import { layerTreeRows, type LayerTreeRow } from '../../editor/layerTree'
const { editor: e } = defineProps<{ editor: Editor }>()
const search = ref(''), list = ref<InstanceType<typeof NVirtualList>>()
const rows = computed(() => { e.version.value; return layerTreeRows(e.scene.value, e.sceneIndex.value, e.compositionId.value, key => e.workspace.isExpanded(key, 'layers'), search.value) })
const options = computed(() => { e.version.value; const scene = e.scene.value; if (!scene) return []; const labels = compositionLabels(scene); return scene.compositions.map(c => ({ value: c.offset, label: labels.get(c.offset)! })) })
const breadcrumbs = computed(() => {
  e.version.value
  const scene = e.scene.value, root = scene?.compositions.at(-1)
  if (!scene || !root) return []
  const queue = [[{ comp: root.offset, label: '⌂' }]], seen = new Set<number>()
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]!, last = path.at(-1)!
    if (last.comp === e.compositionId.value) return path
    if (seen.has(last.comp)) continue
    seen.add(last.comp)
    const comp = scene.compositions.find(c => c.offset === last.comp)
    for (const layer of comp?.layers ?? []) if (layer.itemType === 3 && !seen.has(layer.item)) queue.push([...path, { comp: layer.item, label: layer.name }])
  }
  return [{ comp: root.offset, label: '⌂' }, { comp: e.compositionId.value, label: options.value.find(o => o.value === e.compositionId.value)?.label ?? 'Comp' }]
})
const menuBranches = computed(() => { e.version.value; return menuCharacterBranches(e.composition.value) })
const menuPreview = computed(() => { const visible = menuBranches.value.filter(b => !e.hidden.value.has(b.value)); return visible.length === 1 ? visible[0]!.value : 0 })
function previewCharacter(value: number) { if (!e.busy.value && e.composition.value) e.hidden.value = menuCharacterVisibility(e.composition.value, e.hidden.value, value || null) }
function enter(id: number) { search.value = ''; e.actions.openComposition(e.sceneIndex.value, id) }
function select(row: LayerTreeRow) { if (!e.busy.value) e.actions.selectLayer(row.ref) }
function toggle(row: LayerTreeRow) { if (row.expandable) e.workspace.toggleExpanded(row.key, 'layers') }
function keyboard(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('input,button,[role=checkbox]') || e.busy.value || event.isComposing) return
  const index = rows.value.findIndex(r => r.ref.layerId === e.selectedId.value)
  const row = rows.value[index]
  if (event.key === 'Enter' && row?.layer.itemType === 3) { event.preventDefault(); event.stopPropagation(); e.actions.enterComposition(row.ref); return }
  if (row && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); const open = e.workspace.isExpanded(row.key, 'layers'); if ((event.key === 'ArrowRight') !== open) toggle(row); return }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !rows.value.length) return
  event.preventDefault(); event.stopPropagation()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.value.length - 1 : Math.max(0, Math.min(rows.value.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)))
  select(rows.value[next]!)
}
watch(() => e.selectedId.value, async id => { await nextTick(); const row = rows.value.find(r => r.ref.layerId === id); if (row) list.value?.scrollTo({ key: row.key }) })
</script>
<template>
  <section class="panel hierarchy" data-testid="layer-tree">
    <div class="panel-controls"><n-select size="tiny" filterable :value="e.compositionId.value" :options="options" @update:value="enter" /><n-input v-model:value="search" size="tiny" clearable placeholder="搜索所有图层" /></div>
    <nav class="composition-path" aria-label="合成路径"><template v-for="(crumb, index) in breadcrumbs" :key="crumb.comp"><span v-if="index" aria-hidden="true">›</span><button :title="index === 0 ? '根合成' : crumb.label" :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined" @click="enter(crumb.comp)">{{ crumb.label }}</button></template></nav>
    <div v-if="menuBranches.length" class="panel-controls"><small>菜单角色预览 · 不写入 AET</small><n-select data-testid="menu-character-preview" size="tiny" :disabled="e.busy.value" :value="menuPreview" :options="[{ value: 0, label: '全部 / 自定义（原始叠加）' }, ...menuBranches.map(b => ({ value: b.value, label: b.label }))]" @update:value="previewCharacter" /></div>
    <div class="tree-host" tabindex="0" role="tree" aria-label="图层树" @keydown="keyboard"><n-virtual-list ref="list" :items="rows" :item-size="28" key-field="key" class="tree-list"><template #default="{ item }"><div class="tree-row" :class="{ selected: e.selectedId.value === item.ref.layerId, dim: e.hidden.value.has(item.layer.offset) || !(item.layer.flags & 1) }" :style="{ paddingLeft: `${item.depth * 14 + 4}px` }" role="treeitem" :aria-level="item.depth + 1" :aria-expanded="item.expandable ? e.workspace.isExpanded(item.key, 'layers') : undefined" :aria-selected="e.selectedId.value === item.ref.layerId" @click="select(item)" @dblclick="item.layer.itemType === 3 && e.actions.enterComposition(item.ref)"><button class="expand" :disabled="!item.expandable" aria-label="展开或收起子合成" @click.stop="toggle(item)">{{ item.expandable ? e.workspace.isExpanded(item.key, 'layers') ? '▾' : '▸' : '·' }}</button><n-checkbox size="small" :checked="!e.hidden.value.has(item.layer.offset)" title="预览可见（共享引用，不写入资源）" @click.stop @dblclick.stop @update:checked="e.actions.setPreviewVisible(item.ref, $event)" /><span class="name" :title="item.layer.name">{{ item.layer.name }}</span><small v-if="item.layer.itemType === 3" class="comp-tag">Comp</small><small v-if="item.warning" :title="item.warning">⚠</small></div></template></n-virtual-list></div>
    <p v-if="!rows.length" class="empty">暂无图层</p>
  </section>
</template>
<style scoped>
.composition-path{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;padding:4px 8px;font-size:11px}.composition-path button{font:inherit;border:0;background:transparent;color:#9db5c5;cursor:pointer;padding:2px 3px;overflow-wrap:anywhere;min-width:0}.composition-path button:hover{color:#72c6b2;background:#72c6b222;border-radius:3px}.composition-path [aria-current]{color:#d9e8e4}
.tree-host{flex:1;min-height:0;outline:none}.tree-list{height:100%}.tree-row{display:flex;align-items:center;gap:6px;height:28px;cursor:pointer;padding-right:6px}.tree-row:hover{background:#ffffff09}.selected{background:#385951}.expand{width:18px;flex:none;border:0;background:transparent;color:inherit;cursor:pointer}.expand:disabled{opacity:.3}.name{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.comp-tag{font-size:9px;color:#a9bfdc;background:#7188af22;padding:1px 4px;border-radius:3px;flex:none}
</style>
