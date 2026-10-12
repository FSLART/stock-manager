<script setup>
import { useInventoryContext } from '../composables/useInventoryContext'

const inventory = useInventoryContext()
</script>

<template>
  <div v-if="inventory.itemDialog" class="modal-backdrop" @click.self="inventory.closeItemDialog">
    <form class="modal" @submit.prevent="inventory.submitItem">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Movimento</p>
          <h2>Atualizar stock</h2>
        </div>
        <button type="button" class="close-button" @click="inventory.closeItemDialog">×</button>
      </div>
      <div class="segmented">
        <button type="button" :class="{ selected: inventory.mode === 'in' }" @click="inventory.mode = 'in'">
          Entrada</button
        ><button type="button" :class="{ selected: inventory.mode === 'out' }" @click="inventory.mode = 'out'">
          Saída
        </button>
      </div>
      <label
        >Categoria<select v-model="inventory.itemForm.category" @change="inventory.updateItemCategory">
          <option v-for="category in inventory.categories" :key="category.name" :value="category.name">
            {{ category.name }}
          </option>
        </select></label
      >
      <div class="form-grid">
        <label v-for="property in inventory.activeCategory?.props || []" :key="property"
          >{{ property }}<input v-model="inventory.itemForm.props[property]" required autocomplete="off"
        /></label>
      </div>
      <label v-if="inventory.activeCategory?.image"
        >Imagem do componente<input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          @change="inventory.onFileChange"
      /></label>
      <label>Quantidade<input v-model.number="inventory.itemForm.quantity" type="number" min="1" required /></label>
      <p v-if="inventory.error" class="form-error">{{ inventory.error }}</p>
      <div class="modal-actions">
        <button type="button" class="text-button" @click="inventory.closeItemDialog">Cancelar</button
        ><button class="primary-button" :disabled="inventory.busy">
          {{ inventory.busy ? 'A guardar…' : inventory.mode === 'in' ? 'Adicionar ao stock' : 'Retirar do stock' }}
        </button>
      </div>
    </form>
  </div>

  <div v-if="inventory.categoryDialog" class="modal-backdrop" @click.self="inventory.categoryDialog = false">
    <form class="modal" @submit.prevent="inventory.submitCategory">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Configuração</p>
          <h2>Nova categoria</h2>
        </div>
        <button type="button" class="close-button" @click="inventory.categoryDialog = false">×</button>
      </div>
      <label>Nome<input v-model="inventory.categoryForm.name" placeholder="Ex.: Conectores" required /></label>
      <label
        >Propriedades<span class="label-hint">separadas por vírgulas</span
        ><input v-model="inventory.categoryForm.props" placeholder="tipo, tensão, material" required
      /></label>
      <label class="check-label"
        ><input v-model="inventory.categoryForm.image" type="checkbox" /> Permitir uma imagem por componente</label
      >
      <p v-if="inventory.error" class="form-error">{{ inventory.error }}</p>
      <div class="modal-actions">
        <button type="button" class="text-button" @click="inventory.categoryDialog = false">Cancelar</button
        ><button class="primary-button" :disabled="inventory.busy">
          {{ inventory.busy ? 'A criar…' : 'Criar categoria' }}
        </button>
      </div>
    </form>
  </div>

  <div v-if="inventory.categoryEditDialog" class="modal-backdrop" @click.self="inventory.categoryEditDialog = false">
    <form class="modal" @submit.prevent="inventory.submitCategoryEdit">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Configuração</p>
          <h2>Editar categoria</h2>
        </div>
        <button type="button" class="close-button" @click="inventory.categoryEditDialog = false">×</button>
      </div>
      <label>Nome<input v-model="inventory.categoryForm.name" required /></label>
      <label
        >Propriedades<span class="label-hint">separadas por vírgulas; não podes remover as que os componentes usam</span
        ><input v-model="inventory.categoryForm.props" required
      /></label>
      <label class="check-label"
        ><input v-model="inventory.categoryForm.image" type="checkbox" /> Permitir uma imagem por componente</label
      >
      <p v-if="inventory.error" class="form-error">{{ inventory.error }}</p>
      <div class="modal-actions">
        <button type="button" class="text-button" @click="inventory.categoryEditDialog = false">Cancelar</button
        ><button class="primary-button" :disabled="inventory.busy">
          {{ inventory.busy ? 'A guardar…' : 'Guardar alterações' }}
        </button>
      </div>
    </form>
  </div>
</template>
