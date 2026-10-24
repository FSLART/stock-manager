<script setup>
import { computed, nextTick, ref } from 'vue'
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
    return { name, image: inventory.locations[name] || '', refs: items.length, units: items.reduce((sum, item) => sum + item.qty, 0) }
  }))
const editing = ref(null), newName = ref(''), file = ref(null), removeImage = ref(false), label = ref(null), error = ref(''), created = ref('')
const stockPath = name => `/stock?location=${encodeURIComponent(name)}`
function edit(location) { editing.value = location.name; newName.value = location.name; file.value = null; removeImage.value = false }
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
// O QR abre o inventário já filtrado por esta localização; a etiqueta impressa leva também o nome.
async function print(name) {
  error.value = ''
  try {
    const result = await writeBarcode(`${location.origin}${location.pathname}#${stockPath(name)}`, { format: 'QRCode' })
    if (result.error) throw new Error(result.error)
    // O zint dá width/height sem viewBox: trocá-los por um viewBox deixa o CSS escalar o código.
    label.value = { name, svg: result.svg.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg viewBox="0 0 $1 $2" shape-rendering="crispEdges"') }
  } catch { error.value = 'Não foi possível gerar o código QR'; return }
  await nextTick()
  window.print()
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
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div v-if="!locations.length" class="empty-workspace">Ainda não há localizações. Cria uma caixa acima, ou no inventário seleciona componentes e escolhe "Mover para aqui".</div>
      <ul v-else class="location-grid">
        <li v-for="box in locations" :key="box.name" class="location-card">
          <img v-if="box.image" :src="box.image" :alt="`Foto de ${box.name}`" class="location-image">
          <div v-else class="location-image" aria-hidden="true">▦</div>
          <form v-if="editing === box.name" class="location-form" @submit.prevent="save">
            <label>Nome<input v-model="newName" required maxlength="255" autocomplete="off"></label>
            <label>Foto<input type="file" accept="image/*" @change="file = $event.target.files[0] || null"></label>
            <label v-if="box.image" class="location-check"><input v-model="removeImage" type="checkbox" :disabled="Boolean(file)"> Remover foto</label>
            <div class="location-actions">
              <button class="primary" :disabled="!newName.trim()">Guardar</button>
              <button type="button" class="text-button" @click="editing = null">Cancelar</button>
            </div>
          </form>
          <template v-else>
            <strong>{{ box.name }}</strong>
            <span class="sub">{{ box.refs }} {{ box.refs === 1 ? 'referência' : 'referências' }} · {{ box.units }} un.</span>
            <div class="location-actions">
              <button class="text-button" @click="router.push(stockPath(box.name))">Ver no stock</button>
              <button v-if="inventory.canEdit" class="text-button" @click="edit(box)">Editar</button>
              <button class="text-button" @click="print(box.name)">Imprimir QR</button>
              <!-- Com componentes lá dentro não se apaga: o servidor também recusa. -->
              <button v-if="inventory.canEdit" class="text-button danger" :disabled="box.refs > 0" :title="box.refs ? 'Move os componentes antes de apagar' : ''" @click="remove(box)">Apagar</button>
            </div>
          </template>
        </li>
      </ul>
    </section>
    <!-- Só aparece na impressão. O SVG é gerado aqui pelo zxing, não vem de fora. -->
    <div v-if="label" class="qr-label"><div v-html="label.svg"></div><strong>{{ label.name }}</strong></div>
  </WorkspacePage>
</template>
