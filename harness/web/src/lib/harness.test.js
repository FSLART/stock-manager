import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseWorkbook } from './model.js'
import { indexHarness, showKey } from './harness.js'

const H = indexHarness(parseWorkbook(readFileSync(new URL('../../../data/t26/std/ACCU.xlsx', import.meta.url))))

test('trace segue o splice: ACCU J1:g alimenta TSAL, Latch e IMD', () => {
  const c = H.circuitOf.get(H.wireById.get('W-ACCU-015'))
  assert.deepEqual(c.keys.map(showKey).sort(), ['ACCU J1:g', 'IMD XK1A:2', 'LATCH J1:5', 'SPL AUX_VCC:S', 'TSAL D2:6'])
  assert.equal(c.wires.length, 4)
})

test('ACCU J1:A e ACCU J1:a são circuitos diferentes', () => {
  const [A, a] = ['W-ACCU-001', 'W-ACCU-011'].map((id) => H.circuitOf.get(H.wireById.get(id)))
  assert.notEqual(A, a)
  assert.deepEqual(A.keys.map(showKey).sort(), ['ACCU J1:A', 'LATCH J1:10'])
})

test('trace do carro atravessa o acoplamento ACCU J1 (ACCU ⇄ CAR)', async () => {
  const { indexCar, qKey } = await import('./harness.js')
  const dir = new URL('../../../data/t26/std/', import.meta.url)
  const index = JSON.parse(readFileSync(new URL('index.json', dir)))
  const hs = index.harnesses.filter((h) => h.category === 'car' && h.file).map((h) => {
    const model = parseWorkbook(readFileSync(new URL(h.file, dir)))
    return { code: h.code, model, H: indexHarness(model) }
  })
  const car = indexCar(hs, index.mates)
  const acc = hs.find((h) => h.code === 'ACCU')
  const c = car.circuitOf.get(acc.H.wireById.get('W-ACCU-001')) // ACCU J1:A RE_SDC -> LATCH J1:10
  assert.ok(c.keys.includes(qKey('CAR', 'ACCU J1', 'A')))
  assert.ok(c.wires.some((x) => x.code === 'CAR'))
  assert.ok(c.links.some((l) => l.ref === 'ACCU J1' && l.pin === 'A'))
  // TSAL J1 tem o mesmo nome no ACCU e no CAR mas são fichas diferentes: não pode haver acoplamento
  assert.ok(!car.links.some((l) => l.ref === 'TSAL J1'))
})

test('todos os harnesses validam sem rebentar', async () => {
  const { validate } = await import('./validate.js')
  const dir = new URL('../../../data/t26/std/', import.meta.url)
  const index = JSON.parse(readFileSync(new URL('index.json', dir)))
  for (const h of index.harnesses.filter((h) => h.file)) {
    const fs = validate(parseWorkbook(readFileSync(new URL(h.file, dir))))
    assert.ok(!fs.some((f) => f.rule === 'STRUCT'), h.code)
  }
})

test('placa de cada conector (boards.json)', async () => {
  const { boardOf } = await import('./harness.js')
  const boards = JSON.parse(readFileSync(new URL('../../../data/t26/std/boards.json', import.meta.url)))
  assert.equal(boardOf(boards, 'ACCU', 'AMS J11')?.name, 'AMS')
  assert.equal(boardOf(boards, 'CAR', 'AMS FANS'), null) // ventoinhas comandadas pelo AMS, não são o AMS
  assert.equal(boardOf(boards, 'ACCU', 'ACCU J1'), null) // ACCU não é ACU
  assert.equal(boardOf(boards, 'LVBOX', 'ACU J3')?.name, 'ACU')
  assert.equal(boardOf(boards, 'ACCU', 'TSAL D2')?.name, 'TSAL Green')
  assert.equal(boardOf(boards, 'CAR', 'TSAL J1'), null) // luz TSAL do carro, não a placa
  assert.equal(boardOf(boards, 'JBOX', 'TSAL RED D2')?.name, 'TSAL Red')
  assert.equal(boardOf(boards, 'CAR', 'PDM J1')?.name, 'PDM')
})

test('as duas fichas de um conector entre harnesses têm de ser M e F', async () => {
  const { indexCar } = await import('./harness.js')
  const { validateCar } = await import('./validate.js')
  const dir = new URL('../../../data/t26/std/', import.meta.url)
  const index = JSON.parse(readFileSync(new URL('index.json', dir)))
  const hs = ['ACCU', 'CAR'].map((code) => {
    const model = parseWorkbook(readFileSync(new URL(`${code}.xlsx`, dir)))
    return { code, model, H: indexHarness(model) }
  })
  hs[1].H.conns.get('ACCU J1').gender = 'F' // o ACCU já tem a ficha fêmea (RTS718N32S03)
  const fs = validateCar(hs, indexCar(hs, index.mates), index)
  assert.ok(fs.some((f) => f.rule === 'X-GENDER' && f.sev === 'error' && f.msg.includes('ACCU J1')))
})
