import { expect, it } from 'vitest'
import { parseInventoryCsv } from '../frontend/src/inventoryCsv.js'
const categories = [ { name: 'Resistências', props: ['valor', 'potência'], image: false }, { name: 'LEDs', props: ['cor'], image: true } ]
it('maps category properties, quoted values and UTF-8 BOM in semicolon files', () => {
  expect(parseInventoryCsv('\ufeffCategoria;Quantidade;valor;potência;cor\r\nresistências;2;"4,7k";0.25;\r\nLEDs;3;;;"azul; claro"', categories)).toEqual([
    { cat: 'Resistências', qty: 2, props: { valor: '4,7k', potência: '0.25' } },
    { cat: 'LEDs', qty: 3, props: { cor: 'azul; claro' } },
  ])
})
it('rejects invalid rows before import including unknown categories and missing properties', () => {
  for (const csv of ['categoria,quantidade,cor\nUnknown,1,azul', 'categoria,quantidade,cor\nLEDs,-1,azul', 'categoria,quantidade,cor\nLEDs,2.5,azul', 'categoria,quantidade,cor\nLEDs,1,', 'categoria,cor\nLEDs,azul', 'categoria,quantidade,cor,cor\nLEDs,1,azul,verde', 'categoria,quantidade,cor\nLEDs,1,azul,extra']) {
    expect(() => parseInventoryCsv(csv, categories)).toThrow()
  }
})
it('supports comma CSV with embedded newlines and rejects empty or unclosed quotes', () => {
  expect(parseInventoryCsv('category,qty,cor\nLEDs,2,"azul\nclaro"', categories)[0].props.cor).toBe('azul\nclaro')
  expect(() => parseInventoryCsv('categoria,quantidade,cor', categories)).toThrow()
  expect(() => parseInventoryCsv('categoria,quantidade,cor\nLEDs,2,"azul', categories)).toThrow()
})
