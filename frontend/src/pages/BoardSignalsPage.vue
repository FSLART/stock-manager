<script setup>
import { ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import { readStored, writeStored } from '../api.js'

const stored = readStored('stocklart-board-signals', [])
const signals = ref(Array.isArray(stored) ? stored : [])
const form = ref({ board: '', name: '', voltage: '', connection: '', notes: '' })
const error = ref('')
function save() {
  const signal = Object.fromEntries(Object.entries(form.value).map(([key, value]) => [key, value.trim()]))
  if (!signal.board || !signal.name) return
  const updated = [{ ...signal, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` }, ...signals.value]
  if (!writeStored('stocklart-board-signals', updated)) { error.value = 'Não foi possível guardar os sinais neste navegador.'; return }
  signals.value = updated
  form.value = { board: '', name: '', voltage: '', connection: '', notes: '' }
  error.value = ''
}
function remove(signal) {
  if (!confirm(`Apagar o sinal ${signal.name} da placa ${signal.board}?`)) return
  const updated = signals.value.filter(entry => entry.id !== signal.id)
  if (!writeStored('stocklart-board-signals', updated)) { error.value = 'Não foi possível guardar a alteração.'; return }
  signals.value = updated
}
</script>

<template>
  <WorkspacePage active="board-signals" eyebrow="Engenharia · documentação" title="Sinais de placas" description="Documenta sinais, interfaces e ligações por placa. Dados guardados neste navegador.">
    <section class="workspace-grid">
      <article class="workspace-card workspace-card-wide">
        <div class="card-heading"><div><span class="card-icon">↗</span><h2>Novo sinal</h2></div></div>
        <form class="signal-form" @submit.prevent="save">
          <div class="signal-fields">
            <label>Placa<input v-model="form.board" aria-label="Placa" required maxlength="160" placeholder="Controlador de motor V1"></label>
            <label>Nome do sinal<input v-model="form.name" aria-label="Nome do sinal" required maxlength="160" placeholder="PWM"></label>
            <label>Tensão de referência<input v-model="form.voltage" aria-label="Tensão de referência" maxlength="80" placeholder="3.3 V"></label>
            <label>Interface / ligação<input v-model="form.connection" aria-label="Interface ou ligação" maxlength="160" placeholder="J1 · pino 4"></label>
          </div>
          <label>Notas<textarea v-model="form.notes" aria-label="Notas" rows="3" maxlength="2000" placeholder="Notas para a montagem"></textarea></label>
          <button class="primary-button" :disabled="!form.board.trim() || !form.name.trim()">+ Guardar sinal</button>
        </form>
      </article>
      <article class="workspace-card"><p class="eyebrow">Estrutura recomendada</p><h2>Documentação consistente</h2><p class="card-muted">Usa nomes claros, tensão de referência e notas de ligação para reduzir erros na montagem.</p></article>
    </section>
    <div v-if="error" class="upload-error" role="alert">{{ error }}</div>
    <section class="workspace-card">
      <div class="card-heading"><h2>Biblioteca de sinais</h2><span class="status-pill">{{ signals.length }} sinal(is)</span></div>
      <div v-if="!signals.length" class="empty-workspace">Ainda não existem sinais registados.</div>
      <div v-else class="signal-list">
        <article v-for="signal in signals" :key="signal.id" class="signal-row">
          <div><p class="eyebrow">{{ signal.board }}</p><h3>{{ signal.name }}</h3><p class="card-muted">{{ [signal.voltage, signal.connection].filter(Boolean).join(' · ') }}</p><p class="signal-notes">{{ signal.notes }}</p></div>
          <button class="text-button danger" type="button" :aria-label="`Apagar sinal ${signal.name}`" @click="remove(signal)">Apagar</button>
        </article>
      </div>
    </section>
  </WorkspacePage>
</template>
