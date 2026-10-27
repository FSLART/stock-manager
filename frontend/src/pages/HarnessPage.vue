<script setup>
import { ref } from 'vue'
import AppNavigation from '../components/AppNavigation.vue'

const harness = import.meta.env.DEV ? '/harness/' : 'https://stocklart.pt/harness/'
const loading = ref(true)
const failed = ref(false)
const frameKey = ref(0)
function retry() {
  failed.value = false
  loading.value = true
  frameKey.value += 1
}
</script>

<template>
  <div class="workspace-page harness-page">
    <AppNavigation active="harness" />
    <main id="main-content" class="harness-main" tabindex="-1">
    <div class="harness-context">
      <div>
        <h1>Cablagem</h1>
        <p>Consulta conectores, fios e circuitos do T26e.</p>
      </div>
      <a class="secondary-button" :href="harness" target="_blank" rel="noopener">Abrir numa nova janela</a>
      <p v-if="loading" role="status">A carregar a cablagem… Se não aparecer, abre numa nova janela.</p>
      <p v-if="failed" role="alert">Não foi possível abrir a cablagem. <button class="text-button" type="button" @click="retry">Tentar novamente</button> ou usa a ligação acima.</p>
    </div>
    <iframe :key="frameKey" class="harness-frame" :src="harness" title="Cablagem do T26e" @load="loading = false" @error="loading = false; failed = true"></iframe>
    </main>
  </div>
</template>

<style scoped>
.harness-main { display: block; padding: 0; }
.harness-context { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px; padding: 24px clamp(16px, 4vw, 48px); }
.harness-context h1 { margin: 0 0 6px; font-size: 28px; }
.harness-context p { margin: 0; color: var(--muted, #a7a99e); }
.harness-context > p { flex-basis: 100%; font-size: 14px; }
.harness-frame { min-height: 70vh; }
</style>
