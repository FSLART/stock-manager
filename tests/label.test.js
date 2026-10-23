import { expect, it } from 'vitest'
import { parseLabel } from '../frontend/src/label.js'

it('reads the 2D code of a Mouser label', () => {
  expect(parseLabel('[)>\x1e06\x1dK39759441\x1d14K004\x1d1PMIC6270YM5-TR\x1dQ20\x1d11K091314939\x1d4LTH\x1d1VMicrochip\x1e\x04'))
    .toEqual({ order: '39759441', mpn: 'MIC6270YM5-TR', qty: 20, invoice: '091314939', country: 'TH', manufacturer: 'Microchip' })
})
it('accepts separators returned as visible symbols and DigiKey part numbers', () => {
  expect(parseLabel('[)>␞06␝K39104603␝14K027␝1PICM7555ESA+␝Q8␝4LTW␝1VAnalog␠Devices␠Inc.␞␄')).toMatchObject({ mpn: 'ICM7555ESA+', qty: 8, manufacturer: 'Analog Devices Inc.' })
  expect(parseLabel('[)>\x1e06\x1dP123\x1d1PRC0603\x1d30P311-10KHRCT-ND\x1dQ100\x1e\x04')).toMatchObject({ mpn: 'RC0603', supplierPart: '311-10KHRCT-ND', qty: 100 })
})
it('ignores codes without a manufacturer part number', () => {
  expect(parseLabel('091314939')).toBeNull()
  expect(parseLabel('[)>\x1e06\x1dK1\x1dQ5\x1e\x04')).toBeNull()
})
it('reads DigiKey order and invoice fields instead of the packing list', () => {
  expect(parseLabel('[)>\x1e06\x1dPMCP6542-I/MS-ND\x1d1PMCP6542-I/MS\x1d30PMCP6542-I/MS-ND\x1dK\x1d1K88360125\x1d10K106727746\x1d9D2336\x1d1T242301807000MTAI\x1d11K1\x1d4LTH\x1dQ5\x1d11ZPICK\x1e\x04'))
    .toEqual({ mpn: 'MCP6542-I/MS', supplierPart: 'MCP6542-I/MS-ND', order: '88360125', invoice: '106727746', country: 'TH', qty: 5 })
})
it('merges the one-field barcodes of a Microchip label and lets the 2D code win over plain barcodes', () => {
  expect(parseLabel(['1T233700060000LPI', 'Q5', '1PMCP1755ST-3302E/DB', '2250BGG'])).toEqual({ mpn: 'MCP1755ST-3302E/DB', qty: 5 })
  expect(parseLabel(['QS5-TR', '[)>\x1e06\x1d1PQS5-TR\x1dQ20\x1e\x04'])).toMatchObject({ mpn: 'QS5-TR', qty: 20 })
})
