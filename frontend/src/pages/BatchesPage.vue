<script setup>
import { computed, inject, ref, watch } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import { euros } from '../prices.js'

const api = inject('api'), auth = inject('auth')
const rows = ref([]), loading = ref(true), error = ref(''), query = ref(''), kind = ref(''), limit = ref(200)
const sort = ref({ key: 'date', dir: -1 })
const columns = [['date', 'Data'], ['pn', 'P/N'], ['description', 'Descrição'], ['supplier', 'Fornecedor / batch'], ['qty', 'Qt']]
const plain = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const kinds = computed(() => [...new Set(rows.value.map(row => row.kind))])
// Texto de pesquisa calculado uma vez por linha; o texto dos PDFs so entra aqui, nao na tabela.
const indexed = computed(() => rows.value.map(row => ({ row, text: plain([row.pn, row.supplier_pn, row.description, row.manufacturer, row.supplier,
  row.batch, row.date, row.system, row.person, row.notes, row.file, row.text].join(' ')) })))
const shown = computed(() => {
  const words = plain(query.value).split(/\s+/).filter(Boolean)
  const { key, dir } = sort.value
  return indexed.value.filter(({ row, text }) => (!kind.value || row.kind === kind.value) && words.every(word => text.includes(word)))
    .map(({ row }) => row)
    // Vazios sempre no fim, seja qual for a direcao.
    .sort((a, b) => (a[key] === '' || a[key] == null) - (b[key] === '' || b[key] == null)
      || dir * (key === 'qty' ? a.qty - b.qty : String(a[key]).localeCompare(String(b[key]), 'pt', { numeric: true })))
})
watch([query, kind, sort], () => { limit.value = 200 })
function sortBy(key) { sort.value = { key, dir: sort.value.key === key ? -sort.value.dir : key === 'date' ? -1 : 1 } }
const fileUrl = name => `/api/purchases/files/${name.split('/').map(encodeURIComponent).join('/')}`

async function load() {
  loading.value = true
  error.value = ''
  try { rows.value = (await api.direct('purchases')).purchases }
  catch (cause) { rows.value = []; error.value = cause.login ? 'Inicia sessão para ver as compras e encomendas.' : cause.message }
  finally { loading.value = false }
}
// Carrega logo e outra vez depois do login (o 401 abre o popup).
watch(() => auth.user?.id, load, { immediate: true })
</script>

<template>
  <WorkspacePage
    active="batches"
    eyebrow="Compras · encomendas"
    title="Batches"
    description="Tudo o que foi comprado ou mandado produzir, lido dos ficheiros em data/compras no servidor. Pesquisa por P/N, descrição, fornecedor ou data."
  >
    <section class="workspace-card batches-page">
      <div class="card-heading">
        <h2>Compras e encomendas</h2>
        <span class="status-pill">{{ shown.length === rows.length ? `${rows.length} linha(s)` : `${shown.length} de ${rows.length}` }}</span>
      </div>
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input v-model="query" type="search" aria-label="Pesquisar compras" placeholder="P/N, descrição, fornecedor, batch ou data (ex. 2026-03)" autocomplete="off">
      </div>
      <div class="toggle-chips compact" role="group" aria-label="Tipo">
        <button type="button" class="toggle-chip" :aria-pressed="!kind" @click="kind = ''">Tudo</button>
        <button v-for="name in kinds" :key="name" type="button" class="toggle-chip" :aria-pressed="kind === name" @click="kind = kind === name ? '' : name">
          {{ name }}<span class="chip-count">{{ rows.filter(row => row.kind === name).length }}</span>
        </button>
      </div>
      <p v-if="error" class="upload-error" role="alert">{{ error }} <button v-if="!auth.user" class="text-button" type="button" @click="auth.login()">Entrar</button></p>
      <div v-else-if="loading" class="empty-workspace">A ler os ficheiros de compras…</div>
      <div v-else-if="!shown.length" class="empty-workspace">{{ rows.length ? 'Nada corresponde à pesquisa.' : 'Ainda não há ficheiros em data/compras.' }}</div>
      <div v-else class="list batches-list">
        <table class="stock-table">
          <thead><tr>
            <th v-for="[key, label] in columns" :key="key" scope="col" :aria-sort="sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined">
              <button type="button" @click="sortBy(key)">{{ label }}<span aria-hidden="true">{{ sort.key === key ? (sort.dir > 0 ? '↑' : '↓') : '↕' }}</span></button>
            </th>
            <th scope="col">Preço</th><th scope="col">Ficheiro</th>
          </tr></thead>
          <tbody>
            <tr v-for="(row, index) in shown.slice(0, limit)" :key="index">
              <td>{{ row.date || '—' }}</td>
              <td class="batch-pn"><b>{{ row.pn || '—' }}</b><small v-if="row.supplier_pn">{{ row.supplier_pn }}</small></td>
              <td class="batch-desc">{{ row.description || '—' }}<small v-if="row.manufacturer || row.notes || row.system">{{ [row.manufacturer, row.system, row.notes].filter(Boolean).join(' · ') }}</small></td>
              <td>{{ row.supplier || '—' }}<small>{{ [row.kind, row.batch, row.person].filter(Boolean).join(' · ') }}</small></td>
              <td>{{ row.qty ?? '—' }}</td>
              <td class="price-cell">{{ row.price != null ? euros(row.price) : row.total != null ? `${euros(row.total)} total` : '—' }}</td>
              <td class="batch-files">
                <a v-if="row.doc" :href="fileUrl(row.doc)" target="_blank" rel="noopener">PDF</a>
                <a v-if="row.link" :href="row.link" target="_blank" rel="noopener">Link</a>
                <a v-if="row.kind !== 'Documento'" :href="fileUrl(row.file)" :title="`${row.file}${row.sheet ? ` › ${row.sheet}` : ''}`">Folha</a>
              </td>
            </tr>
          </tbody>
        </table>
        <button v-if="shown.length > limit" class="text-button batches-more" type="button" @click="limit += 500">Mostrar mais ({{ shown.length - limit }} restantes)</button>
      </div>
    </section>
  </WorkspacePage>
</template>
