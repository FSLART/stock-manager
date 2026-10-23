import { expect, it } from 'vitest'
import { parseLabel, sharpen } from '../frontend/src/label.js'

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
it('reads the comma-separated PDF417 of a Microchip label', () => {
  expect(parseLabel('1PMCP6C02T-100E/CHY,1T240400319000MTAI,P,Q3,MTAI240400319.000.038')).toEqual({ mpn: 'MCP6C02T-100E/CHY', qty: 3 })
  expect(parseLabel('[)>\x1e06\x1d1PX1\x1d1VAnalog Devices, Inc.\x1e\x04')).toMatchObject({ manufacturer: 'Analog Devices, Inc.' })
})
it('sharpens edges and leaves flat areas alone', () => {
  const data = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255, 200, 200, 200, 255, 200, 200, 200, 255])
  expect([...sharpen({ data, width: 4, height: 1 }, 1, 2).data.filter((_, i) => i % 4 === 0)]).toEqual([100, 33, 255, 200])
})
