<script setup>
import { onUnmounted, ref } from 'vue'
import AppNavigation from '../components/AppNavigation.vue'

// Each board is one self-contained emulator HTML in board_emulation/, served by Flask at /simulations/.
// A board without `file` is listed as not simulated yet.
const boards = [
  { id: 'tsal-green', name: 'TSAL Green' },
  { id: 'tsal-red', name: 'TSAL Red' },
  { id: 'bspd', name: 'BSPD 2.2', file: 'bspd_emulator.html', description: 'Abre o shutdown quando se trava e acelera ao mesmo tempo.' },
  { id: 'latch', name: 'Latch Board' },
  { id: 'voltage-indicator', name: 'Voltage Indicator' },
]
const selected = ref(null)
// Grow the frame to the emulator's full height so only the site scrolls (same origin, so the document is readable).
let observer
function fitFrame(event) {
  const frame = event.target, doc = frame.contentDocument
  observer?.disconnect()
  observer = new ResizeObserver(() => { frame.style.height = `${doc.documentElement.offsetHeight}px` })
  observer.observe(doc.documentElement)
}
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="workspace-page">
  <AppNavigation active="analog-simulation" />
  <main :class="selected ? 'simulation-content' : 'workspace-content'">
    <h1 class="sr-only">Simulação analógica</h1>
    <template v-if="selected">
      <div class="simulation-toolbar">
        <button class="text-button" type="button" @click="selected = null">← Placas</button>
        <h2>{{ selected.name }}</h2>
        <a class="text-button" :href="`/simulations/${selected.file}`" target="_blank" rel="noopener">Abrir em nova janela</a>
      </div>
      <iframe class="simulation-frame" :src="`/simulations/${selected.file}`" :title="`Simulação ${selected.name}`" scrolling="no" @load="fitFrame"></iframe>
    </template>
    <section v-else class="board-grid">
      <article v-for="board in boards" :key="board.id" class="workspace-card board-card">
        <iframe v-if="board.file" class="board-preview" :src="`/simulations/${board.file}#preview`" :title="`Modelo 3D da placa ${board.name}`" loading="lazy" tabindex="-1" aria-hidden="true"></iframe>
        <div v-else class="board-preview empty-workspace">Modelo 3D em preparação</div>
        <h2>{{ board.name }}</h2>
        <template v-if="board.file">
          <p class="card-muted">{{ board.description }}</p>
          <button class="primary-button" type="button" @click="selected = board">Abrir simulação</button>
        </template>
        <p v-else class="card-muted"><span class="status-pill">Em preparação</span></p>
      </article>
    </section>
  </main>
  </div>
</template>
