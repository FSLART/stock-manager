import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseWorkbook } from './model.js'
import { indexHarness } from './harness.js'
import { diagram, face, formboard, spreadLabels } from './layout2d.js'

const dir = new URL('../../../data/t26/std/', import.meta.url)
const load = (code) => {
  const model = parseWorkbook(readFileSync(new URL(`${code}.xlsx`, dir)))
  return { code, model, H: indexHarness(model) }
}

test('diagrama: uma caixa por ficha com fio, um traço por fio, caixas da mesma coluna não se sobrepõem', () => {
  const h = load('LVBOX')
  const d = diagram(h)
  assert.equal(d.lines.length, h.model.sheets.Wires.length)
  assert.ok(d.lines.every((l) => !l.d.includes('NaN')))
  for (const a of d.boxes) for (const b of d.boxes)
    if (a !== b && a.col === b.col) assert.ok(a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.ref} sobrepõe ${b.ref}`)
})

test('formboard do acumulador: comprimentos à escala e fios por troço', () => {
  const f = formboard(load('ACCU'))
  assert.equal(f.segs.length, 26)
  const seg = (a, b) => f.segs.find((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a))
  const at = (n) => f.nodes.find((x) => x.id === n)
  const [p, q] = [at('ACCU J1'), at('BP6')]
  assert.ok(Math.abs(Math.hypot(p.x - q.x, p.y - q.y) - 190) < 1e-6) // 190 mm no desenho
  assert.ok(seg('ACCU J1', 'BP6').wires.includes('W-ACCU-001')) // RE_SDC sai do ACCU J1
  assert.ok(f.unrouted.length > 0) // fios HV para FUSE/AIR- HV: fora da topologia
})

test('formboard do side panel: troços sem comprimento e várias árvores', () => {
  const f = formboard(load('SIDEPANEL'))
  assert.ok(f.segs.some((s) => !s.known))
  assert.ok(f.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)))
  assert.equal(formboard(load('ACQ2')), null) // sem topologia
})

test('par entrançado: cada fio começa e acaba no seu pino', async () => {
  const { twist } = await import('./layout2d.js')
  const pa = [[0, 0], [100, 0], [200, 30], [300, 30]]
  const pb = [[0, 18], [100, 18], [200, 48], [300, 48]]
  const t = twist(pa, pb)
  const first = (d) => d.slice(1).split(' L')[0]
  const last = (d) => d.split(' L').at(-1)
  assert.equal(first(t.a), '0.0,0.0')
  assert.equal(last(t.a), '300.0,30.0')
  assert.equal(first(t.b), '0.0,18.0')
  assert.equal(last(t.b), '300.0,48.0')
})

test('diagrama cabe na largura (faixas por baixo) e não se sobrepõe', () => {
  const h = load('CAR')
  for (const avail of [375, 1200, 1900]) {
    const d = diagram(h, { avail })
    assert.ok(d.width <= Math.max(avail, 420), `largura ${d.width} > ${avail}`)
    for (const a of d.boxes) for (const b of d.boxes)
      if (a !== b && a.x === b.x) assert.ok(a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.ref} sobrepõe ${b.ref} (${avail}px)`)
  }
})

test('disposição do carro (layout.json): colunas fixas, fichas em falta à vista, as outras junto de quem ligam', () => {
  const layout = JSON.parse(readFileSync(new URL('layout.json', dir)))
  const h = load('CAR')
  const d = diagram(h, { avail: 2400, columns: layout.CAR.columns })
  const col = (ref) => d.boxes.find((b) => b.ref === ref)?.col
  assert.equal(col('BOTS'), 0)
  assert.equal(col('ACCU J1'), 4)
  assert.equal(col('LVBOX J1'), 5)
  assert.equal(col('ACQUISITION 7 J1'), 6)
  assert.ok(d.boxes.some((b) => b.placeholder && b.ref === 'LCD')) // não está no Excel do CAR
  assert.equal(col('DATABOX J1'), 1) // Raspberry Pi = DATABOX J1 e J2
  assert.equal(col('DATABOX J2'), 1)
  assert.ok(!d.boxes.some((b) => b.placeholder && b.ref === 'RASPBERRY PI'))
  for (const r of ['F SOLENOID', 'R SOLENOID', 'EBS SOLENOIDS X2']) assert.equal(col(r), col('TSAL J1'), r)
  for (const r of ['PDM J1', 'PDM J2']) assert.equal(col(r), col('ADBOX J1'), r)
  assert.ok(d.boxes.some((b) => b.ref === 'BRAKE LIGHT J1' && b.empty)) // está, mas sem fios
  assert.ok(d.boxes.every((b) => b.col <= layout.CAR.columns.length))
  assert.equal(d.lines.length, h.model.sheets.Wires.length)
  const w = d.boxes.map((b) => b.w)
  assert.ok(Math.min(...w) < Math.max(...w)) // a largura das caixas segue o texto
})

test('formboard: cada ficha aponta para fora; face de encaixe sem cavidades sobrepostas', () => {
  const f = formboard(load('ACCU'))
  const n = f.nodes.find((x) => x.id === 'ACCU J1')
  const bp = f.nodes.find((x) => x.id === 'BP6')
  assert.ok(Math.cos(n.dir - Math.atan2(n.y - bp.y, n.x - bp.x)) > 0.99) // folha: direção do troço, para fora
  for (const [k, round] of [[19, true], [32, true], [3, true], [12, false], [2, false]]) {
    const fc = face(Array.from({ length: k }, (_, i) => String(i + 1)), round)
    assert.equal(fc.pts.length, k)
    for (const a of fc.pts) for (const b of fc.pts) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 18, `${k} vias: ${a.pin} sobre ${b.pin}`)
    assert.ok(fc.pts.every((p) => Math.abs(p.x) < fc.w / 2 && Math.abs(p.y) < fc.h / 2))
  }
})

test('nomes das fichas: dois nomes no mesmo sítio separam-se, um sozinho não mexe', () => {
  const [a, b, c] = spreadLabels([
    { x: 0, y: 0, w: 60, h: 16, anchor: 'start' },
    { x: 10, y: 4, w: 60, h: 16, anchor: 'start' },
    { x: 500, y: 0, w: 60, h: 16, anchor: 'end' },
  ])
  assert.deepEqual(a, { x: 0, y: 0 })
  assert.ok(Math.abs(b.y - a.y) >= 16)
  assert.deepEqual(c, { x: 500, y: 0 })
})
