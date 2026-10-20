<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton } from 'naive-ui'
import SceneResourceDialog from './SceneResourceDialog.vue'
import type { Editor } from '../../editor/state'
import { assignLayerReference, type LayerReference } from '../../editor/layerReference'
import { resolveLayerContext } from '../../editor/properties'
const { editor: e } = defineProps<{ editor: Editor }>()
const context = computed(() => {
  e.version.value
  return resolveLayerContext(e, e.workspace.activeLayerRef.value)
})
const showResources = ref(false)
function change(value: string | null) {
  const current = context.value
  if (!current || e.busy.value) return
  const [type, id] = (value ?? '0:0').split(':').map(Number)
  e.edit(() =>
    assignLayerReference(current.scene, current.composition.offset, current.layer, {
      type,
      id,
    } as LayerReference),
  )
}
</script>
<template>
  <section v-if="context && [0, 1, 3].includes(context.layer.itemType)" class="reference-select">
    <NButton
      size="small"
      :disabled="e.busy.value || !!(context.layer.flags & 32)"
      @click="showResources = true"
      >选择资源…</NButton
    >
    <SceneResourceDialog
      :editor="e"
      v-model:show="showResources"
      :scene-index="e.sceneIndex.value"
      :target="e.workspace.activeLayerRef.value"
    />
    <NButton
      v-if="context.layer.itemType !== 0"
      size="tiny"
      :disabled="e.busy.value || !!(context.layer.flags & 32)"
      @click="change(null)"
      >清除引用</NButton
    >
    <small>选择已有素材或合成；清除仅解除本层关联，保留变换和动画，不删除共享资源。</small>
  </section>
</template>
<style scoped>
.reference-select {
  padding: 6px;
  display: grid;
  gap: 6px;
}
.reference-select small {
  color: #8695a7;
  font-size: 11px;
}
</style>
