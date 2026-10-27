<script setup>
import { onUnmounted } from 'vue'
defineProps({ src: { type: String, required: true }, title: { type: String, required: true } })
const emit = defineEmits(['load', 'error'])
let observer
function loaded(event) {
  observer?.disconnect()
  const frame = event.target
  try {
    const doc = frame.contentDocument
    if (doc?.body) {
      // Share the workspace's self-hosted fonts with the same-origin tool.
      const fonts = document.createElement('style')
      fonts.textContent = [...document.styleSheets].flatMap(sheet => {
        try { return [...sheet.cssRules].filter(rule => rule.type === 5).map(rule => rule.cssText) } catch { return [] }
      }).join('\n')
      doc.head.append(fonts)
      const fit = () => { frame.style.height = `${Math.ceil(doc.body.getBoundingClientRect().height)}px` }
      observer = new ResizeObserver(fit)
      observer.observe(doc.body)
      fit()
      doc.fonts?.ready.then(fit)
    }
  } catch { /* The standalone link remains available for cross-origin hosts. */ }
  emit('load', event)
}
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <iframe class="tool-frame" :src="src" :title="title" @load="loaded" @error="emit('error', $event)"></iframe>
</template>

<style scoped>
.tool-frame { display: block; width: 100%; height: 720px; min-height: 0; border: 0; }
</style>
