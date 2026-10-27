<script setup>
import { inject, ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import UserAvatar from '../components/UserAvatar.vue'
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
  <WorkspacePage active="settings" title="Definições" description="Gere a tua conta e adapta o espaço de trabalho às tuas preferências.">
    <section class="settings-account">
      <header class="settings-profile">
        <UserAvatar v-if="auth.user" :name="auth.user.name" :src="auth.user.avatar || ''" :size="64" />
        <div><h2>{{ auth.user?.name || 'Preferências do utilizador' }}</h2>
          <p v-if="auth.user" class="card-muted">{{ [auth.user.role, auth.user.department].filter(Boolean).join(' · ') || 'Membro da equipa' }}</p>
          <p v-else class="card-muted">Personaliza a apresentação neste navegador.</p>
          <span v-if="auth.user?.admin" class="status-pill">Administrador</span>
        </div>
      </header>
      <article class="workspace-card">
        <div class="card-heading"><h2>Preferências deste dispositivo</h2><span class="status-pill">Só neste navegador</span></div>
        <label class="setting-row"><span><strong>Modo compacto</strong><small>Reduz o espaço entre linhas no inventário.</small></span><input :checked="preferences.compact" aria-label="Modo compacto" type="checkbox" @change="saveSettings('compact', $event.target.checked)"></label>
        <label class="setting-row"><span><strong>Notificações</strong><small>Mostra confirmações após alterações de stock. Erros continuam visíveis.</small></span><input :checked="preferences.notifications" aria-label="Notificações" type="checkbox" @change="saveSettings('notifications', $event.target.checked)"></label>
        <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      </article>
        <!-- PIN (desativado): ligar a conta Notion a uma sessão iniciada com PIN.
        <p v-if="auth.user.notion" class="card-muted">Conta Notion ligada: também podes entrar com o Notion.</p>
        <a v-else-if="auth.notion" class="text-button" href="/api/auth/notion?next=settings">Ligar conta Notion</a>
        -->
    </section>
      <section v-if="auth.user?.admin" class="settings-people" aria-label="Administração de pessoas"><h2>Pessoas e acessos</h2><PeopleAdmin /></section>
  </WorkspacePage>
</template>

<style scoped>
.settings-account { display: grid; grid-template-columns: minmax(240px, .8fr) minmax(0, 1.4fr); align-items: start; gap: 32px; padding-block: 8px 32px; border-bottom: 1px solid var(--line); }
.settings-profile { display: flex; gap: 18px; align-items: center; padding-block: 20px; }
.settings-profile h2 { margin: 0; font-size: 24px; overflow-wrap: anywhere; }
.settings-profile p { margin: 6px 0 10px; }
.settings-people { margin-top: 32px; }
.settings-people > h2 { margin-bottom: 18px; }
@media (max-width: 800px) { .settings-account { grid-template-columns: minmax(0, 1fr); gap: 12px; } }
</style>
