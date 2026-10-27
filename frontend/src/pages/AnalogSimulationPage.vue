<script setup>
import { nextTick, onUnmounted, ref } from 'vue'
import AppNavigation from '../components/AppNavigation.vue'

const bspd = { id: 'bspd', name: 'BSPD 2.2', file: 'bspd_emulator.html' }
const planned = ['TSAL Green', 'TSAL Red', 'Latch Board', 'Voltage Indicator']
const selected = ref(null)
const loading = ref(false)
const failed = ref(false)
const heading = ref(null)
const openButton = ref(null)
let observer
function openBoard(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  selected.value = bspd
  loading.value = true
  failed.value = false
  nextTick(() => heading.value?.focus())
}
function closeBoard(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  selected.value = null
  observer?.disconnect()
  nextTick(() => openButton.value?.focus())
}
function fitFrame(event) {
  loading.value = false
  observer?.disconnect()
  const frame = event.target
  try {
    const doc = frame.contentDocument
    if (!doc?.documentElement) return
    observer = new ResizeObserver(() => { frame.style.height = `${doc.documentElement.offsetHeight}px` })
    observer.observe(doc.documentElement)
  } catch { /* The standalone link remains available if the frame cannot be inspected. */ }
}
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="workspace-page">
    <AppNavigation active="analog-simulation" />
    <main id="main-content" tabindex="-1" :class="selected ? 'simulation-content' : 'workspace-content'">
      <div class="simulation-heading">
        <h1 ref="heading" tabindex="-1">Simulação analógica</h1>
        <p class="card-muted">Testa circuitos das placas LART e acompanha a resposta dos componentes. Os valores são simulados.</p>
      </div>
      <template v-if="selected">
        <div class="simulation-toolbar">
          <a class="text-button" href="#/analog-simulation" @click="closeBoard">← Simulações</a>
          <h2>{{ selected.name }}</h2>
          <a class="text-button" :href="`/simulations/${selected.file}`" target="_blank" rel="noopener">Abrir numa nova janela</a>
        </div>
        <p v-if="loading" class="simulation-status" role="status">A carregar o simulador… Podes também abrir numa nova janela.</p>
        <p v-if="failed" class="simulation-status" role="alert">Não foi possível abrir o simulador. Usa a ligação acima para o abrir numa nova janela.</p>
        <iframe class="simulation-frame" :src="`/simulations/${selected.file}`" :title="`Simulação ${selected.name}`" scrolling="no" @load="fitFrame" @error="loading = false; failed = true"></iframe>
      </template>
      <template v-else>
        <article class="workspace-card available-board">
          <div>
            <span class="status-pill">Disponível</span>
            <h2>{{ bspd.name }}</h2>
            <p>Abre o circuito de shutdown quando se trava e acelera ao mesmo tempo.</p>
            <p class="card-muted">Começa pelo teste guiado: aciona o travão e a corrente, observa o tempo de disparo e compara com o limite de 500 ms. Depois explora o esquema, a placa 3D e a calibração.</p>
            <a ref="openButton" class="primary-button" :href="`/simulations/${bspd.file}`" @click="openBoard">Abrir simulação BSPD</a>
          </div>
          <iframe class="board-preview" :src="`/simulations/${bspd.file}#preview`" title="Modelo 3D da placa BSPD 2.2" loading="lazy" tabindex="-1" aria-hidden="true"></iframe>
        </article>
        <details class="planned-boards workspace-card">
          <summary>Placas em preparação · {{ planned.length }}</summary>
          <p class="card-muted">Estas placas ainda não têm simulação disponível.</p>
          <ul><li v-for="board in planned" :key="board">{{ board }}</li></ul>
        </details>
      </template>
    </main>
  </div>
</template>

<style scoped>
.simulation-heading { padding: 0 0 24px; }
.simulation-heading h1 { margin: 0 0 8px; font-size: 32px; }
.simulation-content .simulation-heading { padding: 24px clamp(16px, 4vw, 48px) 8px; }
.available-board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, .8fr); gap: 32px; align-items: center; }
.available-board p { max-width: 65ch; line-height: 1.6; }
.available-board .primary-button { display: inline-flex; margin-top: 12px; }
.available-board .board-preview { width: 100%; min-height: 280px; border: 0; border-radius: 8px; }
.planned-boards { margin-top: 24px; }
.planned-boards summary { min-height: 44px; cursor: pointer; padding: 10px 0; font-weight: 600; }
.planned-boards li { padding: 6px 0; }
.simulation-toolbar { flex-wrap: wrap; }
.simulation-status { padding: 0 24px; color: var(--muted, #a7a99e); }
@media (max-width: 650px) { .available-board { grid-template-columns: minmax(0, 1fr); gap: 20px; } .available-board .board-preview { min-height: 220px; } }
</style>
