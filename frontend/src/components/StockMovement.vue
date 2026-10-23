<script setup>
import { computed, ref } from 'vue'
import { isBrand, isPartNumber, partNumberOf } from '../stockText.js'
import { euros, priceEstimator } from '../prices.js'
const props = defineProps({ categories: Array, items: Array, parts: { type: Array, default: () => [] }, busy: Boolean, error: String })
const emit = defineEmits(['submit', 'clear-error'])
const dialog = ref(null)
const fileInput = ref(null)
const category = ref('')
const values = ref({})
const mode = ref('in')
const qty = ref(1)
const editing = ref(null), removeImage = ref(false), imageUrl = ref(''), partQuery = ref(''), unitPrice = ref(''), savedPrice = ref(null)
const selected = computed(() => props.categories.find(c => c.name === category.value))
const hint = computed(() => mode.value === 'in'
  ? 'Se já existir um item com as mesmas propriedades, a quantidade é somada.'
  : 'Preenche as propriedades do item de onde queres retirar.')
function resetFields() {
  values.value = {}
  imageUrl.value = ''
  if (fileInput.value) fileInput.value.value = ''
  emit('clear-error')
}
function open(current) {
  editing.value = null
  partQuery.value = ''
  removeImage.value = false
  category.value = props.categories.some(c => c.name === current) ? current : props.categories[0]?.name || ''
  mode.value = 'in'
  qty.value = 1
  resetFields()
  dialog.value.showModal()
}
// O preço pertence ao P/N no catálogo, por isso só se guarda quando o item tem um P/N a sério.
const partNumberField = computed(() => (selected.value?.props || []).find(isPartNumber))
const partNumber = computed(() => String(values.value[partNumberField.value] ?? '').trim())
const canPrice = computed(() => Boolean(partNumber.value) && partNumber.value !== '-')
const catalogPrice = mpn => props.parts.find(part => part.mpn.toUpperCase() === mpn.toUpperCase())?.price ?? null
const estimatedPrice = computed(() => editing.value && priceEstimator(props.parts)(editing.value))
const priceHint = computed(() => !partNumberField.value ? 'Esta categoria não tem P/N, por isso o preço não pode ser guardado.'
  : !canPrice.value ? 'Preenche o P/N para guardar o preço.' : `Fica no catálogo para todos os itens com o P/N ${partNumber.value}.`)
function edit(item) {
  category.value = item.cat
  editing.value = { ...item }
  savedPrice.value = catalogPrice(partNumberOf(item))
  unitPrice.value = savedPrice.value ?? ''
  removeImage.value = false
  qty.value = item.qty
  resetFields()
  values.value = { ...item.props }
  dialog.value.showModal()
}
function suggestions(prop) {
  return [...new Set(props.items.filter(it => it.cat === category.value).map(it => it.props[prop]).filter(Boolean))]
}
// Escolher uma peça do catálogo preenche o formulário. Se esse P/N já está em stock, usa os valores do item
// existente, para a entrada somar a quantidade em vez de criar um item quase igual.
function pickPart() {
  const mpn = partQuery.value.trim().toUpperCase()
  const part = props.parts.find(p => p.mpn.toUpperCase() === mpn)
  if (!part) return
  emit('clear-error')
  const stocked = props.items.find(item => partNumberOf(item).toUpperCase() === mpn)
  if (stocked) {
    category.value = stocked.cat
    values.value = { ...stocked.props }
    return
  }
  if (props.categories.some(c => c.name === part.category)) category.value = part.category
  values.value = Object.fromEntries((selected.value?.props || []).map(field => [field,
    isPartNumber(field) ? part.mpn : isBrand(field) ? part.manufacturer : part.props[field] ?? '']))
}
// Ctrl+V ou arrastar uma imagem preenche o campo de ficheiro, por isso o envio segue o caminho normal.
// Uma imagem arrastada de outra página chega só como link.
function takeImage(event) {
  const data = event.clipboardData || event.dataTransfer
  const file = [...(data?.files || [])].find(f => f.type.startsWith('image/'))
  const link = event.dataTransfer?.getData('text/uri-list').split('\n').find(line => /^https?:/.test(line))
  // Largar um ficheiro nunca o deve abrir no browser, o que fecharia o formulário.
  if (event.dataTransfer?.files.length) event.preventDefault()
  if (!selected.value?.image || (!file && !link)) return
  event.preventDefault()
  if (!file) { imageUrl.value = link.trim(); return }
  const transfer = new DataTransfer()
  transfer.items.add(file)
  fileInput.value.files = transfer.files
}
function submit() {
  const payload = {
    cat: category.value,
    props: Object.fromEntries((selected.value?.props || []).map(p => [p, (values.value[p] || '').trim()])),
    qty: Number(qty.value), mode: mode.value, file: fileInput.value?.files[0], imageUrl: imageUrl.value.trim(),
  }
  if (editing.value) {
    payload.id = editing.value.id
    if (removeImage.value) payload.image = ''
    if (canPrice.value && unitPrice.value !== '' && Number(unitPrice.value) !== savedPrice.value) {
      // A marca do item só serve para uma peça nova; não substitui o fabricante que o catálogo já tem.
      const brand = savedPrice.value == null && !props.parts.some(part => part.mpn.toUpperCase() === partNumber.value.toUpperCase())
        ? { manufacturer: String(Object.entries(values.value).find(([key]) => isBrand(key))?.[1] ?? '') } : {}
      payload.partPrice = { mpn: partNumber.value, price: Number(unitPrice.value), ...brand }
    }
    // Só o preço mudou: não regista uma edição vazia no histórico de movimentos.
    payload.priceOnly = Boolean(payload.partPrice) && !payload.file && !payload.imageUrl && !removeImage.value && payload.qty === editing.value.qty &&
      Object.entries(payload.props).every(([key, value]) => value === String(editing.value.props[key] ?? '').trim())
  }
  emit('submit', payload)
}
defineExpose({ open, edit, close: () => dialog.value.close() })
</script>

<template>
  <dialog ref="dialog" aria-labelledby="movement-title" @paste="takeImage" @dragover.prevent @drop="takeImage">
    <form @submit.prevent="submit">
      <h2 id="movement-title">{{ editing ? 'Editar componente' : 'Movimento de stock' }}</h2>
      <div v-if="!editing" class="seg" role="group" aria-label="Tipo de movimento">
        <button v-for="m in ['in', 'out']" :key="m" type="button" :aria-pressed="mode === m" @click="mode = m; emit('clear-error')">{{ m === 'in' ? 'Entrada' : 'Saída' }}</button>
      </div>
      <label v-if="!editing && parts.length">Peça do catálogo
        <input v-model="partQuery" list="catalog-parts" placeholder="P/N ou descrição" autocomplete="off" @change="pickPart">
        <datalist id="catalog-parts"><option v-for="part in parts" :key="part.mpn" :value="part.mpn">{{ part.manufacturer }} · {{ part.description }}</option></datalist>
      </label>
      <label>Categoria <select v-model="category" :disabled="!!editing" required @change="resetFields"><option v-for="c in categories" :key="c.name">{{ c.name }}</option></select></label>
      <div class="fields">
        <label v-for="(p, i) in selected?.props || []" :key="category + p">{{ p }}
          <input v-model="values[p]" :list="`suggestion-${i}`" required autocomplete="off">
          <datalist :id="`suggestion-${i}`"><option v-for="value in suggestions(p)" :key="value" :value="value"></option></datalist>
        </label>
      </div>
      <img v-if="editing?.image && !removeImage" :src="editing.image" class="item-image" alt="Imagem atual">
      <label v-if="editing?.image" class="check"><input v-model="removeImage" type="checkbox"> Remover imagem atual</label>
      <label v-show="selected?.image">{{ editing ? 'Substituir imagem' : 'Imagem' }} <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp"><span class="hint">Ou cola (Ctrl+V) ou arrasta uma imagem para aqui.</span></label>
      <label v-show="selected?.image">Link da imagem <input v-model="imageUrl" type="url" placeholder="https://…"></label>
      <label v-if="editing">Preço unitário (€)
        <input v-model="unitPrice" type="number" min="0" step="any" :disabled="!canPrice" :placeholder="estimatedPrice?.estimated ? `≈ ${euros(estimatedPrice.price)} (estimativa)` : ''">
        <span class="hint">{{ priceHint }}</span>
      </label>
      <label>Quantidade <input v-model.number="qty" type="number" :min="editing ? 0 : 1" step="1" required></label>
      <p class="hint" :class="{ error }" role="status">{{ error || (editing ? 'A quantidade indicada substitui o stock atual. Sem nova imagem, a existente é mantida.' : hint) }}</p>
      <div class="actions"><button type="button" class="ghost" :disabled="busy" @click="dialog.close()">Cancelar</button><button class="primary" :disabled="busy || !selected">{{ editing ? 'Guardar alterações' : mode === 'in' ? 'Adicionar ao stock' : 'Retirar do stock' }}</button></div>
    </form>
  </dialog>
</template>
