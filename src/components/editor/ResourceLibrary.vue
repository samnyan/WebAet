<script setup lang="ts">
import { computed, ref } from 'vue'
import { NInput, NVirtualList } from 'naive-ui'
import type { Editor } from '../../editor/state'
import type { WorkspaceAsset } from '../../editor/workspaceAssets'
import { resourceRows, type ResourceNode } from '../../editor/resourceTree'
const p = defineProps<{ editor: Editor; assets: readonly WorkspaceAsset[] }>()
const emit = defineEmits<{ openAsset: [path: string] }>()
const search = ref(''),
  expanded = ref(new Set<string>()),
  selected = ref('')
// Disk-only: opening a document never appends semantic resources to this tree.
const rows = computed(() =>
  resourceRows(p.assets, null, p.editor.library, expanded.value, search.value, 'files'),
)
function toggle(row: ResourceNode) {
  const next = new Set(expanded.value)
  if (next.has(row.key)) next.delete(row.key)
  else next.add(row.key)
  expanded.value = next
}
function choose(row: ResourceNode, event: MouseEvent) {
  selected.value = row.key
  if (row.expandable && event.detail <= 1) toggle(row)
}
function open(row: ResourceNode) {
  if (!p.editor.busy.value && row.asset) emit('openAsset', row.asset)
}
</script>
<template>
  <section class="resource-library" data-testid="resource-library">
    <div class="search">
      <n-input v-model:value="search" size="tiny" clearable placeholder="搜索文件 / 目录" />
    </div>
    <n-virtual-list class="resource-list" :items="rows" :item-size="28" key-field="key" role="tree">
      <template #default="{ item }"
        ><div
          class="resource-row"
          :class="{ selected: selected === item.key }"
          :style="{ paddingLeft: `${item.depth * 14 + 6}px` }"
          role="treeitem"
          :aria-level="item.depth + 1"
          :aria-expanded="item.expandable ? expanded.has(item.key) : undefined"
          :aria-selected="selected === item.key"
          tabindex="0"
          @click="choose(item, $event)"
          @dblclick="open(item)"
          @keydown.enter.prevent="item.expandable ? toggle(item) : open(item)"
          @keydown.right.prevent="item.expandable && !expanded.has(item.key) && toggle(item)"
          @keydown.left.prevent="expanded.has(item.key) && toggle(item)"
        >
          <button
            class="expand"
            :disabled="!item.expandable"
            :aria-label="expanded.has(item.key) ? '收起' : '展开'"
            @click.stop="toggle(item)"
            @dblclick.stop
          >
            {{ item.expandable ? (expanded.has(item.key) ? '▾' : '▸') : '·' }}</button
          ><span :title="item.label">{{ item.label }}</span>
        </div></template
      >
    </n-virtual-list>
    <p v-if="!rows.length" class="empty">选择资源目录或导入文件</p>
  </section>
</template>
<style scoped>
.resource-library {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.search {
  padding: 8px;
}
.resource-list {
  flex: 1;
  min-height: 0;
}
.resource-row {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.resource-row:hover {
  background: #ffffff09;
}
.resource-row.selected {
  background: #385951;
}
.resource-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.expand {
  width: 20px;
  flex: none;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.expand:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
