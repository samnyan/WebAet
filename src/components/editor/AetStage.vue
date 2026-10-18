<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCheckbox } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { evaluateScene } from '../../core/render/evaluate'
import { drawItems, hitTest, type HitArea } from '../../core/render/canvas'
const { editor: e } = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ warnings: [warnings: string[]] }>()
const canvas = ref<HTMLCanvasElement>(), host = ref<HTMLElement>(), zoom = ref(1), pan = ref({ x: 0, y: 0 }), wireframe = ref(false)
let resize: ResizeObserver, hits: HitArea[] = [], scale = 1, origin = { x: 0, y: 0 }, raf = 0
function draw() {
  const c = canvas.value, bounds = host.value?.getBoundingClientRect(); if (!c || !bounds) return
  const ratio = devicePixelRatio || 1; c.width = Math.round(bounds.width * ratio); c.height = Math.round(bounds.height * ratio)
  const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio); ctx.fillStyle = '#171a20'; ctx.fillRect(0, 0, bounds.width, bounds.height)
  const s = e.scene.value; if (!s) return
  scale = Math.min((bounds.width - 48) / s.width, (bounds.height - 48) / s.height) * zoom.value
  origin = { x: (bounds.width - s.width * scale) / 2 + pan.value.x, y: (bounds.height - s.height * scale) / 2 + pan.value.y }
  ctx.translate(origin.x, origin.y); ctx.scale(scale, scale)
  ctx.fillStyle = `rgb(${s.color[0]},${s.color[1]},${s.color[2]})`; ctx.fillRect(0, 0, s.width, s.height)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, s.width, s.height); ctx.clip()
  const evaluated = evaluateScene(s, e.compositionId.value, e.frame.value, e.hidden.value)
  const result = drawItems(ctx, evaluated.items, e.library, e.selectedId.value, wireframe.value); hits = result.hits
  ctx.restore(); ctx.strokeStyle = '#5a6370'; ctx.lineWidth = 1 / scale; ctx.strokeRect(0, 0, s.width, s.height)
  emit('warnings', [...evaluated.warnings, ...result.warnings])
}
function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw) }
watch(() => [e.version.value, e.resourceVersion.value, e.doc.value, e.sceneIndex.value, e.compositionId.value, e.selectedId.value, e.frame.value, e.hidden.value, zoom.value, pan.value, wireframe.value], schedule)
onMounted(() => { resize = new ResizeObserver(schedule); resize.observe(host.value!); schedule() })
onBeforeUnmount(() => { resize?.disconnect(); cancelAnimationFrame(raf) })
let down: { x: number; y: number; pan: boolean } | null = null
function pointerDown(event: PointerEvent) { down = { x: event.clientX, y: event.clientY, pan: event.button === 1 || event.altKey }; canvas.value?.setPointerCapture(event.pointerId); if (down.pan) event.preventDefault() }
function pointerMove(event: PointerEvent) { if (!down?.pan) return; pan.value = { x: pan.value.x + event.clientX - down.x, y: pan.value.y + event.clientY - down.y }; down.x = event.clientX; down.y = event.clientY }
function pointerUp(event: PointerEvent) { if (down && !down.pan && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) { const b = canvas.value!.getBoundingClientRect(); const hit = hitTest(hits, (event.clientX - b.left - origin.x) / scale, (event.clientY - b.top - origin.y) / scale); e.selectedId.value = hit?.layer.offset ?? null }; down = null }
function reset() { zoom.value = 1; pan.value = { x: 0, y: 0 } }
</script>
<template>
  <section class="stage-panel">
    <div class="stage-toolbar"><span>{{ e.scene.value?.width ?? '—' }} × {{ e.scene.value?.height ?? '—' }}</span><n-checkbox v-model:checked="wireframe" size="small">Wireframe</n-checkbox><div class="spacer" /><n-button size="tiny" @click="zoom = Math.max(0.1, zoom / 1.2)">−</n-button><span>{{ Math.round(zoom * 100) }}%</span><n-button size="tiny" @click="zoom = Math.min(8, zoom * 1.2)">+</n-button><n-button size="tiny" @click="reset">适应画布</n-button></div>
    <div ref="host" class="stage-host"><canvas ref="canvas" data-testid="aet-stage" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="down = null" @wheel.prevent="zoom = Math.max(0.1, Math.min(8, zoom * ($event.deltaY < 0 ? 1.1 : 0.9)))" /></div>
    <footer>滚轮缩放 · 中键 / Alt 拖动平移 · 单击选择图层</footer>
  </section>
</template>
