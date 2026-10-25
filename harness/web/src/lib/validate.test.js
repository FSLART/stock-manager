import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseWorkbook } from './model.js'
import { validate } from './validate.js'

const T26 = new URL('../../../data/t26/std/ACCU.xlsx', import.meta.url)
const rules = (fs, rule) => fs.filter((f) => f.rule === rule)

test('T26 acumulador: sem críticos, apanha o que sabemos que lá está', () => {
  const fs = validate(parseWorkbook(readFileSync(T26)))
  assert.deepEqual(rules(fs, 'STRUCT'), [])
  assert.deepEqual(fs.filter((f) => f.sev === 'critical'), [])
  assert.equal(rules(fs, 'W-HVCONN').length, 7) // fios de medida HV em fichas ainda não marcadas HV rated
  assert.ok(rules(fs, 'W-VOLT').some((f) => f.msg.includes('W-ACCU-008'))) // Reset: 0V na ACCU J1, 24V na Latch
  assert.equal(rules(fs, 'ISSUE').length, 17)
})

// modelo mínimo para testar uma regra de cada vez
const HEAD = {
  Wires: ['wire_id', 'net', 'from_ref', 'from_pin', 'to_ref', 'to_pin', 'colour', 'csa_mm2', 'hv', 'twist_group', 'length_mm'],
  Connectors: ['ref', 'type', 'hv_rated', 'housing_pn', 'contact_pn', 'x_m', 'y_m', 'z_m'],
  Pins: ['ref', 'pin', 'label', 'dir', 'voltage'],
}
const rows = (list) => list.map((r, i) => ({ _row: i + 2, ...r }))
function model({ wires = [], conns = [], pins = [], parts = [] }) {
  const c = (ref, type = 'CONNECTOR', extra = {}) => ({ ref, type, hv_rated: 'N', housing_pn: 'X', x_m: 0, y_m: 0, z_m: 0, ...extra })
  return {
    missing: ['Segments', 'Nodes', 'Issues'],
    headers: { ...HEAD, Parts: ['pn'] },
    sheets: {
      Connectors: rows(conns.map((x) => (typeof x === 'string' ? c(x) : c(...x)))),
      Pins: rows(pins.map(([ref, pin, dir = 'IN', label = 'S', voltage = '']) => ({ ref, pin, dir, label, voltage }))),
      Wires: rows(wires.map(([id, fr, fp, tr, tp, extra = {}]) => ({ wire_id: id, net: 'N', from_ref: fr, from_pin: fp, to_ref: tr, to_pin: tp, colour: 'WH', csa_mm2: 0.5, hv: 'N', ...extra }))),
      Parts: rows(parts),
      Segments: [], Nodes: [], Issues: [],
    },
  }
}
const base = { conns: ['A', 'B'], pins: [['A', '1'], ['A', 'a'], ['A', 'A'], ['B', '1'], ['B', '2']] }

test('pinos A e a são diferentes; dois fios no mesmo pino é crítico', () => {
  let fs = validate(model({ ...base, wires: [['W1', 'A', 'A', 'B', '1'], ['W2', 'A', 'a', 'B', '2']] }))
  assert.deepEqual(rules(fs, 'W-DUP'), [])
  fs = validate(model({ ...base, wires: [['W1', 'A', '1', 'B', '1'], ['W2', 'A', '1', 'B', '2']] }))
  assert.equal(rules(fs, 'W-DUP')[0].sev, 'critical')
})

test('VCC e GND no mesmo circuito através de um splice', () => {
  const fs = validate(model({
    conns: ['A', 'B', ['SPL X', 'SPLICE']],
    pins: [['A', '1', 'VCC'], ['B', '1', 'GND'], ['SPL X', 'S', '']],
    wires: [['W1', 'A', '1', 'SPL X', 'S'], ['W2', 'SPL X', 'S', 'B', '1']],
  }))
  assert.equal(rules(fs, 'W-POL').length, 1)
})

test('ref com gralha sugere a certa; pino com caixa errada avisa', () => {
  const fs = validate(model({ conns: ['AMS J11', 'B'], pins: [['AMS J11', '1'], ['B', 'a']], wires: [['W1', 'AMS J1l', '1', 'B', 'A']] }))
  assert.match(rules(fs, 'W-REF')[0].msg, /querias "AMS J11"/)
  assert.match(rules(fs, 'W-PIN')[0].msg, /existe "a"/)
})

test('HV ⇔ laranja e ficha HV rated', () => {
  const fs = validate(model({ ...base, wires: [['W1', 'A', '1', 'B', '1', { colour: 'OG', hv: 'N' }], ['W2', 'A', 'A', 'B', '2', { colour: 'OG', hv: 'Y' }]] }))
  assert.equal(rules(fs, 'W-HV').length, 1)
  assert.match(rules(fs, 'W-HVCONN')[0].msg, /A e B/)
})

test('secção com vírgula aceite; fora da gama do contacto dá erro', () => {
  const m = model({
    conns: [['A', 'CONNECTOR', { contact_pn: 'C1' }], 'B'], pins: base.pins, parts: [{ pn: 'C1', awg_range: '20–24 AWG' }, { pn: 'X' }],
    wires: [['W1', 'A', '1', 'B', '1', { csa_mm2: '0,5' }], ['W2', 'A', 'A', 'B', '2', { csa_mm2: 1.5 }]],
  })
  const fs = validate(m)
  assert.deepEqual(rules(fs, 'W-CSA'), [])
  assert.equal(rules(fs, 'W-CRIMP').length, 1)
  assert.match(rules(fs, 'W-CRIMP')[0].msg, /W2/)
})

test('par entrançado com 1 fio, CAN sem par, pino NC com fio', () => {
  const fs = validate(model({
    conns: ['A', 'B'], pins: [['A', '1'], ['A', '2', 'NC'], ['B', '1'], ['B', '2']],
    wires: [['W1', 'A', '1', 'B', '1', { twist_group: 'TP1' }], ['W2', 'A', '2', 'B', '2', { net: 'PWT_CAN_H' }]],
  }))
  assert.equal(rules(fs, 'W-TWIST').length, 1) // grupo TP1 com 1 fio
  assert.equal(rules(fs, 'W-CANPAIR').length, 1) // PWT_CAN_H sem o L
  assert.equal(rules(fs, 'P-NC').length, 1)
})

test('coluna em falta pára a validação', () => {
  const m = model(base)
  m.headers.Wires = m.headers.Wires.filter((h) => h !== 'hv')
  const fs = validate(m)
  assert.equal(fs.length, 1)
  assert.equal(fs[0].rule, 'STRUCT')
})
