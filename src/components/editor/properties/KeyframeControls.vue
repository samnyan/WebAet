<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NPopover, NInputNumber } from 'naive-ui'
import type { Editor } from '../../../editor/state'
import type { EditableChannel } from '../../../core/aet/types'
import { resolveCurve, resolveLayer, type LayerRef } from '../../../editor/properties'

const props = defineProps<{
  editor: Editor
  property: LayerRef & { kind: 'channel'; channel: EditableChannel }
  compact?: boolean
}>()

const e = computed(() => props.editor)
const layer = computed(() => {
  e.value.version.value
  return resolveLayer(e.value, props.property)
})
const isLocked = computed(() => Boolean(layer.value && (layer.value.flags & 32)))
const curve = computed(() => {
  e.value.version.value
  return resolveCurve(e.value, props.property)
})

const targetFrame = computed(() => Math.round(e.value.frame.value))
const hasKeyAtCurrent = computed(() => {
  e.value.version.value
  return e.value.actions.hasKeyAtCurrentFrame(props.property)
})
const canJumpPrev = computed(() => {
  e.value.version.value
  return !isLocked.value && e.value.actions.canJumpKey(props.property, -1)
})
const canJumpNext = computed(() => {
  e.value.version.value
  return !isLocked.value && e.value.actions.canJumpKey(props.property, 1)
})

const activeKey = computed(() => {
  const k = e.value.workspace.activeKey.value
  if (!k) return null
  if (k.property.layerId !== props.property.layerId || k.property.channel !== props.property.channel) return null
  return k
})

const activeKeyframe = computed(() => {
  e.value.version.value
  if (!curve.value || !activeKey.value) return null
  const time = Math.fround(activeKey.value.frame)
  return curve.value.keys.find(k => Math.fround(k.frame) === time) ?? null
})

const popoverVisible = ref(false)

function onPrevKey() {
  e.value.actions.jumpKey(props.property, -1)
}

function onNextKey() {
  e.value.actions.jumpKey(props.property, 1)
}

function onCenterClick() {
  if (hasKeyAtCurrent.value) {
    e.value.actions.selectKey({ property: props.property, frame: targetFrame.value })
    popoverVisible.value = true
  } else {
    e.value.actions.addKey(props.property)
  }
}

function onMoveKey(nextFrame: number | null) {
  if (nextFrame === null || !activeKey.value) return
  e.value.actions.moveKey(activeKey.value, nextFrame)
}

function onSetKeyValue(val: number | null) {
  if (val === null || !activeKey.value) return
  e.value.actions.setKeyValue(activeKey.value, val)
}

function onSetKeyTangent(val: number | null) {
  if (val === null || !activeKey.value) return
  e.value.actions.setKeyTangent(activeKey.value, val)
}

function onDeleteKey() {
  if (!activeKey.value) return
  e.value.actions.removeKey(activeKey.value)
  popoverVisible.value = false
}
</script>

<template>
  <div class="keyframe-controls" :class="{ compact }">
    <button
      type="button"
      class="kf-btn kf-prev"
      :disabled="!canJumpPrev"
      aria-label="上一关键帧"
      title="上一关键帧"
      @click="onPrevKey"
    >
      ◀
    </button>

    <n-popover
      v-if="hasKeyAtCurrent && activeKey"
      v-model:show="popoverVisible"
      trigger="click"
      placement="bottom"
    >
      <template #trigger>
        <button
          type="button"
          class="kf-btn kf-diamond has-key"
          :disabled="isLocked"
          :aria-label="`选中当前关键帧 (第 ${targetFrame} 帧)`"
          :title="`选中关键帧 (第 ${targetFrame} 帧)`"
          @click="onCenterClick"
        >
          ◆
        </button>
      </template>

      <div class="kf-popover-content">
        <div class="kf-popover-header">
          <strong>关键帧 · 第 {{ activeKeyframe?.frame ?? targetFrame }} 帧</strong>
        </div>
        <div class="kf-popover-field">
          <span>时间 (帧)</span>
          <n-input-number
            size="tiny"
            :value="activeKeyframe?.frame"
            :disabled="isLocked"
            :show-button="false"
            @update:value="onMoveKey"
          />
        </div>
        <div class="kf-popover-field">
          <span>数值</span>
          <n-input-number
            size="tiny"
            :value="activeKeyframe?.value"
            :disabled="isLocked"
            :show-button="false"
            :step="property.channel === 'opacity' || property.channel.startsWith('scale') ? 0.01 : 1"
            @update:value="onSetKeyValue"
          />
        </div>
        <div class="kf-popover-field">
          <span>切线</span>
          <n-input-number
            size="tiny"
            :value="activeKeyframe?.tangent"
            :disabled="isLocked"
            :show-button="false"
            :step="0.01"
            @update:value="onSetKeyTangent"
          />
        </div>
        <div class="kf-popover-actions">
          <n-button size="tiny" type="error" ghost :disabled="isLocked" @click="onDeleteKey">
            删除关键帧
          </n-button>
        </div>
      </div>
    </n-popover>

    <button
      v-else
      type="button"
      class="kf-btn kf-diamond no-key"
      :disabled="isLocked"
      :aria-label="`在第 ${targetFrame} 帧添加关键帧`"
      :title="`在第 ${targetFrame} 帧添加关键帧`"
      @click="onCenterClick"
    >
      ◇
    </button>

    <button
      type="button"
      class="kf-btn kf-next"
      :disabled="!canJumpNext"
      aria-label="下一关键帧"
      title="下一关键帧"
      @click="onNextKey"
    >
      ▶
    </button>
  </div>
</template>

<style scoped>
.keyframe-controls {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  user-select: none;
}
.kf-btn {
  background: transparent;
  border: none;
  color: #9faec2;
  font-size: 11px;
  padding: 1px 3px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  line-height: 1;
}
.kf-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.kf-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.kf-diamond.has-key {
  color: #f5a623;
}
.kf-diamond.no-key {
  color: #8c9ba5;
}
.kf-popover-content {
  min-width: 170px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
.kf-popover-header {
  font-size: 12px;
  color: #f5a623;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 4px;
}
.kf-popover-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.kf-popover-field span {
  color: #9faec2;
  white-space: nowrap;
}
.kf-popover-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
