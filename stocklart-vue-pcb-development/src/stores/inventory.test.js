import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useInventoryStore } from './inventory'

describe('inventory store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('loads the default component categories', () => {
    const store = useInventoryStore()

    store.initialize()

    expect(store.categories).toHaveLength(8)
    expect(store.totalUnits).toBe(0)
    store.cleanup()
  })
})
