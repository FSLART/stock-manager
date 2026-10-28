<script setup>
import brandLogo from '../assets/lartt-transparent.svg?inline'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useNavigation } from '../composables/useNavigation.js'
import UserAvatar from './UserAvatar.vue'
import ViewAsPicker from './ViewAsPicker.vue'
import { componentValue } from '../stockText.js'
const router = useNavigation()
const auth = inject('auth', null), api = inject('api', null), movementFilter = inject('movementFilter', null)
const props = defineProps({ active: { type: String, default: '' } })
const menuOpen = ref(false), navOpen = ref(false), box = ref(null), chip = ref(null), navToggle = ref(null), header = ref(null), mine = ref(null), activityError = ref(false)
const firstName = computed(() => auth?.user?.name.split(/\s+/)[0] || '')
const previewLabel = computed(() => auth?.preview && (auth.preview.guest ? 'visitante sem sessão' : `${auth.preview.role} · ${auth.preview.department || 'sem departamento'}`))
const changingView = ref(false)
const leader = computed(() => Boolean(auth?.user && (auth.user.admin || ['Board', 'Department Leader'].includes(auth.user.role))))
const groups = [
  { label: 'Recursos e oficina', links: [
    { label: 'Inventário', route: '/stock', key: 'stock' },
    { label: 'Localizações', route: '/locations', key: 'locations' },
    { label: 'Etiquetas', route: '/labels', key: 'labels' },
    { label: 'Movimentos', route: '/movements', key: 'movements' },
  ] },
  { label: 'Engenharia', links: [
    { label: 'Projetos PCB', route: '/pcbs', key: 'pcbs' },
    { label: 'Cablagem', route: '/harness', key: 'harness' },
    { label: 'Simulação analógica', route: '/analog-simulation', key: 'analog-simulation' },
  ] },
]
function closeGroups() { header.value?.querySelectorAll('details[open]').forEach(group => { group.open = false }) }
function follow(event, path, filter = '') {
  if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (router.push(path) === false) return
  if (movementFilter) movementFilter.value = filter
  menuOpen.value = false; navOpen.value = false; closeGroups()
}
async function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value || !api) return
  activityError.value = false
  try {
    const movements = (await api.direct('movements')).movements.filter(movement => movement.person === auth.user.name)
    mine.value = { today: movements.filter(movement => new Date(movement.ts).toDateString() === new Date().toDateString()).length, total: movements.length, recent: movements.slice(0, 3) }
  } catch { mine.value = null; activityError.value = true }
}
const closeOutside = event => {
  if (menuOpen.value && !box.value?.contains(event.target)) menuOpen.value = false
  if (!header.value?.contains(event.target)) { navOpen.value = false; closeGroups() }
  else header.value.querySelectorAll('details[open]').forEach(group => { if (!group.contains(event.target)) group.open = false })
}
const closeOnEscape = event => {
  if (event.key !== 'Escape') return
  if (menuOpen.value) { menuOpen.value = false; chip.value?.focus(); return }
  const openGroup = header.value?.querySelector('details[open]')
  if (openGroup) { openGroup.open = false; openGroup.querySelector('summary')?.focus(); return }
  if (navOpen.value) { navOpen.value = false; navToggle.value?.focus() }
}
onMounted(() => { document.addEventListener('pointerdown', closeOutside); document.addEventListener('keydown', closeOnEscape) })
onUnmounted(() => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape) })
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="header?.parentElement.querySelector('main')?.focus()">Saltar para o conteúdo</a>
  <div v-if="auth?.preview" class="preview-banner" role="status">
    <div class="preview-banner-row">
      <span>A ver o site como <b>{{ previewLabel }}</b>. As permissões, também no servidor, são as desta vista.</span>
      <button type="button" class="text-button" :aria-expanded="changingView" @click="changingView = !changingView">Mudar vista</button>
      <button type="button" class="primary" @click="auth.viewAs(null)">Voltar a admin</button>
    </div>
    <ViewAsPicker v-if="changingView" />
  </div>
  <header ref="header" class="home-nav">
    <a class="home-brand" href="#/" @click="follow($event, '/')">
      <span class="brand-mark"><img :src="brandLogo" alt="LART" /></span>
      <span><strong>Stocklart</strong><small>Ferramentas da equipa</small></span>
    </a>
    <button ref="navToggle" class="nav-toggle" :aria-expanded="navOpen" aria-controls="main-menu" aria-label="Menu" @click="navOpen = !navOpen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="!navOpen" d="M4 7h16M4 12h16M4 17h16"/><path v-else d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <nav id="main-menu" class="main-menu" :class="{ open: navOpen }" aria-label="Menu principal">
      <a href="#/" :class="['menu-link', { active: active === 'home' }]" :aria-current="active === 'home' ? 'page' : undefined" @click="follow($event, '/')">Início</a>
      <details v-for="group in groups" :key="group.label" class="nav-group" :class="{ active: group.links.some(link => link.key === active) }">
        <summary>{{ group.label }}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="nav-submenu">
          <a v-for="link in group.links" :key="link.key" :href="`#${link.route}`" :class="['menu-link', { active: active === link.key }]" :aria-current="active === link.key ? 'page' : undefined" @click="follow($event, link.route)">{{ link.label }}</a>
        </div>
      </details>
      <a v-if="leader" href="#/batches" :class="['menu-link', { active: active === 'batches' }]" :aria-current="active === 'batches' ? 'page' : undefined" @click="follow($event, '/batches')">Compras e encomendas</a>
      <a v-if="!auth?.user" href="#/settings" :class="['menu-link', 'nav-preferences', { active: active === 'settings' }]" :aria-current="active === 'settings' ? 'page' : undefined" @click="follow($event, '/settings')">Definições</a>
    </nav>
    <div v-if="auth?.enabled" ref="box" class="session-box">
      <button v-if="!auth.user" class="text-button" @click="auth.login()">Entrar</button>
      <template v-else>
        <button ref="chip" class="user-chip" :aria-expanded="menuOpen" aria-controls="user-menu" :aria-label="`Sessão de ${auth.user.name}`" @click="toggleMenu">
          <UserAvatar :name="auth.user.name" :src="auth.user.avatar" /><span class="user-first">{{ firstName }}</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div v-if="menuOpen" id="user-menu" class="user-menu" role="region" aria-label="A tua sessão">
          <div class="user-menu-head"><UserAvatar :name="auth.user.name" :src="auth.user.avatar" :size="48" /><div><strong>{{ auth.user.name }}</strong><span>{{ [auth.user.admin && 'Admin', auth.user.role, auth.user.department].filter(Boolean).join(' · ') || 'Conta Notion da LART' }}</span></div></div>
          <div class="user-menu-stats" aria-live="polite"><template v-if="mine"><span><b>{{ mine.today }}</b> movimentos hoje</span><span><b>{{ mine.total }}</b> no histórico</span></template><span v-else>{{ activityError ? 'Histórico indisponível. Tenta novamente em Movimentos.' : 'A carregar os teus movimentos…' }}</span></div>
          <ul v-if="mine?.recent.length" class="user-menu-recent"><li v-for="movement in mine.recent" :key="movement.id"><b :class="movement.delta > 0 ? 'positive' : movement.delta < 0 ? 'negative' : ''">{{ movement.delta > 0 ? '+' : '' }}{{ movement.delta }}</b><span>{{ componentValue(movement) }} · {{ movement.cat }}</span><time :datetime="movement.ts">{{ new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' }).format(new Date(movement.ts)) }}</time></li></ul>
          <p v-else-if="mine" class="user-menu-empty">Ainda não tens movimentos neste histórico.</p>
          <details v-if="auth.user.admin && auth.roles.length" class="view-as-menu"><summary>Ver o site como…</summary><ViewAsPicker /></details>
          <div class="user-menu-actions">
            <a href="#/movements" @click="follow($event, '/movements', auth.user.name)">Os meus movimentos</a>
            <a href="#/settings" class="menu-link" @click="follow($event, '/settings')">Definições</a>
            <button class="danger" @click="menuOpen = false; auth.logout()">Sair</button>
          </div>
        </div>
      </template>
    </div>
  </header>
</template>
