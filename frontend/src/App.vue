<script setup>
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, shallowReactive, watch } from 'vue'
import { createApi, readStored, writeStored } from './api.js'
import { componentValue, describe, mainKey, partNumberOf } from './stockText.js'
import { siValue } from './pcbStock.js'
import { euros, priceEstimator } from './prices.js'
import InventoryCsvImport from './components/InventoryCsvImport.vue'
import StockItem from './components/StockItem.vue'
import StockMovement from './components/StockMovement.vue'
import CategoryForm from './components/CategoryForm.vue'
import PartsCatalog from './components/PartsCatalog.vue'
import LabelScanner from './components/LabelScanner.vue'
import InventoryTutorial from './components/InventoryTutorial.vue'
import AppNavigation from './components/AppNavigation.vue'
import LoginDialog from './components/LoginDialog.vue'
import HomePage from './pages/HomePage.vue'
import AnalogSimulationPage from './pages/AnalogSimulationPage.vue'
import MovementsPage from './pages/MovementsPage.vue'
import PcbBomPage from './pages/PcbBomPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import LocationsPage from './pages/LocationsPage.vue'
import HarnessPage from './pages/HarnessPage.vue'
import LabelsPage from './pages/LabelsPage.vue'

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
const categories = ref([]), items = ref([]), parts = ref([]), locationImages = ref({}), locationCodes = ref({}), labels = ref([]), current = ref(null), section = ref(null), query = ref('')
const busy = ref(false), loading = ref(true), toastMessage = ref(''), toastUndo = ref(null), formError = ref('')
const movement = ref(null), categoryForm = ref(null), partsCatalog = ref(null), labelScanner = ref(null)
const csvImport = ref(null), csvError = ref(''), inventoryTutorial = ref(null)
const canEdit = ref(false), categoryError = ref('')
const queues = shallowReactive(new Map())
let timer, toastTimer, refreshing = false, disposed = false
const normalize = value => String(value).toLowerCase().replace(/\s+/g, '')
const propertyFilters = ref({}), filterSearch = ref({}), stockFilter = ref(''), imageFilter = ref(''), locationFilter = ref('')
const filtersOpen = ref(false), sortKey = ref(''), sortDirection = ref(1)
const sectionOf = computed(() => Object.fromEntries(categories.value.map(c => [c.name, c.section])))
// Subcategorias: uma categoria mostra o seu stock e o de todas as que estão dentro dela.
const childrenOf = computed(() => {
  const names = new Set(categories.value.map(c => c.name)), map = new Map()
  for (const c of categories.value) { const parent = names.has(c.parent) ? c.parent : null; map.set(parent, [...(map.get(parent) || []), c]) }
  return map
})
const subtree = name => [name, ...(childrenOf.value.get(name) || []).flatMap(c => subtree(c.name))]
const scope = computed(() => new Set(current.value ? subtree(current.value) : []))
const trail = computed(() => {
  const byName = new Map(categories.value.map(c => [c.name, c])), path = []
  for (let c = byName.get(byName.get(current.value)?.parent); c && !path.includes(c.name); c = byName.get(c.parent)) path.unshift(c.name)
  return path
})
const inScope = item => current.value ? scope.value.has(item.cat) : !section.value || sectionOf.value[item.cat] === section.value
// Secções dobradas e categorias sem referências ficam escondidas; a categoria aberta mostra-se sempre.
const folded = ref(new Set(readStored('stocklart-folded-sections', []))), showEmpty = ref(readStored('stocklart-show-empty', false) === true)
const filled = computed(() => new Set(items.value.map(item => item.cat)))
const emptyCount = computed(() => categories.value.filter(c => !filled.value.has(c.name)).length)
const sections = computed(() => [...new Set(categories.value.map(c => c.section))].map(name => {
  const all = categories.value.filter(c => c.section === name)
  const open = !folded.value.has(name) || all.some(c => c.name === current.value)
  // Árvore achatada por ordem, com a profundidade para a indentação; uma mãe aparece se algo dentro dela tiver stock.
  const rows = [], visit = (category, depth) => {
    if (!showEmpty.value && !subtree(category.name).some(n => filled.value.has(n) || n === current.value)) return
    rows.push({ ...category, depth })
    for (const child of childrenOf.value.get(category.name) || []) visit(child, depth + 1)
  }
  if (open) for (const category of childrenOf.value.get(null) || []) if (category.section === name) visit(category, 0)
  return { name, open, categories: rows }
}))
function fold(name) {
  folded.value = new Set(folded.value.has(name) ? [...folded.value].filter(entry => entry !== name) : [...folded.value, name])
  writeStored('stocklart-folded-sections', [...folded.value])
}
watch(showEmpty, value => writeStored('stocklart-show-empty', value))
const scopedItems = computed(() => items.value.filter(inScope))
const propertyKeys = computed(() => [...new Set([
  ...scopedItems.value.flatMap(item => Object.keys(item.props)),
])])
const facets = computed(() => propertyKeys.value.map(key => ({ key, values: [...new Set(
  scopedItems.value.map(item => String(item.props[key] ?? '')).filter(Boolean)
)].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true })) })))
// "Tudo" mistura categorias com propriedades diferentes: uma coluna Descrição em vez de uma por propriedade.
// Dentro de uma categoria cada propriedade tem a sua coluna, para ordenar e filtrar, e Componente seria repetida.
const showCategory = computed(() => scope.value.size !== 1)
const columns = computed(() => [
  ...(showCategory.value ? [{ key: 'cat', label: 'Categoria' }, { key: 'component', label: 'Componente' }] : []),
  ...(showCategory.value ? [{ key: 'desc', label: 'Descrição' }] : propertyKeys.value.map(key => ({ key: `prop:${key}`, label: key }))),
  { key: 'location', label: 'Localização' }, { key: 'price', label: 'Preço un.' }, { key: 'qty', label: 'Quantidade' }, { key: 'value', label: 'Valor' },
])
const activeFilters = computed(() => Object.values(propertyFilters.value).reduce((sum, values) => sum + values.length, 0) + Number(Boolean(stockFilter.value)) + Number(Boolean(imageFilter.value)) + Number(locationFilter.value !== ''))
watch([current, section], () => { propertyFilters.value = {}; filterSearch.value = {} })
function clearFilters() {
  current.value = null
  section.value = null
  query.value = ''
  propertyFilters.value = {}
  filterSearch.value = {}
  stockFilter.value = ''
  imageFilter.value = ''
  locationFilter.value = ''
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
const NUMERIC = new Set(['qty', 'price', 'value'])
const sortValue = (item, key) => key === 'component' ? componentValue(item) : key === 'desc' ? describe(item) : key.startsWith('prop:') ? item.props[key.slice(5)] ?? ''
  : key === 'price' ? priceOf.value(item)?.price ?? -1 : key === 'value' ? item.qty * (priceOf.value(item)?.price ?? 0) : item[key] ?? ''
// Resistências e condensadores ficam na caixa por encapsulamento e depois por valor: a lista segue a mesma ordem.
const packageOf = item => String(Object.entries(item.props).find(([key]) => /^(encapsulamento|tamanho|footprint|package)/i.test(key.trim()))?.[1] ?? '')
const valueOf = item => siValue(item.props[mainKey(item)], mainKey(item)) ?? Infinity
const byBox = (a, b) => packageOf(a).localeCompare(packageOf(b), 'pt', { numeric: true }) || valueOf(a) - valueOf(b)
const shown = computed(() => items.value.filter(item =>
  inScope(item) &&
  normalize(item.cat + Object.values(item.props).join('') + (item.location || '')).includes(normalize(query.value)) &&
  // null é "Sem localização"; '' é todas.
  (locationFilter.value === '' || (item.location || '') === (locationFilter.value ?? '')) &&
  Object.entries(propertyFilters.value).every(([key, values]) => !values.length || values.includes(String(item.props[key] ?? ''))) &&
  (!stockFilter.value || (stockFilter.value === 'empty' ? item.qty === 0 : stockFilter.value === 'low' ? item.qty > 0 && item.qty <= 5 : item.qty > 0)) &&
  (!imageFilter.value || Boolean(item.image) === (imageFilter.value === 'yes'))
).sort((a, b) => {
  if (!sortKey.value) return /resist|condens|capacit/i.test(current.value ?? '') ? byBox(a, b) : 0
  const av = sortValue(a, sortKey.value), bv = sortValue(b, sortKey.value)
  return sortDirection.value * (NUMERIC.has(sortKey.value) ? av - bv : String(av).localeCompare(String(bv), 'pt', { numeric: true, sensitivity: 'base' }))
}))
const units = computed(() => shown.value.reduce((sum, item) => sum + item.qty, 0))
const priceOf = computed(() => priceEstimator(parts.value))
const estimate = computed(() => {
  const priced = shown.value.map(item => [item, priceOf.value(item)]).filter(([, price]) => price)
  return { value: priced.reduce((sum, [item, { price }]) => sum + item.qty * price, 0), missing: shown.value.length - priced.length }
})
const total = name => { const names = new Set(name ? subtree(name) : []); return items.value.filter(item => !name || names.has(item.cat)).reduce((sum, item) => sum + item.qty, 0) }
const sectionTotal = name => items.value.filter(item => sectionOf.value[item.cat] === name).reduce((sum, item) => sum + item.qty, 0)
const color = name => `hsl(${[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)} 65% 48%)`
const locked = computed(() => busy.value || queues.size > 0)
// Inclui as caixas criadas na página Localizações que ainda estão vazias.
const locations = computed(() => [...new Set([...items.value.map(item => item.location), ...Object.keys(locationImages.value)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true })))
const selected = ref(new Set()), locationName = ref('')
let lastPicked = null
const allShownSelected = computed(() => shown.value.length > 0 && shown.value.every(item => selected.value.has(item.id)))
function pick(item, shift) {
  const on = !selected.value.has(item.id), list = shown.value
  const from = list.findIndex(entry => entry.id === lastPicked), to = list.indexOf(item)
  // Shift+clique marca (ou desmarca) tudo entre o último clicado e este.
  for (const entry of shift && from >= 0 ? list.slice(Math.min(from, to), Math.max(from, to) + 1) : [item]) {
    if (on) selected.value.add(entry.id); else selected.value.delete(entry.id)
  }
  lastPicked = item.id
}
function toggleShown() {
  const on = !allShownSelected.value
  for (const item of shown.value) { if (on) selected.value.add(item.id); else selected.value.delete(item.id) }
}
// P/N únicos dos selecionados; "-" é a convenção para "sem P/N".
const selectedPartNumbers = computed(() => [...new Map(items.value.filter(item => selected.value.has(item.id))
  .map(partNumberOf).filter(mpn => mpn && mpn !== '-').map(mpn => [mpn.toUpperCase(), mpn])).values()])
// Um pedido de cada vez, para não bater nos limites da Mouser/DigiKey; o servidor guarda cada peça no catálogo.
// Como no formulário, a imagem da API vai para os selecionados com esse P/N que ainda não têm uma.
async function syncSelected() {
  if (busy.value || queues.size) return
  busy.value = true
  const mpns = selectedPartNumbers.value, failed = []
  try {
    for (const [index, mpn] of mpns.entries()) {
      toast(`A sincronizar ${index + 1}/${mpns.length}: ${mpn}`)
      try {
        const { image } = await api.direct('lookupPart', { mpn })
        const missing = items.value.filter(item => selected.value.has(item.id) && !item.image && partNumberOf(item).toUpperCase() === mpn.toUpperCase()
          && categories.value.find(category => category.name === item.cat)?.image)
        if (!image || !missing.length) continue
        const url = await api.uploadImage(image)
        for (const { id, props, qty } of missing) await api.direct('editItem', { id, props, qty, image: url })
      } catch (error) { failed.push(`${mpn} (${error.message})`) }
    }
    await load()
    toast(failed.length ? `Sem sincronizar: ${failed.join('; ')}` : `${mpns.length} P/N sincronizado(s) com a Mouser/DigiKey`, failed.length > 0)
  } finally { busy.value = false }
}
function setLocation(location) {
  act('setLocation', { ids: [...selected.value], location }, () => { selected.value = new Set(); locationName.value = '' })
}

const pages = { home: HomePage, 'analog-simulation': AnalogSimulationPage, movements: MovementsPage, pcbs: PcbBomPage, settings: SettingsPage, locations: LocationsPage, labels: LabelsPage, harness: HarnessPage }
const routeKeys = { '/': 'home', '/stock': 'stock', '/analog-simulation': 'analog-simulation', '/movements': 'movements', '/pcbs': 'pcbs', '/settings': 'settings', '/locations': 'locations', '/labels': 'labels', '/harness': 'harness' }
const page = ref('home')
// #/stock?location=Caixa%201 (o QR de cada caixa) abre o inventário só com essa localização.
// Antes de os dados chegarem o código ainda não tem nome: load() volta a tentar.
let pendingBox = null
function openBox() {
  const name = Object.keys(locationCodes.value).find(entry => locationCodes.value[entry] === pendingBox)
  if (name !== undefined) { locationFilter.value = name; pendingBox = null }
}
function readRoute() {
  const [path, search] = window.location.hash.slice(1).split('?')
  page.value = routeKeys[path] || 'home'
  const location = new URLSearchParams(search).get('location')
  if (location !== null) { clearFilters(); locationFilter.value = location }
  // #/stock?box=K7Q2MX vem do QR impresso: o código fica fixo mesmo que a caixa mude de nome.
  pendingBox = new URLSearchParams(search).get('box')?.toUpperCase() || null
  if (pendingBox) { clearFilters(); openBox() }
}
readRoute()
const navigation = { push(path) { window.location.hash = path; readRoute() } }
provide('navigation', navigation)
const preferences = reactive({ compact: readStored('stocklart-compact-mode', false) === true, notifications: readStored('stocklart-notifications', true) !== false })
provide('preferences', preferences)
provide('inventory', reactive({
  totalUnits: computed(() => total()),
  categoryCount: computed(() => categories.value.length),
  items: computed(() => items.value),
  locations: computed(() => locationImages.value),
  codes: computed(() => locationCodes.value),
  labels: computed(() => labels.value),
  canEdit: computed(() => canEdit.value),
  editLocation: guard(async ({ file, ...payload }, done) => {
    if (file) {
      try { payload.image = await api.uploadImage(file) } catch (error) { return toast(error.message, true) }
    }
    await act('editLocation', payload, done)
  }),
  deleteLocation: guard(name => act('deleteLocation', { name })),
  saveLabel: guard((label, done) => act('saveLabel', label, done)),
  deleteLabels: guard((ids, done) => act('deleteLabels', { ids }, done)),
  consume: guard((payload, done) => act('consumeItems', payload, done)),
  revertMovements: guard((ids, done) => act('revertMovements', { ids }, done)),
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
  parts.value = data.parts || []
  locationImages.value = data.locations || {}
  locationCodes.value = data.location_codes || {}
  labels.value = data.labels || []
  if (pendingBox) openBox()
  canEdit.value = Boolean(data.can_edit)
  const ids = new Set(data.items.map(item => item.id))
  for (const id of selected.value) if (!ids.has(id)) selected.value.delete(id)
  Object.assign(auth, { enabled: Boolean(data.auth), user: data.user || null, notion: Boolean(data.notion_login) })
  if (current.value && !categories.value.some(c => c.name === current.value)) current.value = null
  if (section.value && !categories.value.some(c => c.section === section.value)) section.value = null
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
  const warning = (refs.length
    ? `Isto vai apagar também ${refs.length} referência(s) (${refs.reduce((sum, item) => sum + item.qty, 0)} unidades) que estão lá dentro. Esta ação não pode ser desfeita.`
    : 'Esta ação não pode ser desfeita.') + (childrenOf.value.has(category.name) ? '\n\nAs subcategorias ficam e sobem um nível.' : '')
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
async function submitMovement({ file, imageUrl, partPrice, priceOnly, ...payload }) {
  if (busy.value || queues.size) return
  busy.value = true
  formError.value = ''
  try {
    const editing = payload.id !== undefined
    if (file || imageUrl) payload.image = await api.uploadImage(file || imageUrl)
    else if (!editing) payload.image = ''
    if (editing) { delete payload.mode; delete payload.cat }
    const result = priceOnly ? await api.request('savePart', partPrice) : await api.request(editing ? 'editItem' : 'move', payload)
    if (partPrice && !priceOnly) await api.request('savePart', partPrice)
    movement.value.close()
    toast(result.msg)
    if (!result.queued) await load()
  } catch (error) { formError.value = error.message }
  finally { busy.value = false }
}
// A etiqueta abre logo o formulário; a Mouser/DigiKey completam depois o catálogo (descrição, categoria, datasheet,
// preço atual) e a imagem. Sem chaves das APIs ou sem resultado, fica o que a etiqueta trouxe.
async function useLabel(label) {
  movement.value.open(current.value, label)
  let found
  try { found = await api.direct('lookupPart', { mpn: label.mpn }) } catch { return }
  if (!found?.part) return
  updatePart(found.part)
  await nextTick()
  movement.value.fill(label, found.image)
}
function updatePart(found) { parts.value = [...parts.value.filter(part => part.mpn.toUpperCase() !== found.mpn.toUpperCase()), found] }
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
const partError = ref('')
async function savePart(part) {
  if (busy.value || queues.size) return
  busy.value = true
  partError.value = ''
  try {
    const result = await api.request('savePart', part)
    partsCatalog.value.closeForm()
    toast(result.msg)
    if (!result.queued) await load()
  } catch (error) { partError.value = error.message }
  finally { busy.value = false }
}
function deleteFromForm(name) {
  categoryForm.value.close()
  deleteCategory(categories.value.find(category => category.name === name))
}
function openCategory(category) {
  categoryError.value = ''
  categoryForm.value.open(category, section.value || sectionOf.value[current.value])
}
async function submitCategory(payload) {
  if (busy.value || queues.size) return
  busy.value = true
  categoryError.value = ''
  try {
    const result = await api.request(payload.originalName ? 'editCategory' : 'newCategory', payload)
    categoryForm.value.close()
    current.value = payload.name
    section.value = null
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
  step: guard(stepItem), deleteItem: guard(deleteItem), deleteCategory: guard(deleteCategory), openCategory: guard(openCategory), savePart: guard(savePart),
  openMovement: guard(() => movement.value.open(current.value)), scanLabel: guard(() => labelScanner.value.open()), editItem: guard(item => movement.value.edit(item)), setLocation: guard(setLocation), syncSelected: guard(syncSelected), importCsv: guard(() => csvImport.value.open()),
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
      <div class="cat-row"><button :aria-current="!current && !section" @click="current = null; section = null">Tudo <span class="n">{{ total() }}</span></button></div>
      <template v-for="group in sections" :key="group.name">
      <div class="cat-section"><button class="fold" :aria-expanded="group.open" :aria-label="`${group.open ? 'Dobrar' : 'Abrir'} ${group.name}`" @click="fold(group.name)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><button :aria-current="!current && section === group.name" @click="current = null; section = group.name">{{ group.name }} <span class="n">{{ sectionTotal(group.name) }}</span></button></div>
      <div v-for="category in group.categories" :key="category.name" class="cat-row">
        <button :aria-current="current === category.name" :style="{ '--depth': category.depth }" @click="current = category.name; section = null"><span><i class="dot" :style="{ background: color(category.name) }"></i>{{ category.name }}</span><span class="n">{{ total(category.name) }}</span></button>
        <!-- Um só botão discreto por categoria; apagar fica dentro do formulário de edição. -->
        <button v-if="canEdit" class="cat-edit" :aria-label="`Editar categoria ${category.name}`" title="Editar categoria" :disabled="locked" @click="guarded.openCategory(category)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg></button>
        <button v-else class="cat-del" :aria-label="`Apagar categoria ${category.name}`" title="Apagar categoria" :disabled="locked" @click="guarded.deleteCategory(category)">✕</button>
      </div>
      </template>
      <label v-if="emptyCount" class="show-empty"><input v-model="showEmpty" type="checkbox"> Mostrar vazias ({{ emptyCount }})</label>
    </nav>
    <button v-if="parts.length" type="button" class="catalog-btn" @click="partsCatalog.open()">Catálogo de peças <span class="n">{{ parts.length }}</span></button>
    </div>
  </aside>
  <main class="stock-content">
    <div class="top">
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input v-model="query" type="search" aria-label="Pesquisar componentes" placeholder="Pesquisar componentes…" autocomplete="off">
      </div>
      <button class="text-button tutorial-button" @click="inventoryTutorial.open()"><span aria-hidden="true">?</span> Tutorial</button>
      <button v-if="canEdit" class="text-button import-csv-button" aria-label="Importar CSV" :disabled="locked || !categories.length" @click="guarded.importCsv()">Importar CSV</button>
      <button class="text-button" :disabled="locked || !categories.length" @click="guarded.scanLabel()">Ler etiqueta</button>
      <button class="primary" :disabled="locked || !categories.length" @click="guarded.openMovement()">Adicionar</button>
    </div>
    <section class="filter-section" :class="{ open: filtersOpen || activeFilters }" aria-label="Filtros de componentes">
      <div class="filter-toolbar">
        <button class="filter-toggle" :aria-expanded="filtersOpen" @click="filtersOpen = !filtersOpen">Filtros <span v-if="activeFilters" class="filter-count">{{ activeFilters }}</span><span aria-hidden="true">{{ filtersOpen ? '⌃' : '⌄' }}</span></button>
        <div class="quick-filters">
          <select v-model="stockFilter" aria-label="Filtrar stock"><option value="">Todo o stock</option><option value="available">Em stock</option><option value="low">Pouco stock (1–5)</option><option value="empty">Sem stock</option></select>
          <select v-if="locations.length" v-model="locationFilter" aria-label="Filtrar localização"><option value="">Todas as localizações</option><option v-for="location in locations" :key="location" :value="location">{{ location }}</option><option :value="null">Sem localização</option></select>
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
    <nav v-if="trail.length" class="trail" aria-label="Categorias acima"><template v-for="name in trail" :key="name"><button @click="current = name">{{ name }}</button><span aria-hidden="true">›</span></template></nav>
    <div class="heading"><h1>{{ current || section || 'Tudo em stock' }}</h1><span class="sub">{{ shown.length }} {{ shown.length === 1 ? 'referência' : 'referências' }} · {{ units }} {{ units === 1 ? 'unidade' : 'unidades' }}<template v-if="estimate.value"> · <span class="estimate" :title="`Estimativa: preço do catálogo pelo P/N; sem P/N, mediana de peças da mesma categoria e tamanho.${estimate.missing ? ` ${estimate.missing} sem preço.` : ''}`">≈ {{ euros(estimate.value) }}</span></template></span></div>
    <form v-if="canEdit && selected.size" class="selection-bar" aria-label="Componentes selecionados" @submit.prevent="guarded.setLocation(locationName)">
      <strong>{{ selected.size }} {{ selected.size === 1 ? 'selecionado' : 'selecionados' }}</strong>
      <input v-model="locationName" list="stock-locations" aria-label="Nova localização" placeholder="Caixa 1, Gaveta A…" maxlength="255" autocomplete="off">
      <datalist id="stock-locations"><option v-for="location in locations" :key="location" :value="location" /></datalist>
      <button class="primary" :disabled="locked || !locationName.trim()">Mover para aqui</button>
      <button type="button" class="text-button" :disabled="locked" @click="guarded.setLocation('')">Tirar localização</button>
      <button type="button" class="text-button" :disabled="locked || !selectedPartNumbers.length" :title="selectedPartNumbers.length ? '' : 'Nenhum selecionado tem P/N'" @click="guarded.syncSelected">Sincronizar com APIs ({{ selectedPartNumbers.length }})</button>
      <button type="button" class="text-button" @click="selected = new Set()">Limpar seleção</button>
    </form>
    <div class="mobile-sort">
      <label>Ordenar por
        <select v-model="sortChoice"><option value="">Ordem original</option><option v-for="column in columns" :key="column.key" :value="column.key">{{ column.label }}</option></select>
      </label>
      <label v-if="canEdit && shown.length" class="select-shown"><input type="checkbox" :checked="allShownSelected" @change="toggleShown"> Todos</label>
      <button class="text-button" :disabled="!sortKey" :aria-label="sortDirection === 1 ? 'Ordem crescente, inverter' : 'Ordem decrescente, inverter'" @click="sortDirection = -sortDirection">{{ sortDirection === 1 ? '↑' : '↓' }}</button>
    </div>
    <div class="list" :aria-busy="loading">
      <div v-if="loading" class="empty">A carregar stock…</div>
      <template v-else>
        <table class="stock-table">
          <caption class="sr-only">Stock de componentes</caption>
          <thead><tr>
            <th v-if="canEdit" scope="col" class="select-cell"><input type="checkbox" :aria-label="allShownSelected ? 'Desmarcar todos os mostrados' : 'Selecionar todos os mostrados'" :checked="allShownSelected" :disabled="!shown.length" @change="toggleShown"></th>
            <th scope="col" class="image-column">Imagem</th>
            <th v-for="column in columns" :key="column.key" scope="col" :aria-sort="sortKey === column.key ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none'">
              <button :aria-label="`Ordenar por ${column.label}`" @click="sortBy(column.key)">{{ column.label }} <span aria-hidden="true">{{ sortKey === column.key ? (sortDirection === 1 ? '↑' : '↓') : '↕' }}</span></button>
            </th>
            <th scope="col">Ações</th>
          </tr></thead>
          <tbody><StockItem v-for="item in shown" :key="item.id" :item="item" :price="priceOf(item)" :property-keys="showCategory ? [] : propertyKeys" :show-category="showCategory" :busy="busy" :locked="locked" :can-edit="canEdit" :selected="selected.has(item.id)" @select="shift => pick(item, shift)" @edit="guarded.editItem(item)" @step="delta => guarded.step(item, delta)" @delete="guarded.deleteItem(item)" /></tbody>
        </table>
        <div v-if="!shown.length" class="empty"><b>Nada encontrado.</b><br>Tenta outra pesquisa ou adiciona um item novo.</div>
      </template>
    </div>
  </main>
  </div>
  </div>
  <StockMovement ref="movement" :categories="categories" :items="items" :parts="parts" :busy="busy" :error="formError" @submit="submitMovement" @clear-error="formError = ''" @part="updatePart" />
  <CategoryForm ref="categoryForm" :categories="categories" :busy="busy" :error="categoryError" @submit="submitCategory" @delete="deleteFromForm" />
  <InventoryCsvImport ref="csvImport" :categories="categories" :current="current" :busy="busy" :error="csvError" @submit="submitCsv" @clear-error="csvError = ''" />
  <LoginDialog ref="loginDialog" @login="user => { auth.user = user; toast(`Sessão iniciada: ${user.name}`) }" />
  <PartsCatalog v-if="parts.length" ref="partsCatalog" :parts="parts" :items="items" :categories="categories" :busy="busy" :error="partError" @save="guarded.savePart" @clear-error="partError = ''" />
  <InventoryTutorial ref="inventoryTutorial" />
  <LabelScanner ref="labelScanner" :items="items" :parts="parts" action="Adicionar ao stock" @use="useLabel" />
  <div id="toast" role="status" :class="{ on: toastMessage }">{{ toastMessage }}<button v-if="toastUndo" class="toast-undo" @click="toastUndo()">Desfazer</button></div>
</template>
