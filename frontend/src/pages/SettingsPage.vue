<script setup>
import { inject, ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import PeopleAdmin from '../components/PeopleAdmin.vue'
import { writeStored } from '../api.js'

const preferences = inject('preferences')
const auth = inject('auth')
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
      <article class="workspace-card"><p class="eyebrow">Persistência atual</p><h2>Inventário ligado à API</h2><p class="card-muted">O inventário e o histórico de movimentos ficam no servidor Flask (ou no Google Apps Script), com cache e fila offline. Projetos PCB e preferências são guardados apenas neste navegador.</p></article>
      <article v-if="auth.user" class="workspace-card">
        <div class="card-heading"><h2>A tua sessão</h2><span class="status-pill">{{ auth.user.name }}</span></div>
        <p class="card-muted">As alterações ao stock ficam registadas com o teu nome. A sessão fica aberta neste browser até carregares em Sair.</p>
        <p v-if="auth.user.notion" class="card-muted">Conta Notion ligada: também podes entrar com o Notion.</p>
        <a v-else-if="auth.notion" class="text-button" href="/api/auth/notion?next=settings">Ligar conta Notion</a>
      </article>
      <PeopleAdmin v-if="auth.user?.admin" />
    </section>
  </WorkspacePage>
</template>
