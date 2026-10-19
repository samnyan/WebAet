<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCheckbox, NInputNumber, NSelect } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { channels, channels3D, videoCurve, type EditableChannel, type Curve } from '../../core/aet/types'
import { sampleCurve, sampleCurveTangent } from '../../core/animation/curves'
import { markerSegments } from '../../core/animation/segments'
import { retimeKeys } from '../../core/animation/retime'
import CurvePreview from './CurvePreview.vue'
const { editor: e } = defineProps<{ editor: Editor }>()
const showCurve = ref(false)
const collapsed = ref(false), playing = ref(false), repeat = ref(true), channel = ref<EditableChannel>('positionX'), selectedKey = ref(-1), pixels = ref(3), height = ref(245)
let raf = 0, last = 0
const segmentId = ref('all')
const segments = computed(() => { e.version.value; return markerSegments(e.selected.value?.markers ?? []) })
const segmentOptions = computed(() => [{ value: 'all', label: '完整时间范围' }, ...segments.value.map(s => ({ value: s.id, label: s.label }))])
const fullRange = computed(() => {
  e.version.value
  const layers = e.composition.value?.layers ?? []
  return { start: Math.min(e.scene.value?.start ?? 0, ...layers.map(l => l.start)), end: Math.max(e.scene.value?.end ?? 60, ...layers.map(l => l.end), 1) }
})
const range = computed(() => segments.value.find(s => s.id === segmentId.value) ?? fullRange.value)
watch(() => e.selectedId.value, () => { segmentId.value = 'all'; stop() })
watch(segments, list => { if (segmentId.value !== 'all' && !list.some(s => s.id === segmentId.value)) segmentId.value = 'all' })
watch(() => [range.value.start, range.value.end], () => { stop(); e.frame.value = Math.max(range.value.start, Math.min(range.value.end, e.frame.value)) })
watch(segmentId, () => { stop(); e.frame.value = range.value.start })
const width = computed(() => Math.max(700, (range.value.end - range.value.start) * pixels.value))
const curve = computed(() => { e.version.value; return videoCurve(e.selected.value?.video, channel.value) })
// Curves are markRaw and edited in place: expose a fresh display snapshot per revision.
const key = computed(() => { e.version.value; const k = curve.value?.keys[selectedKey.value]; return k ? { ...k } : undefined })
const tracks = computed(() => { e.version.value; return [...channels, ...(e.selected.value?.video?.extra ? channels3D : [])].map(ch => ({ channel: ch, curve: videoCurve(e.selected.value?.video, ch) })) })
const animationOptions = computed(() => e.composition.value?.layers.map(l => ({ value: l.offset, label: l.name })) ?? [])
watch(() => [e.selectedId.value, channel.value], () => selectedKey.value = -1, { flush: 'sync' })
watch(() => [e.sceneIndex.value, e.compositionId.value], () => { stop(); selectedKey.value = -1; e.frame.value = range.value.start })
function stop() { playing.value = false; cancelAnimationFrame(raf); last = 0 }
function tick(now: number) {
  if (!playing.value) return
  if (last) {
    let frame = e.frame.value + Math.min(0.1, (now - last) / 1000) * (e.scene.value?.fps ?? 60)
    if (frame >= range.value.end) { if (repeat.value) frame = range.value.start + (frame - range.value.start) % (range.value.end - range.value.start); else { e.frame.value = Math.max(range.value.start, range.value.end - 1); stop(); return } }
    e.frame.value = frame
  }
  last = now; raf = requestAnimationFrame(tick)
}
function toggle() { if (playing.value) stop(); else { if (e.frame.value < range.value.start || e.frame.value >= range.value.end) e.frame.value = range.value.start; playing.value = true; raf = requestAnimationFrame(tick) } }
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
  const frame = Math.round(e.frame.value), value = sampleCurve(c, frame), tangent = sampleCurveTangent(c, frame)
  e.edit(() => {
    if (c.keys.length === 1 && frame !== fullRange.value.start) c.keys[0]!.frame = fullRange.value.start
    const found = c.keys.findIndex(k => k.frame === frame)
    if (found >= 0) { selectedKey.value = found; return }
    c.keys.push({ frame, value, tangent }); c.keys.sort((a, b) => a.frame - b.frame); selectedKey.value = c.keys.findIndex(k => k.frame === frame)
  })
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
function deleteKey() { const c = curve.value; if (!c || selectedKey.value < 0 || (e.selected.value!.flags & 32)) return; e.edit(() => c.keys.splice(selectedKey.value, 1)); selectedKey.value = -1 }
function editKey(field: 'frame' | 'value' | 'tangent', value: number | null) {
  const c = curve.value, k = c?.keys[selectedKey.value]; if (!c || !k || value === null || (e.selected.value!.flags & 32)) return
  if (field === 'frame' && c.keys.some(other => other !== k && other.frame === value)) { e.error.value = '关键帧时间不能重复'; return }
  e.edit(() => { k[field] = value; c.keys.sort((a, b) => a.frame - b.frame); selectedKey.value = c.keys.indexOf(k) })
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
onMounted(() => window.addEventListener('keydown', keyboard))
onBeforeUnmount(() => { stop(); window.removeEventListener('keydown', keyboard) })
</script>
<template>
  <section class="timeline" :style="{ height: collapsed ? '38px' : `${height}px` }">
    <div class="timeline-resize" @pointerdown.prevent="resize" />
    <div class="timeline-toolbar"><n-button size="tiny" @click="collapsed = !collapsed">{{ collapsed ? '▸' : '▾' }} 时间线</n-button><template v-if="!collapsed">
      <n-button data-testid="play" size="tiny" :disabled="!e.doc.value" @click="toggle">{{ playing ? '暂停' : '播放' }}</n-button><n-button size="tiny" @click="scrub(range.start)">|◀</n-button>
      <n-input-number class="frame-input" size="tiny" :value="e.frame.value" :min="range.start" :max="range.end" :precision="2" :show-button="false" @update:value="v => v !== null && scrub(v)" /><span>f</span><n-checkbox v-model:checked="repeat" size="small">循环</n-checkbox>
      <n-select class="timeline-layer" size="tiny" filterable :value="e.selectedId.value" :options="animationOptions" placeholder="选择图层 / Animation" @update:value="e.selectedId.value = $event" />
      <n-select class="timeline-segment" style="width: 190px" size="tiny" v-model:value="segmentId" :options="segmentOptions" :disabled="!segments.length" />
      <n-checkbox data-testid="show-curve" v-model:checked="showCurve" size="small">曲线预览</n-checkbox>
      <div class="spacer" /><n-button size="tiny" @click="pixels = Math.max(0.2, pixels / 1.4)">−</n-button><n-button size="tiny" @click="pixels = Math.min(30, pixels * 1.4)">+</n-button>
    </template></div>
    <template v-if="!collapsed"><div class="timeline-body"><div class="track-labels"><div class="track-ruler-label">属性</div><div v-for="track in tracks" :key="track.channel" class="track-label" :class="{ active: channel === track.channel }" @click="channel = track.channel">{{ track.channel }} <small>{{ track.curve?.keys.length ?? 0 }}</small></div></div>
      <div class="tracks-scroll"><div class="tracks-surface" :style="{ width: `${width}px` }">
        <div class="time-ruler" @pointerdown="rulerDown" @pointermove="($event.buttons & 1) && scrub(timeAt($event))"><span v-for="i in Math.floor((range.end - range.start) / 30) + 1" :key="i" :style="{ left: `${(i - 1) * 30 * pixels}px` }">{{ range.start + (i - 1) * 30 }}</span></div>
        <div v-for="track in tracks" :key="track.channel" class="track-lane" :class="{ active: channel === track.channel }" @pointerdown="channel = track.channel; rulerDown($event)" @pointermove="($event.buttons & 1) && scrub(timeAt($event))">
          <button v-for="(k, i) in track.curve?.keys ?? []" :key="i" class="keyframe" :class="{ chosen: channel === track.channel && selectedKey === i }" :style="{ left: `${((track.curve!.keys.length === 1 ? range.start : k.frame) - range.start) * pixels}px` }" :title="`${track.channel}: ${k.frame}f = ${k.value}, tangent ${k.tangent}`" @pointerdown="dragKey($event, track.channel, i, track.curve!)" />
        </div><div class="playhead" :style="{ left: `${(e.frame.value - range.start) * pixels}px` }" />
      </div></div></div>
      <CurvePreview v-if="showCurve" :curve="curve" :start="range.start" :end="range.end" :frame="e.frame.value" :revision="e.version.value" @scrub="scrub" @select-key="i => curve && chooseKey(channel, i, curve)" />
      <div class="key-editor"><span>{{ channel }}</span><n-button data-testid="copy-curve" size="tiny" :disabled="!curve" @click="copyCurve">复制曲线</n-button><n-button data-testid="paste-curve" size="tiny" :disabled="!curve || !copiedCurve || copiedCurve.channel !== channel || !!(e.selected.value!.flags & 32)" :title="copiedCurve ? `替换整条 ${copiedCurve.channel} 曲线（${copiedCurve.keys.length} 个键）` : '先复制同名轨道曲线'" @click="pasteCurve">替换曲线</n-button><n-button data-testid="previous-key" size="tiny" :disabled="previousKey < 0" @click="jumpKey(previousKey)">◀◆</n-button><n-button data-testid="next-key" size="tiny" :disabled="nextKey < 0" @click="jumpKey(nextKey)">◆▶</n-button><n-button data-testid="add-key" size="tiny" :disabled="!curve || !!(e.selected.value!.flags & 32)" @click="addKey">＋关键帧</n-button><n-button data-testid="delete-key" size="tiny" :disabled="!key || !!(e.selected.value!.flags & 32)" @click="deleteKey">删除</n-button>
        <template v-if="key"><label v-for="field in (['frame', 'value', 'tangent'] as const)" :key="field">{{ field }}<n-input-number :data-key-field="field" size="tiny" :value="key[field]" :show-button="false" :disabled="!!(e.selected.value!.flags & 32) || (field === 'frame' && curve!.keys.length === 1)" @update:value="editKey(field, $event)" /></label></template><span v-else class="muted">选择 ◆ 编辑时间 / 数值 / Hermite 切线，拖动 ◆ 改时间</span>
      </div>
      <div class="key-editor"><span>整轨重定时（首键为轴）</span><label>时间倍率<n-input-number data-testid="retime-scale" size="tiny" v-model:value="timeScale" :min="0.001" :show-button="false" /></label><label>偏移 f<n-input-number data-testid="retime-shift" size="tiny" v-model:value="timeShift" :show-button="false" /></label><n-button data-testid="retime-apply" size="tiny" :disabled="!curve || curve.keys.length < 2 || !!(e.selected.value!.flags & 32)" @click="retime">应用重定时</n-button></div>
    </template>
  </section>
</template>
