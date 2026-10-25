import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseWorkbook } from './model.js'
import { indexHarness } from './harness.js'
import { connKey, parsePositions, placeConnectors } from './positions.js'

const dir = new URL('../../../data/t26/std/', import.meta.url)
const index = JSON.parse(readFileSync(new URL('index.json', dir)))
const list = ['ACCU', 'CAR', 'SIDEPANEL'].map((code) => {
  const model = parseWorkbook(readFileSync(new URL(`${code}.xlsx`, dir)))
  return { code, model, H: indexHarness(model) }
})
const data = { list, index }
const fakeModel = (name) => (name.startsWith('c3d-rts714n19s03') ? [0.24, 0.42, 1.59] : null)

test('positions.csv do Excel em português (; e vírgula decimal)', () => {
  const rows = parsePositions('harness;ref;anchor_3d;x_m;y_m;z_m;notes\nCAR;LVBOX J1;;0,1;0,2;1,5;pick\n')
  assert.deepEqual(rows[0].xyz, [0.1, 0.2, 1.5])
  assert.equal(rows[0].ref, 'LVBOX J1')
})

test('positions.csv com notas entre aspas que têm vírgulas', () => {
  const rows = parsePositions('harness,ref,anchor_3d,x_m,y_m,z_m,notes\nJBOX,JBOX J1,,0.1,0.2,1.5,"19 vias, mas o pinout usa 32"\n')
  assert.equal(rows[0].notes, '19 vias, mas o pinout usa 32')
  assert.deepEqual(rows[0].xyz, [0.1, 0.2, 1.5])
})

test('prioridades: csv > excel; peça do modelo; acoplamento; splice pela média dos vizinhos', () => {
  const csv = parsePositions(readFileSync(new URL('positions.csv', dir), 'utf8'))
  const pos = placeConnectors(data, [...csv, { harness: 'ACCU', ref: 'TSAL D2', xyz: [9, 9, 9] }], fakeModel)
  assert.equal(pos.get(connKey('ACCU', 'ACCU J1')).source, 'excel')
  assert.deepEqual(pos.get(connKey('CAR', 'ACCU J1')).pos, pos.get(connKey('ACCU', 'ACCU J1')).pos) // a outra metade da ficha
  assert.equal(pos.get(connKey('CAR', 'ACCU J1')).source, 'acoplamento')
  assert.equal(pos.get(connKey('SIDEPANEL', 'SIDEPANEL J1')).source, 'peça')
  assert.equal(pos.get(connKey('CAR', 'SIDEPANEL J1')).source, 'acoplamento')
  assert.deepEqual(pos.get(connKey('ACCU', 'TSAL D2')).pos, [9, 9, 9])
  assert.equal(pos.get(connKey('ACCU', 'SPL AUX_VCC')).source, 'vizinhos')
  assert.ok(!pos.has(connKey('CAR', 'LEFT EMERGENCY'))) // peça que não está no CAD: fica para o modo pick
})
