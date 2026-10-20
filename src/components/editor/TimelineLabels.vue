<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { NCheckbox, NDropdown, type DropdownOption } from 'naive-ui'
import type { Editor } from '../../editor/state'
import {
  TIMELINE_ROW_HEIGHT,
  TIMELINE_RULER_HEIGHT,
  type TimelineRow,
} from '../../editor/timelineRows'
import PropertyEditorRow from './properties/PropertyEditorRow.vue'
import {
  copyCurve,
  canPasteCurve,
  pasteCurve,
  restoreCurve,
  makeConstant,
  reverseCurve,
  getCopiedCurve,
} from '../../editor/animationTools'
import { resolveCurve } from '../../editor/properties'

const props = defineProps<{
  editor: Editor
  rows: TimelineRow[]
  labelsWidth: number
  scrollTop: number
  viewportHeight: number
  filterAnimated: boolean
}>()

const emit = defineEmits<{
  'update:filterAnimated': [value: boolean]
  openTools: []
  wheel: [e: WheelEvent]
}>()

const e = computed(() => props.editor)

// Visible rows computation
const visibleRows = computed(() => {
  const overscan = 5
  const first = Math.max(0, Math.floor(props.scrollTop / TIMELINE_ROW_HEIGHT) - overscan)
  const last = Math.min(
    props.rows.length,
    Math.ceil((props.scrollTop + props.viewportHeight) / TIMELINE_ROW_HEIGHT) + overscan
  )

  const result: { row: TimelineRow; index: number; top: number }[] = []
  for (let i = first; i < last; i++) {
    const row = props.rows[i]
    if (row) {
      result.push({
        row,
        index: i,
        top: i * TIMELINE_ROW_HEIGHT - props.scrollTop,
      })
    }
  }
  return result
})

function isExpanded(id: string): boolean {
  return e.value.workspace.isExpanded(id, 'timeline')
}

function toggleExpand(id: string, ev?: MouseEvent) {
  ev?.stopPropagation()
  e.value.workspace.toggleExpanded(id, 'timeline')
}

function selectLayer(row: Extract<TimelineRow, { kind: 'layer' }>, ev?: MouseEvent) {
  if (ev) {
    const target = ev.target as HTMLElement | null
    if (target?.closest('button, input, textarea, select, .action-btn')) return
  }
  ev?.stopPropagation()
  const currentLayer = e.value.workspace.activeLayerRef.value
  const isSameLayer =
    currentLayer?.sceneIndex === row.layer.sceneIndex &&
    currentLayer?.compositionId === row.layer.compositionId &&
    currentLayer?.layerId === row.layer.layerId

  if (!isSameLayer || e.value.workspace.activeProperty.value !== null) {
    e.value.actions.selectLayer(row.layer)
  }
}

function onLayerDblClick(row: Extract<TimelineRow, { kind: 'layer' }>) {
  if (row.itemType === 3 && row.item !== undefined) {
    e.value.actions.openComposition(row.layer.sceneIndex, row.item)
  }
}

function toggleLayerVisible(row: Extract<TimelineRow, { kind: 'layer' }>, ev: MouseEvent) {
  ev.stopPropagation()
  e.value.actions.setValue({ ...row.layer, kind: 'layer', field: 'visible' }, !row.visible)
}

function toggleLayerLocked(row: Extract<TimelineRow, { kind: 'layer' }>, ev: MouseEvent) {
  ev.stopPropagation()
  e.value.actions.setValue({ ...row.layer, kind: 'layer', field: 'locked' }, !row.locked)
}

function selectProperty(row: Extract<TimelineRow, { kind: 'property' }>, ev?: MouseEvent) {
  ev?.stopPropagation()

  const currentLayer = e.value.workspace.activeLayerRef.value
  const isSameLayer =
    currentLayer?.sceneIndex === row.property.sceneIndex &&
    currentLayer?.compositionId === row.property.compositionId &&
    currentLayer?.layerId === row.property.layerId

  if (!isSameLayer) {
    e.value.actions.selectLayer(row.property)
  }

  const prevProp = e.value.workspace.activeProperty.value
  const isSameProperty =
    prevProp &&
    prevProp.layerId === row.property.layerId &&
    prevProp.kind === row.property.kind &&
    (prevProp.kind !== 'channel' || (row.property.kind === 'channel' && prevProp.channel === row.property.channel))

  if (!isSameProperty) {
    e.value.workspace.activeProperty.value = row.property
    e.value.workspace.activeKey.value = null
  }
}

function isRowSelected(row: TimelineRow): boolean {
  if (row.kind === 'layer') {
    return e.value.workspace.activeLayerRef.value?.layerId === row.layer.layerId
  }
  if (row.kind === 'property') {
    const active = e.value.workspace.activeProperty.value
    if (!active) return false
    if (active.layerId !== row.property.layerId || active.kind !== row.property.kind) return false
    if (active.kind === 'channel' && row.property.kind === 'channel') {
      return active.channel === row.property.channel
    }
    return true
  }
  return false
}

// Context menu
const showDropdown = ref(false)
const dropdownX = ref(0)
const dropdownY = ref(0)
const contextRow = ref<TimelineRow | null>(null)

function onContextMenu(row: TimelineRow, ev: MouseEvent) {
  ev.preventDefault()
  ev.stopPropagation()
  contextRow.value = row
  dropdownX.value = ev.clientX
  dropdownY.value = ev.clientY
  showDropdown.value = false
  nextTick(() => {
    showDropdown.value = true
  })
}

const dropdownOptions = computed<DropdownOption[]>(() => {
  const row = contextRow.value
  if (!row) return []

  if (row.kind === 'property' && row.property.kind === 'channel') {
    const propRef = row.property
    const curve = resolveCurve(e.value, propRef)
    const hasKeys = Boolean(curve && curve.keys.length > 0)
    const hasMultipleKeys = Boolean(curve && curve.keys.length > 1)
    const canPaste = canPasteCurve(e.value, propRef)
    const copied = getCopiedCurve(e.value)

    return [
      {
        label: '复制曲线',
        key: 'copy',
        disabled: !hasKeys,
      },
      {
        label: copied ? `替换曲线 (${copied.keys.length} 键)` : '替换曲线',
        key: 'paste',
        disabled: !canPaste,
      },
      {
        label: '转为当前值常量',
        key: 'constant',
        disabled: !hasMultipleKeys,
      },
      {
        label: '恢复原始轨道',
        key: 'restore',
      },
      {
        label: '反转动画',
        key: 'reverse',
        disabled: !hasMultipleKeys,
      },
      {
        type: 'divider',
        key: 'd1',
      },
      {
        label: '动画编辑工具...',
        key: 'tools',
      },
    ]
  }

  if (row.kind === 'layer') {
    const options: DropdownOption[] = [
      {
        label: row.locked ? '解锁图层' : '锁定图层',
        key: 'toggle-lock',
      },
      {
        label: row.visible ? '隐藏图层' : '显示图层',
        key: 'toggle-visible',
      },
      {
        label: '整层动画工具...',
        key: 'tools',
      },
    ]
    if (row.itemType === 3) {
      options.unshift({
        label: '进入子合成',
        key: 'open-comp',
      })
    }
    return options
  }

  return []
})

function handleDropdownSelect(key: string) {
  showDropdown.value = false
  const row = contextRow.value
  if (!row) return

  if (row.kind === 'property' && row.property.kind === 'channel') {
    const propRef = row.property
    if (key === 'copy') {
      copyCurve(e.value, propRef)
    } else if (key === 'paste') {
      const copied = getCopiedCurve(e.value)
      if (copied && window.confirm(`替换 ${propRef.channel} 曲线为剪贴板中的 ${copied.keys.length} 个关键帧？可撤销。`)) {
        pasteCurve(e.value, propRef)
      }
    } else if (key === 'constant') {
      const curve = resolveCurve(e.value, propRef)
      if (curve && window.confirm(`将 ${propRef.channel} 的 ${curve.keys.length} 个关键帧替换为当前帧常量？可撤销。`)) {
        makeConstant(e.value, propRef)
      }
    } else if (key === 'restore') {
      if (window.confirm(`恢复 ${propRef.channel} 到当前 AET 原始数据？仅恢复此轨道，可撤销。`)) {
        restoreCurve(e.value, propRef)
      }
    } else if (key === 'reverse') {
      reverseCurve(e.value, propRef)
    } else if (key === 'tools') {
      e.value.actions.selectLayer(propRef)
      e.value.workspace.activeProperty.value = propRef
      emit('openTools')
    }
  } else if (row.kind === 'layer') {
    if (key === 'toggle-lock') {
      e.value.actions.setValue({ ...row.layer, kind: 'layer', field: 'locked' }, !row.locked)
    } else if (key === 'toggle-visible') {
      e.value.actions.setValue({ ...row.layer, kind: 'layer', field: 'visible' }, !row.visible)
    } else if (key === 'open-comp' && row.itemType === 3 && row.item !== undefined) {
      e.value.actions.openComposition(row.layer.sceneIndex, row.item)
    } else if (key === 'tools') {
      e.value.workspace.selectLayer(row.layer)
      emit('openTools')
    }
  }
}

function handleCollapseAll() {
  const map = new Map(e.value.workspace.expandedSets.value)
  const prefix = `${e.value.workspace.docSession.value}:${e.value.sceneIndex.value}:${e.value.compositionId.value}:timeline`
  map.set(prefix, new Set<string>())
  e.value.workspace.expandedSets.value = map
}

function handleExpandAll() {
  const set = new Set<string>()
  const comp = e.value.composition.value
  if (comp) {
    for (const layer of comp.layers) {
      set.add(`layer:${layer.offset}`)
      for (const g of ['layer', 'source', 'transform', 'transform3d', 'appearance', 'markers']) {
        set.add(`group:${layer.offset}:${g}`)
      }
    }
  }
  const map = new Map(e.value.workspace.expandedSets.value)
  const prefix = `${e.value.workspace.docSession.value}:${e.value.sceneIndex.value}:${e.value.compositionId.value}:timeline`
  map.set(prefix, set)
  e.value.workspace.expandedSets.value = map
}
</script>

<template>
  <div
    class="timeline-labels"
    :style="{ width: `${labelsWidth}px` }"
    @wheel="emit('wheel', $event)"
  >
    <!-- Ruler Header -->
    <div
      class="labels-header"
      :style="{ height: `${TIMELINE_RULER_HEIGHT}px` }"
    >
      <span class="header-title">图层 / 属性 ({{ rows.length }})</span>
      <div class="header-actions">
        <n-checkbox
          size="small"
          :checked="filterAnimated"
          title="仅显示含动画 (>1 关键帧) 的属性行"
          @update:checked="emit('update:filterAnimated', $event)"
        >
          <span style="font-size: 11px">仅动画</span>
        </n-checkbox>
        <button
          type="button"
          class="hdr-btn"
          title="全部折叠"
          @click="handleCollapseAll"
        >
          ▸
        </button>
        <button
          type="button"
          class="hdr-btn"
          title="全部展开"
          @click="handleExpandAll"
        >
          ▾
        </button>
      </div>
    </div>

    <!-- Rows List Container -->
    <div class="labels-body">
      <div
        v-for="item in visibleRows"
        :key="item.row.id"
        class="timeline-label-row"
        :class="[
          `row-kind-${item.row.kind}`,
          {
            selected: isRowSelected(item.row),
            'even-row': item.index % 2 === 0,
            'odd-row': item.index % 2 === 1,
          },
        ]"
        :style="{
          top: `${item.top}px`,
          height: `${TIMELINE_ROW_HEIGHT}px`,
        }"
        @contextmenu="onContextMenu(item.row, $event)"
      >
        <!-- Layer Row -->
        <template v-if="item.row.kind === 'layer'">
          <div
            class="layer-row-inner"
            :class="{ locked: item.row.locked }"
            @click="selectLayer(item.row, $event)"
            @dblclick="onLayerDblClick(item.row)"
          >
            <button
              type="button"
              class="arrow-btn"
              :title="isExpanded(item.row.id) ? '折叠' : '展开'"
              @click="toggleExpand(item.row.id, $event)"
            >
              {{ isExpanded(item.row.id) ? '▾' : '▸' }}
            </button>

            <!-- Quick flags: eye, lock -->
            <button
              type="button"
              class="flag-btn eye-btn"
              :class="{ disabled: !item.row.visible }"
              :title="item.row.visible ? '点击隐藏图层' : '点击显示图层'"
              @click="toggleLayerVisible(item.row, $event)"
            >
              {{ item.row.visible ? '👁' : '─' }}
            </button>
            <button
              type="button"
              class="flag-btn lock-btn"
              :class="{ locked: item.row.locked }"
              :title="item.row.locked ? '点击解锁图层' : '点击锁定图层'"
              @click="toggleLayerLocked(item.row, $event)"
            >
              {{ item.row.locked ? '🔒' : '🔓' }}
            </button>

            <!-- Layer Name -->
            <span
              class="layer-name"
              :title="`${item.row.layerName} (0x${item.row.layer.layerId.toString(16)})`"
            >
              {{ item.row.layerName }}
            </span>

            <span v-if="item.row.itemType === 3" class="comp-badge" title="子合成图层（双击打开）">
              Comp
            </span>
          </div>
        </template>

        <!-- Group Row -->
        <template v-else-if="item.row.kind === 'group'">
          <div
            class="group-row-inner"
            :style="{ paddingLeft: `${6 + item.row.depth * 14}px` }"
            @click="toggleExpand(item.row.id, $event)"
          >
            <button
              type="button"
              class="arrow-btn"
              :title="isExpanded(item.row.id) ? '折叠' : '展开'"
              @click="toggleExpand(item.row.id, $event)"
            >
              {{ isExpanded(item.row.id) ? '▾' : '▸' }}
            </button>
            <span class="group-title">{{ item.row.groupLabel }}</span>
          </div>
        </template>

        <!-- Property Row -->
        <template v-else-if="item.row.kind === 'property'">
          <div
            class="property-row-inner"
            :style="{ paddingLeft: `${6 + item.row.depth * 14}px` }"
            @click="selectProperty(item.row, $event)"
          >
            <PropertyEditorRow
              :editor="editor"
              :property="item.row.property"
              compact
            />
          </div>
        </template>
      </div>
    </div>

    <!-- Dropdown context menu -->
    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :x="dropdownX"
      :y="dropdownY"
      :options="dropdownOptions"
      :show="showDropdown"
      :on-clickoutside="() => (showDropdown = false)"
      @select="handleDropdownSelect"
    />
  </div>
</template>

<style scoped>
.timeline-labels {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 16px;
  background: #20242b;
  border-right: 1px solid #303746;
  overflow: hidden;
  user-select: none;
  z-index: 2;
  contain: layout paint;
}
.labels-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: #2c323c;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid #1a1e24;
  box-sizing: border-box;
  font-size: 11px;
  color: #c7d4df;
  z-index: 3;
}
.header-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.hdr-btn {
  background: transparent;
  border: 1px solid #4a5464;
  color: #c7d4df;
  border-radius: 2px;
  padding: 1px 4px;
  font-size: 10px;
  cursor: pointer;
  line-height: 1;
}
.hdr-btn:hover {
  background: #3b4452;
}
.labels-body {
  position: absolute;
  top: 28px;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: auto;
}
.timeline-label-row {
  position: absolute;
  left: 0;
  right: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #1c2027;
  font-size: 11px;
}
.timeline-label-row.even-row {
  background: #20242b;
}
.timeline-label-row.odd-row {
  background: #242a32;
}
.timeline-label-row:hover {
  background: #2c3540;
}
.timeline-label-row.selected {
  background: #294039 !important;
}

.layer-row-inner {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  padding-left: 6px;
  padding-right: 6px;
  cursor: pointer;
}
.layer-row-inner.locked {
  opacity: 0.75;
}
.layer-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #c8d5e2;
  font-weight: 500;
}
.comp-badge {
  font-size: 9px;
  background: #38536b;
  color: #b7d6f5;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.arrow-btn {
  background: none;
  border: none;
  color: #8b9baa;
  cursor: pointer;
  padding: 0 3px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.arrow-btn:hover {
  color: #fff;
}
.flag-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
  color: #8b9baa;
}
.flag-btn:hover {
  color: #fff;
}
.flag-btn.disabled {
  color: #555e69;
}
.flag-btn.locked {
  color: #e5a443;
}

.group-row-inner {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.group-title {
  color: #a4b3c4;
  font-size: 11px;
}

.property-row-inner {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding-right: 4px;
}
.property-row-inner :deep(.property-editor-row) {
  width: 100%;
}
</style>
