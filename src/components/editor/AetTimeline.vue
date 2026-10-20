<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCheckbox, NInputNumber, NSelect } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { markerSegments } from '../../core/animation/segments'
import { resolveCurve, resolveLayer } from '../../editor/properties'
import {
  buildTimelineRows,
  TIMELINE_DEFAULT_LABELS_WIDTH,
} from '../../editor/timelineRows'
import CurvePreview from './CurvePreview.vue'
import GraphKeyControls from './GraphKeyControls.vue'
import WorkAreaControls from './WorkAreaControls.vue'
import { useWorkArea } from '../../editor/workArea'
import AetTimelineCanvas from './AetTimelineCanvas.vue'
import TimelineLabels from './TimelineLabels.vue'
import AnimationToolsDialog from './AnimationToolsDialog.vue'

const { editor: e } = defineProps<{ editor: Editor }>()

const showCurve = ref(false)
const showTools = ref(false)
const filterAnimated = ref(false)
const playbackSpeed = ref(1)
const reverse = ref(false)
const speedOptions = [0.25, 0.5, 1, 2].map(value => ({ value, label: `${value}×` }))

const collapsed = ref(false)
const repeat = ref(true)
const pixels = ref(3)
const height = ref(260)
try { const saved = Number(localStorage.getItem('webaet.timeline-height')); if (saved >= 140) height.value = Math.min(saved, innerHeight * 0.7) } catch { /* Optional storage. */ }
watch(height, value => { try { localStorage.setItem('webaet.timeline-height', String(value)) } catch { /* Optional storage. */ } })
const labelsWidth = ref(TIMELINE_DEFAULT_LABELS_WIDTH)
const scrollTop = ref(0)
const scrollLeft = ref(0)

let raf = 0
let last = 0

watch([playbackSpeed, reverse], () => {
  last = 0
})

const segmentId = ref('all')
const work = useWorkArea(e)
function setWorkArea(start: number, end: number) {
  if (work.set(start, end)) segmentId.value = 'work'
}
function clearWorkArea() { work.clear(); if (segmentId.value === 'work') segmentId.value = 'all' }

const segments = computed(() => {
  e.version.value
  const layer = resolveLayer(e, e.workspace.activeLayerRef.value)
  return markerSegments(layer?.markers ?? e.selected.value?.markers ?? [])
})

const layerRange = computed(() => {
  e.version.value
  const layer = resolveLayer(e, e.workspace.activeLayerRef.value) ?? e.selected.value
  return layer && Number.isFinite(layer.start) && Number.isFinite(layer.end) && layer.end > layer.start
    ? { start: layer.start, end: layer.end }
    : null
})

const segmentOptions = computed(() => [
  { value: 'all', label: '完整时间范围' },
  ...(work.area.value ? [{ value: 'work', label: '工作区间（仅预览）' }] : []),
  ...(layerRange.value
    ? [{ value: 'layer', label: `选中图层 · ${layerRange.value.start}–${layerRange.value.end} f（末端不含）` }]
    : []),
  ...segments.value.map(s => ({ value: s.id, label: s.label })),
])

const fullRange = computed(() => {
  e.version.value
  const layers = e.composition.value?.layers ?? []
  return {
    start: Math.min(e.scene.value?.start ?? 0, ...(layers.length ? layers.map(l => l.start) : [0])),
    end: Math.max(e.scene.value?.end ?? 60, ...(layers.length ? layers.map(l => l.end) : [1]), 1),
  }
})

const range = computed(
  () =>
    (segmentId.value === 'work' ? work.area.value : segmentId.value === 'layer' ? layerRange.value : segments.value.find(s => s.id === segmentId.value)) ??
    fullRange.value
)

watch(segmentOptions, list => {
  if (!list.some(s => s.value === segmentId.value)) {
    segmentId.value = 'all'
  }
})

watch(
  () => [range.value.start, range.value.end],
  () => {
    stop()
    e.frame.value = Math.max(range.value.start, Math.min(range.value.end, e.frame.value))
  }
)

watch(segmentId, () => {
  stop()
  e.frame.value = range.value.start
})

const snap = ref(true)
const followPlayhead = ref(false)
const viewport = ref<InstanceType<typeof AetTimelineCanvas>>()

function fitRange() {
  viewport.value?.fit()
}

// Hierarchical rows computation - depends on structure, NOT e.frame.value!
const rows = computed(() => {
  e.version.value
  e.workspace.expandedSets.value
  return buildTimelineRows(e, { filterAnimated: filterAnimated.value })
})

// Active curve for CurvePreview
const activeCurve = computed(() => {
  e.version.value
  const prop = e.workspace.activeProperty.value
  if (!prop || prop.kind !== 'channel') return undefined
  return resolveCurve(e, prop)
})

function stop() {
  e.workspace.stopPlayback()
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  last = 0
}

watch(
  () => [e.sceneIndex.value, e.compositionId.value],
  () => {
    stop()
    e.workspace.activeKey.value = null
    // Composition navigation owns the destination playhead (including Back).
  }
)

watch(
  () => e.doc.value?.source,
  () => {
    stop()
    e.workspace.activeKey.value = null
    segmentId.value = 'all'
  },
  { flush: 'sync' }
)

watch(
  () => e.busy.value,
  busy => {
    if (busy) stop()
  },
  { flush: 'sync' }
)

function visibilityChanged() {
  if (document.hidden) stop()
}

function tick(now: number) {
  if (!e.workspace.playing.value) {
    stop()
    return
  }
  if (last) {
    let frame =
      e.frame.value +
      Math.min(0.1, (now - last) / 1000) *
        (e.scene.value?.fps ?? 60) *
        playbackSpeed.value *
        (reverse.value ? -1 : 1)

    if (frame >= range.value.end) {
      if (repeat.value) {
        frame = range.value.start + ((frame - range.value.start) % (range.value.end - range.value.start))
      } else {
        e.frame.value = Math.max(range.value.start, range.value.end - 1)
        stop()
        return
      }
    }

    if (frame < range.value.start) {
      if (repeat.value) {
        const span = range.value.end - range.value.start
        frame = range.value.start + ((((frame - range.value.start) % span) + span) % span)
      } else {
        e.frame.value = range.value.start
        stop()
        return
      }
    }

    e.frame.value = frame
  }
  last = now
  raf = requestAnimationFrame(tick)
}

watch(
  () => e.workspace.playing.value,
  playing => {
    if (playing) {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    } else {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      last = 0
    }
  }
)

function toggle() {
  if (!e.doc.value || e.busy.value || document.hidden) return
  if (e.workspace.playing.value) {
    stop()
  } else {
    if (
      e.frame.value < range.value.start ||
      e.frame.value >= range.value.end ||
      (reverse.value && e.frame.value <= range.value.start)
    ) {
      e.frame.value = reverse.value ? Math.max(range.value.start, range.value.end - 1) : range.value.start
    }
    e.workspace.playing.value = true
  }
}

function scrub(value: number) {
  stop()
  e.frame.value = Math.max(range.value.start, Math.min(range.value.end, value))
}

function onCurvePreviewSelectKey(index: number) {
  const curve = activeCurve.value
  const prop = e.workspace.activeProperty.value
  if (!curve || !prop || prop.kind !== 'channel') return
  const k = curve.keys[index]
  if (k) {
    scrub(k.frame)
    e.actions.selectKey({ property: prop, frame: k.frame })
  }
}

function onScroll(pos: { scrollTop: number; scrollLeft: number }) {
  scrollTop.value = pos.scrollTop
  scrollLeft.value = pos.scrollLeft
}

function onLabelsWheel(ev: WheelEvent) {
  viewport.value?.handleLabelsWheel(ev)
}

function resetTimelineLayout() { height.value = 260 }
onMounted(() => window.addEventListener('webaet:reset-layout', resetTimelineLayout))
onBeforeUnmount(() => window.removeEventListener('webaet:reset-layout', resetTimelineLayout))
function resize(event: PointerEvent) {
  const y = event.clientY
  const h = height.value
  const move = (ev: PointerEvent) => {
    height.value = Math.max(140, Math.min(innerHeight * 0.7, h + y - ev.clientY))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function keyboard(event: KeyboardEvent) {
  if (
    !e.doc.value ||
    e.busy.value ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing
  ) {
    return
  }
  if (
    (event.target as HTMLElement)?.closest(
      'input,textarea,select,button,[contenteditable=true],[role=combobox],[role=checkbox],[role=dialog]'
    )
  ) {
    return
  }
  if (event.code === 'Space') {
    event.preventDefault()
    if (!event.repeat) toggle()
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const direction = event.key === 'ArrowRight' ? 1 : -1
    scrub(Math.min(Math.max(range.value.start, range.value.end - 1), Math.round(e.frame.value) + direction * step))
  }
}

onMounted(() => {
  window.addEventListener('keydown', keyboard)
  document.addEventListener('visibilitychange', visibilityChanged)
})

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('keydown', keyboard)
  document.removeEventListener('visibilitychange', visibilityChanged)
})
</script>

<template>
  <section class="timeline" :style="{ height: collapsed ? '38px' : `${height}px` }">
    <div class="timeline-resize" title="拖动调整高度，双击恢复默认" @dblclick="resetTimelineLayout" @pointerdown.prevent="resize" />
    <div class="timeline-toolbar">
      <n-button size="tiny" @click="collapsed = !collapsed">
        {{ collapsed ? '▸' : '▾' }} 时间线
      </n-button>
      <template v-if="!collapsed">
        <n-button
          data-testid="play"
          size="tiny"
          :disabled="!e.doc.value || e.busy.value"
          @click="toggle"
        >
          {{ e.workspace.playing.value ? '暂停' : '播放' }}
        </n-button>
        <n-button size="tiny" @click="scrub(range.start)">|◀</n-button>
        <n-input-number
          class="frame-input"
          size="tiny"
          :value="e.frame.value"
          :min="range.start"
          :max="range.end"
          :precision="2"
          :show-button="false"
          @update:value="v => v !== null && scrub(v)"
        />
        <span>f</span>
        <n-checkbox v-model:checked="snap" size="small">帧吸附</n-checkbox>
        <n-checkbox v-model:checked="repeat" size="small">循环</n-checkbox>
        <n-select
          data-testid="playback-speed"
          style="width: 85px"
          size="tiny"
          v-model:value="playbackSpeed"
          :options="speedOptions"
          title="仅改变预览速度，不修改场景帧率"
        />
        <n-select
          class="timeline-segment"
          style="width: 190px"
          size="tiny"
          v-model:value="segmentId"
          :options="segmentOptions"
          :disabled="segmentOptions.length < 2"
        />
        <WorkAreaControls :area="work.area.value" :frame="e.frame.value" :start="fullRange.start" :end="fullRange.end" :disabled="!e.composition.value || e.busy.value" @set="setWorkArea" @clear="clearWorkArea" />
        <n-checkbox data-testid="reverse-playback" v-model:checked="reverse" size="small">倒放</n-checkbox>
        <n-checkbox data-testid="show-curve" v-model:checked="showCurve" size="small">曲线预览</n-checkbox>

        <n-button
          data-testid="animation-tools"
          size="tiny"
          :disabled="!e.doc.value || e.busy.value"
          @click="showTools = true"
        >
          动画工具
        </n-button>

        <div class="spacer" />

        <n-checkbox data-testid="follow-playhead" v-model:checked="followPlayhead" size="small">跟随播放头</n-checkbox>
        <n-button data-testid="fit-timeline" size="tiny" @click="fitRange">适应范围</n-button>
        <n-button size="tiny" @click="viewport?.setZoom(pixels / 1.4)">−</n-button>
        <n-button size="tiny" @click="viewport?.setZoom(pixels * 1.4)">+</n-button>
      </template>
    </div>

    <template v-if="!collapsed">
      <div class="timeline-main">
        <TimelineLabels
          :editor="e"
          :rows="rows"
          :labels-width="labelsWidth"
          :scroll-top="scrollTop"
          :viewport-height="height"
          v-model:filter-animated="filterAnimated"
          @open-tools="showTools = true"
          @wheel="onLabelsWheel"
        />
        <AetTimelineCanvas
          ref="viewport"
          :snap="snap"
          :editor="e"
          :rows="rows"
          :start="range.start"
          :end="range.end"
          :frame="e.frame.value"
          :pixels="pixels"
          :revision="e.version.value"
          :follow="followPlayhead"
          :playing="e.workspace.playing.value"
          :disabled="e.busy.value || !e.doc.value"
          :labels-width="labelsWidth"
          @seek="scrub"
          @zoom="pixels = $event"
          @scroll="onScroll"
          @update:labels-width="labelsWidth = $event"
        />
      </div>

      <GraphKeyControls v-if="showCurve" :editor="e" />
      <CurvePreview
        v-if="showCurve"
        :editor="e"
        :snap="snap"
        :curve="activeCurve"
        :start="range.start"
        :end="range.end"
        :frame="e.frame.value"
        :revision="e.version.value"
        @scrub="scrub"
        @select-key="onCurvePreviewSelectKey"
      />

      <AnimationToolsDialog
        :editor="e"
        v-model:show="showTools"
      />
    </template>
  </section>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  background: #181d24;
  border-top: 1px solid #303746;
  position: relative;
  user-select: none;
}
.timeline-resize {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  cursor: row-resize;
  z-index: 10;
}
.timeline-resize:hover {
  background: #688d80;
}
.timeline-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: #20242b;
  border-bottom: 1px solid #303746;
  flex-wrap: wrap;
  font-size: 11px;
}
.frame-input {
  width: 75px;
}
.spacer {
  flex: 1;
}
.timeline-main {
  position: relative;
  flex: 1;
  min-height: 65px;
  display: flex;
  overflow: hidden;
}
</style>
