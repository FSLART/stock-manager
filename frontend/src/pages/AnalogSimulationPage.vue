<script setup>
import { ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'

// Each board is one self-contained emulator HTML in board_emulation/, served by Flask at /simulations/.
// A board without `file` is listed as not simulated yet.
const boards = [
  { id: 'tsal-green', name: 'TSAL Green' },
  { id: 'tsal-red', name: 'TSAL Red' },
  { id: 'bspd', name: 'BSPD 2.2', file: 'bspd_emulator.html', description: 'Brake System Plausibility Device: abre o circuito de shutdown quando há travagem forte com potência elevada durante mais de 0,5 s.' },
  { id: 'latch', name: 'Latch Board' },
  { id: 'voltage-indicator', name: 'Voltage Indicator' },
]
const selected = ref(null)
</script>

<template>
  <WorkspacePage active="analog-simulation" eyebrow="Engenharia · simulação" title="Simulação analógica" description="Placas analógicas simuladas a partir dos ficheiros Altium. Escolhe uma placa para abrir a simulação.">
    <section v-if="selected" class="workspace-card">
      <div class="card-heading">
        <h2>{{ selected.name }}</h2>
        <div>
          <a class="text-button" :href="`/simulations/${selected.file}`" target="_blank" rel="noopener">Abrir em nova janela</a>
          <button class="text-button" type="button" @click="selected = null">← Placas</button>
        </div>
      </div>
      <iframe class="simulation-frame" :src="`/simulations/${selected.file}`" :title="`Simulação ${selected.name}`"></iframe>
    </section>
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
  </WorkspacePage>
</template>
