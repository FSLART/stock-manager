<script setup>
import { computed, ref } from 'vue'
import { euros } from '../prices.js'
import { partNumberOf } from '../stockText.js'
const props = defineProps({ parts: Array, items: Array, categories: { type: Array, default: () => [] }, busy: Boolean, error: String })
const emit = defineEmits(['save', 'clear-error'])
const dialog = ref(null), query = ref('')
// draft é a peça no formulário; original é a peça como estava, para enviar só o que mudou.
const draft = ref(null), original = ref(null)
const stocked = computed(() => new Set(props.items.map(item => partNumberOf(item).toUpperCase())))
const categoryNames = computed(() => [...new Set([...props.categories.map(c => c.name), ...props.parts.map(p => p.category)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt')))
const shown = computed(() => {
  const words = query.value.trim().toLowerCase()
  return props.parts.filter(part => !words || [part.mpn, part.manufacturer, part.description, part.category].join(' ').toLowerCase().includes(words))
})
const FIELDS = ['manufacturer', 'description', 'category', 'price']
function openForm(part = null) {
  emit('clear-error')
  original.value = part
  draft.value = part ? { mpn: part.mpn, manufacturer: part.manufacturer, description: part.description, category: part.category, price: part.price ?? '' }
    : { mpn: '', manufacturer: '', description: '', category: '', price: '' }
}
function save() {
  const clean = { ...draft.value, mpn: draft.value.mpn.trim() }
  const changed = FIELDS.filter(field => !original.value || String(clean[field] ?? '').trim() !== String(original.value[field] ?? '').trim())
  if (!changed.length) { draft.value = null; return }
  emit('save', { mpn: clean.mpn, ...Object.fromEntries(changed.map(field => [field, clean[field]])) })
}
defineExpose({ open: () => { query.value = ''; draft.value = null; dialog.value.showModal() }, closeForm: () => { draft.value = null } })
</script>

<template>
  <dialog ref="dialog" class="catalog-dialog" aria-labelledby="catalog-title">
    <div class="catalog-head">
      <h2 id="catalog-title">Catálogo de peças</h2>
      <span class="sub">{{ shown.length === parts.length ? `${parts.length} peças` : `${shown.length} de ${parts.length}` }}</span>
      <button type="button" class="primary add-part" :disabled="busy" @click="openForm()">Adicionar peça</button>
      <button type="button" class="ghost" aria-label="Fechar catálogo" @click="dialog.close()">✕</button>
    </div>
    <form v-if="draft" class="catalog-form" @submit.prevent="save">
      <label>P/N <input v-model="draft.mpn" required :readonly="Boolean(original)" autocomplete="off"></label>
      <label>Fabricante <input v-model="draft.manufacturer" autocomplete="off"></label>
      <label class="wide">Descrição <input v-model="draft.description" autocomplete="off"></label>
      <label>Categoria <input v-model="draft.category" list="catalog-categories" autocomplete="off"></label>
      <label>Preço unitário (€) <input v-model="draft.price" type="number" min="0" step="any"></label>
      <datalist id="catalog-categories"><option v-for="name in categoryNames" :key="name" :value="name"></option></datalist>
      <p v-if="error" class="hint error wide" role="alert">{{ error }}</p>
      <div class="actions wide"><button type="button" class="ghost" :disabled="busy" @click="draft = null">Cancelar</button><button class="primary" :disabled="busy">{{ original ? 'Guardar peça' : 'Adicionar peça' }}</button></div>
    </form>
    <input v-model="query" type="search" placeholder="Procurar P/N, fabricante ou descrição" aria-label="Procurar no catálogo">
    <div class="catalog-list">
      <table class="stock-table">
        <thead><tr><th scope="col">P/N</th><th scope="col">Fabricante</th><th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col">Preço</th><th scope="col">Em stock</th></tr></thead>
        <tbody>
          <!-- Clicar numa linha abre a peça no formulário para a corrigir. -->
          <tr v-for="part in shown" :key="part.mpn" :title="part.source" class="catalog-row" tabindex="0" @click="openForm(part)" @keydown.enter="openForm(part)">
            <td>{{ part.mpn }}</td>
            <td>{{ part.manufacturer || '—' }}</td>
            <td class="catalog-desc">{{ part.description || '—' }}</td>
            <td>{{ part.category || '—' }}</td>
            <td class="price-cell">{{ part.price == null ? '—' : euros(part.price) }}</td>
            <td>{{ stocked.has(part.mpn.toUpperCase()) ? 'Sim' : '' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!shown.length" class="hint">Nenhuma peça corresponde à pesquisa.</p>
    </div>
  </dialog>
</template>
