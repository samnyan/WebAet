<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NInputNumber } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { resolveCurve, resolveLayerContext } from '../../editor/properties'
const { editor: e } = defineProps<{ editor: Editor }>()
const frame = ref<number | null>(null),
  value = ref<number | null>(null),
  tangent = ref<number | null>(null)
const target = computed(() => {
  e.version.value
  const ref = e.workspace.activeKey.value
  if (!ref) return null
  const curve = resolveCurve(e, ref.property),
    ctx = resolveLayerContext(e, ref.property)
  const key = curve?.keys.find((k) => Math.fround(k.frame) === Math.fround(ref.frame))
  return key && curve && ctx
    ? { ref, key, constant: curve.keys.length === 1, locked: !!(ctx.layer.flags & 32) }
    : null
})
watch(
  [target, () => e.workspace.docSession.value, () => e.version.value, () => e.busy.value],
  () => {
    frame.value = target.value?.key.frame ?? null
    value.value = target.value?.key.value ?? null
    tangent.value = target.value?.key.tangent ?? null
  },
  { immediate: true, flush: 'sync' },
)
function apply() {
  if (target.value && frame.value !== null && value.value !== null && tangent.value !== null)
    e.actions.updateKey(target.value.ref, frame.value, value.value, tangent.value)
}
</script>
<template>
  <div
    v-if="target"
    class="graph-key-controls"
    @keydown.esc.stop="
      frame = target.key.frame
      value = target.key.value
      tangent = target.key.tangent
    "
  >
    <span>选中键</span>
    <label
      >帧<NInputNumber
        v-model:value="frame"
        data-testid="graph-key-frame"
        size="tiny"
        :disabled="e.busy.value || target.locked || target.constant"
        :show-button="false"
    /></label>
    <label
      >值<NInputNumber
        v-model:value="value"
        data-testid="graph-key-value"
        size="tiny"
        :disabled="e.busy.value || target.locked"
        :show-button="false"
    /></label>
    <label title="AET 单切线：入侧与出侧共用，单位为值/帧"
      >切线<NInputNumber
        v-model:value="tangent"
        data-testid="graph-key-tangent"
        size="tiny"
        :disabled="e.busy.value || target.locked || target.constant"
        :show-button="false"
    /></label>
    <NButton
      data-testid="graph-key-apply"
      size="tiny"
      :disabled="
        e.busy.value || target.locked || frame === null || value === null || tangent === null
      "
      @click="apply"
      >应用</NButton
    >
  </div>
</template>
<style scoped>
.graph-key-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 8px;
  font-size: 11px;
  background: #20242b;
  flex-wrap: wrap;
}
.graph-key-controls label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.graph-key-controls .n-input-number {
  width: 100px;
}
</style>
