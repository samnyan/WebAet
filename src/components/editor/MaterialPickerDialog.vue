<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { NModal, NButton, NInputNumber } from 'naive-ui'
import type { Editor } from '../../editor/state'
import type { LayerRef } from '../../editor/properties'
import { resolveLayer } from '../../editor/properties'
import { applyMaterial, type MaterialItem } from '../../editor/materialPicker'
import { materialPackagesKey } from '../../editor/materialPackages'
import ResourceBrowser from './ResourceBrowser.vue'
const p = defineProps<{ editor: Editor; show: boolean }>()
const emit = defineEmits<{ 'update:show': [show: boolean] }>()
const packages = inject(
  materialPackagesKey,
  computed(() => []),
)
const selected = ref<MaterialItem | null>(null),
  sourceIndex = ref(0),
  error = ref('')
const targetRef = ref<LayerRef | null>(null)
let revision = 0,
  session = 0
const video = computed(() => {
  p.editor.version.value
  const target = targetRef.value
  const l = resolveLayer(p.editor, target)
  return (
    l && p.editor.doc.value?.scenes[target!.sceneIndex]?.videos.find((v) => v.offset === l.item)
  )
})
watch(
  () => p.show,
  (show) => {
    if (show) {
      targetRef.value = p.editor.workspace.activeLayerRef.value && {
        ...p.editor.workspace.activeLayerRef.value,
      }
      revision = p.editor.version.value
      session = p.editor.workspace.docSession.value
      selected.value = null
      sourceIndex.value = 0
      error.value = ''
      p.editor.workspace.requestPause()
    }
  },
  { immediate: true },
)
function apply() {
  const target = targetRef.value
  try {
    if (!target || !selected.value) return
    if (
      revision !== p.editor.version.value ||
      session !== p.editor.workspace.docSession.value ||
      JSON.stringify(target) !== JSON.stringify(p.editor.workspace.activeLayerRef.value)
    )
      throw new Error('编辑目标已改变，请重新打开选择器')
    const refs =
      p.editor.doc.value?.scenes[target.sceneIndex]?.compositions
        .flatMap((c) => c.layers)
        .filter((l) => l.itemType === 1 && l.item === video.value?.offset).length ?? 0
    if (refs > 1 && !window.confirm(`此素材记录被 ${refs} 个图层共享，替换将影响全部引用。继续？`))
      return
    applyMaterial(p.editor, target, sourceIndex.value, selected.value)
    emit('update:show', false)
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e)
  }
}
</script>
<template>
  <n-modal
    :show="show"
    preset="dialog"
    :show-icon="false"
    title="选择关联素材"
    class="material-picker-dialog editor-dialog"
    style="width: min(1200px, 96vw)"
    @update:show="emit('update:show', $event)"
    ><div class="picker-body">
      <ResourceBrowser
        v-if="show"
        :packages="packages"
        @select="selected = $event"
        @activate="apply"
      />
      <p v-if="!video?.sources.length" class="warning">
        纯色素材无 Sprite 源记录，目前不能新增结构；可先改用现有的图片素材引用。
      </p>
    </div>
    <template #action
      ><div class="picker-footer">
        <span v-if="error" role="alert" class="warning">{{ error }}</span
        ><span v-else class="muted">{{
          selected?.path || '选择素材后确认；不会修改原始 FARC'
        }}</span
        ><template v-if="(video?.sources.length ?? 0) > 1"
          ><span>序列源索引</span
          ><n-input-number
            v-model:value="sourceIndex"
            :min="0"
            :max="video!.sources.length - 1"
            size="small"
            style="width: 90px" /></template
        ><n-button @click="emit('update:show', false)">取消</n-button
        ><n-button
          type="primary"
          :disabled="!selected || !video?.sources.length || editor.busy.value"
          @click="apply"
          >使用此素材</n-button
        >
      </div></template
    ></n-modal
  >
</template>
<style scoped>
.picker-body {
  height: min(580px, 65dvh);
  overflow: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.picker-body > .resource-browser {
  flex: 1;
}
.picker-footer {
  width: 100%;
  flex-wrap: wrap;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid #ffffff18;
}
.picker-footer > span:first-child {
  flex: 1;
  overflow-wrap: anywhere;
}
.picker-body > p {
  margin: 4px 10px;
}
</style>
<style>
.editor-dialog {
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
}
.editor-dialog .n-dialog__content {
  min-height: 0;
  overflow: auto;
}
.editor-dialog .n-dialog__action {
  flex-shrink: 0;
}
</style>
