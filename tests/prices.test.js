import { expect, it } from 'vitest'
import { euros, priceEstimator } from '../frontend/src/prices.js'

const parts = [
  { mpn: 'RC0603JR-071KL', category: 'Resistências', props: { tamanho: '603' }, price: 0.004 },
  { mpn: 'CR0603-JW-472ELF', category: 'Resistências', props: { tamanho: '603' }, price: 0.006 },
  { mpn: 'RPCQ2512JT10R0', category: 'Resistências', props: { tamanho: '2512' }, price: 0.5 },
  { mpn: 'LAN8720AI', category: '', props: {}, price: 1.1 },
  { mpn: 'NO-PRICE', category: 'Resistências', props: { tamanho: '603' }, price: null },
]

it('prices by part number, then by category and size, then by category', () => {
  const price = priceEstimator(parts)
  expect(price({ cat: 'CI', props: { 'P/N': 'lan8720ai ' } })).toEqual({ price: 1.1, estimated: false })
  expect(price({ cat: 'Resistências', props: { 'valor (Ω)': '1k', tamanho: '603', 'P/N': '-' } })).toEqual({ price: 0.005, estimated: true })
  expect(price({ cat: 'Resistências', props: { 'valor (Ω)': '1k', tamanho: '0402' } })).toEqual({ price: 0.006, estimated: true })
  expect(price({ cat: 'Díodos', props: { referência: '1N4148' } })).toBe(null)
})

it('shows cents of a cent for cheap parts and drops decimals on large totals', () => {
  expect([0.009, 0.851, 22, 476.64].map(euros)).toEqual(['0,009\u00a0€', '0,85\u00a0€', '22,00\u00a0€', '477\u00a0€'])
})
