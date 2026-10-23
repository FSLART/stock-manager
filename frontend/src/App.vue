<script setup>
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, shallowReactive, watch } from 'vue'
import { createApi, readStored } from './api.js'
import { componentValue, describe } from './stockText.js'
import InventoryCsvImport from './components/InventoryCsvImport.vue'
import StockItem from './components/StockItem.vue'
import StockMovement from './components/StockMovement.vue'
import CategoryForm from './components/CategoryForm.vue'
import AppNavigation from './components/AppNavigation.vue'
import LoginDialog from './components/LoginDialog.vue'
import HomePage from './pages/HomePage.vue'
import AnalogSimulationPage from './pages/AnalogSimulationPage.vue'
import MovementsPage from './pages/MovementsPage.vue'
import PcbBomPage from './pages/PcbBomPage.vue'
import SettingsPage from './pages/SettingsPage.vue'

const loginDialog = ref(null)
const api = createApi({ onUnauthorized() { auth.user = null; loginDialog.value?.open() } })
// enabled só vem do Flask; no Apps Script as alterações continuam sem login.
const auth = reactive({
  enabled: false, user: null, notion: false,
  login: () => loginDialog.value.open(),
  async logout() {
    try { toast((await api.direct('logout')).msg); auth.user = null }
    catch (error) { toast(error.message, true) }
  },
})
provide('api', api)
provide('auth', auth)
provide('movementFilter', ref(''))
// Com sessão a ação corre logo; sem sessão abre o popup e continua depois do login.
function guard(fn) {
  return (...args) => !auth.enabled || auth.user ? fn(...args) : loginDialog.value.open().then(ok => ok && fn(...args))
}
const categories = ref([]), items = ref([]), current = ref(null), query = ref('')
const busy = ref(false), loading = ref(true), toastMessage = ref(''), toastUndo = ref(null), formError = ref('')
const movement = ref(null), categoryForm = ref(null)
const csvImport = ref(null), csvError = ref('')
const canEdit = ref(false), categoryError = ref('')
const queues = shallowReactive(new Map())
let timer, toastTimer, refreshing = false, disposed = false
const normalize = value => String(value).toLowerCase().replace(/\s+/g, '')
const propertyFilters = ref({}), filterSearch = ref({}), stockFilter = ref(''), imageFilter = ref('')
const filtersOpen = ref(false), sortKey = ref(''), sortDirection = ref(1)
const scopedItems = computed(() => items.value.filter(item => !current.value || item.cat === current.value))
const propertyKeys = computed(() => [...new Set([
  ...scopedItems.value.flatMap(item => Object.keys(item.props)),
])])
const facets = computed(() => propertyKeys.value.map(key => ({ key, values: [...new Set(
  scopedItems.value.map(item => String(item.props[key] ?? '')).filter(Boolean)
)].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true })) })))
// "Tudo" mistura categorias com propriedades diferentes: uma coluna Descrição em vez de uma por propriedade.
// Dentro de uma categoria cada propriedade tem a sua coluna, para ordenar e filtrar, e Componente seria repetida.
const showCategory = computed(() => !current.value)
const columns = computed(() => [
  ...(showCategory.value ? [{ key: 'cat', label: 'Categoria' }, { key: 'component', label: 'Componente' }] : []),
  ...(showCategory.value ? [{ key: 'desc', label: 'Descrição' }] : propertyKeys.value.map(key => ({ key: `prop:${key}`, label: key }))),
  { key: 'qty', label: 'Quantidade' },
])
const activeFilters = computed(() => Object.values(propertyFilters.value).reduce((sum, values) => sum + values.length, 0) + Number(Boolean(stockFilter.value)) + Number(Boolean(imageFilter.value)))
watch(current, () => { propertyFilters.value = {}; filterSearch.value = {} })
function clearFilters() {
  current.value = null
  query.value = ''
  propertyFilters.value = {}
  filterSearch.value = {}
  stockFilter.value = ''
  imageFilter.value = ''
}
function toggleProperty(key, value) {
  const selected = propertyFilters.value[key] || []
  propertyFilters.value[key] = selected.includes(value) ? selected.filter(entry => entry !== value) : [...selected, value]
}
// Nos cartões do telemóvel não há cabeçalhos clicáveis: um seletor faz o mesmo papel.
const sortChoice = computed({ get: () => sortKey.value, set: key => { sortKey.value = key; sortDirection.value = 1 } })
function sortBy(key) {
  sortDirection.value = sortKey.value === key ? -sortDirection.value : 1
  sortKey.value = key
}
const sortValue = (item, key) => key === 'component' ? componentValue(item) : key === 'desc' ? describe(item) : key.startsWith('prop:') ? item.props[key.slice(5)] ?? '' : item[key]
const shown = computed(() => items.value.filter(item =>
  (!current.value || item.cat === current.value) &&
  normalize(item.cat + Object.values(item.props).join('')).includes(normalize(query.value)) &&
  Object.entries(propertyFilters.value).every(([key, values]) => !values.length || values.includes(String(item.props[key] ?? ''))) &&
  (!stockFilter.value || (stockFilter.value === 'empty' ? item.qty === 0 : stockFilter.value === 'low' ? item.qty > 0 && item.qty <= 5 : item.qty > 0)) &&
  (!imageFilter.value || Boolean(item.image) === (imageFilter.value === 'yes'))
).sort((a, b) => {
  if (!sortKey.value) return 0
  const av = sortValue(a, sortKey.value), bv = sortValue(b, sortKey.value)
  return sortDirection.value * (sortKey.value === 'qty' ? av - bv : String(av).localeCompare(String(bv), 'pt', { numeric: true, sensitivity: 'base' }))
}))
const units = computed(() => shown.value.reduce((sum, item) => sum + item.qty, 0))
const total = name => items.value.filter(item => !name || item.cat === name).reduce((sum, item) => sum + item.qty, 0)
const color = name => `hsl(${[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)} 65% 48%)`
const locked = computed(() => busy.value || queues.size > 0)

const pages = { home: HomePage, 'analog-simulation': AnalogSimulationPage, movements: MovementsPage, pcbs: PcbBomPage, settings: SettingsPage }
const routeKeys = { '/': 'home', '/stock': 'stock', '/analog-simulation': 'analog-simulation', '/movements': 'movements', '/pcbs': 'pcbs', '/settings': 'settings' }
const page = ref(routeKeys[window.location.hash.slice(1)] || 'home')
function readRoute() { page.value = routeKeys[window.location.hash.slice(1)] || 'home' }
const navigation = { push(path) { window.location.hash = path; readRoute() } }
provide('navigation', navigation)
const preferences = reactive({ compact: readStored('stocklart-compact-mode', false) === true, notifications: readStored('stocklart-notifications', true) !== false })
provide('preferences', preferences)
provide('inventory', reactive({
  totalUnits: computed(() => total()),
  categoryCount: computed(() => categories.value.length),
  async manageCategories() { navigation.push('/stock'); await nextTick(); document.querySelector('nav[aria-label="Categorias"]')?.focus() },
  addMaterial: guard(async () => { navigation.push('/stock'); await nextTick(); if (categories.value.length) movement.value.open(current.value) }),
}))

function toast(message, important = false, undo = null) {
  if (!preferences.notifications && !important && !undo) return
  toastMessage.value = message || ''
  toastUndo.value = undo
  clearTimeout(toastTimer)
  // Quem pode desfazer precisa de mais tempo para ler e decidir.
  toastTimer = setTimeout(() => { toastMessage.value = ''; toastUndo.value = null }, undo ? 8000 : 3000)
}
async function load() {
  const data = await api.load()
  if (disposed) return
  categories.value = data.categories
  items.value = data.items
  canEdit.value = Boolean(data.can_edit)
  Object.assign(auth, { enabled: Boolean(data.auth), user: data.user || null, notion: Boolean(data.notion_login) })
  if (current.value && !categories.value.some(c => c.name === current.value)) current.value = null
}
async function act(action, payload, success) {
  if (busy.value || queues.size) return
  busy.value = true
  toast('A sincronizar...')
  try {
    const result = await api.request(action, payload)
    const saved = success?.(result)
    if (saved !== false) toast(result.msg)
    if (!result.queued) await load()
  } catch (error) { toast(error.message, true) }
  finally { busy.value = false }
}
function deleteItem(item) {
  if (!confirm(`Apagar ${componentValue(item)} (${item.cat}, ${item.qty} un.) do stock?`)) return
  act('deleteItem', { id: item.id }, () => {
    // Desfazer repõe o componente com as mesmas propriedades, quantidade e imagem (ganha um id novo).
    if (item.qty > 0) toast(`Apagado: ${componentValue(item)}`, false, async () => {
      toastMessage.value = ''; toastUndo.value = null
      await act('move', { cat: item.cat, props: item.props, qty: item.qty, mode: 'in', image: item.image || '' })
    })
    return false
  })
}
function deleteCategory(category) {
  const refs = items.value.filter(item => item.cat === category.name)
  const warning = refs.length
    ? `Isto vai apagar também ${refs.length} referência(s) (${total(category.name)} unidades) que estão lá dentro. Esta ação não pode ser desfeita.`
    : 'Esta ação não pode ser desfeita.'
  if (confirm(`Apagar a categoria "${category.name}"?\n\n${warning}`)) {
    act('deleteCategory', { name: category.name }, () => {
      if (current.value === category.name) current.value = null
    })
  }
}
function stepItem(item, requestedDelta) {
  if (busy.value) return
  const delta = Math.max(0, item.qty + requestedDelta) - item.qty
  if (!delta) return
  item.qty += delta
  const queue = queues.get(item.id) || { pending: 0, running: false, timer: null }
  queue.pending += delta
  queues.set(item.id, queue)
  if (!queue.running && !queue.timer) {
    queue.timer = setTimeout(() => { queue.timer = null; processQueue(item.id, queue) }, 150)
  }
}
async function processQueue(id, queue) {
  queue.running = true
  toast('A sincronizar...')
  try {
    while (queue.pending) {
      const delta = queue.pending
      queue.pending = 0
      try {
        const result = await api.request('step', { id, delta })
        if (result.queued) toast(result.msg)
      } catch (error) {
        const item = items.value.find(item => item.id === id)
        if (item) item.qty = Math.max(0, item.qty - delta)
        toast(error.message, true)
      }
    }
  } finally { queues.delete(id) }
}
async function submitMovement({ file, imageUrl, ...payload }) {
  if (busy.value || queues.size) return
  busy.value = true
  formError.value = ''
  try {
    const editing = payload.id !== undefined
    if (file || imageUrl) payload.image = await api.uploadImage(file || imageUrl)
    else if (!editing) payload.image = ''
    if (editing) { delete payload.mode; delete payload.cat }
    const result = await api.request(editing ? 'editItem' : 'move', payload)
    movement.value.close()
    toast(result.msg)
    if (!result.queued) await load()
  } catch (error) { formError.value = error.message }
  finally { busy.value = false }
}
async function submitCsv(rows) {
  if (locked.value || !rows.length) return
  busy.value = true
  csvError.value = ''
  try {
    const result = await api.importInventory(rows)
    csvImport.value.close()
    toast(result.msg)
    await load()
  } catch (error) { csvError.value = error.message }
  finally { busy.value = false }
}
function openCategory(category) {
  categoryError.value = ''
  categoryForm.value.open(category)
}
async function submitCategory(payload) {
  if (busy.value || queues.size) return
  busy.value = true
  categoryError.value = ''
  try {
    const result = await api.request(payload.originalName ? 'editCategory' : 'newCategory', payload)
    categoryForm.value.close()
    current.value = payload.name
    toast(result.msg)
    if (!result.queued) await load()
  } catch (error) { categoryError.value = error.message }
  finally { busy.value = false }
}
async function refresh() {
  if (refreshing || busy.value || queues.size || document.visibilityState === 'hidden') return
  refreshing = true
  try {
    const count = await api.syncPending(toast)
    await load()
    if (count) toast(`${count} operação(ões) sincronizada(s)`)
  } catch { /* Preserve the last visible snapshot when the network is down. */ }
  finally { refreshing = false }
}
const guarded = {
  step: guard(stepItem), deleteItem: guard(deleteItem), deleteCategory: guard(deleteCategory), openCategory: guard(openCategory),
  openMovement: guard(() => movement.value.open(current.value)), editItem: guard(item => movement.value.edit(item)), importCsv: guard(() => csvImport.value.open()),
}
onMounted(async () => {
  window.addEventListener('online', refresh)
  window.addEventListener('hashchange', readRoute)
  timer = setInterval(refresh, 15000)
  try {
    await api.syncPending(toast)
    await load()
  } catch (error) { toast(error.message || 'Sem ligação ao servidor e sem dados guardados neste dispositivo', true) }
  finally { loading.value = false }
})
onUnmounted(() => {
  disposed = true
  clearInterval(timer)
  clearTimeout(toastTimer)
  for (const queue of queues.values()) clearTimeout(queue.timer)
  window.removeEventListener('online', refresh)
  window.removeEventListener('hashchange', readRoute)
})
</script>

<template>
  <component :is="pages[page]" v-if="page !== 'stock'" />
  <div v-else class="stock-page" :class="{ compact: preferences.compact }">
  <AppNavigation active="stock" />
  <div class="stock-shell">
  <aside class="sidebar">
    <!-- O fundo da barra vai até ao fim da página; o conteúdo fica fixo no topo enquanto a lista desce. -->
    <div class="sidebar-inner">
    <div class="sidebar-heading"><h2>Categorias</h2><button class="new-category" aria-label="Nova categoria" :disabled="locked" @click="guarded.openCategory()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nova</button></div>
    <nav class="category-nav" aria-label="Categorias" tabindex="-1">
      <div class="cat-row"><button :aria-current="!current" @click="current = null">Tudo <span class="n">{{ total() }}</span></button></div>
      <div v-for="category in categories" :key="category.name" class="cat-row">
        <button :aria-current="current === category.name" @click="current = category.name"><span><i class="dot" :style="{ background: color(category.name) }"></i>{{ category.name }}</span><span class="n">{{ total(category.name) }}</span></button>
        <button v-if="canEdit" class="cat-edit" :aria-label="`Editar categoria ${category.name}`" :disabled="locked" @click="guarded.openCategory(category)">Editar</button>
        <button class="cat-del" :aria-label="`Apagar categoria ${category.name}`" title="Apagar categoria" :disabled="locked" @click="guarded.deleteCategory(category)">✕</button>
      </div>
    </nav>
    </div>
  </aside>
  <main class="stock-content">
    <div class="top">
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input v-model="query" type="search" aria-label="Pesquisar componentes" placeholder="Pesquisar componentes…" autocomplete="off">
      </div>
      <button v-if="canEdit" class="text-button import-csv-button" aria-label="Importar CSV" :disabled="locked || !categories.length" @click="guarded.importCsv()">Importar CSV</button>
      <button class="primary" :disabled="locked || !categories.length" @click="guarded.openMovement()">Adicionar / retirar</button>
    </div>
    <section class="filter-section" :class="{ open: filtersOpen || activeFilters }" aria-label="Filtros de componentes">
      <div class="filter-toolbar">
        <button class="filter-toggle" :aria-expanded="filtersOpen" @click="filtersOpen = !filtersOpen">Filtros <span v-if="activeFilters" class="filter-count">{{ activeFilters }}</span><span aria-hidden="true">{{ filtersOpen ? '⌃' : '⌄' }}</span></button>
        <div class="quick-filters">
          <select v-model="stockFilter" aria-label="Filtrar stock"><option value="">Todo o stock</option><option value="available">Em stock</option><option value="low">Pouco stock (1–5)</option><option value="empty">Sem stock</option></select>
          <select v-model="imageFilter" aria-label="Filtrar imagens"><option value="">Todas as imagens</option><option value="yes">Com imagem</option><option value="no">Sem imagem</option></select>
          <button class="clear-filters" aria-label="Limpar filtros" :disabled="!activeFilters && !query && !current" @click="clearFilters">✕ Limpar filtros</button>
        </div>
      </div>
      <div v-show="filtersOpen" class="filter-panels">
        <div v-for="facet in facets" :key="facet.key" class="filter-panel">
          <h2>{{ facet.key }}</h2>
          <input v-model="filterSearch[facet.key]" type="text" :aria-label="`Pesquisar filtro ${facet.key}`" placeholder="Pesquisar…">
          <div class="filter-options">
            <label v-for="value in facet.values.filter(value => normalize(value).includes(normalize(filterSearch[facet.key] || '')))" :key="value" class="filter-option">
              <input type="checkbox" :aria-label="`Filtrar ${facet.key}: ${value}`" :checked="(propertyFilters[facet.key] || []).includes(value)" @change="toggleProperty(facet.key, value)"><span :title="value">{{ value }}</span>
            </label>
            <p v-if="!facet.values.length" class="filter-no-values">Sem valores</p>
          </div>
        </div>
        <p v-if="!facets.length" class="filter-no-values">As propriedades das categorias aparecem aqui como filtros.</p>
      </div>
    </section>
    <div class="heading"><h1>{{ current || 'Tudo em stock' }}</h1><span class="sub">{{ shown.length }} {{ shown.length === 1 ? 'referência' : 'referências' }} · {{ units }} {{ units === 1 ? 'unidade' : 'unidades' }}</span></div>
    <div class="mobile-sort">
      <label>Ordenar por
        <select v-model="sortChoice"><option value="">Ordem original</option><option v-for="column in columns" :key="column.key" :value="column.key">{{ column.label }}</option></select>
      </label>
      <button class="text-button" :disabled="!sortKey" :aria-label="sortDirection === 1 ? 'Ordem crescente, inverter' : 'Ordem decrescente, inverter'" @click="sortDirection = -sortDirection">{{ sortDirection === 1 ? '↑' : '↓' }}</button>
    </div>
    <div class="list" :aria-busy="loading">
      <div v-if="loading" class="empty">A carregar stock…</div>
      <template v-else>
        <table class="stock-table">
          <caption class="sr-only">Stock de componentes</caption>
          <thead><tr>
            <th scope="col" class="image-column">Imagem</th>
            <th v-for="column in columns" :key="column.key" scope="col" :aria-sort="sortKey === column.key ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none'">
              <button :aria-label="`Ordenar por ${column.label}`" @click="sortBy(column.key)">{{ column.label }} <span aria-hidden="true">{{ sortKey === column.key ? (sortDirection === 1 ? '↑' : '↓') : '↕' }}</span></button>
            </th>
            <th scope="col">Ações</th>
          </tr></thead>
          <tbody><StockItem v-for="item in shown" :key="item.id" :item="item" :property-keys="showCategory ? [] : propertyKeys" :show-category="showCategory" :busy="busy" :locked="locked" :can-edit="canEdit" @edit="guarded.editItem(item)" @step="delta => guarded.step(item, delta)" @delete="guarded.deleteItem(item)" /></tbody>
        </table>
        <div v-if="!shown.length" class="empty"><b>Nada encontrado.</b><br>Tenta outra pesquisa ou adiciona um item novo.</div>
      </template>
    </div>
  </main>
  </div>
  </div>
  <StockMovement ref="movement" :categories="categories" :items="items" :busy="busy" :error="formError" @submit="submitMovement" @clear-error="formError = ''" />
  <CategoryForm ref="categoryForm" :categories="categories" :busy="busy" :error="categoryError" @submit="submitCategory" />
  <InventoryCsvImport ref="csvImport" :categories="categories" :current="current" :busy="busy" :error="csvError" @submit="submitCsv" @clear-error="csvError = ''" />
  <LoginDialog ref="loginDialog" @login="user => { auth.user = user; toast(`Sessão iniciada: ${user.name}`) }" />
  <div id="toast" role="status" :class="{ on: toastMessage }">{{ toastMessage }}<button v-if="toastUndo" class="toast-undo" @click="toastUndo()">Desfazer</button></div>
</template>
