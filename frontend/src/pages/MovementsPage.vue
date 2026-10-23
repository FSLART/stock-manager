<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'

const api = inject('api')
const movementLabels = { in: 'Entrada', out: 'Saída', delete: 'Remoção', edit: 'Ajuste' }
const movements = ref([]), loading = ref(true), error = ref(''), query = ref('')
// "Os meus movimentos" no menu da sessão chega aqui com o nome já na pesquisa.
const movementFilter = inject('movementFilter', null)
watch(() => movementFilter?.value, value => { if (value) { query.value = value; movementFilter.value = '' } }, { immediate: true })
const plain = value => String(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const shown = computed(() => movements.value.filter(movement =>
  plain([movement.person, movement.cat, ...Object.values(movement.props)].join(' ')).includes(plain(query.value))))

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}
onMounted(async () => {
  try { movements.value = (await api.direct('movements')).movements }
  catch (cause) { error.value = cause.message }
  finally { loading.value = false }
})
</script>

<template>
  <WorkspacePage
    active="movements"
    eyebrow="Inventário · histórico"
    title="Movimentos"
    description="Histórico guardado no servidor: quem tirou, pôs, ajustou ou removeu cada componente, e quando."
  >
    <section class="workspace-card">
      <div class="card-heading">
        <div>
          <span class="card-icon">↕</span>
          <h2>Histórico de movimentos</h2>
        </div>
        <span class="status-pill">{{ shown.length }} registo(s)</span>
      </div>
      <label class="project-name-field">
        <span>Pesquisar</span>
        <input v-model="query" type="search" aria-label="Pesquisar movimentos" placeholder="Pessoa, componente ou categoria" autocomplete="off">
      </label>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div v-else-if="loading" class="empty-workspace">A carregar histórico…</div>
      <div v-else-if="!shown.length" class="empty-workspace">
        {{ movements.length ? 'Nenhum movimento corresponde à pesquisa.' : 'Ainda não existem movimentos. As entradas, saídas e remoções feitas no stock aparecem aqui.' }}
      </div>
      <div v-else class="movement-list">
        <div v-for="movement in shown" :key="movement.id" class="movement-row">
          <span :class="['movement-badge', movement.type]">{{ movementLabels[movement.type] }}</span>
          <div class="movement-main">
            <strong>{{ Object.values(movement.props).join(' · ') }}</strong>
            <span>{{ movement.cat }} · {{ movement.person }} · {{ formatDate(movement.ts) }}</span>
          </div>
          <div class="movement-quantity">
            <b :class="movement.delta > 0 ? 'positive' : movement.delta < 0 ? 'negative' : ''">
              {{ movement.delta > 0 ? '+' : '' }}{{ movement.delta }}
            </b>
            <span>{{ movement.before }} → {{ movement.after }}</span>
          </div>
        </div>
      </div>
    </section>
  </WorkspacePage>
</template>
