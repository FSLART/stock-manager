<script setup>
import { computed, ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'

const PROJECTS_STORAGE_KEY = 'stocklart-pcb-projects'
const bomFile = ref(null)
const projectName = ref('')
const bomItems = ref([])
const projectError = ref('')
const projects = ref(loadProjects())
const selectedProject = ref(null)

const componentCount = computed(() => bomItems.value.reduce((total, item) => total + item.quantity, 0))

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveProjects() {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects.value))
}

function componentName(item) {
  return item.partNumber !== '—' ? item.partNumber : item.value
}

function parseBom(text) {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
  if (!rows.length) return []

  const separator = rows[0].includes(';') ? ';' : ','
  const normalizeHeader = (header) =>
    header
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
  const splitRow = (row) => {
    const values = []
    let value = ''
    let quoted = false
    for (let index = 0; index < row.length; index += 1) {
      const character = row[index]
      if (character === '"') {
        if (quoted && row[index + 1] === '"') {
          value += '"'
          index += 1
        } else {
          quoted = !quoted
        }
      } else if (character === separator && !quoted) {
        values.push(value.trim())
        value = ''
      } else {
        value += character
      }
    }
    values.push(value.trim())
    return values
  }
  const headers = splitRow(rows[0]).map(normalizeHeader)
  const findHeader = (pattern) => headers.findIndex((header) => pattern.test(header))
  const quantityIndex = findHeader(/^(qty|quantity|quantidade|qtd|count|amount)$/)
  const referenceIndex = findHeader(/^(reference|references|ref|refs|designator|designators|partreference)$/)
  const valueIndex = findHeader(/^(value|component|componentvalue|valor|name|componentname)$/)
  const descriptionIndex = findHeader(/^(description|desc|descricao|details?)$/)
  const footprintIndex = findHeader(/^(footprint|package|encapsulation|encapsulamento)$/)
  const partNumberIndex = findHeader(/^(mpn|partnumber|partno|manufacturerpartnumber|ordercode|codigo)$/)
  const hasHeaders = [
    quantityIndex,
    referenceIndex,
    valueIndex,
    descriptionIndex,
    footprintIndex,
    partNumberIndex
  ].some((index) => index >= 0)
  const dataRows = hasHeaders ? rows.slice(1) : rows

  return dataRows
    .map((row) => {
      const values = splitRow(row)
      const references = values[referenceIndex >= 0 ? referenceIndex : 0] || ''
      const rawQuantity = quantityIndex >= 0 ? values[quantityIndex] : ''
      const referenceCount = references.split(/[,\s]+/).filter(Boolean).length
      const quantity = Number.parseInt(rawQuantity || String(referenceCount || 1), 10)
      return {
        reference: references || '—',
        value: values[valueIndex >= 0 ? valueIndex : -1] || 'Componente sem valor',
        description: values[descriptionIndex >= 0 ? descriptionIndex : -1] || '—',
        footprint: values[footprintIndex >= 0 ? footprintIndex : -1] || '—',
        partNumber: values[partNumberIndex >= 0 ? partNumberIndex : -1] || '—',
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
      }
    })
    .filter((item) => item.reference !== '—' || item.value !== 'Componente sem valor')
}

async function selectBom(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  projectError.value = ''
  selectedProject.value = false
  if (!file) return

  const validBom = /\.(csv|bom|txt)$/i.test(file.name)
  if (!validBom) {
    projectError.value = 'Seleciona um ficheiro BOM em formato CSV, BOM ou TXT.'
    return
  }

  try {
    bomFile.value = file
    bomItems.value = parseBom(await file.text())
    if (!projectName.value) {
      projectName.value = file.name.replace(/\.(csv|bom|txt)$/i, '')
    }
  } catch {
    bomFile.value = null
    bomItems.value = []
    projectError.value = 'Não foi possível ler o ficheiro BOM.'
  }
}

function saveAndOpenProject() {
  if (!bomFile.value) return
  const project = {
    id: crypto.randomUUID(),
    name: projectName.value.trim() || bomFile.value.name,
    fileName: bomFile.value.name,
    items: bomItems.value,
    createdAt: new Date().toISOString()
  }
  projects.value = [project, ...projects.value]
  saveProjects()
  selectedProject.value = project
}

function openProject(project) {
  selectedProject.value = project
}

function removeProject(projectId) {
  projects.value = projects.value.filter((project) => project.id !== projectId)
  saveProjects()
  if (selectedProject.value?.id === projectId) selectedProject.value = null
}
</script>

<template>
  <WorkspacePage
    active="pcbs"
    eyebrow="Produção · listas de materiais"
    title="PCB e os seus BOMs"
    description="Cria um projeto PCB e associa-lhe o respetivo ficheiro BOM."
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
            <input type="file" accept=".csv,.bom,.txt,text/csv,text/plain" @change="selectBom" />
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
          Cada projeto mantém o seu nome e o ficheiro BOM correspondente, pronto para receber mais dados no futuro.
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
        <button v-for="project in projects" :key="project.id" class="saved-project" @click="openProject(project)">
          <span>
            <strong>{{ project.name }}</strong>
            <small>{{ project.fileName }} · {{ project.items.length }} linhas no BOM</small>
          </span>
          <span class="saved-project-count">{{ project.items.reduce((total, item) => total + item.quantity, 0) }}</span>
          <span
            class="saved-project-delete"
            role="button"
            tabindex="0"
            aria-label="Apagar projeto"
            @click.stop="removeProject(project.id)"
            @keydown.enter.stop="removeProject(project.id)"
            >×</span
          >
        </button>
      </div>
    </section>

    <section v-if="selectedProject" class="workspace-card pcb-project-detail">
      <div class="card-heading">
        <div>
          <span class="card-icon">PCB</span>
          <h2>{{ selectedProject.name }}</h2>
        </div>
        <button class="text-button" @click="selectedProject = null">Fechar</button>
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
            <div v-for="item in selectedProject.items" :key="`${componentName(item)}-${item.quantity}`" class="bom-row">
              <span class="bom-component">
                <strong>{{ componentName(item) }}</strong>
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
  </WorkspacePage>
</template>
