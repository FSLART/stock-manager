import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseWorkbook } from './model.js'
import { indexHarness } from './harness.js'
import { canOf, canPairs } from './can.js'

const w = (net, extra = {}) => ({ net, from_ref: 'A', from_pin: '1', to_ref: 'B', to_pin: '1', ...extra })

test('cada nome dos Excels cai num dos cinco barramentos, com H/L', () => {
  const cases = [
    ['PWT_CAN_H', 'PWT', 'H'], ['CAN_PWT_L', 'PWT', 'L'], ['DATA_CAN_H', 'DATA', 'H'], ['DAT_CAN_L', 'DATA', 'L'],
    ['CAN_Data_L', 'DATA', 'L'], ['AUT_CAN_H', 'AUT', 'H'], ['CAN_AUT_L', 'AUT', 'L'], ['CHG_CAN_H', 'CHG', 'H'],
    ['CAN conf inverters High', 'DTI', 'H'], ['CAN conf inverters Low', 'DTI', 'L'],
  ]
  for (const [net, bus, side] of cases) assert.deepEqual(canOf(w(net)), { bus, side }, net)
  assert.equal(canOf(w('AUT_CAN', { description: 'Autonumous Can BUS Low' })).side, 'L') // H/L só na descrição
  assert.equal(canOf(w('PWR_CAN_HIGH')).bus, 'PWT')
  assert.ok(canOf(w('PWR_CAN_HIGH')).likely) // provável, mas a renomear
  assert.equal(canOf(w('AD_CAN_LOW')).bus, 'AUT')
  assert.equal(canOf(w('PWR CAN Shield')).side, 'S') // blindagem, não é H nem L
  assert.equal(canOf(w('MOTOR_CAN_H')).bus, null) // não é nenhum dos cinco
  assert.equal(canOf(w('RE_SDC')), null)
  assert.equal(canOf(w('RE_SDC', { from_ref: 'CAN S J1' })), null) // o nome da ficha não conta
})

test('pares entrançados no LV Box: H e L do mesmo barramento entre as mesmas fichas', () => {
  const model = parseWorkbook(readFileSync(new URL('../../../data/t26/std/LVBOX.xlsx', import.meta.url)))
  const h = { model, H: indexHarness(model) }
  const { info, partner } = canPairs(h)
  assert.ok(partner.size >= 2)
  for (const [a, b] of partner) {
    assert.equal(info.get(a).bus, info.get(b).bus)
    assert.notEqual(info.get(a).side, info.get(b).side)
  }
})
