<script setup>
import AppNavigation from '../components/AppNavigation.vue'
// site à parte; endereço completo para funcionar também no Apps Script
const harness = 'https://stocklart.pt/harness/'
</script>

<template>
  <div class="workspace-page harness-page">
    <AppNavigation active="harness" />
    <h1 class="sr-only">Cablagem</h1>
    <iframe class="harness-frame" :src="harness" title="Cablagem do T26e"></iframe>
  </div>
</template>
