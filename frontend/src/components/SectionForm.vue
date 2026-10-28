<script setup>
import { ref } from 'vue'
const props = defineProps({ sections: Array, busy: Boolean, error: String })
const emit = defineEmits(['submit', 'delete'])
const dialog = ref(null), original = ref(null), name = ref('')
function open(section = null) {
  original.value = section
  name.value = section || ''
  dialog.value.showModal()
}
const index = () => props.sections.indexOf(original.value)
// Sem original cria; com original muda o nome e/ou a posição (o índice final na lista).
// Subir/descer guarda logo e deixa o diálogo aberto para mover mais vezes.
function submit(position = index(), moving = false) {
  emit('submit', original.value ? { name: original.value, newName: moving ? original.value : name.value.trim(), position } : { name: name.value.trim() }, moving)
}
defineExpose({ open, close: () => dialog.value.close() })
</script>

<template>
  <dialog ref="dialog" aria-labelledby="section-title">
    <form @submit.prevent="submit()">
      <h2 id="section-title">{{ original ? 'Editar secção' : 'Nova secção' }}</h2>
      <label>Nome <input v-model="name" maxlength="64" placeholder="Ex.: Consumíveis" required></label>
      <div v-if="original" class="section-order">
        <span>Posição {{ index() + 1 }} de {{ sections.length }}</span>
        <button type="button" class="ghost" :disabled="busy || index() === 0" @click="submit(index() - 1, true)">↑ Subir</button>
        <button type="button" class="ghost" :disabled="busy || index() === sections.length - 1" @click="submit(index() + 1, true)">↓ Descer</button>
      </div>
      <p class="hint">{{ original ? 'Mudar o nome leva as categorias desta secção com ela. Só se apaga uma secção vazia.' : 'A secção agrupa categorias do stock do teu departamento.' }}</p>
      <p v-if="error" class="hint error" role="alert">{{ error }}</p>
      <div class="actions"><button v-if="original" type="button" class="ghost delete-category" :disabled="busy || sections.length === 1" @click="emit('delete', original)">Apagar secção</button><button type="button" class="ghost" :disabled="busy" @click="dialog.close()">Cancelar</button><button class="primary" :disabled="busy">{{ original ? 'Guardar' : 'Criar secção' }}</button></div>
    </form>
  </dialog>
</template>
