<script setup>
import { computed, ref } from 'vue'
import { parseBom } from '../bom.js'
import { readStored, writeStored } from '../api.js'
import WorkspacePage from '../components/WorkspacePage.vue'
import LabelScanner from '../components/LabelScanner.vue'

const PROJECTS_STORAGE_KEY = 'stocklart-pcb-projects'
const bomFile = ref(null)
const projectName = ref('')
const bomItems = ref([])
const projectError = ref('')
const projects = ref(loadProjects())
const selectedProject = ref(null)
const labelScanner = ref(null)

const componentCount = computed(() => bomItems.value.reduce((total, item) => total + item.quantity, 0))

function loadProjects() {
  const saved = readStored(PROJECTS_STORAGE_KEY, [])
  return Array.isArray(saved) ? saved : []
}
function saveProjects(updated) {
  if (!writeStored(PROJECTS_STORAGE_KEY, updated)) {
    projectError.value = 'Não foi possível guardar os projetos neste navegador.'
    return false
  }
  projects.value = updated
  projectError.value = ''
  return true
}

function componentName(item) {
  return item.partNumber !== '—' ? item.partNumber : item.value
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

function saveAndOpenProject() {
  if (!bomFile.value) return
  const project = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: projectName.value.trim() || bomFile.value.name,
    fileName: bomFile.value.name,
    items: bomItems.value,
    createdAt: new Date().toISOString()
  }
  if (!saveProjects([project, ...projects.value])) return
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
    : [...project.items, { reference: '—', value: mpn, description: manufacturer || '—', footprint: '—', partNumber: mpn, quantity: qty }]
  const updated = { ...project, items }
  if (saveProjects(projects.value.map(entry => entry.id === project.id ? updated : entry))) selectedProject.value = updated
}

function openProject(project) {
  selectedProject.value = project
}

function removeProject(projectId) {
  if (!confirm('Apagar este projeto PCB guardado?')) return
  if (!saveProjects(projects.value.filter((project) => project.id !== projectId))) return
  if (selectedProject.value?.id === projectId) selectedProject.value = null
}
</script>

<template>
  <WorkspacePage
    active="pcbs"
    eyebrow="Produção · listas de materiais"
    title="PCB e os seus BOMs"
    description="Cria projetos PCB e consulta os seus BOMs. Projetos guardados neste navegador."
  >
    <section class="workspace-grid">
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
          Cada projeto mantém o seu nome e o ficheiro BOM correspondente, guardados neste navegador para consulta posterior.
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
      <div v-if="!projects.length" class="empty-workspace">Ainda não tens projetos PCB guardados.</div>
      <div v-else class="saved-project-list">
        <div v-for="project in projects" :key="project.id" class="saved-project">
          <button class="saved-project-open" @click="openProject(project)">
          <span>
            <strong>{{ project.name }}</strong>
            <small>{{ project.fileName }} · {{ project.items.length }} linhas no BOM</small>
          </span>
          <span class="saved-project-count">{{ project.items.reduce((total, item) => total + item.quantity, 0) }}</span>
          </button>
          <button
            class="saved-project-delete"
            aria-label="Apagar projeto"
            @click.stop="removeProject(project.id)"
            >×</button>
        </div>
      </div>
    </section>

    <section v-if="selectedProject" class="workspace-card pcb-project-detail">
      <div class="card-heading">
        <div>
          <span class="card-icon">PCB</span>
          <h2>{{ selectedProject.name }}</h2>
        </div>
        <span class="pcb-detail-actions">
          <button class="text-button" type="button" @click="labelScanner.open()">Ler etiqueta</button>
          <button class="text-button" type="button" @click="selectedProject = null">Fechar</button>
        </span>
      </div>
      <div class="pcb-detail-grid">
        <div class="pcb-step-preview">
          <div class="step-file-mark">BOM</div>
          <strong>{{ selectedProject.fileName }}</strong>
          <small>Ficheiro associado ao projeto</small>
        </div>
        <div>
          <p class="eyebrow">Resumo do projeto</p>
          <div class="project-stat">
            <strong>{{ selectedProject.items.reduce((total, item) => total + item.quantity, 0) }}</strong
            ><span>componentes no BOM</span>
          </div>
          <div class="bom-list">
            <div v-for="(item, index) in selectedProject.items" :key="index" class="bom-row">
              <span class="bom-component">
                <strong>{{ componentName(item) }}</strong>
                <small v-if="item.reference !== '—'">Referências: {{ item.reference }}</small>
                <small v-if="item.partNumber !== '—' && item.value !== 'Componente sem valor'">
                  Valor: {{ item.value }}
                </small>
                <small v-if="item.description !== '—'">{{ item.description }}</small>
                <small v-if="item.footprint !== '—'">Footprint: {{ item.footprint }}</small>
              </span>
              <strong class="bom-quantity">{{ item.quantity }}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
    <LabelScanner ref="labelScanner" action="Adicionar ao BOM" @use="addLabel" />
  </WorkspacePage>
</template>
