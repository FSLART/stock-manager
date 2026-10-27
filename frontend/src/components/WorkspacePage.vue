<script setup>
import { computed } from 'vue'
import { useNavigation } from '../composables/useNavigation.js'
import AppNavigation from './AppNavigation.vue'
const router = useNavigation()
const props = defineProps({ active: { type: String, required: true }, eyebrow: String, title: { type: String, required: true }, description: { type: String, required: true } })
const inventoryPage = computed(() => ['locations', 'labels', 'movements'].includes(props.active))
</script>

<template>
  <div class="workspace-page">
    <AppNavigation :active="active" />
    <main id="main-content" class="workspace-content" tabindex="-1">
      <header class="workspace-header">
        <div>
          <nav class="page-breadcrumbs" aria-label="Localização na aplicação"><a href="#/" @click="router.follow($event, '/')">Início</a><template v-if="inventoryPage"><span aria-hidden="true">/</span><a href="#/stock" @click="router.follow($event, '/stock')">Inventário</a></template><span aria-hidden="true">/</span><span aria-current="page">{{ title }}</span></nav>
          <h1>{{ title }}</h1>
          <p class="subtitle">{{ description }}</p>
        </div>
      </header>
      <slot />
    </main>
  </div>
</template>
