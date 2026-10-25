import { expect, it } from 'vitest'
import { ICON_GROUPS, ICONS, iconFor, screwDrawing } from '../frontend/src/labelIcons.js'

it('gives every label icon its own key and a name that stands alone', () => {
  const icons = ICON_GROUPS.flatMap(([, list]) => list)
  expect(Object.keys(ICONS)).toHaveLength(icons.length)
  expect(new Set(icons.map(([, name]) => name)).size).toBe(icons.length)
  expect(icons.every(([, , svg]) => svg.startsWith('<svg') && !svg.includes('<!--'))).toBe(true)
})

it('suggests the most specific icon for a category', () => {
  expect(['Parafusos sextavados', 'Parafusos de embutir', 'Parafusos', 'Porcas autoblocantes', 'Porcas', 'Anilhas de pressão', 'Anilhas', 'Resistências', 'Sensores'].map(iconFor))
    .toEqual(['bolt', 'screw-countersunk', 'screw', 'nut-nyloc', 'nut', 'washer-split', 'washer', 'resistor', 'chip'])
})

it('draws a screw whose length follows the size in the title', () => {
  const width = (head, title) => Number(screwDrawing(head, title).match(/viewBox="0 [-\d.]+ ([\d.]+) /)[1])
  expect(width('screw', 'M3x10')).toBeLessThan(width('screw', 'M3x20'))
  // Sem tamanho no título desenha 10 mm; acima de 24 mm a haste fica inteira, cresce mais devagar e para nos 72 mm.
  expect(width('screw', 'Parafusos')).toBe(width('screw', 'M3x10'))
  // A haste é uma peça só, com mais dentes de rosca quanto mais comprida.
  const teeth = title => screwDrawing('screw', title).match(/L[\d.]+ -0\.38/g).length
  expect(teeth('M3x10')).toBeLessThan(teeth('M10x50'))
  expect(width('screw', 'M5x30')).toBeLessThan(width('screw', 'M10x50'))
  expect(width('screw', 'M10x50')).toBeLessThan(width('screw', 'M10x100'))
  expect(width('screw', 'M10x100')).toBe(width('screw', 'M10x72'))
  // Nos de embutir o comprimento inclui a cabeça.
  expect(width('screw-countersunk', 'M3x10')).toBeLessThan(width('screw', 'M3x10'))
  expect(screwDrawing('', 'M3x10')).toBe('')
})
