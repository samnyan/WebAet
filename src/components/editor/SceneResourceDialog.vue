<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { NModal, NButton, NInput, NVirtualList } from 'naive-ui'
import type { Editor } from '../../editor/state'
import type { LayerRef } from '../../editor/properties'
import { resolveLayer } from '../../editor/properties'
import { assignLayerReference, layerReferenceOptions } from '../../editor/layerReference'
import { createSpriteRecord } from '../../editor/sceneResources'
import { materialPackagesKey } from '../../editor/materialPackages'
import type { MaterialItem } from '../../editor/materialPicker'
import ResourceBrowser from './ResourceBrowser.vue'
import AssetPreview from './AssetPreview.vue'
const p = defineProps<{
  editor: Editor
  show: boolean
  sceneIndex: number
  target?: LayerRef | null
}>()
const emit = defineEmits<{ 'update:show': [boolean] }>()
const packages = inject(
  materialPackagesKey,
  computed(() => []),
)
const search = ref(''),
  creating = ref(false),
  selected = ref<string | null>(null),
  image = ref<MaterialItem | null>(null),
  error = ref('')
let session = 0,
  revision = 0
watch(
  () => p.show,
  (show) => {
    if (show) {
      search.value = ''
      creating.value = false
      selected.value = null
      image.value = null
      error.value = ''
      session = p.editor.workspace.docSession.value
      revision = p.editor.version.value
      p.editor.workspace.requestPause()
    }
  },
)
const items = computed(() => {
  p.editor.version.value
  const scene = p.editor.doc.value?.scenes[p.sceneIndex]
  if (!scene) return []
  return layerReferenceOptions(scene, p.target?.compositionId ?? -1).filter(
    (o) => o.value !== '0:0' && o.label.toLowerCase().includes(search.value.toLowerCase()),
  )
})
function preview(value: string) {
  const [type, id] = value.split(':').map(Number)
  return type === 3
    ? { kind: 'composition' as const, sceneIndex: p.sceneIndex, compositionId: id! }
    : { kind: 'source' as const, sceneIndex: p.sceneIndex, videoId: id!, sourceIndex: 0 }
}
function apply() {
  try {
    const e = p.editor
    if (e.busy.value) return
    if (e.workspace.docSession.value !== session || e.version.value !== revision)
      throw new Error('场景已改变，请重新打开窗口')
    if (creating.value) {
      if (!image.value) return
      createSpriteRecord(e, p.sceneIndex, image.value, p.target)
    } else if (p.target && selected.value) {
      const scene = e.doc.value?.scenes[p.sceneIndex],
        layer = resolveLayer(e, p.target)
      if (!scene || !layer) throw new Error('图层已不存在')
      const [type, id] = selected.value.split(':').map(Number)
      e.edit(() =>
        assignLayerReference(scene, p.target!.compositionId, layer, { type, id } as Parameters<
          typeof assignLayerReference
        >[3]),
      )
    } else return
    emit('update:show', false)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>
<template>
  <n-modal
    :show="show"
    preset="dialog"
    :show-icon="false"
    title="场景资源"
    class="editor-dialog"
    style="width: min(1100px, 95vw)"
    @update:show="emit('update:show', $event)"
  >
    <div class="scene-resource-body">
      <div class="resource-actions">
        <n-button size="small" :type="!creating ? 'primary' : 'default'" @click="creating = false"
          >合成与素材记录</n-button
        ><n-button size="small" :type="creating ? 'primary' : 'default'" @click="creating = true"
          >从贴图创建…</n-button
        ><n-input
          v-if="!creating"
          v-model:value="search"
          size="small"
          clearable
          placeholder="搜索场景资源"
        />
      </div>
      <ResourceBrowser v-if="creating" :packages="packages" @select="image = $event" />
      <n-virtual-list v-else class="record-list" :items="items" :item-size="108" key-field="value"
        ><template #default="{ item }"
          ><button
            class="record"
            :class="{ selected: selected === item.value }"
            :disabled="item.disabled"
            @click="selected = item.value"
            @dblclick="
              selected = item.value
              target && apply()
            "
          >
            <AssetPreview :editor="editor" :target="preview(item.value)" :size="96" /><span>{{
              item.label
            }}</span>
          </button></template
        ></n-virtual-list
      >
      <p v-if="!creating && !items.length">当前场景没有匹配资源，可从贴图创建素材记录。</p>
    </div>
    <template #action
      ><span class="resource-message" :role="error ? 'alert' : undefined">{{
        error ||
        (creating
          ? '创建独立素材记录，不修改 SPR/FARC 或其他图层。需要对应 spr_db.bin。'
          : '选择当前场景的合成或素材记录。')
      }}</span
      ><n-button @click="emit('update:show', false)">关闭</n-button
      ><n-button
        v-if="creating || target"
        type="primary"
        :disabled="editor.busy.value || (creating ? !image : !selected)"
        @click="apply"
        >{{ creating ? (target ? '创建并使用' : '创建素材记录') : '使用选中资源' }}</n-button
      ></template
    >
  </n-modal>
</template>
<style scoped>
.scene-resource-body {
  height: min(580px, 65dvh);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}
.resource-actions {
  display: flex;
  gap: 8px;
  flex: none;
}
.resource-actions .n-input {
  flex: 1;
}
.record-list,
.scene-resource-body > .resource-browser {
  flex: 1;
  min-height: 0;
}
.record {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 108px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #ffffff12;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.record:hover,
.record.selected {
  background: #72c6b21a;
}
.record:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.record :deep(.asset-preview) {
  width: 110px;
  flex: none;
}
.record :deep(.preview-image) {
  min-height: 60px;
}
.record :deep(canvas) {
  max-height: 80px;
}
.record :deep(small) {
  display: none;
}
.resource-message {
  font-size: 11px;
  color: #9facbe;
  margin-right: auto;
}
</style>
