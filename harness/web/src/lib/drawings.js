// Desenho de cada ficha pelo P/N (catalog.json → drawings): cavidades na face de encaixe e perfil visto de cima, em mm
import { txt } from './harness.js'
import { face } from './layout2d.js'

export const drawingFor = (catalog, pn) => (txt(pn) && (catalog?.drawings || []).find((d) => new RegExp(d.match).test(txt(pn)))) || null

// grelha → { pino: [x, y] }: rows = nº de cavidades por fila (de cima para baixo) ou nº de filas iguais;
// start = canto da cavidade 1; a numeração corre ao longo da fila e passa à fila seguinte
export function gridCavities({ pitch, rowPitch, rows, start }, n) {
  const counts = Array.isArray(rows) ? rows : Array(rows).fill(Math.ceil(n / rows))
  const order = start.startsWith('bottom') ? [...counts.keys()].reverse() : [...counts.keys()]
  const out = {}
  let k = 1
  for (const r of order)
    for (let i = 0; i < counts[r]; i++) {
      const col = start.endsWith('right') ? counts[r] - 1 - i : i
      out[k++] = [(col - (counts[r] - 1) / 2) * pitch, (r - (counts.length - 1) / 2) * rowPitch]
    }
  return out
}

// desenho de uma ficha: cav (mm), face [w, h] (mm), top [[comprimento, largura]] (mm); n = nº de posições
export function connectorDrawing(catalog, pn, n = 0) {
  const d = drawingFor(catalog, pn)
  if (!d) return null
  const cav = d.cavities || gridCavities(d.grid, n)
  const pts = Object.values(cav)
  const cols = d.grid && Math.max(...(Array.isArray(d.grid.rows) ? d.grid.rows : [Math.ceil(n / d.grid.rows)]))
  const rows = d.grid && (Array.isArray(d.grid.rows) ? d.grid.rows.length : d.grid.rows)
  const width = d.grid && cols * d.grid.pitch + (d.margin ?? 1)
  const maxR = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)))
  const pitch = Math.min(...pts.flatMap((a) => pts.filter((b) => b !== a).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))))
  const faceMm = d.face || (d.grid ? [width, rows * d.grid.rowPitch + 2.26] : [2 * maxR + 1.8 * pitch, 2 * maxR + 1.8 * pitch])
  return { ...d, cav, pitch, face: faceMm, top: d.top.map(([l, w]) => [l, w === 'A' ? width : w]) }
}

// face de encaixe em px para desenhar: com desenho, as cavidades no sítio real; os pinos do Excel que não estão
// no desenho ficam numa fila por baixo (extra); sem desenho, a disposição genérica de face()
export function faceLayout(dwg, pins) {
  if (!dwg) {
    const f = face(pins, false)
    return { ...f, latch: false, pts: f.pts.map((p) => ({ ...p, r: 10.5 })), extra: [] }
  }
  const s = Math.min(26 / dwg.pitch, 240 / dwg.face[0], 200 / dwg.face[1]) // px por mm: cavidades a ~26 px, face até 240 px
  const r = Math.min(10.5, 0.42 * dwg.pitch * s)
  const pts = Object.entries(dwg.cav).map(([pin, [x, y]]) => ({ pin, x: x * s, y: y * s, r: Math.max(r, ((dwg.sizes?.[pin] || 0) / 2) * s) }))
  const [w, h] = dwg.face.map((v) => v * s)
  const extra = pins.filter((p) => !(p in dwg.cav))
  extra.forEach((pin, i) => pts.push({ pin, x: (i - (extra.length - 1) / 2) * 26, y: h / 2 + 30, r: 10.5, extra: true }))
  return { round: dwg.shape === 'round', latch: dwg.latch, w, h, pts, extra, below: extra.length ? 44 : 0 }
}
