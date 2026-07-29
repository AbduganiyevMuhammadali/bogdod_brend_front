import { ref, onMounted, onUnmounted } from 'vue'

const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)

let listenerCount = 0
function onResize() { width.value = window.innerWidth }

export function useViewport() {
  onMounted(() => {
    if (listenerCount === 0) window.addEventListener('resize', onResize)
    listenerCount++
  })
  onUnmounted(() => {
    listenerCount--
    if (listenerCount === 0) window.removeEventListener('resize', onResize)
  })

  return { width }
}
