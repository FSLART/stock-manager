<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ categories: Array, busy: Boolean, error: String })
const emit = defineEmits(['submit', 'delete'])
const dialog = ref(null)
const SECTIONS = ['Componentes eletrónicos', 'Harness', 'Não consumíveis']
const name = ref(''), image = ref(false), section = ref(SECTIONS[0])
const originalName = ref(null), fields = ref([]), originalFields = ref([])
function open(category, defaultSection) {
  originalName.value = category?.name || null
  originalFields.value = [...(category?.props || [])]
  fields.value = category ? category.props.map(p => ({ source: p, name: p })) : [{ source: null, name: '' }]
  name.value = ''; image.value = false; section.value = category?.section || defaultSection || SECTIONS[0]
  if (category) { name.value = category.name; image.value = category.image }
  dialog.value.showModal()
}
// Propriedades das outras categorias, por minúsculas: "brand" passa a "Brand" se já existir, para a exportação não as separar.
const known = computed(() => new Map(props.categories.filter(c => c.name !== originalName.value).flatMap(c => c.props).map(p => [p.toLowerCase(), p])))
const knownNames = computed(() => [...known.value.values()].sort((a, b) => a.localeCompare(b)))
function submit() {
  for (const field of fields.value) field.name = known.value.get(field.name.trim().toLowerCase()) || field.name.trim()
  if (originalName.value) {
    const removed = originalFields.value.filter(p => !fields.value.some(f => f.source === p))
    if (removed.length && !confirm(`Remover as propriedades ${removed.join(', ')} e os seus valores de todos os componentes desta categoria?`)) return
    emit('submit', { originalName: originalName.value, name: name.value.trim(), fields: fields.value, image: image.value, section: section.value })
  } else {
    emit('submit', { name: name.value.trim(), props: fields.value.map(f => f.name), image: image.value, section: section.value })
  }
}
defineExpose({ open, close: () => dialog.value.close() })
</script>

<template>
  <dialog ref="dialog" aria-labelledby="category-title">
    <form @submit.prevent="submit">
      <h2 id="category-title">{{ originalName ? 'Editar categoria' : 'Nova categoria' }}</h2>
      <label>Nome <input v-model="name" placeholder="Ex.: Díodos" required></label>
      <label>Secção <select v-model="section"><option v-for="option in SECTIONS" :key="option">{{ option }}</option></select></label>
      <div v-for="(field, index) in fields" :key="index" class="property-editor">
        <label>Propriedade <input v-model="field.name" list="known-properties" autocomplete="off" required></label>
        <button type="button" class="move" :disabled="index === 0" aria-label="Subir propriedade" @click="fields.splice(index - 1, 0, ...fields.splice(index, 1))">↑</button>
        <button type="button" class="move" :disabled="index === fields.length - 1" aria-label="Descer propriedade" @click="fields.splice(index + 1, 0, ...fields.splice(index, 1))">↓</button>
        <button type="button" class="del" :disabled="fields.length === 1" aria-label="Remover propriedade" @click="fields.splice(index, 1)">✕</button>
      </div>
      <datalist id="known-properties"><option v-for="known in knownNames" :key="known" :value="known"></option></datalist>
      <button type="button" class="ghost" @click="fields.push({ source: null, name: '' })">+ Adicionar propriedade</button>
      <label class="check"><input v-model="image" type="checkbox"> Permitir uma imagem por componente</label>
      <p class="hint">{{ originalName ? 'Renomear ou reordenar uma propriedade mantém os valores existentes. Novas propriedades ficam vazias até editares cada componente.' : 'Itens com todas as propriedades iguais ficam agrupados e a quantidade soma.' }}</p>
      <p v-if="error" class="hint error" role="alert">{{ error }}</p>
      <div class="actions"><button v-if="originalName" type="button" class="ghost delete-category" :disabled="busy" @click="emit('delete', originalName)">Apagar categoria</button><button type="button" class="ghost" :disabled="busy" @click="dialog.close()">Cancelar</button><button class="primary" :disabled="busy">{{ originalName ? 'Guardar alterações' : 'Criar categoria' }}</button></div>
    </form>
  </dialog>
</template>
