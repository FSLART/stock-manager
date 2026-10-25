// Posição 3D de cada conector (metros, frame do modelo: X lateral, Y vertical, Z longitudinal +trás).
// Prioridade: positions.csv (ou pick local) > x/y/z do Excel > peça do modelo (anchor_3d) > o mesmo conector no
// outro harness (acoplamento) > média dos vizinhos, só para splices e pernos.
import { ends, txt } from './harness.js'

const num = (v) => (txt(v) === '' ? NaN : Number(txt(v).replace(',', '.')))
const xyzOf = (r) => {
  const v = [r.x_m, r.y_m, r.z_m].map(num)
  return v.every(Number.isFinite) ? v : null
}
export const connKey = (code, ref) => `${code}\u0001${ref}`

// positions.csv: harness,ref,anchor_3d,x_m,y_m,z_m,notes — aceita ";" e vírgula decimal (Excel em português)
// campos entre aspas (o Excel põe-nas quando a nota tem vírgulas) podem ter o separador lá dentro
const split = (line, sep) => {
  const out = ['']
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted // shortcut: "" dentro das aspas perde-se; chega para notas
    else if (ch === sep && !quoted) out.push('')
    else out[out.length - 1] += ch
  }
  return out
}
export function parsePositions(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const head = split(lines[0], sep).map((h) => h.trim().replace(/^﻿/, ''))
  return lines.slice(1).map((l) => {
    const cells = split(l, sep)
    const r = Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]))
    return { harness: r.harness, ref: r.ref, anchor: r.anchor_3d, xyz: xyzOf(r), notes: r.notes || '' }
  }).filter((r) => r.harness && r.ref)
}

// data: { list: [{ code, model, H }], index: { mates } }; anchorPos(nome) -> [x,y,z] | null
export function placeConnectors(data, rows, anchorPos) {
  const out = new Map()
  const csv = new Map(rows.map((r) => [connKey(r.harness, r.ref), r]))
  const set = (k, pos, source, note = '') => pos && !out.has(k) && out.set(k, { pos, source, note })
  for (const h of data.list)
    for (const [ref, c] of h.H.conns) {
      const k = connKey(h.code, ref)
      const r = csv.get(k)
      if (r) set(k, r.xyz || (r.anchor && anchorPos(r.anchor)), r.source || (r.xyz ? 'csv' : 'peça'), r.notes)
      set(k, xyzOf(c), 'excel')
      if (txt(c.anchor_3d)) set(k, anchorPos(txt(c.anchor_3d)), 'peça', txt(c.anchor_3d))
    }
  for (const m of data.index.mates || []) {
    const [a, b] = [connKey(m.a, m.ref), connKey(m.b, m.ref)]
    if (out.has(a)) set(b, out.get(a).pos, 'acoplamento', m.a)
    if (out.has(b)) set(a, out.get(b).pos, 'acoplamento', m.b)
  }
  for (let pass = 0; pass < 2; pass++)
    for (const h of data.list)
      for (const [ref, c] of h.H.conns) {
        const k = connKey(h.code, ref)
        if (out.has(k) || !['SPLICE', 'STUD'].includes(txt(c.type).toUpperCase())) continue
        const near = h.model.sheets.Wires.flatMap((w) => {
          const [a, b] = ends(w).map((e) => e.ref)
          return a === ref ? [b] : b === ref ? [a] : []
        }).map((r) => out.get(connKey(h.code, r))?.pos).filter(Boolean)
        if (near.length) set(k, [0, 1, 2].map((i) => near.reduce((s, p) => s + p[i], 0) / near.length), 'vizinhos')
      }
  return out
}
