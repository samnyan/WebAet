<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { MaterialItem } from '../../editor/materialPicker'
import type { SpriteLibrary } from '../../core/resources/library'
const p = defineProps<{ item: MaterialItem; library: SpriteLibrary; size: number }>()
const host = ref<HTMLElement>(),
  error = ref('')
let observer: IntersectionObserver,
  timer: ReturnType<typeof setTimeout>,
  visible = false
function paint() {
  clearTimeout(timer)
  if (!visible) return
  timer = setTimeout(() => {
    const s = p.item.set.sprites[p.item.index]!,
      t = p.item.set.textures[s.texture]
    if (!host.value || !t) return
    try {
      const c = document.createElement('canvas')
      c.width = c.height = Math.min(256, p.size)
      const scale = Math.min(c.width / s.width, c.height / s.height),
        w = s.width * scale,
        h = s.height * scale
      c.getContext('2d')!.drawImage(
        p.library.image(t),
        s.x,
        s.y,
        s.width,
        s.height,
        (c.width - w) / 2,
        (c.height - h) / 2,
        w,
        h,
      )
      host.value.replaceChildren(c)
    } catch (e) {
      error.value = String(e)
    }
  }, 20)
}
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    visible = entries[0]!.isIntersecting
    if (visible) paint()
    else clearTimeout(timer)
  })
  observer.observe(host.value!)
})
watch(() => [p.item.key, p.size], paint)
onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(timer)
  host.value?.querySelectorAll('canvas').forEach((c) => {
    c.width = c.height = 0
  })
})
</script>
<template>
  <div ref="host" class="material-thumb" :style="{ height: `${size}px` }" :title="error">
    {{ error ? '预览失败' : '…' }}
  </div>
</template>
<style scoped>
.material-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-conic-gradient(#22262c 0% 25%, #2b3038 0% 50%) 0/16px 16px;
  overflow: hidden;
}
.material-thumb:deep(canvas) {
  max-width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
