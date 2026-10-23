<script setup>
import { inject, ref } from 'vue'
import brandLogo from '../assets/lartt-transparent.svg?inline'
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
  <dialog ref="dialog" class="login-dialog" aria-labelledby="login-title" @close="cancel">
    <form method="dialog">
      <div class="login-marks" aria-hidden="true">
        <span class="login-mark login-mark-lart"><img :src="brandLogo" alt=""></span>
        <span class="login-link"></span>
        <span class="login-mark login-mark-notion"><svg viewBox="0 0 40 40"><rect x="4" y="4" width="32" height="32" rx="7" fill="#fff" stroke="#111" stroke-width="2.5"/><path d="M13 11.5h5.2l8.3 12.2V15l-2-1.1v-2.4h6.8v2.4l-2 1.1v14h-3.8L16.6 16.6v9.6l2 1.1v2.4h-6.8v-2.4l2-1.1V14l-1.8-1z" fill="#111"/></svg></span>
      </div>
      <h2 id="login-title">Entra com o Notion</h2>
      <p class="login-lead">Para tirar ou repor componentes, usa a tua conta Notion da LART. Ver o stock continua livre para todos.</p>
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
      <ul class="login-facts">
        <li>Cada movimento fica com o teu nome no histórico.</li>
        <li>O Stocklart só guarda o teu nome e a tua foto do Notion.</li>
        <li>A sessão fica aberta neste browser até carregares em Sair.</li>
      </ul>
      <p v-if="!auth.notion" class="hint error" role="alert">O login com Notion não está configurado no servidor.</p>
      <a v-if="auth.notion" class="primary notion-login" href="/api/auth/notion"><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="4" width="32" height="32" rx="7" fill="#fff" stroke="#111" stroke-width="2.5"/><path d="M13 11.5h5.2l8.3 12.2V15l-2-1.1v-2.4h6.8v2.4l-2 1.1v14h-3.8L16.6 16.6v9.6l2 1.1v2.4h-6.8v-2.4l2-1.1V14l-1.8-1z" fill="#111"/></svg>Continuar com o Notion</a>
      <button type="button" class="ghost" @click="dialog.close()">Agora não</button>
    </form>
  </dialog>
</template>
