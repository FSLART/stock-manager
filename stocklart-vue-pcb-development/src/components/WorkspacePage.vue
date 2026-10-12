<script setup>
import AppNavigation from './AppNavigation.vue'

defineProps({
  active: {
    type: String,
    required: true
  },
  eyebrow: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  }
})
</script>

<template>
  <div class="workspace-page">
    <AppNavigation :active="active" />
    <main class="workspace-content">
      <header class="workspace-header">
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h1>{{ title }}</h1>
          <p class="subtitle">{{ description }}</p>
        </div>
        <button class="home-button" @click="$router.push('/stock')">← Inventário</button>
      </header>
      <slot />
    </main>
  </div>
</template>
