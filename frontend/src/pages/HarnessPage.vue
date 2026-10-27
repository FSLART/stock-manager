<script setup>
import { ref } from 'vue'
import WorkspacePage from '../components/WorkspacePage.vue'
import ToolFrame from '../components/ToolFrame.vue'
const harness = import.meta.env.DEV ? '/harness/' : 'https://stocklart.pt/harness/'
const loading = ref(true), failed = ref(false), frameKey = ref(0)
function retry() { failed.value = false; loading.value = true; frameKey.value += 1 }
</script>

<template>
  <WorkspacePage active="harness" title="Cablagem" description="Consulta conectores, fios e circuitos do T26e.">
    <div class="tool-page-actions"><a class="text-button" :href="harness" target="_blank" rel="noopener">Abrir numa nova janela</a></div>
    <p v-if="loading" role="status" class="card-muted">A carregar a cablagem…</p>
    <p v-if="failed" role="alert">Não foi possível abrir a cablagem. <button class="text-button" @click="retry">Tentar novamente</button></p>
    <ToolFrame :key="frameKey" class="harness-frame" :src="`${harness}?embedded=1`" title="Cablagem do T26e" @load="loading = false" @error="loading = false; failed = true" />
  </WorkspacePage>
</template>
