import { expect, it } from 'vitest'
import { priceEstimator } from '../frontend/src/prices.js'

const parts = [
  { mpn: 'RC0603JR-071KL', category: 'Resistências', props: { tamanho: '603' }, price: 0.004 },
  { mpn: 'CR0603-JW-472ELF', category: 'Resistências', props: { tamanho: '603' }, price: 0.006 },
  { mpn: 'RPCQ2512JT10R0', category: 'Resistências', props: { tamanho: '2512' }, price: 0.5 },
  { mpn: 'LAN8720AI', category: '', props: {}, price: 1.1 },
  { mpn: 'NO-PRICE', category: 'Resistências', props: { tamanho: '603' }, price: null },
]

it('prices by part number, then by category and size, then by category', () => {
  const price = priceEstimator(parts)
  expect(price({ cat: 'CI', props: { 'P/N': 'lan8720ai ' } })).toBe(1.1)
  expect(price({ cat: 'Resistências', props: { 'valor (Ω)': '1k', tamanho: '603', 'P/N': '-' } })).toBe(0.005)
  expect(price({ cat: 'Resistências', props: { 'valor (Ω)': '1k', tamanho: '0402' } })).toBe(0.006)
  expect(price({ cat: 'Díodos', props: { referência: '1N4148' } })).toBe(null)
})
