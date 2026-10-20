<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NModal,
  NDialog,
  NRadioGroup,
  NRadioButton,
  NInputNumber,
  NButton,
  NSpace,
  NDivider,
  NTabs,
  NTabPane,
  NAlert,
  NTag,
} from 'naive-ui'
import type { Editor } from '../../editor/state'
import {
  resolveCurve,
  resolveLayer,
  channelLabels,
} from '../../editor/properties'
import {
  copyCurve,
  canPasteCurve,
  pasteCurve,
  restoreCurve,
  makeConstant,
  reverseCurve,
  offsetValues,
  retimeCurve,
  retimeLayer,
  getCopiedCurve,
} from '../../editor/animationTools'
import { retimeKeys } from '../../core/animation/retime'

const props = defineProps<{
  editor: Editor
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const e = computed(() => props.editor)

// Capture context when opened to guard against stale edits
let capturedCompId = -1
let capturedLayerId = -1
let capturedRevision = -1

const activeTab = ref<'retime' | 'offset' | 'reverse' | 'quick'>('retime')
const scope = ref<'property' | 'layer'>('property')

const timeScale = ref(1)
const timeShift = ref(0)
const valueDelta = ref(0)

const activeProperty = computed(() => e.value.workspace.activeProperty.value)
const activeLayerRef = computed(() => {
  if (e.value.workspace.activeLayerRef.value) {
    return e.value.workspace.activeLayerRef.value
  }
  if (activeProperty.value) {
    return {
      sceneIndex: activeProperty.value.sceneIndex,
      compositionId: activeProperty.value.compositionId,
      layerId: activeProperty.value.layerId,
    }
  }
  return null
})

const currentLayer = computed(() => {
  e.value.version.value
  return resolveLayer(e.value, activeLayerRef.value)
})

const isLayerLocked = computed(() => Boolean(currentLayer.value && (currentLayer.value.flags & 32)))

const channelPropertyRef = computed(() => {
  const p = activeProperty.value
  return p && p.kind === 'channel' ? p : null
})

const activeCurve = computed(() => {
  e.value.version.value
  return channelPropertyRef.value ? resolveCurve(e.value, channelPropertyRef.value) : undefined
})

const propertyKeyCount = computed(() => activeCurve.value?.keys.length ?? 0)

const layerAnimatedTracksCount = computed(() => {
  e.value.version.value
  const l = currentLayer.value
  if (!l?.video) return 0
  let count = 0
  for (const c of Object.values(l.video.curves)) {
    if (c && c.keys.length > 1) count++
  }
  if (l.video.extra) {
    for (const c of Object.values(l.video.extra)) {
      if (c && (c as any).keys?.length > 1) count++
    }
  }
  return count
})

const canRetimeProperty = computed(() => {
  return Boolean(channelPropertyRef.value && propertyKeyCount.value >= 2 && !isLayerLocked.value)
})

const canRetimeLayerScope = computed(() => {
  return Boolean(currentLayer.value?.video && layerAnimatedTracksCount.value > 0 && !isLayerLocked.value)
})

// Initialize state on open
watch(
  () => props.show,
  show => {
    if (show) {
      capturedCompId = e.value.compositionId.value
      capturedLayerId = activeLayerRef.value?.layerId ?? -1
      capturedRevision = e.value.version.value

      timeScale.value = 1
      timeShift.value = 0
      valueDelta.value = 0

      if (canRetimeProperty.value) {
        scope.value = 'property'
      } else if (canRetimeLayerScope.value) {
        scope.value = 'layer'
      } else {
        scope.value = 'property'
      }
    }
  }
)

// Close dialog if active composition, layer or revision changes
watch(
  [() => e.value.compositionId.value, () => activeLayerRef.value?.layerId, () => e.value.version.value],
  ([comp, layer, rev]) => {
    if (props.show && (comp !== capturedCompId || layer !== capturedLayerId || rev !== capturedRevision)) {
      emit('update:show', false)
    }
  }
)

// Retime preview summary
const retimePreview = computed(() => {
  if (scope.value === 'property') {
    const keys = activeCurve.value?.keys
    if (!keys || keys.length < 2) return null
    const oldStart = keys[0]!.frame
    const oldEnd = keys[keys.length - 1]!.frame
    try {
      const preview = retimeKeys(keys, timeScale.value, timeShift.value)
      const newStart = preview[0]!.frame
      const newEnd = preview[preview.length - 1]!.frame
      return {
        keysCount: keys.length,
        oldRange: `${oldStart.toFixed(1)} ~ ${oldEnd.toFixed(1)} f`,
        newRange: `${newStart.toFixed(1)} ~ ${newEnd.toFixed(1)} f`,
      }
    } catch {
      return null
    }
  } else {
    return {
      tracksCount: layerAnimatedTracksCount.value,
    }
  }
})

function close() {
  emit('update:show', false)
}

function handleApplyRetime() {
  if (isLayerLocked.value || e.value.busy.value) return
  if (scope.value === 'property') {
    if (!channelPropertyRef.value) return
    const ok = retimeCurve(e.value, channelPropertyRef.value, timeScale.value, timeShift.value)
    if (ok) close()
  } else {
    if (!activeLayerRef.value) return
    if (
      !window.confirm(
        `重定时图层全部 ${layerAnimatedTracksCount.value} 个动画轨道？可撤销。`
      )
    ) {
      return
    }
    const ok = retimeLayer(e.value, activeLayerRef.value, timeScale.value, timeShift.value)
    if (ok) close()
  }
}

function handleApplyOffset() {
  if (isLayerLocked.value || e.value.busy.value || !channelPropertyRef.value) return
  const ok = offsetValues(e.value, channelPropertyRef.value, valueDelta.value)
  if (ok) close()
}

function handleApplyReverse() {
  if (isLayerLocked.value || e.value.busy.value || !channelPropertyRef.value) return
  const ok = reverseCurve(e.value, channelPropertyRef.value)
  if (ok) close()
}

function handleCopyCurve() {
  if (!channelPropertyRef.value) return
  copyCurve(e.value, channelPropertyRef.value)
}

function handlePasteCurve() {
  if (!channelPropertyRef.value) return
  const copied = getCopiedCurve(e.value)
  if (!copied) return
  if (
    !window.confirm(
      `替换 ${channelPropertyRef.value.channel} 曲线为剪贴板中的 ${copied.keys.length} 个关键帧？可撤销。`
    )
  ) {
    return
  }
  const ok = pasteCurve(e.value, channelPropertyRef.value)
  if (ok) close()
}

function handleMakeConstant() {
  if (!channelPropertyRef.value || !activeCurve.value) return
  if (
    !window.confirm(
      `将 ${channelPropertyRef.value.channel} 的 ${activeCurve.value.keys.length} 个关键帧替换为当前帧常量？可撤销。`
    )
  ) {
    return
  }
  const ok = makeConstant(e.value, channelPropertyRef.value)
  if (ok) close()
}

function handleRestoreCurve() {
  if (!channelPropertyRef.value) return
  if (!window.confirm(`恢复 ${channelPropertyRef.value.channel} 到当前 AET 原始数据？仅恢复此轨道，可撤销。`)) {
    return
  }
  const ok = restoreCurve(e.value, channelPropertyRef.value)
  if (ok) close()
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.stopPropagation()
    close()
  } else if (ev.key === 'Enter') {
    const target = ev.target as HTMLElement
    if (target.tagName !== 'BUTTON') {
      ev.preventDefault()
      ev.stopPropagation()
      if (activeTab.value === 'retime') handleApplyRetime()
      else if (activeTab.value === 'offset') handleApplyOffset()
      else if (activeTab.value === 'reverse') handleApplyReverse()
    }
  }
}
</script>

<template>
  <n-modal
    :show="show"
    transform-origin="center"
    @update:show="emit('update:show', $event)"
  >
    <n-dialog
      class="editor-dialog"
      style="width: 520px; max-width: 90vw"
      :show-icon="false"
      @close="close"
      title="动画编辑工具"
      :bordered="false"
      role="dialog"
      aria-modal="true"
      data-testid="animation-tools-dialog"
      @keydown="onKeydown"
    >


      <!-- Target Info -->
      <div class="target-info">
        <n-space align="center" size="small">
          <span class="label">目标图层:</span>
          <n-tag v-if="currentLayer" size="small" type="info">
            {{ currentLayer.name }} (0x{{ currentLayer.offset.toString(16) }})
          </n-tag>
          <span v-else class="text-muted">未选择图层</span>

          <template v-if="channelPropertyRef">
            <span class="label">属性:</span>
            <n-tag size="small" type="success">
              {{ channelLabels[channelPropertyRef.channel] || channelPropertyRef.channel }}
              ({{ propertyKeyCount }} 键)
            </n-tag>
          </template>
        </n-space>
      </div>

      <n-alert v-if="isLayerLocked" type="warning" size="small" style="margin-top: 8px">
        当前图层已锁定，禁止编辑关键帧。
      </n-alert>

      <n-divider style="margin: 12px 0" />

      <!-- Scope selection -->
      <div class="scope-row">
        <span class="label">操作范围:</span>
        <n-radio-group v-model:value="scope" size="small">
          <n-radio-button value="property" :disabled="!canRetimeProperty">
            当前属性 ({{ channelPropertyRef ? (channelLabels[channelPropertyRef.channel] || channelPropertyRef.channel) : '无' }})
          </n-radio-button>
          <n-radio-button value="layer" :disabled="!canRetimeLayerScope">
            整层动画轨道 ({{ layerAnimatedTracksCount }} 轨)
          </n-radio-button>
        </n-radio-group>
      </div>

      <!-- Tools Tabs -->
      <n-tabs v-model:value="activeTab" type="line" size="small" style="margin-top: 12px">
        <!-- Retime Tab -->
        <n-tab-pane name="retime" tab="重定时 (Retime)">
          <div class="tab-content">
            <p class="desc">
              以最早关键帧为轴进行时间缩放与平移。常量轨道保留，不修改图层起止时间。
            </p>
            <div class="form-grid">
              <label>时间倍率 (Scale):</label>
              <n-input-number
                v-model:value="timeScale"
                size="small"
                :min="0.001"
                :step="0.1"
                :show-button="false"
                :disabled="isLayerLocked"
                data-testid="dialog-retime-scale"
              />

              <label>偏移帧 (Shift):</label>
              <n-input-number
                v-model:value="timeShift"
                size="small"
                :step="1"
                :show-button="false"
                :disabled="isLayerLocked"
                data-testid="dialog-retime-shift"
              />
            </div>

            <div v-if="retimePreview" class="preview-box">
              <template v-if="scope === 'property'">
                <div>受影响键数: <b>{{ retimePreview.keysCount }}</b></div>
                <div>原始时间范围: <b>{{ retimePreview.oldRange }}</b></div>
                <div>重定时后范围: <b>{{ retimePreview.newRange }}</b></div>
              </template>
              <template v-else>
                <div>整层受影响动画轨道: <b>{{ retimePreview.tracksCount }}</b> 轨</div>
              </template>
            </div>


          </div>
        </n-tab-pane>

        <!-- Value Offset Tab -->
        <n-tab-pane name="offset" tab="数值平移 (Offset)">
          <div class="tab-content">
            <p class="desc">平移当前轨道的关键帧数值，保留时间帧和切线不变。</p>
            <div v-if="scope === 'layer'" class="alert-hint">
              数值平移仅作用于当前属性，不同属性单位互不相同。
            </div>
            <div class="form-grid">
              <label>数值偏移 (Delta):</label>
              <n-input-number
                v-model:value="valueDelta"
                size="small"
                :show-button="false"
                :disabled="isLayerLocked || !channelPropertyRef || propertyKeyCount === 0"
                data-testid="dialog-value-offset"
              />
            </div>

          </div>
        </n-tab-pane>

        <!-- Reverse Tab -->
        <n-tab-pane name="reverse" tab="反转动画 (Reverse)">
          <div class="tab-content">
            <p class="desc">镜像反转当前属性的关键帧时间顺序，并反转切线斜率。</p>
            <div v-if="scope === 'layer'" class="alert-hint">
              反转仅作用于当前属性。
            </div>

          </div>
        </n-tab-pane>

        <!-- Quick Tab -->
        <n-tab-pane name="quick" tab="曲线管理 (Clipboard)">
          <div class="tab-content">
            <p class="desc">整轨复制、粘贴、恢复原始 AET 轨道及转换为常量。</p>
            <n-space vertical size="medium" style="margin-top: 8px">
              <n-space>
                <n-button
                  size="small"
                  :disabled="!channelPropertyRef || propertyKeyCount === 0"
                  data-testid="dialog-copy-curve"
                  @click="handleCopyCurve"
                >
                  复制当前曲线
                </n-button>
                <n-button
                  size="small"
                  :disabled="!channelPropertyRef || !canPasteCurve(e, channelPropertyRef)"
                  data-testid="dialog-paste-curve"
                  @click="handlePasteCurve"
                >
                  替换粘贴曲线
                </n-button>
              </n-space>

              <n-divider style="margin: 4px 0" />

              <n-space>
                <n-button
                  size="small"
                  :disabled="isLayerLocked || !channelPropertyRef || propertyKeyCount < 2"
                  data-testid="dialog-make-constant"
                  @click="handleMakeConstant"
                >
                  转为当前值常量
                </n-button>
                <n-button
                  size="small"
                  :disabled="isLayerLocked || !channelPropertyRef"
                  data-testid="dialog-restore-curve"
                  @click="handleRestoreCurve"
                >
                  恢复 AET 原始轨道
                </n-button>
              </n-space>
            </n-space>
          </div>
        </n-tab-pane>
      </n-tabs>

      <template #action>
        <div class="footer-row">
              <n-button v-if="activeTab === 'reverse'"
                type="warning"
                size="small"
                :disabled="isLayerLocked || !channelPropertyRef || propertyKeyCount < 2"
                data-testid="dialog-apply-reverse"
                @click="handleApplyReverse"
              >
                反转当前轨道关键帧
              </n-button>

              <n-button v-if="activeTab === 'offset'"
                type="primary"
                size="small"
                :disabled="isLayerLocked || !channelPropertyRef || propertyKeyCount === 0"
                data-testid="dialog-apply-offset"
                @click="handleApplyOffset"
              >
                应用数值平移
              </n-button>

              <n-button v-if="activeTab === 'retime'"
                type="primary"
                size="small"
                :disabled="isLayerLocked || (scope === 'property' ? !canRetimeProperty : !canRetimeLayerScope)"
                data-testid="dialog-apply-retime"
                @click="handleApplyRetime"
              >
                应用重定时
              </n-button>

          <n-button size="small" @click="close">关闭</n-button>
        </div>
      </template>
    </n-dialog>
  </n-modal>
</template>

<style scoped>
.target-info {
  background: #181d24;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
}
.label {
  color: #8c9ba5;
}
.text-muted {
  color: #63707e;
}
.scope-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.tab-content {
  padding: 8px 0;
}
.desc {
  font-size: 12px;
  color: #8c9ba5;
  margin: 0 0 12px 0;
}
.form-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}
.preview-box {
  background: #181d24;
  border: 1px solid #2d3642;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 12px;
}
.preview-box b {
  color: #6bb39b;
}
.alert-hint {
  font-size: 11px;
  color: #e5a443;
  margin-bottom: 8px;
}
.actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.footer-row {
  display: flex;
  justify-content: flex-end;
}
</style>
