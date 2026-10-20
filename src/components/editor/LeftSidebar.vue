<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { NModal } from 'naive-ui'
import { materialPackagesKey } from '../../editor/materialPackages'
import ResourceBrowser from './ResourceBrowser.vue'
import type { Editor } from '../../editor/state'
import type { WorkspaceAsset } from '../../editor/workspaceAssets'
import ResourceLibrary from './ResourceLibrary.vue'
import LayerHierarchy from './LayerHierarchy.vue'
const p = defineProps<{ editor: Editor; assets: readonly WorkspaceAsset[] }>()
const emit = defineEmits<{ openAsset: [path: string]; openComposition: [sceneIndex: number, compositionId: number] }>()
const browse = ref(false)
const packages = inject(materialPackagesKey, computed(() => []))
const tab = computed({ get: () => p.editor.workspace.leftTab.value, set: value => { p.editor.workspace.leftTab.value = value } })
</script>
<template><section class="panel left-sidebar"><div class="sidebar-tabs" role="tablist" aria-label="项目导航"><button role="tab" :aria-selected="tab === 'library'" @click="tab = 'library'">库 / Project</button><button role="tab" :aria-selected="tab === 'layers'" @click="tab = 'layers'">图层树 / Layers</button></div><button v-if="tab === 'library'" class="browse-packages" @click="browse = true">浏览资源包与缩略图…</button><ResourceLibrary v-if="tab === 'library'" :editor="p.editor" :assets="assets" @open-asset="emit('openAsset', $event)" @open-composition="(scene, comp) => emit('openComposition', scene, comp)" /><LayerHierarchy v-else :editor="p.editor" /><n-modal v-model:show="browse" preset="dialog" :show-icon="false" class="editor-dialog" title="资源浏览器" style="width:min(1200px,96vw)"><ResourceBrowser v-if="browse" :packages="packages" style="height:min(580px,65dvh)" /></n-modal></section></template>
<style scoped>
.left-sidebar{min-width:0;border-right:1px solid #383f49;overflow:hidden}.sidebar-tabs{display:flex;height:35px;flex:none;border-bottom:1px solid #383f49}.sidebar-tabs button{flex:1;background:transparent;color:#9facbe;border:0;cursor:pointer;border-bottom:2px solid transparent}.sidebar-tabs [aria-selected=true]{color:#a0f2db;border-bottom-color:#72c6b2}.left-sidebar>:last-child{flex:1;min-height:0}
</style>
