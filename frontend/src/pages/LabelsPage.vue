<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { writeBarcode } from 'zxing-wasm/writer'
import WorkspacePage from '../components/WorkspacePage.vue'
import { useInventoryContext } from '../composables/useInventoryContext.js'
const inventory = useInventoryContext()

// Etiquetas para gavetas: código 2D à esquerda, título grande e campos (Modelo, Posição…) à direita.
// Ficam no servidor, partilhadas pela equipa. Edita-se uma cópia (label) e só "Guardar" a envia.
const blank = () => ({ title: '', fields: [{ name: 'Modelo', value: '' }, { name: 'Posição', value: '' }], code: 'DataMatrix', location: '', width: 60, height: 25 })
const copy = entry => JSON.parse(JSON.stringify(entry))
const labels = computed(() => inventory.labels)
const label = ref(null)
const saved = computed(() => labels.value.find(entry => entry.id === label.value?.id))
const dirty = computed(() => Boolean(label.value) && JSON.stringify(label.value) !== JSON.stringify(saved.value ?? null))
const select = entry => { label.value = entry ? copy(entry) : null }
// Depois de guardar volta a copiar a versão do servidor (que limpa espaços); se a etiqueta foi apagada, abre a primeira.
let resync = false
watch(labels, list => {
  if (resync || !label.value || (label.value.id != null && !saved.value)) select(saved.value ?? list[0])
  resync = false
}, { immediate: true })

const locationNames = computed(() => [...new Set([...inventory.items.map(item => item.location), ...Object.keys(inventory.locations)].filter(Boolean))].sort())
const formats = [['DataMatrix', 'Data Matrix'], ['QRCode', 'QR'], ['', 'Sem código']]

const discard = () => !dirty.value || confirm('Descartar as alterações por guardar?')
function open(entry) { if (entry.id !== label.value?.id && discard()) select(entry) }
function add(from) {
  if (!discard()) return
  const { id, ...entry } = copy(from ?? blank())
  label.value = entry
}
function save() {
  inventory.saveLabel(label.value, result => { label.value.id ??= result.id; resync = true })
}
function remove() {
  if (label.value.id == null) return select(labels.value[0])
  if (confirm(`Apagar a etiqueta "${label.value.title || 'sem título'}" para toda a equipa?`)) inventory.deleteLabel(label.value.id)
}

// Ligada a uma localização, o código abre o inventário nessa caixa (como o QR das Localizações); senão leva o texto da etiqueta.
function codeText({ title, fields, location: box }) {
  if (!box) return [title, ...fields.filter(field => field.value).map(field => `${field.name}: ${field.value}`)].join('\n') || ' '
  const code = inventory.codes?.[box]
  return `${location.origin}${location.pathname}#${code ? `/stock?box=${code}` : `/stock?location=${encodeURIComponent(box)}`}`
}
async function codeSvg(entry) {
  if (!entry.code) return ''
  const result = await writeBarcode(codeText(entry), { format: entry.code })
  if (result.error) throw new Error(result.error)
  // O zint dá width/height sem viewBox: trocá-los por um viewBox deixa o CSS escalar o código.
  return result.svg.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg viewBox="0 0 $1 $2" shape-rendering="crispEdges"')
}

const previewSvg = ref(''), error = ref('')
watch(() => label.value && `${label.value.code}\n${codeText(label.value)}`, async () => {
  error.value = ''
  try { previewSvg.value = label.value ? await codeSvg(label.value) : '' } catch { error.value = 'Não foi possível gerar o código' }
}, { immediate: true })

const printing = ref([])
async function print(entries) {
  error.value = ''
  try { printing.value = await Promise.all(entries.map(async entry => ({ ...entry, svg: await codeSvg(entry) }))) } catch { error.value = 'Não foi possível gerar o código'; return }
  await nextTick()
  // shortcut: o papel tem o tamanho da primeira etiqueta (o Chrome não aceita tamanhos por página); imprimir tamanhos diferentes em separado.
  const page = document.createElement('style')
  page.textContent = `@page{size:${entries[0].width}mm ${entries[0].height}mm;margin:0}`
  document.head.append(page)
  window.print()
  page.remove()
  printing.value = []
}
const size = entry => ({ width: `${entry.width}mm`, height: `${entry.height}mm`, '--h': `${entry.height}mm` })
</script>

<template>
  <WorkspacePage
    active="labels"
    eyebrow="Inventário · arrumação"
    title="Etiquetas"
    description="Cria etiquetas para gavetas e armários, com código Data Matrix ou QR, e imprime-as no tamanho do teu rolo."
  >
    <section class="workspace-card">
      <div class="card-heading">
        <div><span class="card-icon">▤</span><h2>Etiquetas da equipa</h2></div>
        <span class="status-pill">{{ labels.length }} etiqueta(s)</span>
      </div>
      <div class="drawer-label-bar">
        <div v-if="labels.length || label" class="toggle-chips compact" role="group" aria-label="Etiqueta a editar">
          <button v-for="entry in labels" :key="entry.id" type="button" class="toggle-chip" :aria-pressed="entry.id === label?.id" @click="open(entry)">{{ entry.title || 'Sem título' }}</button>
          <button v-if="label && label.id == null" type="button" class="toggle-chip" aria-pressed="true">{{ label.title || 'Nova etiqueta' }}</button>
        </div>
        <div class="location-actions">
          <button class="text-button" @click="add()">Nova etiqueta</button>
          <button class="text-button" :disabled="!labels.length" @click="print(labels)">Imprimir todas ({{ labels.length }})</button>
        </div>
      </div>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div v-if="!label" class="empty-workspace">Ainda não há etiquetas. Carrega em "Nova etiqueta" para criar a primeira.</div>
      <div v-else class="drawer-label-layout">
        <form class="people-editor drawer-label-editor" @submit.prevent>
          <label>Título<input v-model="label.title" maxlength="40" placeholder="Armário 1" autocomplete="off"></label>
          <div>
            <p class="editor-label">Campos</p>
            <div v-for="(field, index) in label.fields" :key="index" class="drawer-label-field">
              <input v-model="field.name" :aria-label="`Nome do campo ${index + 1}`" placeholder="Posição" maxlength="20">
              <input v-model="field.value" :aria-label="`Valor do campo ${index + 1}`" placeholder="D20" maxlength="30">
              <button type="button" class="del" :aria-label="`Remover campo ${field.name || index + 1}`" @click="label.fields.splice(index, 1)">×</button>
            </div>
            <button v-if="label.fields.length < 4" type="button" class="text-button" @click="label.fields.push({ name: '', value: '' })">+ Campo</button>
          </div>
          <div>
            <p id="drawer-label-code" class="editor-label">Código</p>
            <div class="toggle-chips" role="group" aria-labelledby="drawer-label-code">
              <button v-for="[format, name] in formats" :key="name" type="button" class="toggle-chip" :aria-pressed="label.code === format" @click="label.code = format">{{ name }}</button>
            </div>
          </div>
          <label v-if="label.code">Localização ligada<input v-model="label.location" list="drawer-label-locations" placeholder="Nenhuma: o código leva o texto" autocomplete="off"></label>
          <datalist id="drawer-label-locations"><option v-for="name in locationNames" :key="name" :value="name" /></datalist>
          <div class="drawer-label-size">
            <label>Largura (mm)<input v-model.number="label.width" type="number" min="20" max="150" required></label>
            <label>Altura (mm)<input v-model.number="label.height" type="number" min="10" max="100" required></label>
          </div>
        </form>
        <div class="drawer-label-side">
          <p class="editor-label">Pré-visualização</p>
          <div class="drawer-label-preview">
            <div class="drawer-label" :style="size(label)">
              <div v-if="label.code" class="drawer-label-code" v-html="previewSvg"></div>
              <div class="drawer-label-text">
                <strong>{{ label.title || 'Sem título' }}</strong>
                <dl><div v-for="(field, index) in label.fields" :key="index"><dt>{{ field.name }}</dt><dd>{{ field.value }}</dd></div></dl>
              </div>
            </div>
          </div>
          <p v-if="dirty" class="hint" role="status">{{ label.id == null ? 'Etiqueta nova, ainda não guardada.' : 'Alterações por guardar.' }}</p>
          <div class="location-actions">
            <button v-if="inventory.canEdit" class="primary" :disabled="!dirty" @click="save">Guardar</button>
            <button class="text-button" @click="print([label])">Imprimir</button>
            <button class="text-button" @click="add(label)">Duplicar</button>
            <button class="text-button danger" @click="remove">Apagar</button>
          </div>
        </div>
      </div>
    </section>
    <!-- Só aparece na impressão, direto no body como os QR das Localizações. O SVG é gerado aqui pelo zxing. -->
    <Teleport to="body"><div v-if="printing.length" class="qr-labels">
      <div v-for="entry in printing" :key="entry.id" class="drawer-label" :style="size(entry)">
        <div v-if="entry.code" class="drawer-label-code" v-html="entry.svg"></div>
        <div class="drawer-label-text">
          <strong>{{ entry.title }}</strong>
          <dl><div v-for="(field, index) in entry.fields" :key="index"><dt>{{ field.name }}</dt><dd>{{ field.value }}</dd></div></dl>
        </div>
      </div>
    </div></Teleport>
  </WorkspacePage>
</template>
