<script setup>
import { computed, ref } from 'vue'
import { parseInventoryCsv } from '../inventoryCsv.js'

const props = defineProps({ categories: Array, current: String, busy: Boolean, error: String })
const emit = defineEmits(['submit', 'clear-error'])
const dialog = ref(null)
const rows = ref([])
const fileName = ref('')
const parseError = ref('')
const reading = ref(false)
const input = ref(null)
let revision = 0
const units = computed(() => rows.value.reduce((total, item) => total + item.qty, 0))
const template = computed(() => {
  const category = props.categories.find(category => category.name === props.current) || props.categories[0]
  if (!category) return ''
  const quote = value => `"${String(value).replaceAll('"', '""')}"`
  const csv = '\ufeff' + [['categoria', 'quantidade', ...category.props], [category.name, '1', ...category.props.map(() => '')]].map(row => row.map(quote).join(';')).join('\r\n')
  return 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
})
function open() {
  revision++
  reading.value = false
  rows.value = []
  fileName.value = ''
  parseError.value = ''
  if (input.value) input.value.value = ''
  emit('clear-error')
  dialog.value.showModal()
}
async function selectFile(event) {
  const file = event.target.files?.[0]
  const selectedRevision = ++revision
  reading.value = false
  rows.value = []
  fileName.value = ''
  parseError.value = ''
  emit('clear-error')
  if (!file) return
  if (!/\.csv$/i.test(file.name)) { parseError.value = 'Seleciona um ficheiro CSV.'; return }
  if (file.size > 5 * 1024 * 1024) { parseError.value = 'O ficheiro CSV não pode exceder 5 MB.'; return }
  reading.value = true
  try {
    const text = await file.text()
    if (selectedRevision !== revision) return
    rows.value = parseInventoryCsv(text, props.categories)
    fileName.value = file.name
  } catch (error) {
    if (selectedRevision === revision) parseError.value = error.message || 'Não foi possível ler o CSV.'
  } finally { if (selectedRevision === revision) reading.value = false }
}
function close() { revision++; reading.value = false; dialog.value.close() }
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="csv-import-dialog" aria-labelledby="csv-import-title" @cancel="revision++; reading = false">
    <form @submit.prevent="emit('submit', rows)">
      <h2 id="csv-import-title">Importar componentes por CSV</h2>
      <p class="hint">Usa categoria, quantidade e as propriedades da categoria. Aceita vírgulas ou ponto e vírgula. Componentes iguais somam quantidades; só é gravado quando todas as linhas forem válidas. Requer ligação ao servidor local.</p>
      <a v-if="template" :href="template" download="modelo-componentes.csv" class="csv-template-link">Descarregar modelo{{ current ? ` · ${current}` : ` · ${categories[0]?.name}` }}</a>
      <label>Ficheiro CSV<input ref="input" type="file" aria-label="Ficheiro CSV de componentes" accept=".csv,text/csv" :disabled="busy" @change="selectFile"></label>
      <p v-if="reading" class="hint" role="status">A validar o CSV…</p>
      <p v-if="parseError || error" class="form-error" role="alert">{{ parseError || error }}</p>
      <section v-if="rows.length" class="csv-preview" aria-label="Pré-visualização da importação">
        <p class="hint"><strong>{{ fileName }}</strong> · {{ rows.length }} linha(s) · {{ units }} unidades</p>
        <div class="csv-preview-scroll"><table class="stock-table"><thead><tr><th>Categoria</th><th>Propriedades</th><th>Quantidade</th></tr></thead><tbody><tr v-for="(item, index) in rows.slice(0, 100)" :key="index"><td>{{ item.cat }}</td><td><span v-for="(value, key) in item.props" :key="key" class="chip"><b>{{ key }}</b>{{ value }}</span></td><td>{{ item.qty }}</td></tr></tbody></table></div>
        <p v-if="rows.length > 100" class="hint">A pré-visualização mostra as primeiras 100 linhas; serão importadas todas as {{ rows.length }} linhas.</p>
      </section>
      <div class="actions"><button type="button" class="text-button" :disabled="busy" @click="close">Cancelar</button><button class="primary csv-import-submit" :disabled="busy || reading || !rows.length || !!parseError">{{ busy ? 'A importar…' : 'Importar componentes' }}</button></div>
    </form>
  </dialog>
</template>
