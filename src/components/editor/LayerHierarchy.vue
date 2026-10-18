<script setup lang="ts">
import { computed, ref } from 'vue'
import { NInput, NSelect, NButton, NCheckbox } from 'naive-ui'
import type { Editor } from '../../editor/state'
const { editor: e } = defineProps<{ editor: Editor }>()
const search = ref('')
const options = computed(() => e.scene.value?.compositions.map((c, i) => ({ value: c.offset, label: `${i === e.scene.value!.compositions.length - 1 ? 'ROOT' : `Comp ${i}`} · ${c.layers.length} · ${c.layers.slice(0, 2).map(l => l.name).join(', ')}` })) ?? [])
const layers = computed(() => { e.version.value; return e.composition.value?.layers.filter(l => l.name.toLowerCase().includes(search.value.toLowerCase())) ?? [] })
function visibility(id: number, visible: boolean) { const set = new Set(e.hidden.value); if (visible) set.delete(id); else set.add(id); e.hidden.value = set }
function enter(id: number) { e.compositionId.value = id; e.selectedId.value = null }
</script>
<template>
  <section class="panel hierarchy">
    <header>图层 / Layers <span>{{ e.composition.value?.layers.length ?? 0 }}</span></header>
    <div class="panel-controls"><n-select size="tiny" filterable :value="e.compositionId.value" :options="options" @update:value="enter" /><n-input v-model:value="search" size="tiny" placeholder="搜索图层 / Filter" /></div>
    <div class="layer-list">
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
