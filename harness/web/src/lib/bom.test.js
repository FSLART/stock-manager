import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseWorkbook } from './model.js'
import { indexHarness } from './harness.js'
import { bomCsv, bomOf, completeness, crimpFor } from './bom.js'

const dir = new URL('../../../data/t26/std/', import.meta.url)
const catalog = JSON.parse(readFileSync(new URL('catalog.json', dir)))

test('crimp de cada ponta: Excel > catálogo pela ficha e AWG', () => {
  const w = (csa) => ({ csa_mm2: csa })
  assert.equal(crimpFor(catalog, { contact_pn: 'X-1' }, w(0.5)).source, 'Excel')
  assert.equal(crimpFor(catalog, { housing_pn: '43025-1600' }, w(0.5)).pn, '43030-0001')
  assert.equal(crimpFor(catalog, { housing_pn: '43020-0400' }, w('0,5')).pn, '43031-0001') // ficha macho, vírgula decimal
  assert.equal(crimpFor(catalog, { housing_pn: 'RTS718N32S03' }, w(0.5)).pn, 'MS20W23F-10') // caixa: recetáculo fêmea
  assert.equal(crimpFor(catalog, { housing_pn: 'RTS6BS18N32PHEC03' }, w(0.35)).pn, 'MP20W23F-10') // car harness: ficha macho
  assert.equal(crimpFor(catalog, { housing_pn: 'RTS6BS18N32PHEC03' }, w(0.75)).pn, null) // 18 AWG fora de 20–22
  assert.equal(crimpFor(catalog, { housing_pn: '1-794617-2' }, w(0.5)).pn, '794611-1') // AWG por confirmar: não bloqueia
  assert.equal(crimpFor(catalog, { housing_pn: '1-2834074-3' }, w(0.35)).pn, '1-2834067-2') // aceita o prefixo 1-
  assert.equal(crimpFor(catalog, { housing_pn: '282087-1' }, w(0.5)).seal, '281934-2')
  assert.match(crimpFor(catalog, { housing_pn: 'EEG.3B.312.CRLV' }, w(0.5)).why, /por identificar/)
  assert.match(crimpFor(catalog, { housing_pn: 'XYZ-1' }, w(0.5)).why, /não está no catálogo/)
  assert.match(crimpFor(catalog, {}, w(0.5)).why, /sem P\/N/)
})

test('BOM e completude do acumulador', () => {
  const model = parseWorkbook(readFileSync(new URL('ACCU.xlsx', dir)))
  const h = { code: 'ACCU', model, H: indexHarness(model) }
  const bom = bomOf(h, catalog)
  const micro = bom.crimps.find((c) => c.pn === '43030-0001')
  assert.ok(micro.qty >= 30) // pontas nos conectores AMS (Micro-Fit)
  assert.ok(bom.housings.some((x) => x.pn === 'RTS718N32S03'))
  assert.equal(bom.wire.reduce((s, x) => s + x.n, 0), model.sheets.Wires.length)
  assert.match(bomCsv('ACCU', bom), /^"harness","tipo"/)
  const c = completeness(h, catalog)
  assert.ok(c.score > 0 && c.score < 100)
  assert.equal(c.topology, true)
})
