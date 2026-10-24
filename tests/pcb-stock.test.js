import { expect, it } from 'vitest'
import { matchStock, siValue, stockCheck, stockToTake } from '../frontend/src/pcbStock.js'

const items = [
  { id: 1, cat: 'Resistências', props: { 'P/N': '-', Encapsulamento: '0603', 'Resistência (Ω)': '4.7k' }, qty: 30, location: 'Cx1' },
  { id: 2, cat: 'Resistências', props: { 'P/N': '-', Encapsulamento: '0805', 'Resistência (Ω)': '4.7k' }, qty: 5, location: '' },
  { id: 3, cat: 'Condensadores', props: { 'P/N': 'GRM188R71H104KA93D', Encapsulamento: '0603', Capacidade: '100nF' }, qty: 4, location: 'Cx2' },
  { id: 4, cat: 'Indutores', props: { 'P/N': '-', Encapsulamento: '1210', 'Indutância (µH)': '10' }, qty: 2, location: '' },
  { id: 5, cat: 'CIs Amplificadores', props: { 'P/N': 'MCP6542-I/MS', Encapsulamento: '8-MSOP' }, qty: 0, location: '' },
]
const line = (fields) => ({ reference: '—', value: 'Componente sem valor', description: '—', footprint: '—', partNumber: '—', quantity: 1, ...fields })

it('reads passive values in the usual notations', () => {
  expect(siValue('4k7')).toBeCloseTo(4700)
  expect(siValue('0,1 uF')).toBeCloseTo(1e-7)
  expect(siValue('4R7')).toBeCloseTo(4.7)
  expect(siValue('10', 'Indutância (µH)')).toBeCloseTo(1e-5)
  expect(siValue('LED')).toBeNull()
})

it('matches by manufacturer P/N first, then by value and footprint for passives', () => {
  expect(matchStock(line({ partNumber: 'grm188r71h104ka93d', value: '1uF' }), items)).toMatchObject({ by: 'P/N', items: [{ id: 3 }] })
  expect(matchStock(line({ reference: 'R1', value: '4k7', footprint: 'Resistor_SMD:R_0603_1608Metric' }), items).items.map(i => i.id)).toEqual([1])
  expect(matchStock(line({ reference: 'C3', value: '0.1uF', partNumber: 'OTHER-PN' }), items).items.map(i => i.id)).toEqual([3])
  expect(matchStock(line({ reference: 'L1', value: '10uH' }), items).items.map(i => i.id)).toEqual([4])
  // Um CI sem P/N igual não cai para o valor, e um valor de resistência não casa com um condensador.
  expect(matchStock(line({ reference: 'U1', value: '4k7' }), items).items).toEqual([])
  expect(matchStock(line({ reference: 'C1', value: '4.7k' }), items).items).toEqual([])
})

it('sums needs across boards and marks each component ok, short or missing', () => {
  const a = [line({ reference: 'R1,R2', value: '4k7', footprint: '0603', quantity: 2 }), line({ reference: 'U1', partNumber: 'MCP6542-I/MS' })]
  const b = [line({ reference: 'R7', value: '4.7kΩ', footprint: 'R_0603', quantity: 1 }), line({ reference: 'C1', value: '100nF', footprint: '0603', quantity: 3 }), line({ reference: 'U2', partNumber: 'NE555' })]
  const rows = stockCheck([{ lines: a, count: 5 }, { lines: b, count: 2 }], items)
  expect(rows.map(({ name, needed, onHand, status }) => [name, needed, onHand, status])).toEqual([
    ['4k7', 12, 30, 'ok'],
    ['MCP6542-I/MS', 5, 0, 'missing'],
    ['100nF', 6, 4, 'short'],
    ['NE555', 2, 0, 'missing'],
  ])
  expect(rows[0]).toMatchObject({ references: ['R1,R2', 'R7'], locations: 'Cx1', by: 'valor' })
})

it('reads Altium names: the P/N in the name, and lines that group several values', () => {
  const stock = [...items,
    { id: 6, cat: 'Condensadores', props: { 'P/N': '-', Encapsulamento: '0603', Capacidade: '1uF' }, qty: 50, location: '' },
    { id: 7, cat: 'EEPROM', props: { 'P/N': '24FC08-I/MS' }, qty: 3, location: '' },
    { id: 8, cat: 'Relés', props: { 'P/N': '3-1462039-7' }, qty: 9, location: '' }]
  expect(matchStock(line({ reference: 'R1', value: 'RES 4K7 0603 (1608 Metric)' }), stock).items.map(i => i.id)).toEqual([1])
  expect(matchStock(line({ reference: 'IC4', value: '24FC08' }), stock).items.map(i => i.id)).toEqual([7])
  // Um valor curto ("3", um jumper) não apanha um P/N que só começa por ele.
  expect(matchStock(line({ reference: 'JP7', value: '3' }), stock).items).toEqual([])
  const mixed = line({ reference: 'C1, C2, C3, C4, C5', value: 'CAP 1 uF 0603 (1608 Metric), CAP 100nF 0603 (1608 Metric)', quantity: 5 })
  expect(matchStock(mixed, stock).variants.map(v => [v.name, v.items.map(i => i.id)])).toEqual([['1 uF 0603', [6]], ['100nF 0603', [3]]])
  // Cada valor leva entre 1 e 4 peças por placa: os 4 de 100nF podem não chegar para 1 placa e não chegam para 5.
  expect(stockCheck([{ lines: [mixed], count: 1 }], stock)[0]).toMatchObject({ status: 'check', onHand: 54, needed: 5 })
  expect(stockCheck([{ lines: [mixed], count: 5 }], stock)[0].status).toBe('short')
  expect(stockCheck([{ lines: [{ ...mixed, quantity: 4 }], count: 1 }], stock)[0].status).toBe('ok')
})

it('takes what each BOM line needs from stock and reports what is short', () => {
  const lines = [line({ reference: 'R1', value: '4k7', footprint: '0603', quantity: 10 }), line({ reference: 'R2', value: '4.7k', footprint: '0603', quantity: 5 }),
    line({ partNumber: 'GRM188R71H104KA93D', quantity: 3 }), line({ partNumber: 'MCP6542-I/MS' }), line({ partNumber: 'NOPE' })]
  expect(stockToTake(lines, 2, items)).toEqual({ items: [{ id: 1, qty: 30 }, { id: 3, qty: 4 }], short: ['GRM188R71H104KA93D', 'MCP6542-I/MS', 'NOPE'] })
})
