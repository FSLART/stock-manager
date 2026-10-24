<script setup>
import { computed, ref } from 'vue'
// Moldura comum dos tutoriais: um passo de cada vez, com a imagem do passo (slot, recebe a chave do passo),
// o texto, pontos para saltar e Anterior/Seguinte.
const props = defineProps({ steps: { type: Array, required: true } })
const dialog = ref(null), step = ref(0)
const current = computed(() => props.steps[step.value])
function open() {
  step.value = 0
  dialog.value.showModal()
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="tutorial-dialog" aria-labelledby="tutorial-title">
    <div class="tutorial-head">
      <p class="eyebrow">Passo {{ step + 1 }} de {{ steps.length }}</p>
      <button type="button" class="del" aria-label="Fechar tutorial" @click="dialog.close()">×</button>
    </div>
    <h2 id="tutorial-title">{{ current.title }}</h2>
    <!-- Imagem do passo, só para ver (aria-hidden): o texto por baixo diz o mesmo. -->
    <div class="tutorial-figure" aria-hidden="true"><slot :step="current.key" /></div>
    <p class="tutorial-text">{{ current.text }}</p>
    <div class="tutorial-nav">
      <button type="button" class="text-button" :disabled="step === 0" @click="step--">Anterior</button>
      <div class="tutorial-dots">
        <button v-for="(item, index) in steps" :key="item.key" type="button" class="tutorial-dot" :aria-current="index === step ? 'step' : undefined" :aria-label="`Passo ${index + 1}: ${item.title}`" @click="step = index"></button>
      </div>
      <button v-if="step < steps.length - 1" type="button" class="primary" autofocus @click="step++">Seguinte</button>
      <button v-else type="button" class="primary" @click="dialog.close()">Concluir</button>
    </div>
  </dialog>
</template>
