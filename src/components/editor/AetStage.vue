<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCheckbox } from 'naive-ui'
import type { Editor } from '../../editor/state'
import { evaluateScene } from '../../core/render/evaluate'
import { drawItems, hitTest, type HitArea } from '../../core/render/canvas'
import { identity4, multiply4, layerMatrix4, orthographicMatrix } from '../../core/animation/transform3d'
import { observationMatrix, drawSpatialGuides } from '../../core/render/observation'
const { editor: e } = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ warnings: [warnings: string[]] }>()
const canvas = ref<HTMLCanvasElement>(), host = ref<HTMLElement>(), zoom = ref(1), pan = ref({ x: 0, y: 0 }), wireframe = ref(false), isolate = ref(false)
const perspective = ref(false)
const view3D = ref(false), yaw = ref(25), pitch = ref(-20)
let resize: ResizeObserver, hits: HitArea[] = [], scale = 1, origin = { x: 0, y: 0 }, raf = 0
function draw() {
  const c = canvas.value, bounds = host.value?.getBoundingClientRect(); if (!c || !bounds) return
  const ratio = devicePixelRatio || 1; c.width = Math.round(bounds.width * ratio); c.height = Math.round(bounds.height * ratio)
  const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio); ctx.fillStyle = '#171a20'; ctx.fillRect(0, 0, bounds.width, bounds.height)
  const s = e.scene.value; if (!s) return
  scale = Math.min((bounds.width - 48) / s.width, (bounds.height - 48) / s.height) * zoom.value
  origin = { x: (bounds.width - s.width * scale) / 2 + pan.value.x, y: (bounds.height - s.height * scale) / 2 + pan.value.y }
  ctx.translate(origin.x, origin.y); ctx.scale(scale, scale)
  if (!view3D.value) { ctx.fillStyle = `rgb(${s.color[0]},${s.color[1]},${s.color[2]})`; ctx.fillRect(0, 0, s.width, s.height) }
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, s.width, s.height); if (!view3D.value) ctx.clip()
  const evaluated = evaluateScene(s, e.compositionId.value, e.frame.value, e.hidden.value, isolate.value ? e.selectedId.value : null, view3D.value ? observationMatrix(s.width, s.height, yaw.value, pitch.value) : identity4(), view3D.value && perspective.value ? { x: s.width / 2, y: s.height / 2, distance: Math.max(s.width, s.height) * 1.5 } : undefined)
  const result = drawItems(ctx, evaluated.items, e.library, e.selectedId.value, wireframe.value); hits = result.hits
  ctx.restore()
  if (view3D.value && !perspective.value) drawSpatialGuides(ctx, observationMatrix(s.width, s.height, yaw.value, pitch.value), s.width, s.height, scale)
  else if (!view3D.value) { ctx.strokeStyle = '#5a6370'; ctx.lineWidth = 1 / scale; ctx.strokeRect(0, 0, s.width, s.height) }
  emit('warnings', [...evaluated.warnings, ...result.warnings])
}
function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw) }
watch(() => [e.version.value, e.resourceVersion.value, e.doc.value, e.sceneIndex.value, e.compositionId.value, e.selectedId.value, e.frame.value, e.hidden.value, zoom.value, pan.value, wireframe.value, isolate.value, view3D.value, perspective.value, yaw.value, pitch.value], schedule)
onMounted(() => { resize = new ResizeObserver(schedule); resize.observe(host.value!); schedule() })
onBeforeUnmount(() => { resize?.disconnect(); cancelAnimationFrame(raf) })
let down: { x: number; y: number; pan: boolean; rotated?: boolean } | null = null
function pointerDown(event: PointerEvent) { down = { x: event.clientX, y: event.clientY, pan: event.button === 1 || event.altKey }; canvas.value?.setPointerCapture(event.pointerId); if (down.pan) event.preventDefault() }
function pointerMove(event: PointerEvent) {
  if (down && view3D.value && !down.pan) { down.rotated = true; yaw.value += (event.clientX - down.x) * 0.4; pitch.value = Math.max(-89, Math.min(89, pitch.value + (event.clientY - down.y) * 0.4)); down.x = event.clientX; down.y = event.clientY; return }
  if (!down?.pan) return; pan.value = { x: pan.value.x + event.clientX - down.x, y: pan.value.y + event.clientY - down.y }; down.x = event.clientX; down.y = event.clientY }
function pointerUp(event: PointerEvent) {
  if (!down || down.pan || down.rotated) { down = null; return }
  const bounds = canvas.value!.getBoundingClientRect(), dx = (event.clientX - down.x) / scale, dy = (event.clientY - down.y) / scale
  const hit = hitTest(hits, (down.x - bounds.left - origin.x) / scale, (down.y - bounds.top - origin.y) / scale)
  if (hit) {
    e.selectedId.value = hit.layer.offset
    if (!view3D.value && Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 5 && e.composition.value?.layers.some(l => l.offset === hit.layer.offset)) {
      let parent = hit.layer.parent, world = identity4(), seen = new Set<number>()
      const chain = []
      while (parent && !seen.has(parent)) { seen.add(parent); const l = e.composition.value.layers.find(l => l.offset === parent); if (!l) break; chain.unshift(l); parent = l.parent }
      for (const l of chain) world = multiply4(world, layerMatrix4(l, e.frame.value))
      const matrix = orthographicMatrix(world)
      const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2]
      if (Math.abs(determinant) > 1e-9) e.translateLayer(hit.layer.offset, (matrix[3] * dx - matrix[2] * dy) / determinant, (-matrix[1] * dx + matrix[0] * dy) / determinant)
    }
  } else e.selectedId.value = null
  down = null
}
function preset(y: number, p: number) { yaw.value = y; pitch.value = p; perspective.value = false }
function reset() { yaw.value = 25; pitch.value = -20; zoom.value = 1; pan.value = { x: 0, y: 0 } }
</script>
<template>
  <section class="stage-panel">
    <div class="stage-toolbar"><n-button data-testid="view-mode" size="tiny" @click="view3D = !view3D">{{ view3D ? '3D View' : '2D View' }}</n-button><template v-if="view3D"><n-button data-testid="view-front" size="tiny" @click="preset(0, 0)">正面</n-button><n-button data-testid="view-right" size="tiny" @click="preset(90, 0)">右侧</n-button><n-button data-testid="view-top" size="tiny" @click="preset(0, -90)">顶面</n-button></template><n-checkbox v-if="view3D" data-testid="perspective" v-model:checked="perspective" size="small">透视（近似）</n-checkbox><span>{{ e.scene.value?.width ?? '—' }} × {{ e.scene.value?.height ?? '—' }}</span><n-checkbox v-model:checked="wireframe" size="small">Wireframe</n-checkbox><n-checkbox v-model:checked="isolate" size="small">Isolate</n-checkbox><div class="spacer" /><n-button size="tiny" @click="zoom = Math.max(0.1, zoom / 1.2)">−</n-button><span>{{ Math.round(zoom * 100) }}%</span><n-button size="tiny" @click="zoom = Math.min(8, zoom * 1.2)">+</n-button><n-button size="tiny" @click="reset">适应画布</n-button></div>
    <div ref="host" class="stage-host"><canvas ref="canvas" data-testid="aet-stage" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="down = null" @wheel.prevent="zoom = Math.max(0.1, Math.min(8, zoom * ($event.deltaY < 0 ? 1.1 : 0.9)))" /></div>
    <footer>{{ view3D ? '3D 自由观察 · 左键拖动旋转 · 仅改变观察相机，不修改资源 · 尚无 AET 相机透视' : '2D · 拖动图层编辑位置' }} · 滚轮缩放 · 中键 / Alt 拖动平移 · 单击选择</footer>
  </section>
</template>
