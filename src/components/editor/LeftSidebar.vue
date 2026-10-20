<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '../../editor/state'
import type { WorkspaceAsset } from '../../editor/workspaceAssets'
import ResourceLibrary from './ResourceLibrary.vue'
import LoadedResources from './LoadedResources.vue'
import LayerHierarchy from './LayerHierarchy.vue'
const p = defineProps<{ editor: Editor; assets: readonly WorkspaceAsset[] }>()
const emit = defineEmits<{ openAsset: [path: string]; openComposition: [sceneIndex: number, compositionId: number] }>()
const tab = computed({ get: () => p.editor.workspace.leftTab.value, set: value => { p.editor.workspace.leftTab.value = value } })
</script>
<template>
  <section class="panel left-sidebar">
    <div class="sidebar-tabs" role="tablist" aria-label="项目导航"><button role="tab" :aria-selected="tab === 'library'" @click="tab = 'library'">库</button><button role="tab" :aria-selected="tab === 'resources'" @click="tab = 'resources'">资源</button><button role="tab" :aria-selected="tab === 'layers'" @click="tab = 'layers'">图层</button></div>
    <ResourceLibrary v-show="tab === 'library'" :editor="editor" :assets="assets" @open-asset="emit('openAsset', $event)" />
    <LoadedResources v-show="tab === 'resources'" :editor="editor" @open-composition="(scene, comp) => emit('openComposition', scene, comp)" />
    <LayerHierarchy v-show="tab === 'layers'" :editor="editor" />
  </section>
</template>
<style scoped>
.left-sidebar{min-width:0;border-right:1px solid #383f49;overflow:hidden}.sidebar-tabs{display:flex;height:35px;flex:none;border-bottom:1px solid #383f49}.sidebar-tabs button{flex:1;background:transparent;color:#9facbe;border:0;cursor:pointer;border-bottom:2px solid transparent}.sidebar-tabs [aria-selected=true]{color:#a0f2db;border-bottom-color:#72c6b2}.left-sidebar>section{flex:1;min-height:0}
</style>
