<script setup lang="ts">
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { assignLayerReference, layerReferenceOptions, type LayerReference } from '../../editor/layerReference'
import { resolveLayerContext } from '../../editor/properties'
const { editor: e } = defineProps<{ editor: Editor }>()
const context = computed(() => { e.version.value; return resolveLayerContext(e, e.workspace.activeLayerRef.value) })
const options = computed(() => context.value ? layerReferenceOptions(context.value.scene, context.value.composition.offset) : [])
function change(value: string) {
  const current = context.value
  if (!current || e.busy.value) return
  const [type, id] = value.split(':').map(Number)
  e.edit(() => assignLayerReference(current.scene, current.composition.offset, current.layer, { type, id } as LayerReference))
}
</script>
<template>
  <section v-if="context && [0, 1, 3].includes(context.layer.itemType)" class="reference-select">
    <label>图层内容</label>
    <NSelect data-testid="layer-content" size="small" filterable :value="`${context.layer.itemType}:${context.layer.item}`" :options="options" :disabled="e.busy.value || !!(context.layer.flags & 32)" @update:value="change" />
    <small>关联已有素材或合成，保留本层变换；不会创建或修改共享资源。</small>
  </section>
</template>
<style scoped>
.reference-select{padding:6px;display:grid;gap:6px}.reference-select small{color:#8695a7;font-size:11px}
</style>
