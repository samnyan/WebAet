<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Editor } from '../../editor/state'
import type { Keyframe } from '../../core/aet/types'
import { resolveCurve, type PropertyRef } from '../../editor/properties'
import {
  TIMELINE_ROW_HEIGHT,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_MIN_LABELS_WIDTH,
  type TimelineRow,
} from '../../editor/timelineRows'
import type { KeyRef } from '../../editor/propertyActions'

const p = defineProps<{
  editor: Editor
  rows: TimelineRow[]
  start: number
  end: number
  frame: number
  pixels: number
  revision: number
  follow: boolean
  playing: boolean
  disabled: boolean
  labelsWidth: number
}>()

const emit = defineEmits<{
  seek: [frame: number]
  zoom: [pixels: number]
  scroll: [pos: { scrollTop: number; scrollLeft: number }]
  'update:labelsWidth': [width: number]
}>()

const scroll = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const playhead = ref<HTMLElement>()

const ruler = TIMELINE_RULER_HEIGHT
const row = TIMELINE_ROW_HEIGHT

let width = 0
let height = 0
let left = 0
let top = 0
let paint = 0
let input = 0
let edge = 0
let zoomRaf = 0
let pending: number | undefined
let observer: ResizeObserver

let drag: {
  id: number
  mode: 'pan' | 'seek' | 'key' | 'resize-labels'
  x: number
  y: number
  initialX: number
  initialY: number
  left: number
  top: number
  anchor: number
  original: number
  target: number
  keyRef?: KeyRef
  initialLabelsWidth?: number
} | null = null

const span = () => Math.max(1, p.end - p.start)

function lower(keys: readonly Keyframe[], time: number): number {
  let a = 0
  let b = keys.length
  while (a < b) {
    const m = (a + b) >>> 1
    if (keys[m]!.frame < time) a = m + 1
    else b = m
  }
  return a
}

function sync() {
  left = scroll.value?.scrollLeft ?? 0
  top = scroll.value?.scrollTop ?? 0
  emit('scroll', { scrollTop: top, scrollLeft: left })
  schedule()
  positionHead()
}

function positionHead() {
  if (playhead.value) {
    const currentFrame = pending ?? p.frame
    const x = p.labelsWidth + (currentFrame - p.start) * p.pixels - left
    playhead.value.style.transform = `translateX(${x}px)`
    playhead.value.style.height = `${height}px`
    playhead.value.style.visibility = x >= p.labelsWidth && x <= width ? 'visible' : 'hidden'
  }
}

function schedule() {
  if (!paint) paint = requestAnimationFrame(draw)
}

function isKeySelected(prop: PropertyRef, frame: number): boolean {
  const ak = p.editor.workspace.activeKey.value
  if (!ak) return false
  if (ak.property.layerId !== prop.layerId || ak.property.kind !== prop.kind) return false
  if (ak.property.kind === 'channel' && prop.kind === 'channel' && ak.property.channel !== prop.channel) return false
  return Math.fround(ak.frame) === Math.fround(frame)
}

function draw() {
  paint = 0
  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return

  const begin = performance.now()
  const dpr = devicePixelRatio || 1
  const label = p.labelsWidth

  if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    c.style.width = `${width}px`
    c.style.height = `${height}px`
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#20242b'
  ctx.fillRect(0, 0, width, height)

  const first = Math.max(0, Math.floor(top / row))
  const last = Math.min(p.rows.length, Math.ceil((top + height - ruler) / row))
  let painted = 0

  for (let i = first; i < last; i++) {
    const item = p.rows[i]
    if (!item) continue
    const y = ruler + i * row - top

    ctx.save()
    ctx.beginPath()
    ctx.rect(label, ruler, Math.max(0, width - label), Math.max(0, height - ruler))
    ctx.clip()

    // Row background
    const isLayerActive =
      item.kind === 'layer' && p.editor.workspace.activeLayerRef.value?.layerId === item.layer.layerId
    const isPropActive =
      item.kind === 'property' &&
      p.editor.workspace.activeProperty.value?.layerId === item.property.layerId &&
      (p.editor.workspace.activeProperty.value.kind === 'channel' && item.property.kind === 'channel'
        ? p.editor.workspace.activeProperty.value.channel === item.property.channel
        : true)

    ctx.fillStyle = isLayerActive || isPropActive ? '#294039' : i % 2 ? '#242a32' : '#20242b'
    ctx.fillRect(label, y, Math.max(0, width - label), row - 1)

    // Layer time span bar
    if (item.kind === 'layer') {
      const x1 = label + (item.start - p.start) * p.pixels - left
      const x2 = label + (item.end - p.start) * p.pixels - left
      const barW = Math.max(3, x2 - x1)

      ctx.save()
      ctx.beginPath()
      ctx.rect(label, y, Math.max(0, width - label), row)
      ctx.clip()

      ctx.fillStyle = '#34495e'
      ctx.strokeStyle = '#527494'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect ? ctx.roundRect(x1, y + 4, barW, row - 9, 3) : ctx.rect(x1, y + 4, barW, row - 9)
      ctx.fill()
      ctx.stroke()

      if (barW > 40) {
        ctx.fillStyle = '#c5d7e6'
        ctx.font = '10px monospace'
        ctx.textBaseline = 'middle'
        ctx.fillText(item.layerName, Math.max(x1 + 6, label + 6), y + row / 2)
      }
      ctx.restore()
    }

    // Property keys
    if (item.kind === 'property' && item.property.kind === 'channel') {
      const curve = resolveCurve(p.editor, item.property)
      if (curve && curve.keys.length > 0) {
        const keys = curve.keys
        ctx.save()
        ctx.beginPath()
        ctx.rect(label, y, Math.max(0, width - label), row)
        ctx.clip()

        if (keys.length === 1) {
          // Constant single key indicator
          const time = keys[0]!.frame
          const isSelected = isKeySelected(item.property, time)
          const kx = label + (time - p.start) * p.pixels - left

          ctx.fillStyle = isSelected ? '#ffdc83' : '#688d9a'
          ctx.beginPath()
          ctx.arc(kx, y + row / 2, 4, 0, Math.PI * 2)
          ctx.fill()
          painted++
        } else {
          // Animated keys with binary search and pixel column aggregation
          let k = lower(keys, p.start + (left - 8) / p.pixels)
          let lastPixel = -Infinity
          const viewEnd = p.start + (left + width - label + 8) / p.pixels

          while (k < keys.length && keys[k]!.frame <= viewEnd) {
            const keyFrame = keys[k]!.frame
            const isBeingDragged =
              drag?.mode === 'key' &&
              drag.keyRef &&
              drag.keyRef.property.layerId === item.property.layerId &&
              drag.keyRef.property.channel === item.property.channel &&
              Math.fround(drag.keyRef.frame) === Math.fround(keyFrame)

            const selected = isBeingDragged || isKeySelected(item.property, keyFrame)
            const time = isBeingDragged ? drag!.target : keyFrame
            const x = label + (time - p.start) * p.pixels - left

            if (Math.floor(x) !== lastPixel || selected) {
              lastPixel = Math.floor(x)
              painted++
              ctx.fillStyle = selected ? '#ffdc83' : '#83b39f'
              ctx.beginPath()
              ctx.moveTo(x, y + 8)
              ctx.lineTo(x + 5, y + row / 2)
              ctx.lineTo(x, y + row - 8)
              ctx.lineTo(x - 5, y + row / 2)
              ctx.closePath()
              ctx.fill()
            }
            k = Math.max(k + 1, lower(keys, p.start + (Math.floor(x) + 1 - label + left) / p.pixels))
          }

          // Ensure active key is drawn even if pixel aggregation would skip it
          const ak = p.editor.workspace.activeKey.value
          if (
            ak &&
            ak.property.layerId === item.property.layerId &&
            ak.property.channel === item.property.channel
          ) {
            const isBeingDragged = drag?.mode === 'key' && drag.keyRef && Math.fround(drag.keyRef.frame) === Math.fround(ak.frame)
            const time = isBeingDragged ? drag!.target : ak.frame
            const x = label + (time - p.start) * p.pixels - left
            ctx.fillStyle = '#ffdc83'
            ctx.beginPath()
            ctx.moveTo(x, y + 8)
            ctx.lineTo(x + 5, y + row / 2)
            ctx.lineTo(x, y + row - 8)
            ctx.lineTo(x - 5, y + row / 2)
            ctx.closePath()
            ctx.fill()
          }
        }

        ctx.restore()
      }
    }

    ctx.restore()
  }

  // Ruler bar (top)
  ctx.fillStyle = '#2c323c'
  ctx.fillRect(label, 0, Math.max(0, width - label), ruler)

  ctx.save()
  ctx.beginPath()
  ctx.rect(label, 0, Math.max(0, width - label), height)
  ctx.clip()

  const raw = Math.max(1, 90 / p.pixels)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find(v => v * magnitude >= raw) ?? 10) * magnitude
  const min = p.start + left / p.pixels
  const max = min + (width - label) / p.pixels

  ctx.font = '10px monospace'
  ctx.textBaseline = 'middle'
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) {
    const x = label + (t - p.start) * p.pixels - left
    ctx.fillStyle = '#b1bbca'
    ctx.fillText(`${Number(t.toFixed(3))}`, x + 4, ruler / 2)
    ctx.strokeStyle = '#ffffff0c'
    ctx.beginPath()
    ctx.moveTo(x, ruler)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  ctx.restore()

  c.dataset.paintedKeys = String(painted)
  c.dataset.visibleRows = String(Math.max(0, last - first))
  c.dataset.drawMs = (performance.now() - begin).toFixed(3)
  c.dataset.offset = String(left)
  c.dataset.verticalOffset = String(top)
}

function flushSeek() {
  if (input) cancelAnimationFrame(input)
  input = 0
  if (pending !== undefined) {
    const val = pending
    pending = undefined
    emit('seek', val)
  }
}

function seek(value: number) {
  pending = Math.max(p.start, Math.min(p.end, value))
  positionHead()
  if (!input) input = requestAnimationFrame(flushSeek)
}

function at(x: number) {
  return p.start + (x - p.labelsWidth + left) / p.pixels
}

function position(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function down(e: PointerEvent) {
  if (p.disabled || ![0, 1].includes(e.button)) return

  const pos = position(e)
  // Check if click was on the resize splitter between labels and canvas
  if (Math.abs(pos.x - p.labelsWidth) <= 5 && e.button === 0) {
    e.preventDefault()
    canvas.value?.focus()
    canvas.value?.setPointerCapture(e.pointerId)
    drag = {
      id: e.pointerId,
      mode: 'resize-labels',
      ...pos,
      initialX: e.clientX,
      initialY: e.clientY,
      left,
      top,
      anchor: 0,
      original: p.labelsWidth,
      target: p.labelsWidth,
      initialLabelsWidth: p.labelsWidth,
    }
    return
  }

  // Left click inside labels area is handled by TimelineLabels DOM
  if (pos.x < p.labelsWidth) return

  e.preventDefault()
  canvas.value?.focus()
  canvas.value?.setPointerCapture(e.pointerId)

  drag = {
    id: e.pointerId,
    mode: e.button === 1 || e.altKey ? 'pan' : 'seek',
    ...pos,
    initialX: pos.x,
    initialY: pos.y,
    left,
    top,
    anchor: at(pos.x),
    original: 0,
    target: 0,
  }

  if (drag.mode === 'pan') return

  if (pos.y < ruler) {
    seek(at(pos.x))
    return
  }

  const rowIndex = Math.floor((pos.y - ruler + top) / row)
  const item = p.rows[rowIndex]
  if (!item) {
    seek(at(pos.x))
    return
  }

  if (item.kind === 'property' && item.property.kind === 'channel') {
    const curve = resolveCurve(p.editor, item.property)
    if (curve && curve.keys.length > 0) {
      const keys = curve.keys
      const clickTime = at(pos.x)
      const i = lower(keys, clickTime)
      const candidates = keys.length === 1 ? [0] : [i - 1, i].filter(k => k >= 0 && k < keys.length)
      const nearest = candidates.sort(
        (a, b) => Math.abs(keys[a]!.frame - clickTime) - Math.abs(keys[b]!.frame - clickTime)
      )[0]

      if (nearest !== undefined && Math.abs(keys[nearest]!.frame - clickTime) * p.pixels <= 8) {
        const hitKey = keys[nearest]!
        p.editor.actions.selectLayer(item.property)
        p.editor.actions.selectKey({ property: item.property, frame: hitKey.frame })

        const layer = p.rows.find(r => r.kind === 'layer' && r.layer.layerId === item.property.layerId) as
          | Extract<TimelineRow, { kind: 'layer' }>
          | undefined

        if (keys.length > 1 && !layer?.locked) {
          drag.mode = 'key'
          drag.keyRef = { property: item.property, frame: hitKey.frame }
          drag.original = hitKey.frame
          drag.target = hitKey.frame
        } else {
          drag = null
        }
        schedule()
        return
      }
    }
    p.editor.actions.selectLayer(item.property)
    p.editor.workspace.activeProperty.value = item.property
    seek(at(pos.x))
    return
  }

  if (item.kind === 'layer') {
    p.editor.actions.selectLayer(item.layer)
    seek(at(pos.x))
    return
  }

  seek(at(pos.x))
}

function updateDrag() {
  if (!drag || drag.mode === 'pan' || drag.mode === 'resize-labels') return
  if (drag.mode === 'key') {
    drag.target = Math.round(drag.original + at(drag.x) - drag.anchor)
    schedule()
  } else {
    seek(at(drag.x))
  }
}

function autoScroll() {
  edge = 0
  if (!drag || drag.mode === 'pan' || drag.mode === 'resize-labels') return
  const label = p.labelsWidth
  const speed =
    drag.x > width - 24
      ? Math.min(24, (drag.x - width + 24) / 3)
      : drag.x < label + 24
      ? -Math.min(24, (label + 24 - drag.x) / 3)
      : 0
  if (speed && scroll.value) {
    scroll.value.scrollLeft += speed
    sync()
    updateDrag()
    edge = requestAnimationFrame(autoScroll)
  }
}

function move(e: PointerEvent) {
  if (!drag || drag.id !== e.pointerId) return

  if (drag.mode === 'resize-labels') {
    const delta = e.clientX - drag.initialX
    const nextWidth = Math.max(
      TIMELINE_MIN_LABELS_WIDTH,
      Math.min(600, (drag.initialLabelsWidth ?? 340) + delta)
    )
    emit('update:labelsWidth', nextWidth)
    sync()
    return
  }

  Object.assign(drag, position(e))
  if (drag.mode === 'pan') {
    if (scroll.value) {
      scroll.value.scrollLeft = drag.left + drag.initialX - drag.x
      scroll.value.scrollTop = drag.top + drag.initialY - drag.y
      sync()
    }
  } else {
    updateDrag()
    if (!edge) edge = requestAnimationFrame(autoScroll)
  }
}

function up(e: PointerEvent) {
  if (!drag || drag.id !== e.pointerId) return
  move(e)
  const d = drag
  drag = null
  cancelAnimationFrame(edge)
  edge = 0
  flushSeek()

  if (
    d.mode === 'key' &&
    d.keyRef &&
    !p.disabled &&
    (Math.abs(d.x - d.initialX) > 3 || d.target !== d.original)
  ) {
    p.editor.actions.moveKey(d.keyRef, d.target)
  }

  if (canvas.value?.hasPointerCapture(e.pointerId)) {
    canvas.value.releasePointerCapture(e.pointerId)
  }
  schedule()
}

function cancel(e?: PointerEvent) {
  if (e && canvas.value?.hasPointerCapture(e.pointerId)) {
    try {
      canvas.value.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }
  drag = null
  cancelAnimationFrame(edge)
  edge = 0
  cancelAnimationFrame(input)
  input = 0
  if (zoomRaf) cancelAnimationFrame(zoomRaf)
  zoomRaf = 0
  pending = undefined
  positionHead()
  schedule()
}

function setZoom(value: number, anchor = (width - p.labelsWidth) / 2) {
  const next = Math.max(0.000001, Math.min(1000, value))
  const time = (left + anchor) / p.pixels
  emit('zoom', next)
  if (zoomRaf) cancelAnimationFrame(zoomRaf)
  zoomRaf = requestAnimationFrame(() => {
    zoomRaf = 0
    if (scroll.value) {
      scroll.value.scrollLeft = time * next - anchor
      sync()
    }
  })
}

function wheel(e: WheelEvent) {
  e.preventDefault()
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1
  if (e.ctrlKey || e.metaKey) {
    setZoom(
      p.pixels * Math.exp(-e.deltaY * unit * 0.005),
      Math.max(0, e.clientX - canvas.value!.getBoundingClientRect().left - p.labelsWidth)
    )
  } else if (scroll.value) {
    scroll.value.scrollLeft += (e.shiftKey ? e.deltaY + e.deltaX : e.deltaX) * unit
    scroll.value.scrollTop += (e.shiftKey ? 0 : e.deltaY) * unit
    sync()
  }
}

function fit() {
  const availableWidth = Math.max(16, width - p.labelsWidth)
  emit('zoom', Math.max(0.000001, Math.min(1000, availableWidth / span())))
  if (scroll.value) scroll.value.scrollLeft = 0
  sync()
}

function handleLabelsWheel(e: WheelEvent) {
  if (scroll.value) {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1
    scroll.value.scrollTop += e.deltaY * unit
    sync()
  }
}

watch(
  () => p.frame,
  () => {
    if (p.follow && p.playing && !drag && scroll.value) {
      const x = (p.frame - p.start) * p.pixels
      if (x < left || x > left + width - p.labelsWidth - 24) {
        scroll.value.scrollLeft = Math.max(0, x - 24)
        sync()
      }
    }
    positionHead()
  }
)

watch(
  () => [p.rows, p.revision, p.pixels, p.labelsWidth],
  () => {
    schedule()
    positionHead()
  }
)

watch(
  () => [p.start, p.end, p.disabled],
  () => {
    cancel()
    if (scroll.value) scroll.value.scrollLeft = 0
    sync()
  }
)

onMounted(() => {
  observer = new ResizeObserver(() => {
    if (scroll.value) {
      width = Math.max(1, scroll.value.clientWidth)
      height = Math.max(1, scroll.value.clientHeight)
      sync()
    }
  })
  if (scroll.value) observer.observe(scroll.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(paint)
  cancelAnimationFrame(input)
  cancelAnimationFrame(edge)
  if (zoomRaf) cancelAnimationFrame(zoomRaf)
})

defineExpose({ fit, setZoom, handleLabelsWheel })
</script>

<template>
  <div class="aet-timeline-viewport">
    <div ref="scroll" class="aet-timeline-scroll" @scroll="sync">
      <div
        :style="{
          width: `${labelsWidth + Math.max(1, end - start) * pixels + 16}px`,
          height: `${ruler + rows.length * row + 16}px`,
        }"
      />
    </div>

    <canvas
      ref="canvas"
      data-testid="timeline-canvas"
      tabindex="0"
      aria-label="分层时间线：拖动关键帧或时间轴定位，中键/Alt 平移，Shift 滚轮横向滚动，Ctrl 滚轮缩放"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
      @wheel="wheel"
    />

    <div ref="playhead" class="aet-timeline-playhead" />

    <!-- Resizer bar between labels and canvas -->
    <div
      class="labels-resizer"
      :style="{ left: `${labelsWidth - 3}px` }"
      title="拖动调整标签区宽度"
    />
  </div>
</template>

<style scoped>
.aet-timeline-viewport {
  position: relative;
  flex: 1;
  min-height: 65px;
  overflow: hidden;
  background: #20242b;
  contain: layout paint;
}
.aet-timeline-scroll {
  position: absolute;
  inset: 0;
  overflow: scroll;
}
.aet-timeline-scroll > div {
  pointer-events: none;
}
.aet-timeline-viewport canvas {
  position: absolute;
  left: 0;
  top: 0;
  touch-action: none;
  outline: none;
}
.aet-timeline-viewport canvas:focus {
  outline: 1px solid #688d80;
  outline-offset: -1px;
}
.aet-timeline-playhead {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 16px;
  width: 1px;
  background: #f07d79;
  pointer-events: none;
  will-change: transform;
  z-index: 5;
}
.aet-timeline-playhead:before {
  content: '';
  position: absolute;
  left: -4px;
  width: 9px;
  height: 7px;
  background: #f07d79;
}
.labels-resizer {
  position: absolute;
  top: 0;
  bottom: 16px;
  width: 6px;
  cursor: col-resize;
  z-index: 4;
}
.labels-resizer:hover {
  background: rgba(104, 141, 128, 0.4);
}
</style>
