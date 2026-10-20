import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

export function usePanelSizes() {
  const key = 'webaet.sidebar-sizes'
  const left = ref(270), right = ref(330), host = ref<HTMLElement>()
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Number.isFinite(saved?.left)) left.value = Math.max(180, Math.min(700, saved.left))
    if (Number.isFinite(saved?.right)) right.value = Math.max(220, Math.min(700, saved.right))
  } catch { /* Storage can be disabled or malformed. */ }
  function fit() {
    const available = Math.max(400, (host.value?.clientWidth ?? innerWidth) - 172)
    if (left.value + right.value > available) {
      const extra = Math.max(0, available - 400), ratio = (left.value - 180) / Math.max(1, left.value + right.value - 400)
      left.value = 180 + extra * ratio; right.value = 220 + extra * (1 - ratio)
    }
  }
  function save() { try { localStorage.setItem(key, JSON.stringify({ left: left.value, right: right.value })) } catch { /* Optional persistence. */ } }
  function reset() { left.value = 270; right.value = 330; fit(); save() }
  let cleanup: (() => void) | undefined
  function start(event: PointerEvent, side: 'left' | 'right') {
    if (event.button !== 0) return
    cleanup?.()
    const x = event.clientX, initial = side === 'left' ? left.value : right.value
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== event.pointerId) return
      const other = side === 'left' ? right.value : left.value
      const max = Math.min(700, (host.value?.clientWidth ?? innerWidth) - other - 172)
      const value = Math.max(side === 'left' ? 180 : 220, Math.min(max, initial + (ev.clientX - x) * (side === 'left' ? 1 : -1)))
      if (side === 'left') left.value = value; else right.value = value
    }
    const end = (ev: PointerEvent) => { if (ev.pointerId === event.pointerId) { cleanup?.(); save() } }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
    cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); cleanup = undefined }
  }
  let observer: ResizeObserver
  onMounted(() => { observer = new ResizeObserver(fit); if (host.value) observer.observe(host.value); fit() })
  onBeforeUnmount(() => { cleanup?.(); observer?.disconnect() })
  const style = computed(() => ({ gridTemplateColumns: `${left.value}px 6px minmax(160px,1fr) 6px ${right.value}px` }))
  return { host, style, start, reset }
}
