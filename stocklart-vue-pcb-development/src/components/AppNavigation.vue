<script setup>
import { router } from '../router'

defineProps({
  active: {
    type: String,
    default: ''
  }
})

const links = [
  { label: 'Início', route: '/', key: 'home' },
  { label: 'Inventário', route: '/stock', key: 'stock' },
  { label: 'Sinais de placas', route: '/board-signals', key: 'board-signals' },
  { label: 'Movimentos', route: '/movements', key: 'movements' },
  { label: 'PCB e os seus BOMs', route: '/pcbs', key: 'pcbs' },
  { label: 'Definições', route: '/settings', key: 'settings' }
]
</script>

<template>
  <header class="home-nav">
    <button class="home-brand" @click="router.push('/')">
      <span class="brand-mark"><img src="/lartt-transparent.svg" alt="LART" /></span>
      <span><strong>Stocklart</strong><small>Gestão simples de componentes</small></span>
    </button>
    <nav class="main-menu" aria-label="Menu principal">
      <button
        v-for="link in links"
        :key="link.key"
        :class="['menu-link', { active: active === link.key }]"
        @click="router.push(link.route)"
      >
        {{ link.label }}
      </button>
    </nav>
  </header>
</template>
