<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NModal, NInput, NVirtualList } from 'naive-ui'
import type { Editor } from '../../../editor/state'
import { resolveLayerContext, type PropertyRef } from '../../../editor/properties'
import { canParent } from '../../../core/animation/parenting'
const p = defineProps<{ editor: Editor; property: PropertyRef; disabled: boolean }>()
const show = ref(false),
  search = ref(''),
  selected = ref<number | null>(null),
  error = ref('')
const target = ref<PropertyRef | null>(null)
let session = 0,
  revision = 0
const rows = computed(() => {
  p.editor.version.value
  const ctx = resolveLayerContext(p.editor, target.value)
  if (!ctx) return []
  return [
    { id: 0, label: '无父级', disabled: false },
    ...ctx.composition.layers.map((layer, index) => ({
      id: layer.offset,
      label: `${index + 1} · ${layer.name}`,
      disabled: !canParent(ctx.composition, ctx.layer.offset, layer.offset),
    })),
  ].filter((row) => row.label.toLowerCase().includes(search.value.toLowerCase()))
})
function open() {
  if (p.disabled) return
  target.value = { ...p.property }
  session = p.editor.workspace.docSession.value
  revision = p.editor.version.value
  selected.value = resolveLayerContext(p.editor, target.value)?.layer.parent ?? 0
  search.value = ''
  error.value = ''
  show.value = true
  p.editor.workspace.requestPause()
}
function apply() {
  if (
    !target.value ||
    p.disabled ||
    p.editor.busy.value ||
    session !== p.editor.workspace.docSession.value ||
    revision !== p.editor.version.value ||
    JSON.stringify(target.value) !== JSON.stringify(p.property)
  ) {
    error.value = '文档或目标已改变，请重新打开拾取窗口'
    return
  }
  const ctx = resolveLayerContext(p.editor, target.value)
  if (
    !ctx ||
    selected.value === null ||
    !canParent(ctx.composition, ctx.layer.offset, selected.value)
  ) {
    error.value = '不能选择自身、后代或其他合成的图层'
    return
  }
  p.editor.actions.setValue(target.value, selected.value)
  show.value = false
}
</script>
<template>
  <n-button size="tiny" :disabled="disabled" title="在当前合成中拾取父级" @click="open"
    >拾取</n-button
  >
  <n-modal
    v-model:show="show"
    preset="dialog"
    title="拾取父级"
    :show-icon="false"
    class="editor-dialog"
    style="width: min(520px, 90vw)"
  >
    <n-input v-model:value="search" size="small" clearable placeholder="搜索当前合成图层" />
    <n-virtual-list class="parent-list" :items="rows" :item-size="30" key-field="id">
      <template #default="{ item }">
        <button
          class="parent-option"
          :class="{ chosen: selected === item.id }"
          :disabled="item.disabled"
          @click="selected = item.id"
        >
          {{ item.label }}{{ item.disabled ? '（自身或后代）' : '' }}
        </button>
      </template>
    </n-virtual-list>
    <p>仅改变变换父级，保留本地变换；不保证画面位置不变，不移动合成资源。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #action
      ><n-button @click="show = false">取消</n-button
      ><n-button type="primary" :disabled="disabled || selected === null" @click="apply"
        >使用父级</n-button
      ></template
    >
  </n-modal>
</template>
<style scoped>
.parent-list {
  height: 300px;
  margin-top: 8px;
}
.parent-option {
  display: block;
  width: 100%;
  height: 30px;
  text-align: left;
  background: transparent;
  color: inherit;
  border: 0;
  padding: 4px 8px;
  cursor: pointer;
}
.parent-option.chosen {
  background: #72c6b233;
}
.parent-option:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
p {
  font-size: 12px;
  color: #9faec2;
}
p[role='alert'] {
  color: #f07d79;
}
</style>
