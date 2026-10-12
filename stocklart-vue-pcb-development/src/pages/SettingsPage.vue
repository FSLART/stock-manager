<script setup>
import { ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'

const compactMode = ref(localStorage.getItem('stocklart-compact-mode') === 'true')
const notifications = ref(localStorage.getItem('stocklart-notifications') !== 'false')

function saveSettings() {
  localStorage.setItem('stocklart-compact-mode', String(compactMode.value))
  localStorage.setItem('stocklart-notifications', String(notifications.value))
}
</script>

<template>
  <WorkspacePage
    active="settings"
    eyebrow="Sistema · preferências"
    title="Definições"
    description="Configura a experiência do Stocklart e prepara a aplicação para crescer."
  >
    <section class="settings-layout">
      <article class="workspace-card">
        <div class="card-heading">
          <h2>Preferências de interface</h2>
          <span class="status-pill">Local</span>
        </div>
        <label class="setting-row">
          <span><strong>Modo compacto</strong><small>Reduz o espaço entre linhas no inventário.</small></span>
          <input v-model="compactMode" type="checkbox" @change="saveSettings" />
        </label>
        <label class="setting-row">
          <span><strong>Notificações</strong><small>Mostra confirmações após alterações de stock.</small></span>
          <input v-model="notifications" type="checkbox" @change="saveSettings" />
        </label>
      </article>
      <article class="workspace-card">
        <p class="eyebrow">Persistência atual</p>
        <h2>Armazenamento local</h2>
        <p class="card-muted">
          As preferências e o inventário permanecem neste navegador. A ligação à API do VPS poderá ser adicionada sem
          alterar esta organização.
        </p>
      </article>
    </section>
  </WorkspacePage>
</template>
