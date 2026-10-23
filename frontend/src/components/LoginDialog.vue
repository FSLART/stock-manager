<script setup>
import { inject, ref } from 'vue'
import { readStored, writeStored } from '../api.js'

const api = inject('api')
const auth = inject('auth')
const emit = defineEmits(['login'])
const dialog = ref(null), people = ref([]), personId = ref(null), pin = ref(''), error = ref(''), busy = ref(false)
let resolve = () => {}

// Abre o popup e responde true depois de um login com PIN, ou false se for cancelado.
function open() {
  resolve(false)
  error.value = ''
  pin.value = ''
  dialog.value.showModal()
  api.direct('authPeople').then(data => {
    people.value = data.people
    const last = readStored('stocklart-last-person', null)
    personId.value = people.value.some(person => person.id === last) ? last : null
  }).catch(cause => { error.value = cause.message })
  return new Promise(done => { resolve = done })
}
function cancel() { resolve(false) }
async function submit() {
  busy.value = true
  error.value = ''
  try {
    const data = await api.direct('login', { person_id: personId.value, pin: pin.value.trim() })
    writeStored('stocklart-last-person', personId.value)
    emit('login', data.user)
    resolve(true)
    dialog.value.close()
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" aria-labelledby="login-title" @close="cancel">
    <form @submit.prevent="submit">
      <h2 id="login-title">Entrar para alterar o stock</h2>
      <label>Pessoa
        <select v-model="personId" required>
          <option :value="null" disabled>Escolhe o teu nome</option>
          <option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option>
        </select>
      </label>
      <label>PIN <input v-model="pin" type="password" maxlength="4" pattern="[A-Za-z0-9]{4}" title="4 letras ou números" autocomplete="off" required></label>
      <p class="hint">Ver o stock não precisa de login. Cada alteração fica registada com o teu nome.</p>
      <p v-if="error" class="hint error" role="alert">{{ error }}</p>
      <div class="actions">
        <a v-if="auth.notion" class="text-button" href="/api/auth/notion">Entrar com Notion</a>
        <button type="button" class="ghost" :disabled="busy" @click="dialog.close()">Cancelar</button>
        <button class="primary" :disabled="busy">Entrar</button>
      </div>
    </form>
  </dialog>
</template>
