<script setup>
import { inject, onMounted, ref } from 'vue'

const api = inject('api')
const auth = inject('auth')
const people = ref([])
// PIN (desativado: as pessoas novas entram sozinhas pelo Notion). Descomentar os blocos PIN para voltar a ativar.
// PIN: const name = ref(''), pin = ref(''), admin = ref(false)
const busy = ref(false), error = ref(''), message = ref('')

async function load() { people.value = (await api.direct('people')).people }
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
    <p class="card-muted">Quem entra com Notion no workspace LART é adicionado automaticamente. Aqui podes dar acesso de admin ou apagar pessoas.</p>
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
    <div v-for="person in people" :key="person.id" class="setting-row">
      <span><strong>{{ person.name }}</strong><small>{{ [person.admin && 'admin', person.notion ? 'Notion ligado' : 'sem Notion'].filter(Boolean).join(' · ') }}</small></span>
      <div class="people-actions">
        <!-- PIN: <button class="text-button" :disabled="busy" @click="resetPin(person)">Repor PIN</button> -->
        <button class="text-button" :disabled="busy || person.id === auth.user.id" @click="run('editPerson', { id: person.id, admin: !person.admin })">{{ person.admin ? 'Tirar admin' : 'Tornar admin' }}</button>
        <button class="text-button danger" :disabled="busy || person.id === auth.user.id" @click="remove(person)">Apagar</button>
      </div>
    </div>
  </article>
</template>
