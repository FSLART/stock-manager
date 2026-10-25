<script setup>
import { computed, ref, watch } from 'vue'
import { defaultImage } from '../defaultImages.js'
import { componentValue, describe } from '../stockText.js'
import { euros } from '../prices.js'
const props = defineProps({ item: { type: Object, required: true }, price: { type: Object, default: null }, propertyKeys: { type: Array, default: () => [] }, showCategory: Boolean, busy: Boolean, canEdit: Boolean, canChange: Boolean, actions: Boolean, locked: Boolean, selected: Boolean })
defineEmits(['step', 'delete', 'edit', 'select'])
const imageFailed = ref(false), previewing = ref(false)
watch(() => props.item.image, () => { imageFailed.value = false })
const usesDefaultImage = computed(() => !props.item.image || imageFailed.value)
const imageSource = computed(() => usesDefaultImage.value ? defaultImage(props.item.cat) : props.item.image)
const mainValue = computed(() => componentValue(props.item))
const description = computed(() => describe(props.item))
const color = computed(() => `hsl(${[...props.item.cat].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)} 65% 48%)`)
</script>

<template>
  <tr class="row" :class="{ low: item.qty <= 5, selected }">
    <td v-if="canEdit" class="select-cell"><input v-if="canChange" type="checkbox" :aria-label="`Selecionar ${mainValue}`" :checked="selected" @click="$emit('select', $event.shiftKey)"></td>
    <td class="image-cell">
    <img class="item-image" :class="{ 'default-image': usesDefaultImage }" :src="imageSource" :alt="`${usesDefaultImage ? 'Ícone padrão' : 'Imagem'} de ${item.cat}`" :title="usesDefaultImage ? `Ícone padrão de ${item.cat}` : item.cat" @error="imageFailed = true" @mouseenter="previewing = !usesDefaultImage" @mouseleave="previewing = false">
    <Teleport to="body"><img v-if="previewing" class="image-preview" :src="item.image" alt=""></Teleport>
    </td>
    <td v-if="showCategory" class="category-cell"><span class="pill"><i class="dot" :style="{ background: color }"></i>{{ item.cat }}</span></td>
    <!-- Numa categoria a coluna repetiria uma propriedade; fica só como título do cartão no telemóvel. -->
    <td class="component-cell" :class="{ 'card-only': !showCategory }">
      <span class="val">{{ mainValue }}</span><span v-if="item.qty <= 5" class="tag">{{ item.qty === 0 ? 'sem stock' : 'pouco stock' }}</span>
      <!-- Só no telemóvel, onde a linha vira cartão e as colunas desaparecem. -->
      <span class="card-sub">{{ item.cat }}<template v-if="description"> · {{ description }}</template><template v-if="item.location"> · {{ item.location }}</template></span>
    </td>
    <td v-if="showCategory" class="desc-cell">{{ description || '—' }}</td>
    <td v-for="key in propertyKeys" :key="key" class="chips property-cell">{{ item.props[key] || '—' }}</td>
    <td class="location-cell">{{ item.location || '—' }}</td>
    <td class="price-cell" :class="{ estimated: price?.estimated }" :title="price?.estimated ? 'Estimativa: mediana das peças do catálogo da mesma categoria e tamanho' : price ? 'Preço do catálogo pelo P/N' : 'Sem preço no catálogo'">{{ price ? `${price.estimated ? '≈ ' : ''}${euros(price.price)}` : '—' }}</td>
    <td class="qty-cell">
    <div class="qty">
      <template v-if="canChange"><button v-for="delta in [-10, -1]" :key="delta" :class="{ 'step-one': delta === -1 }" :aria-label="`Retirar ${-delta}`" :disabled="busy" @click="$emit('step', delta)">{{ delta === -1 ? '−' : '−10' }}</button></template>
      <output>{{ item.qty }}</output>
      <template v-if="canChange"><button v-for="delta in [1, 10]" :key="delta" :class="{ 'step-one': delta === 1 }" :aria-label="`Adicionar ${delta}`" :disabled="busy" @click="$emit('step', delta)">{{ delta === 1 ? '+' : '+10' }}</button></template>
    </div>
    </td>
    <td class="price-cell value-cell" :class="{ estimated: price?.estimated }">{{ price ? `${price.estimated ? '≈ ' : ''}${euros(item.qty * price.price)}` : '—' }}</td>
    <td v-if="actions" class="actions-cell">
    <div v-if="canChange" class="item-actions">
      <button v-if="canEdit" class="edit" aria-label="Editar componente" :disabled="busy || locked" @click="$emit('edit')">Editar</button>
      <button class="del" aria-label="Apagar item" title="Apagar item" :disabled="busy || locked" @click="$emit('delete')">✕</button>
    </div>
    </td>
  </tr>
</template>
