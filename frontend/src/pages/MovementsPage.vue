<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import { componentValue, describe } from '../stockText.js'
import WorkspacePage from '../components/WorkspacePage.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { useInventoryContext } from '../composables/useInventoryContext.js'

const api = inject('api'), auth = inject('auth'), inventory = useInventoryContext()
const movementLabels = { in: 'Entrada', out: 'Saída', delete: 'Remoção', edit: 'Ajuste', revert: 'Reversão', label: 'Etiqueta' }
const movements = ref([]), loading = ref(true), error = ref(''), query = ref('')
// "Os meus movimentos" no menu da sessão chega aqui com o nome já na pesquisa.
const movementFilter = inject('movementFilter', null)
watch(() => movementFilter?.value, value => { if (value) { query.value = value; movementFilter.value = '' } }, { immediate: true })
const plain = value => String(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const person = ref(''), kind = ref(''), since = ref(''), until = ref(''), department = ref(''), limit = ref(100)
// Só os departamentos que já têm movimentos; o histórico antigo é todo de Electronics.
const departments = computed(() => [...new Set(movements.value.map(movement => movement.department || 'Electronics'))].sort((a, b) => a.localeCompare(b, 'pt')))
const people = computed(() => [...new Set(movements.value.map(movement => movement.person).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt')))
const localDate = timestamp => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const shown = computed(() => movements.value.filter(movement =>
  (!person.value || movement.person === person.value) && (!kind.value || movement.type === kind.value) &&
  (!department.value || (movement.department || 'Electronics') === department.value) &&
  (!since.value || localDate(movement.ts) >= since.value) && (!until.value || localDate(movement.ts) <= until.value) &&
  plain([movement.person, movement.cat, movement.note, ...Object.values(movement.props)].join(' ')).includes(plain(query.value))))
const visible = computed(() => shown.value.slice(0, limit.value))
watch([query, person, kind, since, until, department], () => { limit.value = 100; picked.value = new Set() })
function clearFilters() { query.value = ''; person.value = ''; kind.value = ''; since.value = ''; until.value = ''; department.value = '' }

// Reverter (só admins): escolhe vários movimentos, por exemplo todas as remoções de uma categoria apagada.
const reverting = ref(false), picked = ref(new Set())
const revertable = movement => movement.delta !== 0 && !movement.reverted
const pickable = computed(() => visible.value.filter(revertable))
const allPicked = computed(() => pickable.value.length > 0 && pickable.value.every(movement => picked.value.has(movement.id)))
function toggle(id) { picked.value.has(id) ? picked.value.delete(id) : picked.value.add(id) }
function pickAll() { picked.value = new Set(allPicked.value ? [] : pickable.value.map(movement => movement.id)) }
function revert() {
  if (!confirm(`Reverter ${picked.value.size} movimento(s)? As quantidades voltam ao que eram antes.`)) return
  inventory.revertMovements([...picked.value], () => { picked.value = new Set(); reload() })
}
async function reload() {
  loading.value = true
  error.value = ''
  try { movements.value = (await api.direct('movements')).movements }
  catch (cause) { error.value = cause.message || 'Não foi possível carregar o histórico.' }
  finally { loading.value = false }
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}
onMounted(reload)
</script>

<template>
  <WorkspacePage
    active="movements"
    title="Movimentos"
    description="Consulta as entradas, saídas e ajustes de stock, com a pessoa e a data de cada alteração."
  >
    <section class="workspace-card">
      <div class="card-heading">
        <div>
          <h2>Histórico de movimentos</h2>
        </div>
        <span class="pcb-detail-actions">
          <button v-if="auth.user?.admin" class="text-button" type="button" :aria-pressed="reverting" @click="reverting = !reverting; picked = new Set()">
            {{ reverting ? 'Terminar reversão' : 'Reverter movimentos' }}
          </button>
          <span class="status-pill">{{ shown.length }} registo(s)</span>
        </span>
      </div>
      <p class="card-muted">Até 1000 movimentos mais recentes guardados no servidor. Os filtros aplicam-se a este histórico carregado; movimentos anteriores podem não estar incluídos.</p>
      <div v-if="reverting" class="movement-revert-bar">
        <label class="check"><input type="checkbox" :checked="allPicked" :disabled="!pickable.length" @change="pickAll"> Selecionar todos os visíveis</label>
        <button class="primary-button" type="button" :disabled="!picked.size" @click="revert">Reverter {{ picked.size }} movimento(s)</button>
      </div>
      <label class="project-name-field">
        <span>Pesquisar</span>
        <input v-model="query" type="search" aria-label="Pesquisar movimentos" placeholder="Pessoa, componente ou categoria" autocomplete="off">
      </label>
      <div v-if="departments.length > 1" class="toggle-chips compact" role="group" aria-label="Departamento">
        <button type="button" class="toggle-chip" :aria-pressed="!department" @click="department = ''">Todos</button>
        <button v-for="name in departments" :key="name" type="button" class="toggle-chip" :aria-pressed="department === name" @click="department = department === name ? '' : name">{{ name }}</button>
      </div>
      <div class="movement-filters">
        <label>Pessoa<select v-model="person" aria-label="Pessoa"><option value="">Todas as pessoas</option><option v-for="name in people" :key="name" :value="name">{{ name }}</option></select></label>
        <label>Tipo<select v-model="kind" aria-label="Tipo de movimento"><option value="">Todos os tipos</option><option v-for="(name, type) in movementLabels" :key="type" :value="type">{{ name }}</option></select></label>
        <label>Desde<input v-model="since" type="date" aria-label="Desde"></label>
        <label>Até<input v-model="until" type="date" aria-label="Até"></label>
        <button v-if="query || person || kind || since || until || department" type="button" class="text-button" @click="clearFilters">Limpar filtros</button>
      </div>
      <p v-if="error" class="upload-error" role="alert">{{ error }} <button type="button" class="text-button" @click="reload">Tentar novamente</button></p>
      <div v-else-if="loading" class="empty-workspace">A carregar histórico…</div>
      <div v-else-if="!shown.length" class="empty-workspace">
        {{ movements.length ? 'Nenhum movimento corresponde aos filtros. Altera as datas, a pessoa ou o tipo de movimento.' : 'Ainda não existem movimentos. As entradas, saídas e remoções feitas no stock aparecem aqui.' }}
      </div>
      <div v-else :class="['movement-list', { selecting: reverting }]">
        <div v-for="movement in visible" :key="movement.id" class="movement-row">
          <input v-if="reverting" type="checkbox" :checked="picked.has(movement.id)" :disabled="!revertable(movement)"
            :aria-label="`Reverter movimento #${movement.id}`" @change="toggle(movement.id)">
          <span :class="['movement-badge', movement.type]">{{ movementLabels[movement.type] }}</span>
          <div class="movement-main">
            <strong>{{ componentValue(movement) }}</strong>
            <span>{{ [describe(movement), movement.cat, departments.length > 1 && (movement.department || 'Electronics'), movement.note, movement.reverted && 'revertido'].filter(Boolean).join(' · ') }}</span>
          </div>
          <div class="movement-person">
            <UserAvatar :name="movement.person || '?'" :src="movement.avatar" :size="32" />
            <span>
              <button v-if="movement.person" type="button" :title="`Ver só os movimentos de ${movement.person}`" @click="person = movement.person">{{ movement.person }}</button>
              <b v-else>Desconhecido</b>
              <time :datetime="movement.ts">{{ formatDate(movement.ts) }}</time>
            </span>
          </div>
          <div v-if="movement.type !== 'label'" class="movement-quantity">
            <b :class="movement.delta > 0 ? 'positive' : movement.delta < 0 ? 'negative' : ''">
              {{ movement.delta > 0 ? '+' : '' }}{{ movement.delta }}
            </b>
            <span>{{ movement.before }} → {{ movement.after }}</span>
          </div>
        </div>
      </div>
      <p v-if="shown.length" class="hint">A mostrar {{ visible.length }} de {{ shown.length }} registo(s) filtrado(s).</p>
      <button v-if="shown.length > limit" type="button" class="text-button" @click="limit += 100">Mostrar mais movimentos</button>
    </section>
  </WorkspacePage>
</template>

<style scoped>
.movement-filters { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; margin: 1rem 0; }
.movement-filters label { display: grid; gap: .4rem; flex: 1 1 10rem; }
.movement-filters input, .movement-filters select { width: 100%; min-height: 44px; }
</style>
