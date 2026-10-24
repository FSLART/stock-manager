<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import { useInventoryContext } from '../composables/useInventoryContext.js'

const api = inject('api'), auth = inject('auth'), inventory = useInventoryContext()
const movementLabels = { in: 'Entrada', out: 'Saída', delete: 'Remoção', edit: 'Ajuste', revert: 'Reversão' }
const movements = ref([]), loading = ref(true), error = ref(''), query = ref('')
// "Os meus movimentos" no menu da sessão chega aqui com o nome já na pesquisa.
const movementFilter = inject('movementFilter', null)
watch(() => movementFilter?.value, value => { if (value) { query.value = value; movementFilter.value = '' } }, { immediate: true })
const plain = value => String(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const shown = computed(() => movements.value.filter(movement =>
  plain([movement.person, movement.cat, movement.note, ...Object.values(movement.props)].join(' ')).includes(plain(query.value))))

// Reverter (só admins): escolhe vários movimentos, por exemplo todas as remoções de uma categoria apagada.
const reverting = ref(false), picked = ref(new Set())
const revertable = movement => movement.delta !== 0 && !movement.reverted
const pickable = computed(() => shown.value.filter(revertable))
const allPicked = computed(() => pickable.value.length > 0 && pickable.value.every(movement => picked.value.has(movement.id)))
function toggle(id) { picked.value.has(id) ? picked.value.delete(id) : picked.value.add(id) }
function pickAll() { picked.value = new Set(allPicked.value ? [] : pickable.value.map(movement => movement.id)) }
function revert() {
  if (!confirm(`Reverter ${picked.value.size} movimento(s)? As quantidades voltam ao que eram antes.`)) return
  inventory.revertMovements([...picked.value], () => { picked.value = new Set(); reload() })
}
async function reload() { movements.value = (await api.direct('movements')).movements }

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}
onMounted(async () => {
  try { await reload() }
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
        <span class="pcb-detail-actions">
          <button v-if="auth.user?.admin" class="text-button" type="button" :aria-pressed="reverting" @click="reverting = !reverting; picked = new Set()">
            {{ reverting ? 'Terminar reversão' : 'Reverter movimentos' }}
          </button>
          <span class="status-pill">{{ shown.length }} registo(s)</span>
        </span>
      </div>
      <div v-if="reverting" class="movement-revert-bar">
        <label class="check"><input type="checkbox" :checked="allPicked" :disabled="!pickable.length" @change="pickAll"> Selecionar todos os visíveis</label>
        <button class="primary-button" type="button" :disabled="!picked.size" @click="revert">Reverter {{ picked.size }} movimento(s)</button>
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
      <div v-else :class="['movement-list', { selecting: reverting }]">
        <div v-for="movement in shown" :key="movement.id" class="movement-row">
          <input v-if="reverting" type="checkbox" :checked="picked.has(movement.id)" :disabled="!revertable(movement)"
            :aria-label="`Reverter movimento #${movement.id}`" @change="toggle(movement.id)">
          <span :class="['movement-badge', movement.type]">{{ movementLabels[movement.type] }}</span>
          <div class="movement-main">
            <strong>{{ Object.values(movement.props).join(' · ') }}</strong>
            <span>{{ [movement.cat, movement.person, formatDate(movement.ts), movement.note, movement.reverted && 'revertido'].filter(Boolean).join(' · ') }}</span>
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
