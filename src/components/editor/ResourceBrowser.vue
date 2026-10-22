<script setup lang="ts">
import { computed, markRaw, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NInput, NSlider, NVirtualList, NTree } from 'naive-ui'
import { SpriteLibrary } from '../../core/resources/library'
import {
  loadMaterialPackage,
  materialItems,
  type MaterialItem,
  type MaterialPackage,
} from '../../editor/materialPicker'
import MaterialThumbnail from './MaterialThumbnail.vue'
const p = defineProps<{ packages: readonly MaterialPackage[] }>()
const emit = defineEmits<{ select: [item: MaterialItem | null]; activate: [item: MaterialItem] }>()
const active = ref(''),
  folder = ref(''),
  query = ref(''),
  size = ref(112),
  selected = ref(''),
  items = ref<MaterialItem[]>([]),
  loading = ref(false),
  error = ref('')
const library = markRaw(new SpriteLibrary(64 * 1024 * 1024))
let controller: AbortController | undefined
async function open(key: string) {
  controller?.abort()
  controller = new AbortController()
  const request = controller
  active.value = key
  folder.value = ''
  selected.value = ''
  items.value = []
  emit('select', null)
  error.value = ''
  loading.value = true
  library.clear()
  try {
    const pkg = p.packages.find((v) => v.key === key)
    if (!pkg) return
    const sets = await loadMaterialPackage(pkg, request.signal)
    request.signal.throwIfAborted()
    sets.forEach((set) => library.add(set))
    items.value = markRaw(materialItems(sets))
  } catch (e) {
    if (!request.signal.aborted) error.value = String(e instanceof Error ? e.message : e)
  } finally {
    if (controller === request) loading.value = false
  }
}
const directories = computed(() => {
  const map = new Map<string, { key: string; label: string; children: any[] }>()
  const root = { key: '', label: '全部素材', children: [] as any[] }
  map.set('', root)
  for (const item of items.value) {
    const parts = item.path.split('/').slice(0, -1)
    let path = ''
    for (const part of parts) {
      const parent = path
      path += (path ? '/' : '') + part
      if (!map.has(path)) {
        const node = { key: path, label: part, children: [] }
        map.set(path, node)
        map.get(parent)!.children.push(node)
      }
    }
  }
  return [root]
})
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return items.value.filter(
    (item) =>
      (!folder.value || item.path.startsWith(folder.value + '/')) &&
      (!q || item.path.toLowerCase().includes(q)),
  )
})
// Virtualize grid rows, not just images. Column count follows available viewport.
const viewportWidth = ref(650),
  columns = computed(() => Math.max(1, Math.floor(viewportWidth.value / (size.value + 24))))
const gridRows = computed(() => {
  const result: { key: string; items: MaterialItem[] }[] = []
  for (let i = 0; i < filtered.value.length; i += columns.value)
    result.push({ key: String(i), items: filtered.value.slice(i, i + columns.value) })
  return result
})
function choose(item: MaterialItem) {
  selected.value = item.key
  emit('select', item)
}
watch(
  () => p.packages.map((v) => v.key).join('\n'),
  () => {
    if (!p.packages.some((v) => v.key === active.value)) {
      const first = p.packages[0]
      if (first) open(first.key)
      else {
        controller?.abort()
        items.value = []
        emit('select', null)
      }
    }
  },
  { immediate: true },
)
const gridHost = ref<HTMLElement>()
let resizeObserver: ResizeObserver
onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    viewportWidth.value = entries[0]!.contentRect.width
  })
  if (gridHost.value) resizeObserver.observe(gridHost.value)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  controller?.abort()
  library.clear()
})
</script>
<template>
  <section class="resource-browser" data-testid="resource-browser">
    <div class="browser-toolbar">
      <n-input
        v-model:value="query"
        clearable
        placeholder="搜索当前资源包中的素材名称或路径"
        aria-label="搜索素材"
      /><span>缩略图</span
      ><n-slider v-model:value="size" :min="64" :max="192" :step="16" style="width: 130px" /><small
        >{{ size }} px</small
      >
    </div>
    <div class="browser-columns">
      <aside class="package-list" aria-label="FARC 资源包">
        <strong>资源包</strong
        ><button
          v-for="pkg in packages"
          :key="pkg.key"
          :class="{ active: active === pkg.key }"
          :title="pkg.key"
          @click="open(pkg.key)"
        >
          {{ pkg.label }}
        </button>
        <p v-if="!packages.length">选择资源目录或导入 FARC / Sprite 文件</p>
      </aside>
      <aside class="directory-list">
        <strong>目录</strong
        ><n-tree
          :data="directories"
          block-line
          virtual-scroll
          :selected-keys="[folder]"
          :default-expanded-keys="['']"
          style="height: 100%"
          @update:selected-keys="(keys) => (folder = String(keys[0] ?? ''))"
        />
      </aside>
      <div ref="gridHost" class="materials">
        <div class="breadcrumb">
          <button @click="folder = ''">全部素材</button><span v-if="folder"> / {{ folder }}</span
          ><small>{{ filtered.length }} 项</small>
        </div>
        <p v-if="loading" role="status">正在加载资源包…</p>
        <p v-else-if="error" role="alert">{{ error }}</p>
        <p v-else-if="!filtered.length">没有匹配的素材</p>
        <n-virtual-list
          v-else
          :key="`${size}:${columns}:${active}:${folder}:${query}`"
          class="material-grid"
          :items="gridRows"
          :item-size="size + 54"
          key-field="key"
          ><template #default="{ item: row }"
            ><div
              class="grid-row"
              :style="{
                height: `${size + 54}px`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }"
            >
              <button
                v-for="item in row.items"
                :key="item.key"
                class="material-cell"
                :class="{ selected: selected === item.key }"
                :title="item.path"
                @click="choose(item)"
                @dblclick="
                  choose(item)
                  emit('activate', item)
                "
                @keydown.enter.prevent="
                  choose(item)
                  emit('activate', item)
                "
              >
                <MaterialThumbnail :item="item" :library="library" :size="size" /><span>{{
                  item.set.sprites[item.index]?.name
                }}</span>
              </button>
            </div></template
          ></n-virtual-list
        >
      </div>
    </div>
  </section>
</template>
<style scoped>
.resource-browser {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-bottom: 1px solid #ffffff18;
}
.browser-toolbar .n-input {
  flex: 1;
}
.browser-toolbar > span,
.browser-toolbar small {
  white-space: nowrap;
}
.browser-columns {
  display: grid;
  grid-template-columns: 180px 190px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.package-list,
.directory-list {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid #ffffff18;
  padding: 8px;
}
.package-list strong,
.directory-list strong {
  display: block;
  margin-bottom: 8px;
  color: #aab9cb;
}
.package-list button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 8px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.package-list .active {
  background: #385951;
}
.materials {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.breadcrumb {
  padding: 8px;
  border-bottom: 1px solid #ffffff12;
  display: flex;
  gap: 6px;
  align-items: center;
}
.breadcrumb small {
  margin-left: auto;
  color: #91a1b5;
}
.breadcrumb button {
  background: transparent;
  color: #a0dac9;
  border: 0;
  cursor: pointer;
}
.material-grid {
  flex: 1;
  min-height: 0;
}
.grid-row {
  display: grid;
  gap: 8px;
  padding: 6px 10px;
}
.material-cell {
  background: transparent;
  color: inherit;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px;
  min-width: 0;
  cursor: pointer;
  overflow: hidden;
}
.material-cell:hover {
  background: #ffffff08;
}
.material-cell.selected {
  border-color: #72c6b2;
  background: #38595155;
}
.material-cell > span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-top: 5px;
  font-size: 11px;
}
.materials > p {
  padding: 12px;
  color: #aab9cb;
}
@media (max-width: 850px) {
  .browser-columns {
    grid-template-columns: 140px 140px minmax(0, 1fr);
  }
}
</style>
