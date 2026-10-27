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
  <WorkspacePage active="settings" title="Definições" description="Gere as preferências deste navegador e consulta a tua sessão e os dados partilhados.">
    <section class="settings-layout">
      <article class="workspace-card">
        <div class="card-heading"><h2>Preferências deste dispositivo</h2><span class="status-pill">Só neste navegador</span></div>
        <label class="setting-row"><span><strong>Modo compacto</strong><small>Reduz o espaço entre linhas no inventário.</small></span><input :checked="preferences.compact" aria-label="Modo compacto" type="checkbox" @change="saveSettings('compact', $event.target.checked)"></label>
        <label class="setting-row"><span><strong>Notificações</strong><small>Mostra confirmações após alterações de stock. Erros continuam visíveis.</small></span><input :checked="preferences.notifications" aria-label="Notificações" type="checkbox" @change="saveSettings('notifications', $event.target.checked)"></label>
        <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      </article>
      <article class="workspace-card"><h2>Dados partilhados</h2><p class="card-muted">O inventário, as localizações, as etiquetas e o histórico de movimentos são guardados no servidor. Projetos PCB, BOMs e modelos STEP são partilhados com a equipa. As preferências de interface acima aplicam-se só a este navegador.</p><p class="card-muted">Alterações ao inventário exigem uma conta de Electronics ou administrador. A consulta dos recursos partilhados continua disponível aos restantes membros.</p></article>
      <article v-if="auth.user" class="workspace-card">
        <div class="card-heading"><h2>A tua sessão</h2><span class="status-pill">{{ auth.user.name }}</span></div>
        <p class="card-muted">As alterações ao stock ficam registadas com o teu nome. Usa Sair no menu da conta para terminar a sessão neste navegador.</p>
        <!-- PIN (desativado): ligar a conta Notion a uma sessão iniciada com PIN.
        <p v-if="auth.user.notion" class="card-muted">Conta Notion ligada: também podes entrar com o Notion.</p>
        <a v-else-if="auth.notion" class="text-button" href="/api/auth/notion?next=settings">Ligar conta Notion</a>
        -->
      </article>
      <section v-if="auth.user?.admin" aria-label="Administração de pessoas"><h2>Pessoas e acessos</h2><PeopleAdmin /></section>
    </section>
  </WorkspacePage>
</template>
