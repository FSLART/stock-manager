<script setup>
import brandLogo from '../assets/lartt-transparent.svg?inline'
import { useNavigation } from '../composables/useNavigation.js'
const router = useNavigation()

defineProps({
  active: {
    type: String,
    default: ''
  }
})

const links = [
  { label: 'Início', route: '/', key: 'home' },
  { label: 'Inventário', route: '/stock', key: 'stock' },
  { label: 'Simulação analógica', route: '/analog-simulation', key: 'analog-simulation' },
  { label: 'Movimentos', route: '/movements', key: 'movements' },
  { label: 'PCB e os seus BOMs', route: '/pcbs', key: 'pcbs' },
  { label: 'Definições', route: '/settings', key: 'settings' }
]
// site à parte (não é uma rota desta app); endereço completo para funcionar também no Apps Script
const external = [{ label: 'Cablagem', href: 'https://stocklart.pt/harness/', key: 'harness' }]
</script>

<template>
  <header class="home-nav">
    <button class="home-brand" @click="router.push('/')">
      <span class="brand-mark"><img :src="brandLogo" alt="LART" /></span>
      <span><strong>Stocklart</strong><small>Gestão simples de componentes</small></span>
    </button>
    <nav class="main-menu" aria-label="Menu principal">
      <button
        v-for="link in links"
        :key="link.key"
        :class="['menu-link', { active: active === link.key }]"
        :aria-current="active === link.key ? 'page' : undefined"
        @click="router.push(link.route)"
      >
        {{ link.label }}
      </button>
      <a v-for="link in external" :key="link.key" class="menu-link" :href="link.href">{{ link.label }}</a>
    </nav>
  </header>
</template>
