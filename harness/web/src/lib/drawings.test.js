import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { connectorDrawing, faceLayout, gridCavities } from './drawings.js'

const catalog = JSON.parse(readFileSync(new URL('../../../data/t26/std/catalog.json', import.meta.url)))

test('Micro MATE-N-LOK 14 vias como no desenho C-794617: 1 em baixo à direita, 8 em cima à direita, 14 em cima à esquerda', () => {
  const c = gridCavities({ pitch: 3, rowPitch: 3, rows: 2, start: 'bottom-right' }, 14)
  assert.deepEqual(c[1], [9, 1.5])
  assert.deepEqual(c[7], [-9, 1.5])
  assert.deepEqual(c[8], [9, -1.5])
  assert.deepEqual(c[14], [-9, -1.5])
  const d = connectorDrawing(catalog, '1-794617-4', 14)
  assert.equal(d.face[0], 22) // DIM A da tabela: 22,00
})

test('AMPSEAL 23: filas 8/7/8 a 4 mm, a do meio desfasada meio passo', () => {
  const d = connectorDrawing(catalog, '770680-1', 23)
  assert.equal(Object.keys(d.cav).length, 23)
  assert.deepEqual(d.cav[9][1], 0)
  assert.equal(Math.abs(d.cav[9][0] - d.cav[1][0]), 2)
})

test('RTS 18-32: 32 cavidades, A à esquerda de T no topo; a ficha macho é o espelho', () => {
  const s = connectorDrawing(catalog, 'RTS718N32S03')
  const p = connectorDrawing(catalog, 'RTS6BS18N32PHEC03')
  assert.equal(Object.keys(s.cav).length, 32)
  assert.ok(s.cav.A[0] < 0 && s.cav.T[0] > 0 && s.cav.A[1] < -8)
  assert.equal(p.cav.A[0], -s.cav.A[0])
  assert.equal(connectorDrawing(catalog, 'RTS714N19S03').cav.V.join(), '0,0')
})

test('face: pinos que não existem no desenho vão para uma fila à parte; sem P/N conhecido usa a genérica', () => {
  const f = faceLayout(connectorDrawing(catalog, 'RTS718N32S03'), ['A', 'B', '33', '34'])
  assert.deepEqual(f.extra, ['33', '34'])
  assert.ok(f.pts.filter((p) => !p.extra).length === 32)
  assert.equal(faceLayout(null, ['1', '2']).pts.length, 2)
  assert.equal(connectorDrawing(catalog, 'XPTO-123'), null)
})
