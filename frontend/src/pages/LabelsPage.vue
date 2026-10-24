<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { writeBarcode } from 'zxing-wasm/writer'
import DrawerLabel from '../components/DrawerLabel.vue'
import LabelTutorial from '../components/LabelTutorial.vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import { ICON_GROUPS, iconFor } from '../labelIcons.js'
import { useInventoryContext } from '../composables/useInventoryContext.js'
const inventory = useInventoryContext()
const tutorial = ref(null)

// Etiquetas em dois formatos: gaveta (código 2D à esquerda, título e campos à direita) e caixa (ícones em cima e texto
// centrado, como as etiquetas Gridfinity). Ficam no servidor, partilhadas pela equipa. Edita-se uma cópia (label) e só "Guardar" a envia.
const blank = (template = {}) => ({ title: '', fields: [{ name: 'Modelo', value: '' }, { name: 'Posição', value: '' }], code: 'DataMatrix', location: '', width: 55, height: 25,
  icon: '', item: null, layout: 'drawer', screw: '', titleSize: null, fieldSize: null, ...template })
// Pontos de partida para uma etiqueta nova; tudo se muda depois.
const templates = [
  ['Gaveta', {}],
  ['Parafuso', { title: 'M3x10', fields: [], code: '', width: 55, height: 12, icon: 'drive-phillips', layout: 'bin', screw: 'screw-countersunk' }],
  ['Eletrónica', { title: '10 kΩ', fields: [{ name: 'Encapsulamento', value: '0603' }, { name: 'Tolerância', value: '1%' }], code: '', width: 55, height: 15, icon: 'resistor', layout: 'bin' }],
]
const layouts = [['drawer', 'Gaveta'], ['bin', 'Caixa (ícones em cima)']]
const screwHeads = ICON_GROUPS.find(([group]) => group === 'Parafusos (cabeça)')[1]
const copy = entry => JSON.parse(JSON.stringify(entry))
const labels = computed(() => inventory.labels)
const label = ref(null)
const saved = computed(() => labels.value.find(entry => entry.id === label.value?.id))
const dirty = computed(() => Boolean(label.value) && JSON.stringify(label.value) !== JSON.stringify(saved.value ?? null))
const select = entry => { label.value = entry ? copy(entry) : null }
// Sem etiqueta aberta (label null) a página mostra a lista; volta a ela depois de guardar ou se a etiqueta aberta foi apagada.
watch(labels, () => { if (label.value?.id != null && !saved.value) label.value = null })

// Várias de uma vez (só etiquetas novas): um título por linha, o resto igual, ex.: parafusos de vários tamanhos.
// A pré-visualização mostra a primeira linha.
const many = ref(false), titles = ref('')
const titleLines = computed(() => titles.value.split('\n').map(line => line.trim()).filter(Boolean))
watch(label, () => { many.value = false })
watch(titleLines, lines => { if (many.value) label.value.title = lines[0] ?? '' })
function toggleMany() {
  many.value = !many.value
  if (many.value) titles.value = label.value.title
}

const locationNames = computed(() => [...new Set([...inventory.items.map(item => item.location), ...Object.keys(inventory.locations)].filter(Boolean))].sort())
const formats = [['DataMatrix', 'Data Matrix'], ['QRCode', 'QR'], ['', 'Sem código']]

// Ligar um componente preenche a etiqueta com a categoria, as propriedades e o ícone dele (tudo editável depois).
const itemName = item => [item.cat, ...Object.values(item.props)].join(' · ')
const linkedItem = computed(() => label.value?.item == null ? null : inventory.items.find(item => item.id === label.value.item))
const itemQuery = ref('')
watch(() => [label.value, label.value?.item], () => { itemQuery.value = linkedItem.value ? itemName(linkedItem.value) : '' }, { immediate: true })
function pickItem() {
  if (!itemQuery.value.trim()) { label.value.item = null; return }
  const item = inventory.items.find(entry => itemName(entry) === itemQuery.value)
  if (!item) return
  Object.assign(label.value, {
    item: item.id,
    title: item.cat.slice(0, 40),
    fields: Object.entries(item.props).slice(0, 4).map(([name, value]) => ({ name: name.slice(0, 20), value: String(value).slice(0, 30) })),
    icon: iconFor(item.cat),
  })
}

const discard = () => !dirty.value || confirm('Descartar as alterações por guardar?')
function open(entry) { if (entry.id !== label.value?.id && discard()) select(entry) }
function back() { if (discard()) label.value = null }
function add(from) {
  if (!discard()) return
  const { id, ...entry } = copy(from ?? blank())
  label.value = entry
}
function save() {
  const payload = many.value ? { labels: drafts.value } : label.value
  inventory.saveLabel(payload, () => { label.value = null })
}
function remove() {
  if (label.value.id == null) return (label.value = null)
  if (confirm(`Apagar a etiqueta "${label.value.title || 'sem título'}" para toda a equipa?`)) inventory.deleteLabels([label.value.id])
}

// Seleção na lista, para imprimir ou apagar várias de uma vez; as que já não existem saem da seleção.
const picked = ref(new Set())
watch(labels, list => { picked.value = new Set(list.map(entry => entry.id).filter(id => picked.value.has(id))) })
function togglePick(id) {
  const next = new Set(picked.value)
  if (!next.delete(id)) next.add(id)
  picked.value = next
}
const pickedLabels = computed(() => labels.value.filter(entry => picked.value.has(entry.id)))
const allPicked = computed(() => labels.value.length > 0 && picked.value.size === labels.value.length)
function removePicked() {
  if (confirm(`Apagar ${picked.value.size} etiqueta(s) para toda a equipa?`)) inventory.deleteLabels([...picked.value], () => { picked.value = new Set() })
}

// O código abre no inventário a localização da etiqueta ou, sem ela, a do componente ligado (como o QR das Localizações).
// Sem nenhuma leva o texto da etiqueta.
const boxOf = entry => entry.location || inventory.items.find(item => item.id === entry.item)?.location || ''
function codeText(entry) {
  const { title, fields } = entry, box = boxOf(entry)
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

// O que o editor mostra e imprime: a etiqueta aberta ou, em "várias de uma vez", uma por título.
const drafts = computed(() => !label.value ? [] : many.value ? titleLines.value.map(title => ({ ...label.value, title })) : [label.value])
const previewSvgs = ref([]), error = ref('')
watch(() => drafts.value.map(entry => `${entry.code}\n${codeText(entry)}`).join('\n\n'), async () => {
  error.value = ''
  try { previewSvgs.value = await Promise.all(drafts.value.map(codeSvg)) } catch { error.value = 'Não foi possível gerar o código' }
}, { immediate: true })

// Códigos das etiquetas da lista, para as miniaturas; refeitos quando muda o que eles levam.
const listSvgs = ref({})
watch(() => labels.value.map(entry => `${entry.id}\n${entry.code}\n${codeText(entry)}`).join('\n\n'), async () => {
  listSvgs.value = Object.fromEntries(await Promise.all(labels.value.map(async entry => [entry.id, await codeSvg(entry).catch(() => '')])))
}, { immediate: true })
// Miniatura: a etiqueta em mm reais, reduzida para caber no cartão (1 mm ≈ 3,78 px).
const fit = entry => Math.min(1.3, 230 / (entry.width * 3.78), 100 / (entry.height * 3.78))

const pageName = entry => `label-${entry.width}x${entry.height}`.replaceAll('.', '_')
const printing = ref([])
async function print(entries) {
  error.value = ''
  try { printing.value = await Promise.all(entries.map(async entry => ({ ...entry, svg: await codeSvg(entry) }))) } catch { error.value = 'Não foi possível gerar o código'; return }
  await nextTick()
  // Cada etiqueta sai numa página do tamanho dela (páginas com nome, CSS page), mesmo misturando tamanhos.
  const page = document.createElement('style')
  const sizes = new Map(entries.map(entry => [pageName(entry), `${entry.width}mm ${entry.height}mm`]))
  page.textContent = '@page{margin:0}' + [...sizes].map(([name, size]) => `@page ${name}{size:${size};margin:0}.${name}{page:${name}}`).join('')
  document.head.append(page)
  window.print()
  page.remove()
  printing.value = []
}
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
        <div class="label-heading-actions">
          <button type="button" class="text-button tutorial-button" @click="tutorial.open()"><span aria-hidden="true">?</span> Tutorial</button>
          <span class="status-pill">{{ labels.length }} etiqueta(s)</span>
        </div>
      </div>
      <div class="drawer-label-bar">
        <button v-if="label" type="button" class="text-button" @click="back">← Todas as etiquetas</button>
        <div class="location-actions">
          <div class="location-actions" role="group" aria-label="Nova etiqueta">
            <button v-for="[name, template] in templates" :key="name" class="text-button" @click="add(blank(template))">+ {{ name }}</button>
          </div>
          <button v-if="!label" class="text-button" :disabled="!labels.length" @click="print(labels)">Imprimir todas ({{ labels.length }})</button>
        </div>
      </div>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <template v-if="!label">
        <div v-if="!labels.length" class="empty-workspace">Ainda não há etiquetas. Escolhe um ponto de partida acima: gaveta, parafuso ou eletrónica.</div>
        <!-- Selecionar e imprimir é para todos; apagar só para quem pode editar. -->
        <div v-if="labels.length" class="label-select-bar">
          <button type="button" class="toggle-chip" :aria-pressed="allPicked" @click="picked = new Set(allPicked ? [] : labels.map(entry => entry.id))">Selecionar todas</button>
          <template v-if="picked.size">
            <button type="button" class="text-button" @click="print(pickedLabels)">Imprimir selecionadas ({{ picked.size }})</button>
            <button v-if="inventory.canEdit" type="button" class="text-button danger" @click="removePicked">Apagar selecionadas ({{ picked.size }})</button>
            <button type="button" class="text-button" @click="picked = new Set()">Limpar seleção</button>
          </template>
        </div>
        <ul v-if="labels.length" class="label-list">
          <li v-for="entry in labels" :key="entry.id" class="label-card" :class="{ picked: picked.has(entry.id) }">
            <!-- A miniatura também abre a etiqueta; para o teclado e leitores de ecrã é o botão do título. -->
            <div class="label-card-preview" aria-hidden="true" @click="open(entry)">
              <div :style="{ zoom: fit(entry) }"><DrawerLabel :label="entry" :code="listSvgs[entry.id] || ''" /></div>
            </div>
            <button type="button" class="label-card-title" @click="open(entry)">{{ entry.title || 'Sem título' }}</button>
            <span class="sub">{{ entry.width }} × {{ entry.height }} mm · {{ entry.layout === 'bin' ? 'caixa' : 'gaveta' }}</span>
            <div class="location-actions">
              <button class="text-button" @click="open(entry)">Editar</button>
              <button class="text-button" @click="print([entry])">Imprimir</button>
              <button type="button" class="toggle-chip" :aria-pressed="picked.has(entry.id)" :aria-label="`Selecionar ${entry.title || 'Sem título'}`" @click="togglePick(entry.id)">{{ picked.has(entry.id) ? '✓ Selecionada' : 'Selecionar' }}</button>
            </div>
          </li>
        </ul>
      </template>
      <div v-else class="drawer-label-layout">
        <form class="people-editor drawer-label-editor" @submit.prevent>
          <div>
            <p id="drawer-label-layout" class="editor-label">Formato</p>
            <div class="toggle-chips" role="group" aria-labelledby="drawer-label-layout">
              <button v-for="[layout, name] in layouts" :key="layout" type="button" class="toggle-chip" :aria-pressed="(label.layout || 'drawer') === layout" @click="label.layout = layout">{{ name }}</button>
            </div>
          </div>
          <!-- O tamanho da letra fica ao lado do que muda; vazio acompanha a altura da etiqueta. -->
          <div class="label-with-size">
            <label v-if="many">Títulos, um por linha<textarea v-model="titles" rows="4" :placeholder="label.layout === 'bin' ? 'M3x10\nM4x16\nM5x20' : 'Armário 1\nArmário 2'"></textarea></label>
            <label v-else>Título<input v-model="label.title" maxlength="40" :placeholder="label.layout === 'bin' ? 'M3x10' : 'Armário 1'" autocomplete="off"></label>
            <label>Letra (pt)<input v-model.number="label.titleSize" type="number" min="4" max="72" step="0.5" placeholder="Auto" aria-label="Letra do título (pt)"></label>
          </div>
          <div v-if="label.id == null" class="toggle-chips">
            <button type="button" class="toggle-chip" :aria-pressed="many" @click="toggleMany">Várias de uma vez</button>
            <span v-if="many" class="hint">{{ titleLines.length }} etiqueta(s), iguais exceto no título.</span>
          </div>
          <div v-if="label.layout === 'bin'">
            <p id="drawer-label-screw" class="editor-label">Desenho do parafuso <span>a rosca e o comprimento vêm do título, ex.: M4x16</span></p>
            <div class="label-icons" role="group" aria-labelledby="drawer-label-screw">
              <button type="button" class="toggle-chip" :aria-pressed="!label.screw" @click="label.screw = ''">Nenhum</button>
              <button v-for="[key, name, svg] in screwHeads" :key="key" type="button" class="label-icon" :aria-pressed="label.screw === key" :aria-label="`Desenho: ${name}`" :title="name" @click="label.screw = key" v-html="svg"></button>
            </div>
          </div>
          <div>
            <div class="label-fields-head">
              <p class="editor-label">Campos</p>
              <label>Letra (pt)<input v-model.number="label.fieldSize" type="number" min="4" max="72" step="0.5" placeholder="Auto" aria-label="Letra dos campos (pt)"></label>
            </div>
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
          <label>Componente ligado<input v-model="itemQuery" list="drawer-label-items" placeholder="Procura no inventário" autocomplete="off" @change="pickItem"></label>
          <datalist id="drawer-label-items"><option v-for="item in inventory.items" :key="item.id" :value="itemName(item)" /></datalist>
          <p v-if="label.item != null && !linkedItem" class="hint">O componente ligado já não existe no inventário.</p>
          <label v-if="label.code">Localização ligada<input v-model="label.location" list="drawer-label-locations" placeholder="Nenhuma: o código leva o texto" autocomplete="off"></label>
          <p v-if="label.code && !label.location && boxOf(label)" class="hint">Sem localização, o código abre a do componente: {{ boxOf(label) }}.</p>
          <datalist id="drawer-label-locations"><option v-for="name in locationNames" :key="name" :value="name" /></datalist>
          <div>
            <p id="drawer-label-icon" class="editor-label">Ícone</p>
            <div class="label-icon-groups" role="group" aria-labelledby="drawer-label-icon">
              <button type="button" class="toggle-chip" :aria-pressed="!label.icon" @click="label.icon = ''">Sem ícone</button>
              <div v-for="[group, icons] in ICON_GROUPS" :key="group">
                <p class="label-icon-group">{{ group }}</p>
                <div class="label-icons">
                  <button v-for="[key, name, svg] in icons" :key="key" type="button" class="label-icon" :aria-pressed="label.icon === key" :aria-label="name" :title="name" @click="label.icon = key" v-html="svg"></button>
                </div>
              </div>
            </div>
          </div>
          <div class="drawer-label-size">
            <label>Largura (mm)<input v-model.number="label.width" type="number" min="20" max="150" required></label>
            <label>Altura (mm)<input v-model.number="label.height" type="number" min="10" max="100" required></label>
          </div>
        </form>
        <div class="drawer-label-side">
          <p class="editor-label">Pré-visualização</p>
          <div class="drawer-label-preview" :class="{ many }">
            <DrawerLabel v-for="(entry, index) in drafts" :key="index" :label="entry" :code="previewSvgs[index] || ''" />
          </div>
          <p v-if="dirty" class="hint" role="status">{{ label.id == null ? 'Etiqueta nova, ainda não guardada.' : 'Alterações por guardar.' }}</p>
          <div class="location-actions">
            <button v-if="inventory.canEdit" class="primary" :disabled="!dirty || (many && !titleLines.length)" @click="save">{{ many ? `Guardar ${titleLines.length}` : 'Guardar' }}</button>
            <button class="text-button" :disabled="!drafts.length" @click="print(drafts)">{{ many ? `Imprimir ${drafts.length}` : 'Imprimir' }}</button>
            <button class="text-button" @click="add(label)">Duplicar</button>
            <button class="text-button danger" @click="remove">Apagar</button>
          </div>
        </div>
      </div>
    </section>
    <LabelTutorial ref="tutorial" />
    <!-- Só aparece na impressão, direto no body como os QR das Localizações. O SVG é gerado aqui pelo zxing. -->
    <Teleport to="body"><div v-if="printing.length" class="qr-labels">
      <DrawerLabel v-for="(entry, index) in printing" :key="index" :label="entry" :code="entry.svg" :class="pageName(entry)" />
    </div></Teleport>
  </WorkspacePage>
</template>
