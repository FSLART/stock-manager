<script setup>
import { inject, onMounted, ref } from 'vue'

const api = inject('api')
const auth = inject('auth')
const people = ref([]), roles = ref([]), departments = ref([]), editing = ref(null)
// PIN (desativado: as pessoas novas entram sozinhas pelo Notion). Descomentar os blocos PIN para voltar a ativar.
// PIN: const name = ref(''), pin = ref(''), admin = ref(false)
const busy = ref(false), error = ref(''), message = ref('')

async function load() { ({ people: people.value, roles: roles.value, departments: departments.value } = await api.direct('people')) }
const departmentsOf = person => person.department ? person.department.split(', ') : []
function toggleDepartment(person, department) {
  const current = departmentsOf(person)
  run('editPerson', { id: person.id, departments: current.includes(department) ? current.filter(name => name !== department) : [...current, department] })
}
async function run(action, payload, after) {
  busy.value = true
  error.value = message.value = ''
  try {
    message.value = (await api.direct(action, payload)).msg
    after?.()
    await load()
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
// PIN: const add = () => run('newPerson', { name: name.value.trim(), pin: pin.value.trim(), admin: admin.value }, () => { name.value = pin.value = ''; admin.value = false })
// PIN: function resetPin(person) {
// PIN:   const value = prompt(`Novo PIN para ${person.name} (4 letras ou números)`)
// PIN:   if (value) run('editPerson', { id: person.id, pin: value.trim() })
// PIN: }
function remove(person) {
  if (confirm(`Apagar ${person.name}? Os movimentos já registados mantêm o nome.`)) run('deletePerson', { id: person.id })
}
onMounted(() => load().catch(cause => { error.value = cause.message }))
</script>

<template>
  <article class="workspace-card people-admin">
    <div class="card-heading"><h2>Pessoas</h2><span class="status-pill">{{ people.length }} pessoa(s)</span></div>
    <p class="card-muted">Quem entra com Notion no workspace LART é adicionado automaticamente. O cargo e o departamento vêm da base Members Filtered do Notion a cada login; se os mudares aqui, o Notion deixa de os mudar para essa pessoa. Só Electronics altera o stock eletrónico.</p>
    <!-- PIN:
    <form class="people-form" @submit.prevent="add">
      <label class="project-name-field"><span>Nome</span><input v-model="name" required autocomplete="off"></label>
      <label class="project-name-field"><span>PIN</span><input v-model="pin" maxlength="4" pattern="[A-Za-z0-9]{4}" title="4 letras ou números" required autocomplete="off"></label>
      <label class="check"><input v-model="admin" type="checkbox"> Admin</label>
      <button class="text-button" :disabled="busy">Adicionar</button>
    </form>
    -->
    <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
    <p v-else-if="message" class="card-muted" role="status">{{ message }}</p>
    <template v-for="person in people" :key="person.id">
    <div class="setting-row">
      <span>
        <strong>{{ person.name }}</strong>
        <span class="person-tags">
          <span class="person-tag role">{{ person.role }}</span>
          <span v-for="department in departmentsOf(person)" :key="department" class="person-tag">{{ department }}</span>
          <span v-if="!person.department" class="person-tag empty">Sem departamento</span>
        </span>
        <small>{{ [person.admin && 'Admin', person.manual ? 'Editado à mão' : 'Do Notion', person.notion ? 'Notion ligado' : 'Sem Notion'].filter(Boolean).join(' · ') }}</small>
      </span>
      <div class="people-actions">
        <button class="text-button" :aria-expanded="editing === person.id" @click="editing = editing === person.id ? null : person.id">{{ editing === person.id ? 'Fechar' : 'Editar cargo' }}</button>
        <!-- PIN: <button class="text-button" :disabled="busy" @click="resetPin(person)">Repor PIN</button> -->
        <button class="text-button" :disabled="busy || person.id === auth.user.id" @click="run('editPerson', { id: person.id, admin: !person.admin })">{{ person.admin ? 'Tirar admin' : 'Tornar admin' }}</button>
        <button class="text-button danger" :disabled="busy || person.id === auth.user.id" @click="remove(person)">Apagar</button>
      </div>
    </div>
    <div v-if="editing === person.id" class="people-editor">
      <div>
        <p :id="`role-${person.id}`" class="editor-label">Cargo</p>
        <div class="toggle-chips" role="group" :aria-labelledby="`role-${person.id}`">
          <button v-for="role in roles" :key="role" type="button" class="toggle-chip" :aria-pressed="person.role === role" :disabled="busy"
                  @click="person.role !== role && run('editPerson', { id: person.id, role })">{{ role }}</button>
        </div>
      </div>
      <div>
        <p :id="`departments-${person.id}`" class="editor-label">Departamentos <span>Electronics pode alterar o stock eletrónico</span></p>
        <div class="toggle-chips" role="group" :aria-labelledby="`departments-${person.id}`">
          <button v-for="department in departments" :key="department" type="button" class="toggle-chip" :aria-pressed="departmentsOf(person).includes(department)" :disabled="busy"
                  @click="toggleDepartment(person, department)">{{ department }}</button>
        </div>
      </div>
    </div>
    </template>
  </article>
</template>
