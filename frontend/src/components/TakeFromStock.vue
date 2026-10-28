<script setup>
import { computed, ref } from 'vue'
import { componentValue, describe } from '../stockText.js'
// Retirada manual: pesquisa-se, junta-se à lista e sai tudo de uma vez por /api/items/consume.
const props = defineProps({ items: Array, busy: Boolean })
const emit = defineEmits(['submit'])
const dialog = ref(null), search = ref(null)
const query = ref(''), note = ref(''), lines = ref([])
const normalize = value => String(value).toLowerCase().replace(/\s+/g, '')
const picked = computed(() => new Set(lines.value.map(line => line.item.id)))
const results = computed(() => {
  const text = normalize(query.value)
  if (!text) return []
  return props.items.filter(item => item.qty > 0 && !picked.value.has(item.id) &&
    normalize(item.cat + Object.values(item.props).join('') + (item.location || '')).includes(text)).slice(0, 8)
})
const units = computed(() => lines.value.reduce((sum, line) => sum + (line.qty || 0), 0))
const valid = computed(() => lines.value.length > 0 && lines.value.every(line => Number.isInteger(line.qty) && line.qty >= 1 && line.qty <= line.item.qty))
function add(item) {
  lines.value.push({ item, qty: 1 })
  query.value = ''
  search.value?.focus()
}
// Enter na pesquisa junta o primeiro resultado, para encher a lista só com o teclado.
function addFirst() { if (results.value[0]) add(results.value[0]) }
function open(selected = []) {
  lines.value = selected.filter(item => item.qty > 0).map(item => ({ item, qty: 1 }))
  query.value = ''
  note.value = ''
  dialog.value.showModal()
}
function submit() {
  if (!valid.value) return
  emit('submit', { items: lines.value.map(line => ({ id: line.item.id, qty: line.qty })), note: note.value.trim() || 'Retirada manual' })
}
defineExpose({ open, close: () => dialog.value.close() })
</script>

<template>
  <dialog ref="dialog" class="take-dialog" aria-labelledby="take-title">
    <form @submit.prevent="submit">
      <h2 id="take-title">Retirar do stock</h2>
      <label>Procurar componente
        <input ref="search" v-model="query" type="search" placeholder="Valor, P/N, categoria ou caixa" autocomplete="off" @keydown.enter.prevent="addFirst">
      </label>
      <ul v-if="results.length" class="take-results" aria-label="Resultados">
        <li v-for="item in results" :key="item.id">
          <button type="button" @click="add(item)">
            <span class="take-name"><b>{{ componentValue(item) }}</b> <small>{{ item.cat }}<template v-if="describe(item)"> · {{ describe(item) }}</template></small></span>
            <span class="take-meta">{{ item.qty }} un.<template v-if="item.location"> · {{ item.location }}</template></span>
            <span class="take-add" aria-hidden="true">+</span>
          </button>
        </li>
      </ul>
      <p v-else-if="query.trim()" class="hint">Nada com stock encontrado.</p>
      <div class="take-list">
        <h3>A retirar <span v-if="lines.length">· {{ units }} un. de {{ lines.length }}</span></h3>
        <p v-if="!lines.length" class="hint">Procura em cima e carrega num componente para o juntar à lista.</p>
        <ul v-else>
          <li v-for="(line, index) in lines" :key="line.item.id">
            <span class="take-name"><b>{{ componentValue(line.item) }}</b> <small>{{ line.item.cat }} · {{ line.item.qty }} em stock<template v-if="line.item.location"> · {{ line.item.location }}</template></small></span>
            <input v-model.number="line.qty" type="number" min="1" :max="line.item.qty" step="1" required :aria-label="`Quantidade de ${componentValue(line.item)}`">
            <button type="button" class="toggle-chip" :aria-pressed="line.qty === line.item.qty" title="Retirar tudo (fica a 0)" @click="line.qty = line.item.qty">Tudo</button>
            <button type="button" class="take-remove" :aria-label="`Tirar ${componentValue(line.item)} da lista`" @click="lines.splice(index, 1)">✕</button>
          </li>
        </ul>
      </div>
      <label>Para quê <input v-model="note" maxlength="255" placeholder="Retirada manual" autocomplete="off"></label>
      <p class="hint">Fica registado nos movimentos com o teu nome.</p>
      <div class="actions">
        <button type="button" class="ghost" :disabled="busy" @click="dialog.close()">Cancelar</button>
        <button class="primary" :disabled="busy || !valid">Retirar {{ units || '' }} un.</button>
      </div>
    </form>
  </dialog>
</template>
