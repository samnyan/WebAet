<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Editor } from '../../editor/state'
import type { PreviewTarget } from '../../editor/workspaceAssets'
import { renderAssetPreview } from '../../editor/assetPreview'
const p = defineProps<{ editor: Editor; target: PreviewTarget | null; size?: number }>()
const host = ref<HTMLElement>(), description = ref(''), error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
function release() { host.value?.querySelectorAll('canvas').forEach(c => { c.width = c.height = 0; c.remove() }) }
watch([() => JSON.stringify(p.target), () => p.editor.doc.value?.source, () => p.target?.kind === 'composition' ? p.editor.version.value : 0, () => p.editor.resourceVersion.value, () => p.size], () => {
  clearTimeout(timer); release(); description.value = ''; error.value = ''
  if (!p.target) return
  // Defer until the click/selection has painted; cancelling avoids stale queued work.
  timer = setTimeout(() => {
    if (!p.target || !host.value) return
    try { const result = renderAssetPreview(p.editor, p.target, p.size); host.value.append(result.canvas); description.value = result.description }
    catch (e) { error.value = String(e instanceof Error ? e.message : e) }
  }, 40)
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => { clearTimeout(timer); release() })
</script>
<template><div class="asset-preview" data-testid="asset-preview"><div ref="host" class="preview-image"><span v-if="error">{{ error }}</span><span v-else-if="!target">选择素材查看预览</span></div><small>{{ description }}</small></div></template>
<style scoped>
.asset-preview{padding:8px;border-top:1px solid #ffffff12;flex-shrink:0}.preview-image{min-height:110px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#22262c 0% 25%,#2b3038 0% 50%) 0/16px 16px;color:#9ba7b8;text-align:center}.preview-image:deep(canvas){max-width:100%;max-height:160px}.asset-preview small{display:block;margin-top:6px;overflow-wrap:anywhere;color:#9daabc}
</style>
