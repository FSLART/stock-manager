<script setup>
import { computed, ref, watch } from 'vue'
const props = defineProps({ name: { type: String, required: true }, src: { type: String, default: '' }, size: { type: Number, default: 32 } })
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
const initials = computed(() => props.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase())
// Cor própria de cada pessoa quando não há foto do Notion (mesma regra das cores das categorias).
const hue = computed(() => [...props.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7))
</script>

<template>
  <span class="avatar" :style="{ '--avatar-size': `${size}px`, '--avatar-hue': hue }" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" referrerpolicy="no-referrer" @error="failed = true">
    <template v-else>{{ initials }}</template>
  </span>
</template>
