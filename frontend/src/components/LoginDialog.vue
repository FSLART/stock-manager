<script setup>
import { inject, ref } from 'vue'
// PIN (desativado: o login e so com Notion). Descomentar os blocos marcados PIN para voltar a ativar.
// PIN: import { readStored, writeStored } from '../api.js'

// PIN: const api = inject('api')
const auth = inject('auth')
// PIN: const emit = defineEmits(['login'])
const dialog = ref(null)
// PIN: const people = ref([]), personId = ref(null), pin = ref(''), error = ref(''), busy = ref(false)
let resolve = () => {}

// Abre o popup e responde false se for cancelado; o login com Notion sai da página e volta já com sessão.
function open() {
  resolve(false)
  // PIN: error.value = ''
  // PIN: pin.value = ''
  dialog.value.showModal()
  // PIN: api.direct('authPeople').then(data => {
  // PIN:   people.value = data.people
  // PIN:   const last = readStored('stocklart-last-person', null)
  // PIN:   personId.value = people.value.some(person => person.id === last) ? last : null
  // PIN: }).catch(cause => { error.value = cause.message })
  return new Promise(done => { resolve = done })
}
function cancel() { resolve(false) }
// PIN: async function submit() {
// PIN:   busy.value = true
// PIN:   error.value = ''
// PIN:   try {
// PIN:     const data = await api.direct('login', { person_id: personId.value, pin: pin.value.trim() })
// PIN:     writeStored('stocklart-last-person', personId.value)
// PIN:     emit('login', data.user)
// PIN:     resolve(true)
// PIN:     dialog.value.close()
// PIN:   } catch (cause) { error.value = cause.message }
// PIN:   finally { busy.value = false }
// PIN: }
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" aria-labelledby="login-title" @close="cancel">
    <form method="dialog">
      <h2 id="login-title">Entrar para alterar o stock</h2>
      <!-- PIN:
      <label>Pessoa
        <select v-model="personId" required>
          <option :value="null" disabled>Escolhe o teu nome</option>
          <option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option>
        </select>
      </label>
      <label>PIN <input v-model="pin" type="password" maxlength="4" pattern="[A-Za-z0-9]{4}" title="4 letras ou números" autocomplete="off" required></label>
      <p v-if="error" class="hint error" role="alert">{{ error }}</p>
      -->
      <p class="hint">Ver o stock não precisa de login. Entra com a tua conta Notion da LART; cada alteração fica registada com o teu nome.</p>
      <p v-if="!auth.notion" class="hint error" role="alert">O login com Notion não está configurado no servidor.</p>
      <div class="actions">
        <button type="button" class="ghost" @click="dialog.close()">Cancelar</button>
        <a v-if="auth.notion" class="primary notion-login" href="/api/auth/notion">Entrar com Notion</a>
      </div>
    </form>
  </dialog>
</template>
