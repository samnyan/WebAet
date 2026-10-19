<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Curve, EditableChannel } from '../../core/aet/types'
const p = defineProps<{ tracks: { channel: EditableChannel; curve?: Curve }[]; start: number; end: number; frame: number; pixels: number; channel: EditableChannel; selectedKey: number; revision: number; follow: boolean; playing: boolean; locked: boolean; disabled: boolean }>()
const emit = defineEmits<{ seek: [frame: number]; select: [channel: EditableChannel, index: number, curve: Curve]; channel: [channel: EditableChannel]; moveKey: [frame: number]; zoom: [pixels: number] }>()
const host = ref<HTMLElement>(), scroll = ref<HTMLElement>(), canvas = ref<HTMLCanvasElement>(), playhead = ref<HTMLElement>()
const label = 155, ruler = 25, row = 25
let width = 0, height = 0, left = 0, top = 0, paint = 0, input = 0, edge = 0, pending: number | undefined, observer: ResizeObserver
let drag: { id: number; mode: 'pan' | 'seek' | 'key'; x: number; y: number; initialX: number; initialY: number; left: number; top: number; anchor: number; original: number; target: number } | null = null
const span = () => Math.max(1, p.end - p.start)
function lower(keys: Curve['keys'], time: number) { let a = 0, b = keys.length; while (a < b) { const m = (a + b) >>> 1; if (keys[m]!.frame < time) a = m + 1; else b = m }; return a }
function sync() { left = scroll.value?.scrollLeft ?? 0; top = scroll.value?.scrollTop ?? 0; schedule(); positionHead() }
function positionHead() { if (playhead.value) { const x = label + ((pending ?? p.frame) - p.start) * p.pixels - left; playhead.value.style.transform = `translateX(${x}px)`; playhead.value.style.visibility = x >= label && x <= width ? 'visible' : 'hidden' } }
function schedule() { if (!paint) paint = requestAnimationFrame(draw) }
function draw() {
  paint = 0
  const c = canvas.value, ctx = c?.getContext('2d'); if (!c || !ctx) return
  const begin = performance.now(), dpr = devicePixelRatio || 1
  if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) { c.width = Math.round(width * dpr); c.height = Math.round(height * dpr) }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#20242b'; ctx.fillRect(0, 0, width, height); ctx.font = '11px monospace'; ctx.textBaseline = 'middle'
  const first = Math.max(0, Math.floor(top / row)), last = Math.min(p.tracks.length, Math.ceil((top + height - ruler) / row))
  let painted = 0
  for (let i = first; i < last; i++) {
    const track = p.tracks[i]!, y = ruler + i * row - top, keys = track.curve?.keys ?? []
    ctx.save(); ctx.beginPath(); ctx.rect(0, ruler, width, Math.max(0, height - ruler)); ctx.clip()
    ctx.fillStyle = track.channel === p.channel ? '#294039' : i % 2 ? '#242a32' : '#20242b'; ctx.fillRect(0, y, width, row - 1)
    ctx.save(); ctx.beginPath(); ctx.rect(0, y, label - 4, row); ctx.clip(); ctx.fillStyle = '#c7d4df'; ctx.fillText(`${track.channel}  ${keys.length}`, 10, y + row / 2); ctx.restore()
    ctx.save(); ctx.beginPath(); ctx.rect(label, y, Math.max(0, width - label), row); ctx.clip()
    let k = keys.length === 1 ? 0 : lower(keys, p.start + (left - 8) / p.pixels), lastPixel = -Infinity
    const end = p.start + (left + width - label + 8) / p.pixels
    while (k < keys.length && (keys.length === 1 || keys[k]!.frame <= end)) {
      const selected = track.channel === p.channel && p.selectedKey === k
      const time = selected && drag?.mode === 'key' ? drag.target : keys.length === 1 ? p.start : keys[k]!.frame
      const x = label + (time - p.start) * p.pixels - left
      if (Math.floor(x) !== lastPixel || selected) { lastPixel = Math.floor(x); painted++; ctx.fillStyle = selected ? '#ffdc83' : '#83b39f'; ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x + 5, y + 12); ctx.lineTo(x, y + 17); ctx.lineTo(x - 5, y + 12); ctx.closePath(); ctx.fill() }
      // Jump to the next pixel column rather than traversing every dense key.
      k = keys.length === 1 ? 1 : Math.max(k + 1, lower(keys, p.start + (Math.floor(x) + 1 - label + left) / p.pixels))
    }
    // A selected key must remain visible even when pixel aggregation skipped it.
    if (track.channel === p.channel && keys[p.selectedKey] && keys.length > 1) {
      const x = label + ((drag?.mode === 'key' ? drag.target : keys[p.selectedKey]!.frame) - p.start) * p.pixels - left
      ctx.fillStyle = '#ffdc83'; ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x + 5, y + 12); ctx.lineTo(x, y + 17); ctx.lineTo(x - 5, y + 12); ctx.closePath(); ctx.fill()
    }
    ctx.restore(); ctx.restore()
  }
  ctx.fillStyle = '#2c323c'; ctx.fillRect(0, 0, width, ruler); ctx.fillStyle = '#c7d4df'; ctx.fillText('属性 / 关键帧', 10, ruler / 2)
  ctx.save(); ctx.beginPath(); ctx.rect(label, 0, Math.max(0, width - label), height); ctx.clip()
  const raw = Math.max(1, 90 / p.pixels), magnitude = 10 ** Math.floor(Math.log10(raw)), step = ([1, 2, 5, 10].find(v => v * magnitude >= raw) ?? 10) * magnitude
  const min = p.start + left / p.pixels, max = min + (width - label) / p.pixels
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) { const x = label + (t - p.start) * p.pixels - left; ctx.fillStyle = '#b1bbca'; ctx.fillText(`${Number(t.toFixed(3))}`, x + 4, ruler / 2); ctx.strokeStyle = '#ffffff0c'; ctx.beginPath(); ctx.moveTo(x, ruler); ctx.lineTo(x, height); ctx.stroke() }
  ctx.restore(); c.dataset.paintedKeys = String(painted); c.dataset.visibleRows = String(Math.max(0, last - first)); c.dataset.drawMs = (performance.now() - begin).toFixed(3); c.dataset.offset = String(left); c.dataset.verticalOffset = String(top)
}
function flushSeek() { if (input) cancelAnimationFrame(input); input = 0; if (pending !== undefined) { const value = pending; pending = undefined; emit('seek', value) } }
function seek(value: number) { pending = Math.max(p.start, Math.min(p.end, value)); positionHead(); if (!input) input = requestAnimationFrame(flushSeek) }
function at(x: number) { return p.start + (x - label + left) / p.pixels }
function position(e: PointerEvent) { const r = canvas.value!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
function down(e: PointerEvent) {
  if (p.disabled || ![0, 1].includes(e.button)) return
  e.preventDefault(); canvas.value?.focus(); canvas.value?.setPointerCapture(e.pointerId)
  const pos = position(e)
  drag = { id: e.pointerId, mode: e.button === 1 || e.altKey ? 'pan' : 'seek', ...pos, initialX: pos.x, initialY: pos.y, left, top, anchor: at(pos.x), original: 0, target: 0 }
  if (drag.mode === 'pan') return
  const track = pos.y >= ruler ? p.tracks[Math.floor((pos.y - ruler + top) / row)] : undefined
  if (track && pos.x < label) { emit('channel', track.channel); drag = null; return }
  if (pos.x < label) { drag = null; return }
  if (track?.curve) {
    const keys = track.curve.keys, i = lower(keys, at(pos.x)), candidates = keys.length === 1 ? [0] : [i - 1, i].filter(k => k >= 0 && k < keys.length)
    const nearest = candidates.sort((a, b) => Math.abs((keys.length === 1 ? p.start : keys[a]!.frame) - at(pos.x)) - Math.abs((keys.length === 1 ? p.start : keys[b]!.frame) - at(pos.x)))[0]
    if (nearest !== undefined && Math.abs((keys.length === 1 ? p.start : keys[nearest]!.frame) - at(pos.x)) * p.pixels <= 8) {
      emit('select', track.channel, nearest, track.curve)
      if (keys.length > 1 && !p.locked) { drag.mode = 'key'; drag.original = drag.target = keys[nearest]!.frame } else drag = null
      schedule(); return
    }
    emit('channel', track.channel)
  }
  seek(at(pos.x))
}
function updateDrag() { if (!drag || drag.mode === 'pan') return; if (drag.mode === 'key') { drag.target = Math.round(drag.original + at(drag.x) - drag.anchor); schedule() } else seek(at(drag.x)) }
function autoScroll() {
  edge = 0; if (!drag || drag.mode === 'pan') return
  const speed = drag.x > width - 24 ? Math.min(24, (drag.x - width + 24) / 3) : drag.x < label + 24 ? -Math.min(24, (label + 24 - drag.x) / 3) : 0
  if (speed && scroll.value) { scroll.value.scrollLeft += speed; sync(); updateDrag(); edge = requestAnimationFrame(autoScroll) }
}
function move(e: PointerEvent) { if (!drag || drag.id !== e.pointerId) return; Object.assign(drag, position(e)); if (drag.mode === 'pan') { scroll.value!.scrollLeft = drag.left + drag.initialX - drag.x; scroll.value!.scrollTop = drag.top + drag.initialY - drag.y; sync() } else { updateDrag(); if (!edge) edge = requestAnimationFrame(autoScroll) } }
function up(e: PointerEvent) { if (!drag || drag.id !== e.pointerId) return; move(e); const d = drag; drag = null; cancelAnimationFrame(edge); edge = 0; flushSeek(); if (d.mode === 'key' && !p.disabled && !p.locked && (Math.abs(d.x - d.initialX) > 3 || d.target !== d.original)) emit('moveKey', d.target); if (canvas.value?.hasPointerCapture(e.pointerId)) canvas.value.releasePointerCapture(e.pointerId); schedule() }
function cancel() { drag = null; cancelAnimationFrame(edge); edge = 0; cancelAnimationFrame(input); input = 0; pending = undefined; positionHead(); schedule() }
function setZoom(value: number, anchor = (width - label) / 2) { const next = Math.max(0.000001, Math.min(1000, value)), time = (left + anchor) / p.pixels; emit('zoom', next); requestAnimationFrame(() => { if (scroll.value) scroll.value.scrollLeft = time * next - anchor; sync() }) }
function wheel(e: WheelEvent) { e.preventDefault(); const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1; if (e.ctrlKey || e.metaKey) setZoom(p.pixels * Math.exp(-e.deltaY * unit * .005), Math.max(0, e.clientX - canvas.value!.getBoundingClientRect().left - label)); else if (scroll.value) { scroll.value.scrollLeft += (e.shiftKey ? e.deltaY + e.deltaX : e.deltaX) * unit; scroll.value.scrollTop += (e.shiftKey ? 0 : e.deltaY) * unit; sync() } }
function fit() { emit('zoom', Math.max(.000001, Math.min(1000, (width - label - 16) / span()))); if (scroll.value) scroll.value.scrollLeft = 0; sync() }
watch(() => p.frame, () => { if (p.follow && p.playing && !drag && scroll.value) { const x = (p.frame - p.start) * p.pixels; if (x < left || x > left + width - label - 24) { scroll.value.scrollLeft = Math.max(0, x - 24); sync() } }; positionHead() })
watch(() => [p.tracks, p.revision, p.channel, p.selectedKey, p.pixels], () => { schedule(); positionHead() })
watch(() => p.tracks, () => { cancel() })
watch(() => [p.start, p.end, p.disabled], () => { cancel(); if (scroll.value) scroll.value.scrollLeft = 0; sync() })
onMounted(() => { observer = new ResizeObserver(() => { width = Math.max(1, host.value!.clientWidth - 16); height = Math.max(1, host.value!.clientHeight - 16); sync() }); observer.observe(host.value!) })
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(paint); cancelAnimationFrame(input); cancelAnimationFrame(edge) })
defineExpose({ fit, setZoom })
</script>
<template>
  <div ref="host" class="aet-timeline-viewport">
    <div ref="scroll" class="aet-timeline-scroll" @scroll="sync"><div :style="{ width: `${155 + Math.max(1, end - start) * pixels + 16}px`, height: `${25 + tracks.length * 25 + 16}px` }" /></div>
    <canvas ref="canvas" data-testid="timeline-canvas" tabindex="0" aria-label="时间线：拖动定位或关键帧，中键/Alt 平移，Shift 滚轮横向滚动，Ctrl 滚轮缩放" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel" @wheel="wheel" />
    <div ref="playhead" class="aet-timeline-playhead" />
  </div>
</template>
<style scoped>
.aet-timeline-viewport{position:relative;flex:1;min-height:65px;overflow:hidden;background:#20242b;contain:layout paint}.aet-timeline-scroll{position:absolute;inset:0;overflow:scroll}.aet-timeline-scroll>div{pointer-events:none}.aet-timeline-viewport canvas{position:absolute;inset:0 16px 16px 0;width:calc(100% - 16px);height:calc(100% - 16px);touch-action:none;outline:none}.aet-timeline-viewport canvas:focus{outline:1px solid #688d80;outline-offset:-1px}.aet-timeline-playhead{position:absolute;left:0;top:0;bottom:16px;width:1px;background:#f07d79;pointer-events:none;will-change:transform}.aet-timeline-playhead:before{content:'';position:absolute;left:-4px;width:9px;height:7px;background:#f07d79}
</style>
