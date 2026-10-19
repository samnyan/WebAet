<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCheckbox, NInputNumber, NSelect } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { channels, channels3D, videoCurve, type EditableChannel, type Curve } from '../../core/aet/types'
import { sampleCurve } from '../../core/animation/curves'
import { insertSampledKey } from '../../core/animation/insertKey'
import { markerSegments } from '../../core/animation/segments'
import { retimeKeys } from '../../core/animation/retime'
import { offsetKeyValues } from '../../core/animation/offsetValues'
import CurvePreview from './CurvePreview.vue'
const { editor: e } = defineProps<{ editor: Editor }>()
const showCurve = ref(false), playbackSpeed = ref(1), reverse = ref(false)
const speedOptions = [0.25, 0.5, 1, 2].map(value => ({ value, label: `${value}×` }))
watch([playbackSpeed, reverse], () => { last = 0 })
const collapsed = ref(false), playing = ref(false), repeat = ref(true), channel = ref<EditableChannel>('positionX'), selectedKey = ref(-1), pixels = ref(3), height = ref(245)
let raf = 0, last = 0
const segmentId = ref('all')
const segments = computed(() => { e.version.value; return markerSegments(e.selected.value?.markers ?? []) })
const layerRange = computed(() => {
  e.version.value
  const layer = e.selected.value
  return layer && Number.isFinite(layer.start) && Number.isFinite(layer.end) && layer.end > layer.start ? { start: layer.start, end: layer.end } : null
})
const segmentOptions = computed(() => [{ value: 'all', label: '完整时间范围' }, ...(layerRange.value ? [{ value: 'layer', label: `选中图层 · ${layerRange.value.start}–${layerRange.value.end} f（末端不含）` }] : []), ...segments.value.map(s => ({ value: s.id, label: s.label }))])
const fullRange = computed(() => {
  e.version.value
  const layers = e.composition.value?.layers ?? []
  return { start: Math.min(e.scene.value?.start ?? 0, ...layers.map(l => l.start)), end: Math.max(e.scene.value?.end ?? 60, ...layers.map(l => l.end), 1) }
})
const range = computed(() => (segmentId.value === 'layer' ? layerRange.value : segments.value.find(s => s.id === segmentId.value)) ?? fullRange.value)
watch(() => e.selectedId.value, () => { segmentId.value = 'all'; stop() })
watch(segmentOptions, list => { if (!list.some(s => s.value === segmentId.value)) segmentId.value = 'all' })
watch(() => [range.value.start, range.value.end], () => { stop(); e.frame.value = Math.max(range.value.start, Math.min(range.value.end, e.frame.value)) })
watch(segmentId, () => { stop(); e.frame.value = range.value.start })
const followPlayhead = ref(false)
const scrollHost = ref<HTMLElement>()
function revealPlayhead() {
  const host = scrollHost.value
  if (!followPlayhead.value || !host || host.clientWidth <= 0) return
  const x = (e.frame.value - range.value.start) * pixels.value
  const margin = Math.min(60, host.clientWidth / 4)
  if (x < host.scrollLeft + margin) host.scrollLeft = Math.max(0, x - margin)
  else if (x > host.scrollLeft + host.clientWidth - margin) host.scrollLeft = x - host.clientWidth + margin
}
watch(() => [e.frame.value, pixels.value, followPlayhead.value, collapsed.value, range.value.start], revealPlayhead, { flush: 'post' })
const width = computed(() => Math.max(1, (range.value.end - range.value.start) * pixels.value))
const ticks = computed(() => {
  const span = range.value.end - range.value.start
  const desired = Math.max(1, 90 / pixels.value, span / 500)
  const magnitude = 10 ** Math.floor(Math.log10(desired))
  const step = ([1, 2, 5, 10].find(v => v * magnitude >= desired) ?? 10) * magnitude
  const first = Math.ceil(range.value.start / step) * step
  return Array.from({ length: Math.max(0, Math.min(501, Math.floor((range.value.end - first) / step) + 1)) }, (_, i) => first + i * step)
})
function fitRange() {
  const host = scrollHost.value, span = range.value.end - range.value.start
  if (!host || span <= 0) return
  pixels.value = Math.min(30, Math.max(1, host.clientWidth - 16) / span); host.scrollLeft = 0
}
const curve = computed(() => { e.version.value; return videoCurve(e.selected.value?.video, channel.value) })
// Curves are markRaw and edited in place: expose a fresh display snapshot per revision.
const key = computed(() => { e.version.value; const k = curve.value?.keys[selectedKey.value]; return k ? { ...k } : undefined })
const tracks = computed(() => { e.version.value; return [...channels, ...(e.selected.value?.video?.extra ? channels3D : [])].map(ch => ({ channel: ch, curve: videoCurve(e.selected.value?.video, ch) })) })
const animationOptions = computed(() => e.composition.value?.layers.map(l => ({ value: l.offset, label: l.name })) ?? [])
watch(() => [e.selectedId.value, channel.value], () => selectedKey.value = -1, { flush: 'sync' })
watch(() => [e.sceneIndex.value, e.compositionId.value], () => { stop(); selectedKey.value = -1; e.frame.value = range.value.start })
function stop() { playing.value = false; cancelAnimationFrame(raf); last = 0 }
watch(() => e.doc.value?.source, () => { stop(); selectedKey.value = -1; segmentId.value = 'all' }, { flush: 'sync' })
watch(() => e.busy.value, busy => { if (busy) stop() }, { flush: 'sync' })
function visibilityChanged() { if (document.hidden) stop() }
function tick(now: number) {
  if (!playing.value) return
  if (last) {
    let frame = e.frame.value + Math.min(0.1, (now - last) / 1000) * (e.scene.value?.fps ?? 60) * playbackSpeed.value * (reverse.value ? -1 : 1)
    if (frame >= range.value.end) { if (repeat.value) frame = range.value.start + (frame - range.value.start) % (range.value.end - range.value.start); else { e.frame.value = Math.max(range.value.start, range.value.end - 1); stop(); return } }
    if (frame < range.value.start) {
      if (repeat.value) { const span = range.value.end - range.value.start; frame = range.value.start + ((frame - range.value.start) % span + span) % span }
      else { e.frame.value = range.value.start; stop(); return }
    }
    e.frame.value = frame
  }
  last = now; raf = requestAnimationFrame(tick)
}
function toggle() { if (!e.doc.value || e.busy.value || document.hidden) return; if (playing.value) stop(); else { if (e.frame.value < range.value.start || e.frame.value >= range.value.end || (reverse.value && e.frame.value <= range.value.start)) e.frame.value = reverse.value ? Math.max(range.value.start, range.value.end - 1) : range.value.start; playing.value = true; raf = requestAnimationFrame(tick) } }
const previousKey = computed(() => { e.version.value; return curve.value && curve.value.keys.length > 1 ? curve.value.keys.reduce((found, k, i) => k.frame < e.frame.value - 0.0001 && k.frame >= range.value.start && k.frame < range.value.end ? i : found, -1) : -1 })
const nextKey = computed(() => { e.version.value; return curve.value && curve.value.keys.length > 1 ? curve.value.keys.findIndex(k => k.frame > e.frame.value + 0.0001 && k.frame >= range.value.start && k.frame < range.value.end) : -1 })
function jumpKey(index: number) {
  const target = curve.value?.keys[index]; if (!target || index < 0) return
  stop(); selectedKey.value = index; e.frame.value = target.frame
}
function scrub(value: number) { stop(); e.frame.value = Math.max(range.value.start, Math.min(range.value.end, value)) }
function timeAt(event: PointerEvent) { const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect(); return range.value.start + (event.clientX - bounds.left) / pixels.value }
function rulerDown(event: PointerEvent) { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); scrub(timeAt(event)) }
function addKey() {
  const c = curve.value; if (!c || (e.selected.value!.flags & 32)) return
  e.edit(() => {
    const inserted = insertSampledKey(c.keys, Math.round(e.frame.value), fullRange.value.start)
    c.keys = inserted.keys; selectedKey.value = inserted.index
  })
}
const valueOffset = ref(0)
function offsetValues() {
  const target = curve.value
  if (!target || !target.keys.length || (e.selected.value!.flags & 32)) return
  stop(); e.edit(() => { target.keys = offsetKeyValues(target.keys, valueOffset.value) })
}
const timeScale = ref(1), timeShift = ref(0)
function retime() {
  const target = curve.value; if (!target || target.keys.length < 2 || (e.selected.value!.flags & 32)) return
  stop(); e.edit(() => { target.keys = retimeKeys(target.keys, timeScale.value, timeShift.value) }); selectedKey.value = -1
}
const copiedCurve = ref<{ channel: EditableChannel; keys: Curve['keys'] } | null>(null)
function copyCurve() {
  if (!curve.value) return
  copiedCurve.value = { channel: channel.value, keys: curve.value.keys.map(k => ({ ...k })) }
}
function pasteCurve() {
  const target = curve.value, copied = copiedCurve.value
  if (!target || !copied || copied.channel !== channel.value || (e.selected.value!.flags & 32)) return
  stop(); e.edit(() => { target.keys = copied.keys.map(k => ({ ...k })) }); selectedKey.value = -1
}
function restoreChannel() {
  if (!curve.value || (e.selected.value!.flags & 32)) return
  stop()
  if (!window.confirm(`恢复 ${channel.value} 到当前 AET 原始数据？仅恢复此轨道，可撤销。`)) return
  e.restoreChannel(channel.value); selectedKey.value = -1
}
function makeConstant() {
  const target = curve.value
  if (!target || target.keys.length < 2 || (e.selected.value!.flags & 32)) return
  stop()
  const value = sampleCurve(target, e.frame.value)
  if (!window.confirm(`将 ${channel.value} 的 ${target.keys.length} 个关键帧替换为当前值 ${value}？可撤销。`)) return
  e.edit(() => { target.keys = [{ frame: 0, value, tangent: 0 }] }); selectedKey.value = 0
}
function deleteKey() { const c = curve.value; if (!c || selectedKey.value < 0 || (e.selected.value!.flags & 32)) return; e.edit(() => c.keys.splice(selectedKey.value, 1)); selectedKey.value = -1 }
function editKey(field: 'frame' | 'value' | 'tangent', value: number | null) {
  const c = curve.value, k = c?.keys[selectedKey.value]; if (!c || !k || value === null || (e.selected.value!.flags & 32)) return
  const encoded = Math.fround(value)
  if (!Number.isFinite(encoded)) { e.error.value = '关键帧参数必须是有限 float32'; return }
  if (field === 'frame' && c.keys.some(other => other !== k && Math.fround(other.frame) === encoded)) { e.error.value = '关键帧时间在 float32 精度下不能重复'; return }
  e.edit(() => { k[field] = encoded; c.keys.sort((a, b) => a.frame - b.frame); selectedKey.value = c.keys.indexOf(k) })
}
function chooseKey(ch: EditableChannel, index: number, c: Curve) { channel.value = ch; selectedKey.value = index; scrub(c.keys[index]!.frame) }
function dragKey(event: PointerEvent, ch: EditableChannel, index: number, c: Curve) {
  event.stopPropagation(); chooseKey(ch, index, c)
  if (c.keys.length < 2 || (e.selected.value!.flags & 32)) return
  const startX = event.clientX, original = c.keys[index]!.frame
  const up = (end: PointerEvent) => {
    window.removeEventListener('pointerup', up)
    const target = Math.round(original + (end.clientX - startX) / pixels.value)
    if (Math.abs(end.clientX - startX) > 3) editKey('frame', target)
  }
  window.addEventListener('pointerup', up, { once: true })
}
function resize(event: PointerEvent) {
  const y = event.clientY, h = height.value
  const move = (ev: PointerEvent) => height.value = Math.max(140, Math.min(innerHeight * 0.65, h + y - ev.clientY))
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
function keyboard(event: KeyboardEvent) {
  if (!e.doc.value || e.busy.value || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
  if ((event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable=true],[role=combobox],[role=checkbox],[role=dialog]')) return
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) toggle() }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1, direction = event.key === 'ArrowRight' ? 1 : -1
    scrub(Math.min(Math.max(range.value.start, range.value.end - 1), Math.round(e.frame.value) + direction * step))
  }
}
onMounted(() => { window.addEventListener('keydown', keyboard); document.addEventListener('visibilitychange', visibilityChanged) })
onBeforeUnmount(() => { stop(); window.removeEventListener('keydown', keyboard); document.removeEventListener('visibilitychange', visibilityChanged) })
</script>
<template>
  <section class="timeline" :style="{ height: collapsed ? '38px' : `${height}px` }">
    <div class="timeline-resize" @pointerdown.prevent="resize" />
    <div class="timeline-toolbar"><n-button size="tiny" @click="collapsed = !collapsed">{{ collapsed ? '▸' : '▾' }} 时间线</n-button><template v-if="!collapsed">
      <n-button data-testid="play" size="tiny" :disabled="!e.doc.value || e.busy.value" @click="toggle">{{ playing ? '暂停' : '播放' }}</n-button><n-button size="tiny" @click="scrub(range.start)">|◀</n-button>
      <n-input-number class="frame-input" size="tiny" :value="e.frame.value" :min="range.start" :max="range.end" :precision="2" :show-button="false" @update:value="v => v !== null && scrub(v)" /><span>f</span><n-checkbox v-model:checked="repeat" size="small">循环</n-checkbox><n-select data-testid="playback-speed" style="width: 85px" size="tiny" v-model:value="playbackSpeed" :options="speedOptions" title="仅改变预览速度，不修改场景帧率" />
      <n-select class="timeline-layer" size="tiny" filterable :value="e.selectedId.value" :options="animationOptions" placeholder="选择图层 / Animation" @update:value="e.selectedId.value = $event" />
      <n-select class="timeline-segment" style="width: 190px" size="tiny" v-model:value="segmentId" :options="segmentOptions" :disabled="segmentOptions.length < 2" />
      <n-checkbox data-testid="reverse-playback" v-model:checked="reverse" size="small">倒放</n-checkbox><n-checkbox data-testid="show-curve" v-model:checked="showCurve" size="small">曲线预览</n-checkbox>
      <div class="spacer" /><n-checkbox data-testid="follow-playhead" v-model:checked="followPlayhead" size="small">跟随播放头</n-checkbox><n-button data-testid="fit-timeline" size="tiny" @click="fitRange">适应范围</n-button><n-button size="tiny" @click="pixels = Math.max(0.000001, pixels / 1.4)">−</n-button><n-button size="tiny" @click="pixels = Math.min(30, pixels * 1.4)">+</n-button>
    </template></div>
    <template v-if="!collapsed"><div class="timeline-body"><div class="track-labels"><div class="track-ruler-label">属性</div><div v-for="track in tracks" :key="track.channel" class="track-label" :class="{ active: channel === track.channel }" @click="channel = track.channel">{{ track.channel }} <small>{{ track.curve?.keys.length ?? 0 }}</small></div></div>
      <div ref="scrollHost" class="tracks-scroll"><div class="tracks-surface" :style="{ width: `${width}px` }">
        <div v-memo="[ticks, pixels, range.start]" class="time-ruler" @pointerdown="rulerDown" @pointermove="($event.buttons & 1) && scrub(timeAt($event))"><span v-for="tick in ticks" :key="tick" :style="{ left: `${(tick - range.start) * pixels}px` }">{{ tick }}</span></div>
        <div v-for="track in tracks" :key="track.channel" v-memo="[track, e.version.value, channel, selectedKey, pixels, range.start]" class="track-lane" :class="{ active: channel === track.channel }" @pointerdown="channel = track.channel; rulerDown($event)" @pointermove="($event.buttons & 1) && scrub(timeAt($event))">
          <button v-for="(k, i) in track.curve?.keys ?? []" :key="i" class="keyframe" :class="{ chosen: channel === track.channel && selectedKey === i }" :style="{ left: `${((track.curve!.keys.length === 1 ? range.start : k.frame) - range.start) * pixels}px` }" :title="`${track.channel}: ${k.frame}f = ${k.value}, tangent ${k.tangent}`" @pointerdown="dragKey($event, track.channel, i, track.curve!)" />
        </div><div class="playhead" :style="{ left: `${(e.frame.value - range.start) * pixels}px` }" />
      </div></div></div>
      <CurvePreview v-if="showCurve" :curve="curve" :start="range.start" :end="range.end" :frame="e.frame.value" :revision="e.version.value" @scrub="scrub" @select-key="i => curve && chooseKey(channel, i, curve)" />
      <div class="key-editor"><span>{{ channel }}</span><n-button data-testid="copy-curve" size="tiny" :disabled="!curve" @click="copyCurve">复制曲线</n-button><n-button data-testid="paste-curve" size="tiny" :disabled="!curve || !copiedCurve || copiedCurve.channel !== channel || !!(e.selected.value!.flags & 32)" :title="copiedCurve ? `替换整条 ${copiedCurve.channel} 曲线（${copiedCurve.keys.length} 个键）` : '先复制同名轨道曲线'" @click="pasteCurve">替换曲线</n-button><n-button data-testid="restore-channel" size="tiny" :disabled="!curve || !!(e.selected.value!.flags & 32)" @click="restoreChannel">恢复原始轨道</n-button><n-button data-testid="make-constant" size="tiny" :disabled="!curve || curve.keys.length < 2 || !!(e.selected.value!.flags & 32)" @click="makeConstant">转为常量</n-button><n-button data-testid="previous-key" size="tiny" :disabled="previousKey < 0" @click="jumpKey(previousKey)">◀◆</n-button><n-button data-testid="next-key" size="tiny" :disabled="nextKey < 0" @click="jumpKey(nextKey)">◆▶</n-button><n-button data-testid="add-key" size="tiny" :disabled="!curve || !!(e.selected.value!.flags & 32)" @click="addKey">＋关键帧</n-button><n-button data-testid="delete-key" size="tiny" :disabled="!key || !!(e.selected.value!.flags & 32)" @click="deleteKey">删除</n-button>
        <template v-if="key"><label v-for="field in (['frame', 'value', 'tangent'] as const)" :key="field">{{ field }}<n-input-number :data-key-field="field" size="tiny" :value="key[field]" :show-button="false" :disabled="!!(e.selected.value!.flags & 32) || (field === 'frame' && curve!.keys.length === 1)" @update:value="editKey(field, $event)" /></label></template><span v-else class="muted">选择 ◆ 编辑时间 / 数值 / Hermite 切线，拖动 ◆ 改时间</span>
      </div>
      <div class="key-editor"><span>整轨重定时（首键为轴）</span><label>时间倍率<n-input-number data-testid="retime-scale" size="tiny" v-model:value="timeScale" :min="0.001" :show-button="false" /></label><label>偏移 f<n-input-number data-testid="retime-shift" size="tiny" v-model:value="timeShift" :show-button="false" /></label><n-button data-testid="retime-apply" size="tiny" :disabled="!curve || curve.keys.length < 2 || !!(e.selected.value!.flags & 32)" @click="retime">应用重定时</n-button><label>整轨数值偏移<n-input-number data-testid="value-offset" size="tiny" v-model:value="valueOffset" :show-button="false" /></label><n-button data-testid="value-offset-apply" size="tiny" :disabled="!curve?.keys.length || !!(e.selected.value!.flags & 32)" title="平移整条轨道的数值，保留帧时间和切线" @click="offsetValues">应用数值偏移</n-button></div>
    </template>
  </section>
</template>
