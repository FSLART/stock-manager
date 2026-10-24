<script setup>
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { writeBarcode } from 'zxing-wasm/writer'
import WorkspacePage from '../components/WorkspacePage.vue'
import { useInventoryContext } from '../composables/useInventoryContext.js'
import { useNavigation } from '../composables/useNavigation.js'
const inventory = useInventoryContext()
const router = useNavigation()
// Uma localização existe enquanto tiver componentes ou uma foto guardada.
const locations = computed(() => [...new Set([...inventory.items.map(item => item.location), ...Object.keys(inventory.locations)].filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }))
  .map(name => {
    const items = inventory.items.filter(item => item.location === name)
    return { name, code: inventory.codes?.[name] || '', image: inventory.locations[name] || '', refs: items.length, units: items.reduce((sum, item) => sum + item.qty, 0) }
  }))
const editing = ref(null), newName = ref(''), file = ref(null), removeImage = ref(false), labels = ref([]), error = ref(''), created = ref('')
const picked = ref(new Set())
const pickedBoxes = computed(() => locations.value.filter(box => picked.value.has(box.name)))
const allPicked = computed(() => locations.value.length > 0 && pickedBoxes.value.length === locations.value.length)
function toggle(name) {
  const next = new Set(picked.value)
  if (!next.delete(name)) next.add(name)
  picked.value = next
}
function toggleAll() { picked.value = new Set(allPicked.value ? [] : locations.value.map(box => box.name)) }
const stockPath = name => `/stock?location=${encodeURIComponent(name)}`
function edit(location) { editing.value = location.name; newName.value = location.name; pickPhoto(null); removeImage.value = false }
// A foto tirada ou escolhida aparece logo no cartão, antes de guardar.
const preview = ref('')
function pickPhoto(chosen) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  file.value = chosen
  preview.value = chosen ? URL.createObjectURL(chosen) : ''
}
onUnmounted(() => pickPhoto(null))
function save() {
  inventory.editLocation({ name: editing.value, newName: newName.value, file: file.value, ...(removeImage.value && { image: '' }) }, () => { editing.value = null })
}
function create() {
  const name = created.value.trim()
  if (locations.value.some(box => box.name === name)) { error.value = `${name} já existe`; return }
  error.value = ''
  inventory.editLocation({ name, newName: name }, () => { created.value = '' })
}
function remove(box) {
  if (confirm(`Apagar a localização "${box.name}"?`)) inventory.deleteLocation(box.name)
}
// O QR leva o código fixo da caixa (sem código, no Google Sheets, leva o nome) e abre o inventário filtrado por ela.
// Várias caixas saem seguidas, uma etiqueta de 55 x 50 mm por caixa.
async function print(boxes) {
  error.value = ''
  try {
    labels.value = await Promise.all(boxes.map(async ({ name, code }) => {
      const result = await writeBarcode(`${location.origin}${location.pathname}#${code ? `/stock?box=${code}` : stockPath(name)}`, { format: 'QRCode' })
      if (result.error) throw new Error(result.error)
      // O zint dá width/height sem viewBox: trocá-los por um viewBox deixa o CSS escalar o código.
      return { name, code, svg: result.svg.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg viewBox="0 0 $1 $2" shape-rendering="crispEdges"') }
    }))
  } catch { error.value = 'Não foi possível gerar o código QR'; return }
  await nextTick()
  // Papel de 55 x 50 mm só durante esta impressão (o Chrome ignora o tamanho de um @page com nome).
  const page = document.createElement('style')
  page.textContent = '@page{size:55mm 50mm;margin:0}'
  document.head.append(page)
  window.print()
  page.remove()
  labels.value = []
}
</script>

<template>
  <WorkspacePage
    active="locations"
    eyebrow="Inventário · arrumação"
    title="Localizações"
    description="Caixas e gavetas onde os componentes estão guardados. Cada uma pode ter uma foto e um código QR para colar na caixa."
  >
    <section class="workspace-card">
      <div class="card-heading">
        <div><span class="card-icon">▦</span><h2>Caixas e gavetas</h2></div>
        <span class="status-pill">{{ locations.length }} localização(ões)</span>
      </div>
      <form v-if="inventory.canEdit" class="location-new" @submit.prevent="create">
        <input v-model="created" aria-label="Nome da nova caixa" placeholder="Caixa 1, Gaveta A…" maxlength="255" autocomplete="off">
        <button class="primary" :disabled="!created.trim()">Criar caixa</button>
      </form>
      <div v-if="locations.length" class="location-print">
        <label class="location-check"><input type="checkbox" :checked="allPicked" @change="toggleAll"> Selecionar todas</label>
        <button class="text-button" :disabled="!pickedBoxes.length" @click="print(pickedBoxes)">Imprimir QR ({{ pickedBoxes.length }})</button>
      </div>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div v-if="!locations.length" class="empty-workspace">Ainda não há localizações. Cria uma caixa acima, ou no inventário seleciona componentes e escolhe "Mover para aqui".</div>
      <ul v-else class="location-grid">
        <li v-for="box in locations" :key="box.name" class="location-card">
          <img v-if="editing === box.name && preview" :src="preview" :alt="`Nova foto de ${box.name}`" class="location-image">
          <img v-else-if="box.image" :src="box.image" :alt="`Foto de ${box.name}`" class="location-image">
          <div v-else class="location-image" aria-hidden="true">▦</div>
          <form v-if="editing === box.name" class="location-form" @submit.prevent="save">
            <label>Nome<input v-model="newName" required maxlength="255" autocomplete="off"></label>
            <div class="location-actions" role="group" aria-label="Foto">
              <!-- capture abre a câmara traseira no telemóvel; no computador escolhe um ficheiro. -->
              <label class="text-button">Tirar foto<input type="file" class="sr-only" accept="image/*" capture="environment" @change="pickPhoto($event.target.files[0] || null)"></label>
              <label class="text-button">Escolher foto<input type="file" class="sr-only" accept="image/*" @change="pickPhoto($event.target.files[0] || null)"></label>
            </div>
            <label v-if="box.image" class="location-check"><input v-model="removeImage" type="checkbox" :disabled="Boolean(file)"> Remover foto</label>
            <div class="location-actions">
              <button class="primary" :disabled="!newName.trim()">Guardar</button>
              <button type="button" class="text-button" @click="editing = null">Cancelar</button>
            </div>
          </form>
          <template v-else>
            <label class="location-check"><input type="checkbox" :checked="picked.has(box.name)" :aria-label="`Selecionar ${box.name} para imprimir`" @change="toggle(box.name)"><strong>{{ box.name }}</strong></label>
            <span v-if="box.code" class="sub">Código {{ box.code }}</span>
            <span class="sub">{{ box.refs }} {{ box.refs === 1 ? 'referência' : 'referências' }} · {{ box.units }} un.</span>
            <div class="location-actions">
              <button class="text-button" @click="router.push(stockPath(box.name))">Ver no stock</button>
              <button v-if="inventory.canEdit" class="text-button" @click="edit(box)">Editar</button>
              <button class="text-button" @click="print([box])">Imprimir QR</button>
              <!-- Com componentes lá dentro não se apaga: o servidor também recusa. -->
              <button v-if="inventory.canEdit" class="text-button danger" :disabled="box.refs > 0" :title="box.refs ? 'Move os componentes antes de apagar' : ''" @click="remove(box)">Apagar</button>
            </div>
          </template>
        </li>
      </ul>
    </section>
    <!-- Só aparece na impressão. O SVG é gerado aqui pelo zxing, não vem de fora. -->
    <!-- Fica direto no body para a impressão poder esconder tudo o resto com display:none (sem páginas em branco). -->
    <Teleport to="body"><div v-if="labels.length" class="qr-labels">
      <div v-for="label in labels" :key="label.name" class="qr-label"><div v-html="label.svg"></div><strong>{{ label.code || label.name }}</strong><small v-if="label.code">{{ label.name }}</small></div>
    </div></Teleport>
  </WorkspacePage>
</template>
