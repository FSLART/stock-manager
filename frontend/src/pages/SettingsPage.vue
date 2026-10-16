<script setup>
import { inject, ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import { writeStored } from '../api.js'

const preferences = inject('preferences')
const error = ref('')
function saveSettings(key, value) {
  const storageKey = key === 'compact' ? 'stocklart-compact-mode' : 'stocklart-notifications'
  if (!writeStored(storageKey, value)) { error.value = 'Não foi possível guardar a preferência neste navegador.'; return }
  preferences[key] = value
  error.value = ''
}
</script>

<template>
  <WorkspacePage active="settings" eyebrow="Sistema · preferências" title="Definições" description="Configura a experiência do Stocklart neste navegador.">
    <section class="settings-layout">
      <article class="workspace-card">
        <div class="card-heading"><h2>Preferências de interface</h2><span class="status-pill">Local</span></div>
        <label class="setting-row"><span><strong>Modo compacto</strong><small>Reduz o espaço entre linhas no inventário.</small></span><input :checked="preferences.compact" aria-label="Modo compacto" type="checkbox" @change="saveSettings('compact', $event.target.checked)"></label>
        <label class="setting-row"><span><strong>Notificações</strong><small>Mostra confirmações após alterações de stock. Erros continuam visíveis.</small></span><input :checked="preferences.notifications" aria-label="Notificações" type="checkbox" @change="saveSettings('notifications', $event.target.checked)"></label>
        <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      </article>
      <article class="workspace-card"><p class="eyebrow">Persistência atual</p><h2>Inventário ligado à API</h2><p class="card-muted">O inventário é gerido pelo servidor Flask ou pelo Google Apps Script, com cache e fila offline. Projetos PCB, histórico de movimentos e preferências são guardados apenas neste navegador.</p></article>
    </section>
  </WorkspacePage>
</template>
