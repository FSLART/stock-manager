<script setup>
import { nextTick, ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import ToolFrame from '../components/ToolFrame.vue'

const bspd = { id: 'bspd', name: 'BSPD 2.2', file: 'bspd_emulator.html?v=20261027b' }
const planned = ['TSAL Green', 'TSAL Red', 'Latch Board', 'Voltage Indicator']
const selected = ref(null)
const loading = ref(false)
const failed = ref(false)
const openButton = ref(null)
function openBoard(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  selected.value = bspd
  loading.value = true
  failed.value = false
  nextTick(() => document.querySelector('.simulation-toolbar h2')?.focus())
}
function closeBoard(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  selected.value = null
  nextTick(() => openButton.value?.focus())
}
</script>

<template>
  <WorkspacePage class="tool-workspace" active="analog-simulation" title="Simulação analógica" description="Testa circuitos das placas LART e acompanha a resposta dos componentes. Os valores são simulados.">
      <template v-if="selected">
        <div class="simulation-toolbar">
          <a class="text-button" href="#/analog-simulation" @click="closeBoard">← Simulações</a>
          <h2 tabindex="-1">{{ selected.name }}</h2>
          <a class="text-button" :href="`/simulations/${selected.file}`" target="_blank" rel="noopener">Abrir numa nova janela</a>
        </div>
        <p v-if="loading" class="simulation-status" role="status">A carregar o simulador… Podes também abrir numa nova janela.</p>
        <p v-if="failed" class="simulation-status" role="alert">Não foi possível abrir o simulador. Usa a ligação acima para o abrir numa nova janela.</p>
        <ToolFrame class="simulation-frame" :src="`/simulations/${selected.file}&embedded=1`" :title="`Simulação ${selected.name}`" @load="loading = false" @error="loading = false; failed = true" />
      </template>
      <template v-else>
        <article class="workspace-card available-board">
          <div>
            <div class="board-title"><h2>{{ bspd.name }}</h2><span class="status-pill">Disponível</span></div>
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
  </WorkspacePage>
</template>

<style scoped>
.available-board { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(240px, .85fr); gap: 32px; align-items: center; }
.board-title { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.board-title h2 { margin: 0; font-size: 28px; }
.available-board p { max-width: 65ch; line-height: 1.6; }
.available-board .primary-button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; margin-top: 12px; text-decoration: none; }
.available-board .board-preview { width: 100%; height: 280px; min-height: 0; border: 0; border-radius: 8px; }
.planned-boards { margin-top: 24px; padding-block: 12px; }
.planned-boards summary { min-height: 44px; cursor: pointer; padding: 10px 0; font-weight: 600; }
.planned-boards ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; padding-left: 20px; }
.simulation-toolbar { flex-wrap: wrap; padding: 0 0 16px; margin-bottom: 16px; }
.simulation-toolbar a { text-decoration: none; }
.simulation-status { color: var(--muted); }
@media (max-width: 650px) { .available-board { grid-template-columns: minmax(0, 1fr); gap: 20px; } .available-board .board-preview { height: 220px; } }
</style>
