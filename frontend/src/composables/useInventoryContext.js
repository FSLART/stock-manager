import { inject } from 'vue'

export function useInventoryContext() {
  const inventory = inject('inventory')
  if (!inventory) throw new Error('useInventoryContext must be used inside App')
  return inventory
}
