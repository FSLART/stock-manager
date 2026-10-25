<script setup>
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { parseBom } from '../bom.js'
import { readStored, writeStored } from '../api.js'
import { stockCheck, stockToTake } from '../pcbStock.js'
import { useInventoryContext } from '../composables/useInventoryContext.js'
import WorkspacePage from '../components/WorkspacePage.vue'
import LabelScanner from '../components/LabelScanner.vue'
import BomStockList from '../components/BomStockList.vue'
import StepViewer from '../components/StepViewer.vue'

// Antes os projetos ficavam só no browser; os que ainda lá estão sobem para o servidor quando há sessão.
const PROJECTS_STORAGE_KEY = 'stocklart-pcb-projects'
const bomFile = ref(null)
const projectName = ref('')
const bomItems = ref([])
const projectError = ref('')
const projects = ref([]), localProjects = ref(readLocal()), listError = ref('')
const selectedProject = ref(null)
const labelScanner = ref(null), projectDetail = ref(null)
const api = inject('api')
const inventory = useInventoryContext()
const stepBusy = ref(false), stepError = ref(''), bomError = ref(''), imageBusy = ref(false)
// Placas a produzir por projeto; 0 deixa o projeto fora da lista de produção.
const boardCounts = reactive({})
// Retirar do stock: o nome da PCB escrito à mão confirma, e fica nos movimentos.
const consumeDialog = ref(null), consumeBoards = ref(1), consumeName = ref('')
const toTake = computed(() => selectedProject.value ? stockToTake(selectedProject.value.items, consumeBoards.value || 0, inventory.items) : { items: [], short: [] })
const toTakeUnits = computed(() => toTake.value.items.reduce((total, item) => total + item.qty, 0))

const componentCount = computed(() => bomItems.value.reduce((total, item) => total + item.quantity, 0))
// Cada linha do BOM do projeto aberto, com o que o BOM diz dela para ver ao abrir a linha.
const lineStock = computed(() => selectedProject.value?.items.map(line => ({
  ...stockCheck([{ lines: [line], count: 1 }], inventory.items)[0],
  details: [
    line.partNumber !== '—' && line.value !== 'Componente sem valor' && ['Valor', line.value],
    line.description !== '—' && ['Descrição', line.description],
    line.footprint !== '—' && ['Footprint', line.footprint],
  ].filter(Boolean),
})) ?? [])
const build = computed(() => stockCheck(projects.value.filter(project => boardCounts[project.id] > 0).map(project => ({ lines: project.items, count: boardCounts[project.id] })), inventory.items))

function readLocal() {
  const saved = readStored(PROJECTS_STORAGE_KEY, [])
  return Array.isArray(saved) ? saved : []
}
async function loadProjects() {
  try {
    // Sobem com o mesmo id, por isso repetir (outro separador, falha a meio) não duplica.
    if (localProjects.value.length && inventory.signedIn) {
      await api.direct('savePcbProjects', { projects: localProjects.value })
      writeStored(PROJECTS_STORAGE_KEY, [])
      localProjects.value = []
    }
    projects.value = (await api.direct('pcbProjects')).projects || []
    listError.value = ''
  } catch (error) { listError.value = error.message || 'Não foi possível carregar os projetos.' }
}
// Carrega quando a sessão é conhecida e outra vez ao entrar ou sair (entrar também sobe os do browser).
watch(() => inventory.ready ? String(inventory.signedIn) : '', key => { if (key) loadProjects() }, { immediate: true })
async function persist(project, errorRef = projectError) {
  try { await api.direct('savePcbProjects', { projects: [project] }) }
  catch (error) { errorRef.value = error.message || 'Não foi possível guardar o projeto.'; return false }
  const index = projects.value.findIndex(entry => entry.id === project.id)
  projects.value = index < 0 ? [project, ...projects.value] : projects.value.with(index, project)
  errorRef.value = ''
  return true
}

async function selectBom(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  projectError.value = ''
  selectedProject.value = null
  bomFile.value = null
  bomItems.value = []
  if (!file) return

  const validBom = /\.(csv|bom|txt)$/i.test(file.name)
  if (!validBom) {
    projectError.value = 'Seleciona um ficheiro BOM em formato CSV, BOM ou TXT.'
    return
  }

  try {
    bomItems.value = parseBom(await file.text())
    if (!bomItems.value.length) throw new Error('O BOM não contém componentes.')
    bomFile.value = file
    if (!projectName.value) {
      projectName.value = file.name.replace(/\.(csv|bom|txt)$/i, '')
    }
  } catch (error) {
    bomFile.value = null
    bomItems.value = []
    projectError.value = error.message || 'Não foi possível ler o ficheiro BOM.'
  }
}

async function saveAndOpenProject() {
  if (!bomFile.value) return
  const project = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: projectName.value.trim() || bomFile.value.name,
    fileName: bomFile.value.name,
    items: bomItems.value,
    createdAt: new Date().toISOString()
  }
  if (!await persist(project)) return
  selectedProject.value = project
  bomFile.value = null
  bomItems.value = []
  projectName.value = ''
}

// Uma etiqueta lida soma-se à linha com o mesmo MPN, ou entra como linha nova no BOM do projeto aberto.
function addLabel({ mpn, manufacturer, qty }) {
  const project = selectedProject.value
  const same = item => item.partNumber.toUpperCase() === mpn.toUpperCase()
  const items = project.items.some(same)
    ? project.items.map(item => same(item) ? { ...item, quantity: item.quantity + qty } : item)
    : [...project.items, { reference: '—', value: 'Componente sem valor', description: manufacturer || '—', footprint: '—', partNumber: mpn, quantity: qty }]
  updateProject({ ...project, items })
}

async function updateProject(updated) {
  if (await persist(updated, bomError)) selectedProject.value = updated
}

// Uma nova versão do BOM substitui as linhas do projeto aberto; nome e STEP ficam.
async function replaceBom(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  bomError.value = ''
  if (!file) return
  if (!/\.(csv|bom|txt)$/i.test(file.name)) {
    bomError.value = 'Seleciona um ficheiro BOM em formato CSV, BOM ou TXT.'
    return
  }
  try {
    const items = parseBom(await file.text())
    if (!items.length) throw new Error('O BOM não contém componentes.')
    if (!confirm(`Substituir o BOM de ${selectedProject.value.name} por ${file.name}?`)) return
    updateProject({ ...selectedProject.value, fileName: file.name, items, updatedAt: new Date().toISOString() })
  } catch (error) {
    bomError.value = error.message || 'Não foi possível ler o ficheiro BOM.'
  }
}

async function attachStep(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  stepError.value = ''
  if (!file) return
  if (!/\.(step|stp)$/i.test(file.name)) {
    stepError.value = 'Seleciona um ficheiro STEP (.step ou .stp).'
    return
  }
  stepBusy.value = true
  try {
    const url = await api.uploadStep(file)
    await updateProject({ ...selectedProject.value, step: { name: file.name, url } })
  } catch (error) {
    stepError.value = error.message
  } finally { stepBusy.value = false }
}

// Foto da placa: ficheiro ou Ctrl+V com o projeto aberto (fora dos popups).
async function attachImage(file) {
  if (!file?.type.startsWith('image/') || imageBusy.value) return
  stepError.value = ''
  imageBusy.value = true
  try { await updateProject({ ...selectedProject.value, image: await api.uploadImage(file) }) }
  catch (error) { stepError.value = error.message }
  finally { imageBusy.value = false }
}
function pasteImage(event) {
  const file = [...(event.clipboardData?.files || [])].find(f => f.type.startsWith('image/'))
  if (!file || !selectedProject.value || !inventory.signedIn || document.querySelector('dialog[open]')) return
  event.preventDefault()
  attachImage(file)
}
onMounted(() => window.addEventListener('paste', pasteImage))
onUnmounted(() => window.removeEventListener('paste', pasteImage))

// O projeto abre por baixo da lista de produção: leva a vista até ele.
async function openProject(project) {
  selectedProject.value = project
  await nextTick()
  projectDetail.value?.scrollIntoView?.({ behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

function openConsume() {
  consumeBoards.value = boardCounts[selectedProject.value.id] || 1
  consumeName.value = ''
  consumeDialog.value.showModal()
}
function consume() {
  inventory.consume({ items: toTake.value.items, note: `PCB ${selectedProject.value.name} × ${consumeBoards.value}` }, () => consumeDialog.value.close())
}

const formatDate = timestamp => !timestamp ? '' : new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))

async function removeProject(projectId) {
  if (!confirm('Apagar este projeto PCB para toda a equipa?')) return
  try { await api.direct('deletePcbProject', { id: projectId }) }
  catch (error) { listError.value = error.message || 'Não foi possível apagar o projeto.'; return }
  projects.value = projects.value.filter(project => project.id !== projectId)
  if (selectedProject.value?.id === projectId) selectedProject.value = null
}
</script>

<template>
  <WorkspacePage
    active="pcbs"
    eyebrow="Produção · listas de materiais"
    title="PCB e os seus BOMs"
    description="Cria projetos PCB, consulta os seus BOMs e confirma o stock para produzir. Os projetos e os modelos STEP ficam no servidor, para toda a equipa."
  >
    <!-- Sem sessão só se consultam os projetos: criar e mudar pede login, como no inventário. -->
    <section v-if="inventory.signedIn" class="workspace-grid">
      <article class="workspace-card workspace-card-wide">
        <div class="card-heading">
          <div>
            <span class="card-icon">▦</span>
            <h2>Novo projeto PCB</h2>
          </div>
          <button class="primary-button" type="button" :disabled="!bomFile" @click="saveAndOpenProject">
            Guardar projeto
          </button>
        </div>
        <p class="card-muted">Define o projeto e carrega o BOM para consultar os componentes e quantidades da placa.</p>
        <label class="project-name-field">
          <span>Nome do projeto</span>
          <input v-model="projectName" type="text" placeholder="Ex.: Controlador de motor V1" />
        </label>
        <div class="pcb-file-actions">
          <label class="file-dropzone" :class="{ 'file-dropzone-selected': bomFile }">
            <span class="file-dropzone-icon">BOM</span>
            <span
              ><strong>{{ bomFile?.name || 'Carregar ficheiro BOM' }}</strong
              ><small>CSV, BOM ou TXT</small></span
            >
            <input type="file" aria-label="Carregar ficheiro BOM" accept=".csv,.bom,.txt,text/csv,text/plain" @change="selectBom" />
          </label>
        </div>
        <div v-if="projectError" class="upload-error" role="alert">{{ projectError }}</div>
        <div class="project-upload-summary">
          <span
            ><strong>{{ componentCount }}</strong> componentes detetados</span
          >
          <span v-if="projectName" class="status-pill">Projeto definido</span>
        </div>
      </article>
      <article class="workspace-card">
        <p class="eyebrow">Fluxo de trabalho</p>
        <h2>Projeto e BOM associados</h2>
        <p class="card-muted">
          Cada projeto guarda o nome, o BOM e o modelo STEP no servidor, e toda a equipa vê os mesmos. Indica quantas placas queres produzir de cada projeto para ver o que há em stock.
        </p>
      </article>
    </section>

    <section class="workspace-card saved-projects">
      <div class="card-heading">
        <div>
          <span class="card-icon">PCB</span>
          <h2>Projetos guardados</h2>
        </div>
        <span class="status-pill">{{ projects.length }} projeto(s)</span>
      </div>
      <div v-if="listError" class="upload-error" role="alert">{{ listError }}</div>
      <div v-if="!projects.length" class="empty-workspace">Ainda não há projetos PCB guardados.<template v-if="!inventory.signedIn"> Inicia sessão para criar um.</template></div>
      <p v-if="localProjects.length && !inventory.signedIn" class="hint">{{ localProjects.length }} projeto(s) guardado(s) só neste navegador sobem para a equipa quando iniciares sessão.</p>
      <div v-else class="saved-project-list">
        <div v-for="project in projects" :key="project.id" :class="['saved-project', { selected: selectedProject?.id === project.id }]">
          <button class="saved-project-open" @click="openProject(project)">
            <span class="saved-project-thumb">
              <img v-if="project.image" :src="project.image" alt="" loading="lazy">
              <span v-else class="step-file-mark">PCB</span>
            </span>
            <span>
              <strong>{{ project.name }}</strong>
              <small>{{ [formatDate(project.updatedAt || project.createdAt), `${project.items.reduce((total, item) => total + item.quantity, 0)} componentes`].filter(Boolean).join(" · ") }}</small>
            </span>
          </button>
          <div class="saved-project-foot">
            <label class="board-count">
              <span>Placas</span>
              <input v-model.number="boardCounts[project.id]" type="number" min="0" step="1" placeholder="0" :aria-label="`Placas a produzir de ${project.name}`" />
            </label>
            <button v-if="inventory.signedIn" class="saved-project-delete" aria-label="Apagar projeto" @click.stop="removeProject(project.id)">×</button>
          </div>
        </div>
      </div>
      <div v-if="build.length" class="build-list">
        <h2>Lista de produção</h2>
        <BomStockList :rows="build" label="Lista de produção" />
      </div>
    </section>

    <section v-if="selectedProject" ref="projectDetail" class="workspace-card pcb-project-detail">
      <div class="card-heading">
        <div>
          <span class="card-icon">PCB</span>
          <h2>{{ selectedProject.name }}</h2>
        </div>
        <span class="pcb-detail-actions">
          <label v-if="inventory.signedIn" class="text-button">
            Substituir BOM
            <input type="file" class="sr-only" accept=".csv,.bom,.txt,text/csv,text/plain" aria-label="Substituir ficheiro BOM" @change="replaceBom" />
          </label>
          <button v-if="inventory.signedIn" class="text-button" type="button" @click="labelScanner.open()">Ler etiqueta</button>
          <button v-if="inventory.electronicsEditor" class="text-button" type="button" @click="openConsume">Retirar do stock</button>
          <button class="text-button" type="button" @click="selectedProject = null">Fechar</button>
        </span>
      </div>
      <div v-if="bomError" class="upload-error" role="alert">{{ bomError }}</div>
      <div class="pcb-detail-grid">
        <div class="pcb-step-panel">
          <img v-if="selectedProject.image" class="pcb-image" :src="selectedProject.image" :alt="`Placa ${selectedProject.name}`">
          <span v-if="inventory.signedIn" class="pcb-step-actions">
            <label class="text-button">
              {{ imageBusy ? 'A enviar…' : selectedProject.image ? 'Substituir imagem' : 'Anexar imagem' }}
              <input type="file" class="sr-only" accept="image/*" aria-label="Anexar imagem da PCB" :disabled="imageBusy" @change="attachImage($event.target.files?.[0]); $event.target.value = ''" />
            </label>
            <button v-if="selectedProject.image" class="text-button" type="button" @click="updateProject({ ...selectedProject, image: '' })">Remover imagem</button>
            <small>ou Ctrl+V para colar</small>
          </span>
          <StepViewer v-if="selectedProject.step" :url="selectedProject.step.url" />
          <div v-else class="pcb-step-empty">
            <div class="step-file-mark">STEP</div>
            <small>Sem modelo 3D associado</small>
          </div>
          <div class="pcb-step-meta">
            <strong v-if="selectedProject.step">{{ selectedProject.step.name }}</strong>
            <span class="pcb-step-actions">
              <a v-if="selectedProject.step" class="text-button" :href="selectedProject.step.url" :download="selectedProject.step.name">Descarregar STEP</a>
              <label v-if="inventory.signedIn" class="text-button">
                {{ stepBusy ? 'A enviar…' : selectedProject.step ? 'Substituir STEP' : 'Anexar STEP' }}
                <input type="file" class="sr-only" accept=".step,.stp" aria-label="Anexar ficheiro STEP" :disabled="stepBusy" @change="attachStep" />
              </label>
            </span>
            <div v-if="stepError" class="upload-error" role="alert">{{ stepError }}</div>
            <small>BOM: {{ selectedProject.fileName }} · <b>{{ selectedProject.items.reduce((total, item) => total + item.quantity, 0) }}</b> componentes</small>
          </div>
        </div>
        <BomStockList :rows="lineStock" :label="`BOM de ${selectedProject.name}`" />
      </div>
    </section>
    <dialog ref="consumeDialog" aria-labelledby="consume-title">
      <form v-if="selectedProject" @submit.prevent="consume">
        <h2 id="consume-title">Retirar do stock</h2>
        <label>Placas produzidas <input v-model.number="consumeBoards" type="number" min="1" step="1" required></label>
        <p class="hint">Sai do stock: <b>{{ toTakeUnits }}</b> unidade(s) de {{ toTake.items.length }} componente(s). Fica registado nos movimentos.</p>
        <p v-if="toTake.short.length" class="hint error">Sem stock suficiente (retira-se só o que há): {{ toTake.short.join(', ') }}</p>
        <label>Escreve <b>{{ selectedProject.name }}</b> para confirmar <input v-model="consumeName" autocomplete="off" required></label>
        <div class="actions">
          <button type="button" class="ghost" @click="consumeDialog.close()">Cancelar</button>
          <button class="primary" :disabled="consumeName.trim() !== selectedProject.name || !toTake.items.length">Retirar do stock</button>
        </div>
      </form>
    </dialog>
    <LabelScanner ref="labelScanner" action="Adicionar ao BOM" @use="addLabel" />
  </WorkspacePage>
</template>
