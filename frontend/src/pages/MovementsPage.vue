<script setup>
import WorkspacePage from '../components/WorkspacePage.vue'
import { useInventoryContext } from '../composables/useInventoryContext'

const inventory = useInventoryContext()
const movementLabels = { in: 'Entrada', out: 'Saída', delete: 'Remoção', edit: 'Ajuste' }

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}
</script>

<template>
  <WorkspacePage
    active="movements"
    eyebrow="Inventário · histórico"
    title="Movimentos"
    description="Histórico registado neste navegador a partir desta atualização. Operações guardadas offline são identificadas no registo."
  >
    <section class="workspace-card">
      <div class="card-heading">
        <div>
          <span class="card-icon">↕</span>
          <h2>Histórico de movimentos</h2>
        </div>
        <span class="status-pill">{{ inventory.movements.length }} registo(s)</span>
      </div>
      <div v-if="!inventory.movements.length" class="empty-workspace">
        Ainda não existem movimentos. As entradas, saídas e remoções feitas no stock aparecem aqui.
      </div>
      <div v-else class="movement-list">
        <div v-for="movement in inventory.movements" :key="movement.id" class="movement-row">
          <span :class="['movement-badge', movement.type]">{{ movementLabels[movement.type] }}{{ movement.queued ? ' · offline' : '' }}</span>
          <div class="movement-main">
            <strong>{{ movement.item }}</strong>
            <span>{{ movement.category }} · {{ formatDate(movement.timestamp) }}</span>
          </div>
          <div class="movement-quantity">
            <b :class="movement.delta > 0 ? 'positive' : 'negative'">
              {{ movement.delta > 0 ? '+' : '' }}{{ movement.delta }}
            </b>
            <span>{{ movement.before }} → {{ movement.after }}</span>
          </div>
        </div>
      </div>
    </section>
  </WorkspacePage>
</template>
