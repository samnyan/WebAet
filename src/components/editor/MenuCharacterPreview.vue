<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '../../editor/state'
import { menuCharacterBranches, menuCharacterVisibility } from '../../editor/menuCharacterPreview'
const { editor: e } = defineProps<{ editor: Editor }>()
const branches = computed(() => {
  e.version.value
  return menuCharacterBranches(e.composition.value)
})
const selected = computed(() => {
  const visible = branches.value.filter((b) => !e.hidden.value.has(b.value))
  return visible.length === 1 ? String(visible[0]!.value) : ''
})
function change(event: Event) {
  const composition = e.composition.value
  if (!composition || e.busy.value) return
  const value = (event.target as HTMLSelectElement).value
  e.hidden.value = menuCharacterVisibility(
    composition,
    e.hidden.value,
    value ? Number(value) : null,
  )
}
</script>
<template>
  <div v-if="branches.length" class="menu-character-preview" data-testid="menu-character-preview">
    <label
      >菜单角色（仅预览）
      <select
        data-testid="menu-character-select"
        :value="selected"
        :disabled="e.busy.value"
        @change="change"
      >
        <option value="">原始分支 / 全部显示</option>
        <option v-for="branch in branches" :key="branch.value" :value="String(branch.value)">
          {{ branch.label }}
        </option>
      </select></label
    >
    <span>仅筛选角色，保留其他 UI；不模拟文字、子菜单或独立播放时钟。</span>
  </div>
</template>
<style scoped>
.menu-character-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 5px 10px;
  font-size: 11px;
  color: #a9b6c8;
  background: #242b34;
}
.menu-character-preview select {
  color: inherit;
  background: #171d25;
  border: 1px solid #485467;
  padding: 3px;
}
.menu-character-preview span {
  color: #8896aa;
}
</style>
