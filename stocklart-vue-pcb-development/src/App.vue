<script setup>
import { onMounted, onUnmounted, provide } from 'vue'
import { useInventoryStore } from './stores/inventory'

const inventory = useInventoryStore()
provide('inventory', inventory)
onMounted(inventory.initialize)
onUnmounted(inventory.cleanup)
</script>

<template>
  <RouterView />
</template>
