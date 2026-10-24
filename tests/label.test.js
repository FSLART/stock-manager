import { expect, it } from 'vitest'
import { findPart, parseLabel, sharpen } from '../frontend/src/label.js'

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
it('recognises a TE Connectivity label, which carries no manufacturer field', () => {
  expect(parseLabel('[)>␞06␝P1-1614883-3␝1PCPF0805B470RE1␝30PCPF0805B470RE1␝KTES000641397␝1K92806909␝10K113013004␝9D22051␝1TAMC-2201280052␝11K1␝4LTW␝Q10␝11ZPICK␝12Z2728833␞␄'))
    .toMatchObject({ mpn: 'CPF0805B470RE1', manufacturer: 'TE Connectivity', qty: 10, order: 'TES000641397', invoice: '113013004', country: 'TW' })
  // Uma etiqueta DigiKey normal (P = código DigiKey) não passa por TE.
  expect(parseLabel('[)>\x1e06\x1dPMCP6542-I/MS-ND\x1d1PMCP6542-I/MS\x1dQ5\x1e\x04').manufacturer).toBeUndefined()
})
it('reads the Data Matrix of a TE factory label, with its own two-letter fields', () => {
  expect(parseLabel('[)>\x1e06\x1dLT3S049401118178\x1dPN3-1462039-7\x1dRVD\x1dQT20\x1dPO200233795374\x1dBT0\x1dBX\x1dDC26282\x1e\x04'))
    .toEqual({ mpn: '3-1462039-7', qty: 20, order: '200233795374', manufacturer: 'TE Connectivity' })
})
it('sharpens edges and leaves flat areas alone', () => {
  const data = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255, 200, 200, 200, 255, 200, 200, 200, 255])
  expect([...sharpen({ data, width: 4, height: 1 }, 1, 2).data.filter((_, i) => i % 4 === 0)]).toEqual([100, 33, 255, 200])
})

it('reads a Mouser label whose 2D code damages the part number and finds it in the catalog', () => {
  // Bytes reais do código 2D da etiqueta Mouser do Panjit GS1002FL_R1_00001.
  const label = parseLabel('[)>\x1e06\x1dK39963463\x1d14K015\x1d1PGS1002FLR1\x00001\x1dQ10\x1d11K091655874\x1d4LTW\x1d1VPanjit\x1e\x04')
  expect(label).toMatchObject({ mpn: 'GS1002FLR1001', manufacturer: 'Panjit', qty: 10 })
  const parts = [{ mpn: 'GS1002FL_R1_00001' }, { mpn: 'GS1004FL_R1_00001' }, { mpn: 'RC0603FR-0710KL' }]
  expect(findPart(label.mpn, parts)?.mpn).toBe('GS1002FL_R1_00001')
  expect(findPart('rc0603fr-0710kl', parts)?.mpn).toBe('RC0603FR-0710KL')
  // Curto demais ou ambíguo: não adivinha.
  expect(findPart('GS1002', parts)).toBeNull()
  expect(findPart('GS100FLR1001', [{ mpn: 'GS1002FL_R1_00001' }, { mpn: 'GS1004FL_R1_00001' }])).toBeNull()
})
