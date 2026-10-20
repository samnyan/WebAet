<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCheckbox, NPopover } from 'naive-ui'
import type { Editor } from '../../editor/state'
import MenuCharacterPreview from './MenuCharacterPreview.vue'
import { translationGizmo, localTranslation } from '../../editor/translationGizmo'
import { previewTranslation } from '../../editor/translationPreview'
import { pointerAngle, angleDelta, rotationPreview } from '../../editor/rotationGizmo'
import { sampleCurve } from '../../core/animation/curves'
import { scalePreview } from '../../editor/scaleEditing'
import { createSceneEvaluator } from '../../core/render/evaluate'
import { createInstanceEvaluator } from '../../core/render/instances'
import { renderSceneFrame } from '../../core/render/frame'
import { drawItems, hitTest, type HitArea } from '../../core/render/canvas'
import {
  identity4,
  multiply4,
  layerMatrix4,
  orthographicMatrix,
} from '../../core/animation/transform3d'
import { observationMatrix, drawSpatialGuides } from '../../core/render/observation'
const { editor: e } = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ warnings: [warnings: string[]] }>()
const canvas = ref<HTMLCanvasElement>(),
  host = ref<HTMLElement>(),
  zoom = ref(1),
  pan = ref({ x: 0, y: 0 }),
  wireframe = ref(false),
  isolate = ref(false)
const perspective = ref(false),
  transparentExport = ref(false)
const view3D = ref(false),
  yaw = ref(25),
  pitch = ref(-20)
const evaluator = computed(() => {
  e.version.value
  return e.scene.value ? createSceneEvaluator(e.scene.value) : null
})
const secondaryChoice = ref('')
const secondaryLayers = computed(() => {
  e.version.value
  const names = ['arcade_mode_on', 'arcade_mode_off', 'mix_mode_on', 'mix_mode_off']
  const layers = names.map((name) =>
    e.composition.value?.layers.find(
      (l) => l.itemType === 3 && l.name === `nsw_menu_selector_${name}`,
    ),
  )
  return layers.every((l) => l !== undefined) ? layers : []
})
const instanceEvaluator = computed(() => {
  e.version.value
  return e.scene.value ? createInstanceEvaluator(e.scene.value) : null
})
const secondaryEnabled = computed(
  () =>
    !!secondaryChoice.value &&
    secondaryLayers.value.length === 4 &&
    !view3D.value &&
    !isolate.value,
)
watch(
  () => [e.doc.value, e.sceneIndex.value, e.compositionId.value],
  () => {
    secondaryChoice.value = ''
  },
)
let resize: ResizeObserver,
  hits: HitArea[] = [],
  scale = 1,
  origin = { x: 0, y: 0 },
  raf = 0
let axisDrag: {
  id: number
  axis: 'x' | 'y' | 'rotate' | 'scale'
  factor?: number
  angle: number
  appliedAngle?: number
  lastAngle: number
  initialRotation: number
  pivot: { x: number; y: number }
  parent: readonly number[]
  linear?: readonly number[]
  x: number
  y: number
  dx: number
  dy: number
  layer: number
  inverse: readonly number[]
} | null = null
let gizmoPoint: ReturnType<typeof translationGizmo> = null
function cancelAxis() {
  axisDrag = null
  down = null
  schedule()
}
watch(
  () => [
    e.version.value,
    e.workspace.docSession.value,
    e.sceneIndex.value,
    e.compositionId.value,
    e.selectedId.value,
    e.frame.value,
    e.busy.value,
    view3D.value,
    secondaryEnabled.value,
  ],
  cancelAxis,
  { flush: 'sync' },
)
watch(
  [zoom, pan],
  () => {
    if (axisDrag) cancelAxis()
  },
  { flush: 'sync' },
)
let previousWarnings: string[] = []
function draw() {
  const c = canvas.value,
    bounds = host.value?.getBoundingClientRect()
  if (!c || !bounds) return
  const ratio = devicePixelRatio || 1,
    width = Math.round(bounds.width * ratio),
    height = Math.round(bounds.height * ratio)
  if (c.width !== width || c.height !== height) {
    c.width = width
    c.height = height
  }
  const ctx = c.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, bounds.width, bounds.height)
  ctx.fillStyle = '#171a20'
  ctx.fillRect(0, 0, bounds.width, bounds.height)
  const s = e.scene.value
  if (!s) {
    gizmoPoint = null
    hits = []
    previousWarnings = []
    emit('warnings', [])
    return
  }
  scale = Math.min((bounds.width - 48) / s.width, (bounds.height - 48) / s.height) * zoom.value
  origin = {
    x: (bounds.width - s.width * scale) / 2 + pan.value.x,
    y: (bounds.height - s.height * scale) / 2 + pan.value.y,
  }
  ctx.translate(origin.x, origin.y)
  ctx.scale(scale, scale)
  if (!view3D.value) {
    ctx.fillStyle = `rgb(${s.color[0]},${s.color[1]},${s.color[2]})`
    ctx.fillRect(0, 0, s.width, s.height)
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, s.width, s.height)
  if (!view3D.value) ctx.clip()
  const evaluated = secondaryEnabled.value
    ? instanceEvaluator.value!([
        // Preserve unrelated ROOT content; the two preview objects are explicitly
        // drawn above it. This is not a claim about the game's object draw order.
        {
          composition: e.compositionId.value,
          frame: e.frame.value,
          branch: null,
          hidden: new Set([...e.hidden.value, ...secondaryLayers.value.map((l) => l!.offset)]),
        },
        {
          composition: e.compositionId.value,
          frame: 6,
          branch: secondaryLayers.value[secondaryChoice.value === 'arcade' ? 3 : 1]!.offset,
          hidden: e.hidden.value,
        },
        {
          composition: e.compositionId.value,
          frame: Math.max(10, Math.min(90, e.frame.value)),
          branch: secondaryLayers.value[secondaryChoice.value === 'arcade' ? 0 : 2]!.offset,
          hidden: e.hidden.value,
        },
      ])
    : evaluator.value!(
        e.compositionId.value,
        e.frame.value,
        e.hidden.value,
        isolate.value ? e.selectedId.value : null,
        view3D.value ? observationMatrix(s.width, s.height, yaw.value, pitch.value) : identity4(),
        view3D.value && perspective.value
          ? { x: s.width / 2, y: s.height / 2, distance: Math.max(s.width, s.height) * 1.5 }
          : undefined,
      )
  const previewItems =
    axisDrag && e.composition.value
      ? previewTranslation(
          evaluated.items,
          e.composition.value,
          axisDrag.layer,
          axisDrag.dx,
          axisDrag.dy,
          axisDrag.linear,
        )
      : evaluated.items
  const result = drawItems(ctx, previewItems, e.library, e.selectedId.value, wireframe.value)
  hits = result.hits
  ctx.restore()
  if (view3D.value && !perspective.value)
    drawSpatialGuides(
      ctx,
      observationMatrix(s.width, s.height, yaw.value, pitch.value),
      s.width,
      s.height,
      scale,
    )
  else if (!view3D.value) {
    ctx.strokeStyle = '#5a6370'
    ctx.lineWidth = 1 / scale
    ctx.strokeRect(0, 0, s.width, s.height)
  }
  gizmoPoint =
    !view3D.value &&
    !secondaryEnabled.value &&
    !e.busy.value &&
    e.composition.value &&
    e.selectedId.value !== null
      ? translationGizmo(e.composition.value, e.selectedId.value, e.frame.value)
      : null
  if (gizmoPoint) {
    const x = gizmoPoint.x + (axisDrag?.linear ? 0 : (axisDrag?.dx ?? 0)),
      y = gizmoPoint.y + (axisDrag?.linear ? 0 : (axisDrag?.dy ?? 0))
    ctx.fillStyle = '#79c6ff'
    ctx.fillRect(x + 46 / scale, y + 46 / scale, 9 / scale, 9 / scale)
    ctx.strokeStyle = '#d8b4fe'
    ctx.lineWidth = 1.5 / scale
    ctx.beginPath()
    ctx.arc(x, y, 68 / scale, 0, Math.PI * 2)
    ctx.stroke()
    if (axisDrag?.axis === 'rotate') {
      const delta = axisDrag.appliedAngle ?? 0
      ctx.fillStyle = '#d8b4fe'
      ctx.font = `${12 / scale}px monospace`
      ctx.fillText(`Δ ${delta.toFixed(1)}°`, x + 74 / scale, y)
    }
    ctx.lineWidth = 2 / scale
    for (const [dx, dy, color] of [
      [52, 0, '#f07d79'],
      [0, -52, '#72c6b2'],
    ] as const) {
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + dx / scale, y + dy / scale)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.fillRect(x + dx / scale - 4 / scale, y + dy / scale - 4 / scale, 8 / scale, 8 / scale)
    }
  }
  const warnings = [...evaluated.warnings, ...result.warnings]
  if (
    warnings.length !== previousWarnings.length ||
    warnings.some((w, i) => w !== previousWarnings[i])
  ) {
    previousWarnings = warnings
    emit('warnings', warnings)
  }
}
function schedule() {
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      draw()
    })
}
watch(
  () => [
    e.version.value,
    e.resourceVersion.value,
    e.doc.value,
    e.sceneIndex.value,
    e.compositionId.value,
    e.selectedId.value,
    e.frame.value,
    e.hidden.value,
    secondaryChoice.value,
    zoom.value,
    pan.value,
    wireframe.value,
    isolate.value,
    view3D.value,
    perspective.value,
    yaw.value,
    pitch.value,
  ],
  schedule,
)
onMounted(() => {
  resize = new ResizeObserver(schedule)
  resize.observe(host.value!)
  schedule()
})
onBeforeUnmount(() => {
  resize?.disconnect()
  cancelAnimationFrame(raf)
})
let down: { x: number; y: number; pan: boolean; rotated?: boolean } | null = null
function pointerDown(event: PointerEvent) {
  if (event.button === 0 && !event.altKey && gizmoPoint && e.selectedId.value !== null) {
    const bounds = canvas.value!.getBoundingClientRect()
    const x = event.clientX - bounds.left - origin.x - gizmoPoint.x * scale
    const y = event.clientY - bounds.top - origin.y - gizmoPoint.y * scale
    const axis =
      Math.abs(y) <= 7 && x >= 12 && x <= 60
        ? 'x'
        : Math.abs(x) <= 7 && y <= -12 && y >= -60
          ? 'y'
          : Math.abs(x - 50) <= 9 && Math.abs(y - 50) <= 9
            ? 'scale'
            : Math.abs(Math.hypot(x, y) - 68) <= 7
              ? 'rotate'
              : null
    if (axis) {
      e.workspace.requestPause()
      canvas.value!.focus()
      canvas.value!.setPointerCapture(event.pointerId)
      axisDrag = {
        id: event.pointerId,
        axis,
        angle: 0,
        lastAngle: pointerAngle(gizmoPoint.inverse, x, y),
        initialRotation: sampleCurve(
          e.composition.value!.layers.find((l) => l.offset === e.selectedId.value)!.video!.curves
            .rotation,
          e.frame.value,
        ),
        pivot: { x: gizmoPoint.x, y: gizmoPoint.y },
        parent: gizmoPoint.parent,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        dy: 0,
        layer: e.selectedId.value,
        inverse: gizmoPoint.inverse,
      }
      down = null
      event.preventDefault()
      return
    }
  }
  down = { x: event.clientX, y: event.clientY, pan: event.button === 1 || event.altKey }
  canvas.value?.setPointerCapture(event.pointerId)
  if (down.pan) event.preventDefault()
}
function pointerMove(event: PointerEvent) {
  if (axisDrag?.id === event.pointerId) {
    if (axisDrag.axis === 'scale') {
      const d = axisDrag
      const factor = Math.max(
        0.01,
        Math.min(100, Math.exp((event.clientX - d.x - event.clientY + d.y) / 100)),
      )
      d.factor = factor
      const preview = scalePreview(factor, d.pivot.x, d.pivot.y)
      d.linear = preview.linear
      d.dx = preview.dx
      d.dy = preview.dy
      schedule()
      return
    }
    if (axisDrag.axis === 'rotate') {
      const bounds = canvas.value!.getBoundingClientRect(),
        d = axisDrag
      const angle = pointerAngle(
        d.inverse,
        (event.clientX - bounds.left - origin.x) / scale - d.pivot.x,
        (event.clientY - bounds.top - origin.y) / scale - d.pivot.y,
      )
      d.angle += angleDelta(d.lastAngle, angle)
      d.lastAngle = angle
      const value = event.shiftKey
        ? Math.round((d.initialRotation + d.angle) / 15) * 15
        : d.initialRotation + d.angle
      d.appliedAngle = value - d.initialRotation
      const preview = rotationPreview(
        d.parent,
        d.inverse,
        value - d.initialRotation,
        d.pivot.x,
        d.pivot.y,
      )
      d.linear = preview.linear
      d.dx = preview.dx
      d.dy = preview.dy
      schedule()
      return
    }
    axisDrag.dx = axisDrag.axis === 'x' ? (event.clientX - axisDrag.x) / scale : 0
    axisDrag.dy = axisDrag.axis === 'y' ? (event.clientY - axisDrag.y) / scale : 0
    schedule()
    return
  }
  if (down && view3D.value && !down.pan) {
    down.rotated = true
    yaw.value += (event.clientX - down.x) * 0.4
    pitch.value = Math.max(-89, Math.min(89, pitch.value + (event.clientY - down.y) * 0.4))
    down.x = event.clientX
    down.y = event.clientY
    return
  }
  if (!down?.pan) return
  pan.value = { x: pan.value.x + event.clientX - down.x, y: pan.value.y + event.clientY - down.y }
  down.x = event.clientX
  down.y = event.clientY
}
function pointerUp(event: PointerEvent) {
  if (axisDrag?.id === event.pointerId) {
    pointerMove(event)
    const drag = axisDrag
    cancelAxis()
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 3) {
      if (drag.axis === 'scale') {
        e.scaleLayer(drag.layer, drag.factor ?? 1)
      } else if (drag.axis === 'rotate') {
        const raw = drag.initialRotation + drag.angle
        e.actions.setValue(
          {
            sceneIndex: e.sceneIndex.value,
            compositionId: e.compositionId.value,
            layerId: drag.layer,
            kind: 'channel',
            channel: 'rotation',
          },
          event.shiftKey ? Math.round(raw / 15) * 15 : raw,
        )
      } else {
        const local = localTranslation(drag.inverse, drag.dx, drag.dy)
        e.translateLayer(drag.layer, local.x, local.y)
      }
    }
    return
  }
  if (!down || down.pan || down.rotated) {
    down = null
    return
  }
  const bounds = canvas.value!.getBoundingClientRect(),
    dx = (event.clientX - down.x) / scale,
    dy = (event.clientY - down.y) / scale
  const hit = hitTest(
    hits,
    (down.x - bounds.left - origin.x) / scale,
    (down.y - bounds.top - origin.y) / scale,
  )
  if (hit) {
    // Select the immediate instance in the current composition, not its leaf.
    const layer = e.composition.value?.layers.find((l) => l.offset === hit.path[0])
    if (!layer) {
      down = null
      return
    }
    e.actions.selectLayer({
      sceneIndex: e.sceneIndex.value,
      compositionId: e.compositionId.value,
      layerId: layer.offset,
    })
    if (
      !secondaryEnabled.value &&
      !view3D.value &&
      Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 5 &&
      e.composition.value?.layers.some((l) => l.offset === layer.offset)
    ) {
      let parent = layer.parent,
        world = identity4(),
        seen = new Set<number>()
      const chain = []
      while (parent && !seen.has(parent)) {
        seen.add(parent)
        const l = e.composition.value.layers.find((l) => l.offset === parent)
        if (!l) break
        chain.unshift(l)
        parent = l.parent
      }
      for (const l of chain) world = multiply4(world, layerMatrix4(l, e.frame.value))
      const matrix = orthographicMatrix(world)
      const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2]
      if (Math.abs(determinant) > 1e-9)
        e.translateLayer(
          layer.offset,
          (matrix[3] * dx - matrix[2] * dy) / determinant,
          (-matrix[1] * dx + matrix[0] * dy) / determinant,
        )
    }
  } else e.actions.selectLayer(null)
  down = null
}
function focusSelected() {
  const bounds = host.value?.getBoundingClientRect(),
    scene = e.scene.value
  const points = hits
    .filter(
      (h) =>
        h.item.path.includes(e.selectedId.value ?? -1) ||
        h.item.mask?.path.includes(e.selectedId.value ?? -1),
    )
    .flatMap((h) => h.points)
  if (!bounds || !scene || !points.length) return
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y)
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys)
  if (![left, right, top, bottom].every(Number.isFinite)) return
  const base = Math.min((bounds.width - 48) / scene.width, (bounds.height - 48) / scene.height)
  const fit = Math.min(
    (bounds.width - 80) / Math.max(1, right - left),
    (bounds.height - 80) / Math.max(1, bottom - top),
  )
  zoom.value = Math.max(0.1, Math.min(8, fit / base))
  const nextScale = base * zoom.value
  pan.value = {
    x: (scene.width / 2 - (left + right) / 2) * nextScale,
    y: (scene.height / 2 - (top + bottom) / 2) * nextScale,
  }
}
async function exportPreview(branch = false) {
  if (!e.scene.value || !canvas.value) return
  try {
    if (branch && e.selectedId.value === null) return
    let target: HTMLCanvasElement
    {
      const result = renderSceneFrame(
        e.scene.value,
        e.compositionId.value,
        e.frame.value,
        e.library,
        transparentExport.value,
        branch ? e.selectedId.value : null,
      )
      target = result.canvas
      e.notices.value = result.warnings.map((w) => `场景 PNG: ${w}`)
    }
    const name =
      `${e.doc.value!.name.replace(/\.bin$/i, '')}_${e.scene.value.name}_${branch ? `branch-${e.selectedId.value}` : 'scene'}${transparentExport.value ? '-transparent' : ''}_${e.frame.value.toFixed(2)}f.png`.replace(
        /[<>:"/\\|?*\x00-\x1f]/g,
        '_',
      )
    const blob = await new Promise<Blob>((resolve, reject) =>
      target.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png'),
    )
    const url = URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  } catch (err) {
    e.error.value = String(err)
  }
}
function wheelZoom(event: WheelEvent) {
  const bounds = host.value?.getBoundingClientRect(),
    scene = e.scene.value
  if (!bounds || !scene || !Number.isFinite(event.deltaY) || event.deltaY === 0) return
  const next = Math.max(0.1, Math.min(8, zoom.value * (event.deltaY < 0 ? 1.1 : 0.9)))
  const ratio = next / zoom.value
  const x = event.clientX - bounds.left - bounds.width / 2
  const y = event.clientY - bounds.top - bounds.height / 2
  pan.value = { x: x - (x - pan.value.x) * ratio, y: y - (y - pan.value.y) * ratio }
  zoom.value = next
}
function preset(y: number, p: number) {
  yaw.value = y
  pitch.value = p
  perspective.value = false
}
function reset() {
  yaw.value = 25
  pitch.value = -20
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}
</script>
<template>
  <section class="stage-panel">
    <div class="stage-toolbar">
      <n-button data-testid="view-mode" size="tiny" @click="view3D = !view3D">{{
        view3D ? '3D View' : '2D View'
      }}</n-button>
      <template v-if="view3D"
        ><n-button size="tiny" @click="preset(0, 0)">正面</n-button
        ><n-button size="tiny" @click="preset(90, 0)">右侧</n-button
        ><n-button size="tiny" @click="preset(0, -90)">顶面</n-button
        ><n-checkbox v-model:checked="perspective" size="small">透视（近似）</n-checkbox></template
      >
      <span>{{ e.scene.value?.width ?? '—' }} × {{ e.scene.value?.height ?? '—' }}</span
      ><n-checkbox v-model:checked="wireframe" size="small">Wireframe</n-checkbox
      ><n-checkbox v-model:checked="isolate" size="small">Isolate</n-checkbox>
      <div class="spacer" />
      <n-button size="tiny" @click="reset">适应画布</n-button
      ><n-button size="tiny" @click="zoom = Math.max(0.1, zoom / 1.2)">−</n-button
      ><span>{{ Math.round(zoom * 100) }}%</span
      ><n-button size="tiny" @click="zoom = Math.min(8, zoom * 1.2)">+</n-button>
      <n-button
        data-testid="focus-selected"
        size="tiny"
        :disabled="e.selectedId.value === null"
        @click="focusSelected"
        >聚焦选中</n-button
      >
      <n-popover trigger="click" placement="bottom-end" :show-arrow="false"
        ><template #trigger
          ><n-button size="tiny" :disabled="!e.scene.value || e.busy.value"
            >导出PNG ▾</n-button
          ></template
        >
        <div class="png-menu">
          <n-button
            text
            :disabled="!e.scene.value || e.busy.value"
            @click="e.runOperation('导出场景PNG', () => exportPreview(false))"
            >导出场景PNG</n-button
          >
          <n-button
            text
            :disabled="!e.scene.value || e.selectedId.value === null || e.busy.value"
            title="导出选中分支，保留父级变换及遮罩"
            @click="e.runOperation('导出组件PNG', () => exportPreview(true))"
            >导出组件PNG</n-button
          >
          <n-checkbox v-model:checked="transparentExport" :disabled="e.busy.value" size="small"
            >透明底</n-checkbox
          >
        </div></n-popover
      >
    </div>
    <MenuCharacterPreview :editor="e" />
    <div v-if="secondaryLayers.length" class="branch-hint">
      <label
        >子菜单（部分模拟）
        <select
          data-testid="secondary-preview"
          v-model="secondaryChoice"
          :disabled="e.busy.value || view3D || isolate"
        >
          <option value="">原始分支 / 单时钟</option>
          <option value="arcade">Arcade on + Mix off</option>
          <option value="mix">Mix on + Arcade off</option>
        </select></label
      >
      <span
        >仅 2D 非隔离，暂停画布拖动编辑；on 帧限制 10–90，off 固定 6；叠于其他 UI
        之上，游戏顺序未核对。文字/版本/切换动画不模拟；原生场景 PNG 仍为原始合成。</span
      >
    </div>

    <div ref="host" class="stage-host">
      <canvas
        ref="canvas"
        data-testid="aet-stage"
        tabindex="0"
        @keydown.esc.stop.prevent="cancelAxis"
        @lostpointercapture="cancelAxis"
        @pointerdown="pointerDown"
        @pointermove="pointerMove"
        @pointerup="pointerUp"
        @pointercancel="cancelAxis"
        @wheel.prevent="wheelZoom"
      />
    </div>
    <footer>
      {{
        view3D
          ? '3D 自由观察 · 左键拖动旋转 · 仅改变观察相机，不修改资源 · 尚无完整 AET 相机透视'
          : '2D · 拖动图层编辑位置'
      }}
      · 滚轮缩放 · 中键 / Alt 拖动平移 · 单击选择
    </footer>
  </section>
</template>
