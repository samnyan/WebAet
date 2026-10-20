<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NInput, NInputNumber, NCheckbox, NSelect } from 'naive-ui'
import type { Editor } from '../../../editor/state'
import {
  getPropertyDescriptor,
  readPropertyValue,
  resolveLayerContext,
  type PropertyRef,
} from '../../../editor/properties'
import { canParent } from '../../../core/animation/parenting'
import { canReferenceComposition } from '../../../core/animation/compositionReference'
import KeyframeControls from './KeyframeControls.vue'

const props = defineProps<{
  editor: Editor
  property: PropertyRef
  compact?: boolean
}>()

const e = computed(() => props.editor)

const ctx = computed(() => {
  e.value.version.value
  return resolveLayerContext(e.value, props.property)
})

const descriptor = computed(() => {
  e.value.version.value
  return getPropertyDescriptor(e.value, props.property)
})

const currentValue = computed(() => {
  e.value.version.value
  return readPropertyValue(e.value, props.property, e.value.frame.value)
})

const isLocked = computed(() => {
  const l = ctx.value?.layer
  return Boolean(l && (l.flags & 32))
})

const isDisabled = computed(() => {
  if (e.value.busy.value || !ctx.value) return true
  if (props.property.kind === 'layer' && props.property.field === 'locked') return false
  return isLocked.value
})

const isEditing = ref(false)
const numberDraft = ref<number | null>(null)
const textDraft = ref<string>('')
let capturedRevision = 0
let capturedLayerId = 0

const propertyIdentity = computed(() => JSON.stringify(props.property))
let capturedIdentity = ''

function startEdit() {
  if (isDisabled.value) return
  capturedIdentity = propertyIdentity.value
  e.value.workspace.requestPause()
  capturedRevision = e.value.version.value
  capturedLayerId = props.property.layerId
  isEditing.value = true
  if (descriptor.value?.editor === 'number') {
    numberDraft.value = typeof currentValue.value === 'number' ? currentValue.value : 0
  } else if (descriptor.value?.editor === 'text') {
    textDraft.value = typeof currentValue.value === 'string' ? currentValue.value : ''
  }
}

function cancelEdit() {
  isEditing.value = false
  numberDraft.value = null
  textDraft.value = ''
}

function commitNumberEdit() {
  if (!isEditing.value) return
  if (!isDisabled.value && propertyIdentity.value === capturedIdentity && e.value.version.value === capturedRevision && props.property.layerId === capturedLayerId) {
    if (numberDraft.value !== null && numberDraft.value !== currentValue.value) {
      e.value.actions.setValue(props.property, numberDraft.value)
    }
  }
  cancelEdit()
}

function commitTextEdit() {
  if (!isEditing.value) return
  if (!isDisabled.value && propertyIdentity.value === capturedIdentity && e.value.version.value === capturedRevision && props.property.layerId === capturedLayerId) {
    if (textDraft.value !== currentValue.value) {
      e.value.actions.setValue(props.property, textDraft.value)
    }
  }
  cancelEdit()
}

watch([() => e.value.version.value, propertyIdentity, () => e.value.workspace.activeLayerRef.value, () => e.value.busy.value], () => {
  if (isEditing.value) cancelEdit()
}, { flush: 'sync' })

const matteOptions = [
  { value: 0, label: '无 / None' },
  { value: 1, label: 'Alpha' },
  { value: 2, label: '反相 Alpha' },
  { value: 3, label: '亮度 / Luma' },
  { value: 4, label: '反相亮度 / NotLuma' },
]

const blendOptions = [
  { value: 3, label: 'Normal' },
  { value: 5, label: 'Add' },
  { value: 6, label: 'Multiply' },
  { value: 7, label: 'Screen' },
  { value: 8, label: 'Overlay' },
  { value: 27, label: 'Difference' },
]

const parentOptions = computed(() => {
  const c = ctx.value?.composition
  const l = ctx.value?.layer
  if (!c || !l) return []
  return [
    { value: 0, label: '无 / None' },
    ...c.layers.map(p => ({
      value: p.offset,
      label: p.name,
      disabled: !canParent(c, l.offset, p.offset),
    })),
  ]
})

const compositionOptions = computed(() => {
  const scene = ctx.value?.scene
  const parent = ctx.value?.composition
  if (!scene || !parent) return []
  return scene.compositions.map((c, i) => ({
    value: c.offset,
    label: `${i} · ${c.layers.slice(0, 2).map(l => l.name).join(', ')} · ${c.layers.length} layers`,
    disabled: !canReferenceComposition(scene, parent.offset, c.offset),
  }))
})

const videoOptions = computed(() => {
  const scene = ctx.value?.scene
  if (!scene) return []
  return scene.videos.map((v, i) => ({
    value: v.offset,
    label: `${i} · ${v.sources[0]?.name || '纯色'} · ${v.width}×${v.height}`,
  }))
})

const selectOptions = computed(() => {
  if (props.property.kind === 'layer' && props.property.field === 'parent') {
    return parentOptions.value
  }
  if (props.property.kind === 'source') {
    const l = ctx.value?.layer
    if (l?.itemType === 3) return compositionOptions.value
    if (l?.itemType === 1) return videoOptions.value
    return []
  }
  if (props.property.kind === 'video') {
    if (props.property.field === 'blend') return blendOptions
    if (props.property.field === 'matte') return matteOptions
  }
  return []
})
</script>

<template>
  <div
    class="property-editor-row"
    :class="{ compact, 'is-channel': property.kind === 'channel' }"
    :data-property-kind="property.kind"
  >
    <div class="row-label" :title="descriptor?.label">
      <span>{{ descriptor?.label ?? property.kind }}</span>
    </div>

    <div class="row-control">
      <template v-if="descriptor?.editor === 'number'">
        <n-input-number
          size="tiny"
          :value="isEditing ? numberDraft : currentValue"
          :disabled="isDisabled"
          :show-button="false"
          :step="descriptor.step ?? 1"
          @focus="startEdit"
          @update:value="v => { if (isEditing) numberDraft = v }"
          @blur="commitNumberEdit"
          @keydown.enter="commitNumberEdit"
          @keydown.esc="cancelEdit"
        />
      </template>

      <template v-else-if="descriptor?.editor === 'text'">
        <n-input
          size="tiny"
          :value="isEditing ? textDraft : (currentValue ?? '')"
          :disabled="isDisabled"
          @focus="startEdit"
          @update:value="v => { if (isEditing) textDraft = v }"
          @blur="commitTextEdit"
          @keydown.enter="commitTextEdit"
          @keydown.esc="cancelEdit"
        />
      </template>

      <template v-else-if="descriptor?.editor === 'boolean'">
        <n-checkbox
          :checked="Boolean(currentValue)"
          :disabled="isDisabled"
          @update:checked="v => e.actions.setValue(property, v)"
        />
      </template>

      <template v-else-if="descriptor?.editor === 'select'">
        <n-select
          size="tiny"
          filterable
          :value="currentValue"
          :options="selectOptions"
          :disabled="isDisabled"
          @update:value="v => e.actions.setValue(property, v)"
        />
      </template>

      <template v-else>
        <span class="readonly-value">{{ currentValue ?? '-' }}</span>
      </template>
    </div>

    <div
      v-if="descriptor?.animated && property.kind === 'channel'"
      class="row-keyframes"
    >
      <KeyframeControls
        :editor="editor"
        :property="property"
        :compact="compact"
      />
    </div>
  </div>
</template>

<style scoped>
.property-editor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 24px;
  padding: 1px 4px;
  font-size: 11px;
}
.row-label {
  flex: 0 0 85px;
  max-width: 85px;
  color: #9faec2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-control {
  flex: 1 1 auto;
  min-width: 60px;
}
.row-keyframes {
  flex: 0 0 auto;
  margin-left: 4px;
}
.compact .row-label {
  flex: 0 0 65px;
  max-width: 65px;
  font-size: 10px;
}
.compact {
  gap: 4px;
  min-height: 20px;
  padding: 0 2px;
}
.readonly-value {
  color: #ccc;
  font-family: monospace;
}
</style>
