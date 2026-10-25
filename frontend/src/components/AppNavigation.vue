<script setup>
import brandLogo from '../assets/lartt-transparent.svg?inline'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useNavigation } from '../composables/useNavigation.js'
import UserAvatar from './UserAvatar.vue'
const router = useNavigation()
const auth = inject('auth', null)
const api = inject('api', null)
const movementFilter = inject('movementFilter', null)

// Menu da sessão: quem és, o que fizeste ultimamente e os atalhos que interessam.
const menuOpen = ref(false), navOpen = ref(false), box = ref(null), chip = ref(null), mine = ref(null)
const moreOpen = ref(false), moreBox = ref(null), moreToggle = ref(null)
const firstName = computed(() => auth?.user?.name.split(/\s+/)[0] || '')
const sameDay = timestamp => new Date(timestamp).toDateString() === new Date().toDateString()
const ago = timestamp => {
  const minutes = Math.round((Date.now() - new Date(timestamp)) / 60000)
  const rtf = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' })
  return minutes < 60 ? rtf.format(-minutes, 'minute') : minutes < 1440 ? rtf.format(-Math.round(minutes / 60), 'hour') : rtf.format(-Math.round(minutes / 1440), 'day')
}
async function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value || !api) return
  try {
    const movements = (await api.direct('movements')).movements.filter(movement => movement.person === auth.user.name)
    mine.value = { today: movements.filter(movement => sameDay(movement.ts)).length, total: movements.length, recent: movements.slice(0, 3) }
  } catch { mine.value = null }
}
function go(route, filter = '') {
  menuOpen.value = false
  if (movementFilter) movementFilter.value = filter
  router.push(route)
}
function logout() { menuOpen.value = false; auth.logout() }
const closeOutside = event => {
  if (menuOpen.value && !box.value?.contains(event.target)) menuOpen.value = false
  if (moreOpen.value && !moreBox.value?.contains(event.target)) moreOpen.value = false
}
// Esc fecha o menu e devolve o foco ao botão que o abriu, para o teclado não ficar perdido no corpo da página.
const closeOnEscape = event => {
  if (event.key !== 'Escape') return
  if (menuOpen.value) { menuOpen.value = false; chip.value?.focus() }
  if (moreOpen.value) { moreOpen.value = false; moreToggle.value?.focus() }
}
onMounted(() => { document.addEventListener('pointerdown', closeOutside); document.addEventListener('keydown', closeOnEscape) })
onUnmounted(() => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape) })

const props = defineProps({
  active: {
    type: String,
    default: ''
  }
})

const links = [
  { label: 'Início', route: '/', key: 'home' },
  { label: 'Inventário', route: '/stock', key: 'stock' },
  { label: 'Localizações', route: '/locations', key: 'locations' },
  { label: 'Etiquetas', route: '/labels', key: 'labels' },
  { label: 'Movimentos', route: '/movements', key: 'movements' },
  { label: 'PCB e os seus BOMs', route: '/pcbs', key: 'pcbs' },
]
// Menos usadas: ficam no "Mais" do computador; no telemóvel o menu recolhido mostra-as junto das outras.
const more = [
  { label: 'Simulação analógica', route: '/analog-simulation', key: 'analog-simulation' },
  { label: 'Cablagem', route: '/harness', key: 'harness' },
  { label: 'Definições', route: '/settings', key: 'settings' },
]
const moreActive = computed(() => more.some(link => link.key === props.active))
function goTo(link) { navOpen.value = false; moreOpen.value = false; router.push(link.route) }
</script>

<template>
  <header class="home-nav">
    <button class="home-brand" @click="router.push('/')">
      <span class="brand-mark"><img :src="brandLogo" alt="LART" /></span>
      <span><strong>Stocklart</strong><small>Gestão simples de componentes</small></span>
    </button>
    <!-- Só em ecrãs estreitos: o menu recolhe-se num botão para o cabeçalho não ocupar um terço do ecrã. -->
    <button class="nav-toggle" :aria-expanded="navOpen" aria-controls="main-menu" aria-label="Menu" @click="navOpen = !navOpen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="!navOpen" d="M4 7h16M4 12h16M4 17h16"/><path v-else d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <nav id="main-menu" class="main-menu" :class="{ open: navOpen }" aria-label="Menu principal">
      <button
        v-for="link in links"
        :key="link.key"
        :class="['menu-link', { active: active === link.key }]"
        :aria-current="active === link.key ? 'page' : undefined"
        @click="goTo(link)"
      >
        {{ link.label }}
      </button>
      <div ref="moreBox" class="more-box">
        <button ref="moreToggle" class="menu-link more-toggle" :class="{ active: moreActive }" :aria-expanded="moreOpen" aria-controls="more-menu" @click="moreOpen = !moreOpen">
          Mais <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div v-show="moreOpen" id="more-menu" class="more-menu">
          <button v-for="link in more" :key="link.key" :class="['menu-link', { active: active === link.key }]" :aria-current="active === link.key ? 'page' : undefined" @click="goTo(link)">{{ link.label }}</button>
        </div>
      </div>
    </nav>
    <div v-if="auth?.enabled" ref="box" class="session-box">
      <button v-if="!auth.user" class="text-button" @click="auth.login()">Entrar</button>
      <template v-else>
        <button ref="chip" class="user-chip" :aria-expanded="menuOpen" aria-controls="user-menu" :aria-label="`Sessão de ${auth.user.name}`" @click="toggleMenu">
          <UserAvatar :name="auth.user.name" :src="auth.user.avatar" />
          <span class="user-first">{{ firstName }}</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div v-if="menuOpen" id="user-menu" class="user-menu" role="region" aria-label="A tua sessão">
          <div class="user-menu-head">
            <UserAvatar :name="auth.user.name" :src="auth.user.avatar" :size="48" />
            <div><strong>{{ auth.user.name }}</strong><span>{{ [auth.user.admin && 'Admin', auth.user.role, auth.user.department].filter(Boolean).join(' · ') || 'Conta Notion da LART' }}</span></div>
          </div>
          <div class="user-menu-stats" aria-live="polite">
            <template v-if="mine"><span><b>{{ mine.today }}</b> hoje</span><span><b>{{ mine.total }}</b> no total</span></template>
            <span v-else>A carregar os teus movimentos…</span>
          </div>
          <ul v-if="mine?.recent.length" class="user-menu-recent">
            <li v-for="movement in mine.recent" :key="movement.id">
              <b :class="movement.delta > 0 ? 'positive' : movement.delta < 0 ? 'negative' : ''">{{ movement.delta > 0 ? '+' : '' }}{{ movement.delta }}</b>
              <span>{{ Object.values(movement.props)[0] }} · {{ movement.cat }}</span>
              <time :datetime="movement.ts">{{ ago(movement.ts) }}</time>
            </li>
          </ul>
          <p v-else-if="mine" class="user-menu-empty">Ainda não alteraste o stock. Os teus movimentos aparecem aqui.</p>
          <div class="user-menu-actions">
            <button @click="go('/movements', auth.user.name)">Os meus movimentos</button>
            <button @click="go('/settings')">Definições</button>
            <button class="danger" @click="logout">Sair</button>
          </div>
        </div>
      </template>
    </div>
  </header>
</template>
