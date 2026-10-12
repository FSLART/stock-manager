import { defineStore } from 'pinia'
import { createInventoryContext } from '../composables/useInventory'

export const useInventoryStore = defineStore('inventory', () => createInventoryContext())
