<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NInput, NSelect, NButton, NCheckbox } from 'naive-ui'
import type { Editor } from '../../editor/state'
const { editor: e } = defineProps<{ editor: Editor }>()
const search = ref('')
const options = computed(() => e.scene.value?.compositions.map((c, i) => ({ value: c.offset, label: `${i === e.scene.value!.compositions.length - 1 ? 'ROOT' : `Comp ${i}`} · ${c.layers.length} · ${c.layers.slice(0, 2).map(l => l.name).join(', ')}` })) ?? [])
const layers = computed(() => { e.version.value; return e.composition.value?.layers.filter(l => l.name.toLowerCase().includes(search.value.toLowerCase())) ?? [] })
const parents = computed(() => {
  e.version.value
  return e.scene.value?.compositions.flatMap((c, i) => c.layers.filter(l => l.itemType === 3 && l.item === e.compositionId.value).map(l => ({ composition: c.offset, layer: l.offset, label: `Comp ${i} · ${l.name}` }))) ?? []
})
function returnTo(composition: number, layer: number | null = null) { search.value = ''; e.compositionId.value = composition; e.selectedId.value = layer }
function visibility(id: number, visible: boolean) { const set = new Set(e.hidden.value); if (visible) set.delete(id); else set.add(id); e.hidden.value = set }
function enter(id: number) { returnTo(id) }
const list = ref<HTMLElement>()
watch(() => e.selectedId.value, async () => { await nextTick(); list.value?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }) })
function keyboard(event: KeyboardEvent) {
  if (event.target !== list.value || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || e.busy.value) return
  const index = layers.value.findIndex(l => l.offset === e.selectedId.value)
  if (event.key === 'Enter') {
    const layer = layers.value[index]
    if (layer?.itemType === 3) { event.preventDefault(); event.stopPropagation(); enter(layer.item) }
    return
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !layers.value.length) return
  event.preventDefault(); event.stopPropagation()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? layers.value.length - 1 : index < 0 ? 0 : Math.max(0, Math.min(layers.value.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)))
  e.selectedId.value = layers.value[next]!.offset
}

</script>
<template>
  <section class="panel hierarchy">
    <header>图层 / Layers <span>{{ e.composition.value?.layers.length ?? 0 }}</span></header>
    <div class="panel-controls"><n-select size="tiny" filterable :value="e.compositionId.value" :options="options" @update:value="enter" /><n-input v-model:value="search" size="tiny" placeholder="搜索图层 / Filter" /></div>
    <div v-if="e.scene.value && e.compositionId.value !== e.scene.value.compositions.at(-1)?.offset" class="panel-controls">
      <n-button data-testid="composition-root" size="tiny" @click="returnTo(e.scene.value!.compositions.at(-1)!.offset)">⌂ 根合成</n-button>
      <n-button v-for="parent in parents" :key="parent.layer" data-testid="composition-parent" size="tiny" :title="parent.label" @click="returnTo(parent.composition, parent.layer)">↑ {{ parent.label }}</n-button>
      <small v-if="!parents.length">无上级引用</small>
    </div>
    <div ref="list" class="layer-list" tabindex="0" aria-label="图层列表：上下键选择，Home/End 跳转，Enter 进入合成" @keydown="keyboard">
      <div v-for="layer in layers" :key="layer.offset" class="layer-row" :class="{ selected: e.selectedId.value === layer.offset, dim: e.hidden.value.has(layer.offset) || !(layer.flags & 1) }" @click="e.selectedId.value = layer.offset" @dblclick="layer.itemType === 3 && enter(layer.item)">
        <n-checkbox size="small" :checked="!e.hidden.value.has(layer.offset)" @click.stop @update:checked="visibility(layer.offset, $event)" />
        <span class="layer-kind" :title="['None', 'Video', 'Audio', 'Composition'][layer.itemType]">{{ ['◇', '▧', '♫', '▣'][layer.itemType] }}</span>
        <span class="layer-name" :title="layer.name">{{ layer.name }}</span>
        <n-button v-if="layer.itemType === 3" text size="tiny" @click.stop="enter(layer.item)">↳</n-button>
      </div>
      <p v-if="!layers.length" class="empty">暂无图层</p>
    </div>
  </section>
</template>
