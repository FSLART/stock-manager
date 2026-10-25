// Crimps, lista de materiais (BOM / cut list) e o que falta a cada harness.
import { ends, pinKey, txt } from './harness.js'

const CSA_AWG = { 0.14: 26, 0.22: 24, 0.35: 22, 0.5: 20, 0.75: 18, 1: 17, 1.5: 16, 2.5: 14, 4: 12, 6: 10, 10: 8, 16: 6, 25: 4, 35: 2, 50: 1 }
const num = (v) => (txt(v) === '' ? NaN : Number(txt(v).replace(',', '.')))
const up = (v) => txt(v).toUpperCase()

// foto do fabricante (servida pela Digi-Key) e página do produto, se o catálogo a tiver
export const photoOf = (catalog, pn) => (pn && catalog?.photos?.[pn]) || null

const awgOk = (c, awg) => !awg || !(c.awg?.length === 2) || (awg >= Math.min(...c.awg) && awg <= Math.max(...c.awg))

// ficha do catálogo pelo P/N (exato ou regex 'match')
export function housingOf(catalog, pn) {
  if (!pn) return null
  for (const family of catalog?.families || [])
    for (const housing of family.housings)
      if (housing.pn ? housing.pn === pn : new RegExp(housing.match).test(pn)) return { family, housing }
  return null
}
export function contactOf(catalog, pn) {
  for (const family of catalog?.families || []) {
    const contact = family.contacts.find((c) => c.pn === pn)
    if (contact) return { family, contact }
  }
  return null
}

// crimp de uma ponta de fio numa ficha: contact_pn da ficha (Excel) > catálogo pela ficha e AWG do fio
export function crimpFor(catalog, conn, wire) {
  const csa = num(wire.csa_mm2)
  const awg = CSA_AWG[csa]
  const housing = txt(conn?.housing_pn)
  const hit = housingOf(catalog, housing)
  const out = (contact, source, extra = {}) => ({
    pn: contact.pn, source, family: hit?.family || contactOf(catalog, contact.pn)?.family || null, seal: contact.seal || null,
    price: contact.price ?? null, tool: (hit?.family || contactOf(catalog, contact.pn)?.family)?.tool || null, awg, ok: awgOk(contact, awg), ...extra,
  })
  if (txt(conn?.contact_pn)) return out(contactOf(catalog, txt(conn.contact_pn))?.contact || { pn: txt(conn.contact_pn) }, 'Excel')
  if (!housing) return { pn: null, why: 'ficha sem P/N', awg }
  if (!hit) return { pn: null, why: `${housing} não está no catálogo`, awg }
  const options = hit.housing.contacts.map((pn) => contactOf(catalog, pn)?.contact || { pn })
  if (!options.length) return { pn: null, why: `${housing}: contacto por identificar`, family: hit.family, awg }
  if (!awg) return out(options[0], 'catálogo', { guess: 'sem secção — confirmar AWG' })
  const fit = options.find((c) => awgOk(c, awg))
  return fit ? out(fit, 'catálogo')
    : { pn: null, why: `${csa} mm² (≈${awg} AWG) fora da gama dos contactos de ${housing}`, family: hit.family, awg }
}

// todas as pontas de fio de um harness que terminam numa ficha (não em splices nem pernos)
export function wireEnds(h) {
  return h.model.sheets.Wires.flatMap((w) => ends(w).map((e, i) => ({ w, side: i ? 'to' : 'from', ref: e.ref, pin: e.pin, conn: h.H.conns.get(e.ref) })))
    .filter((x) => up(x.conn?.type) === 'CONNECTOR')
}

const tally = (rows, key) => {
  const m = new Map()
  for (const r of rows) {
    const k = key(r)
    m.set(k, [...(m.get(k) || []), r])
  }
  return m
}

// BOM de um harness: fichas, crimps, vedantes, fio por cor × secção, ferramentas, custo estimado
export function bomOf(h, catalog) {
  const halves = [...h.H.conns.values()].filter((c) => up(c.type) === 'CONNECTOR')
  const ends_ = wireEnds(h).map((x) => ({ ...x, crimp: crimpFor(catalog, x.conn, x.w) }))
  const housings = [...tally(halves, (c) => txt(c.housing_pn) || '').entries()].map(([pn, cs]) => {
    const hit = housingOf(catalog, pn)
    return { pn, qty: cs.length, refs: cs.map((c) => txt(c.ref)), family: hit?.family.name || '', price: hit?.housing.price ?? null,
      over: cs.filter((c) => hit?.housing.positions && h.H.pinsOf(txt(c.ref)).length > hit.housing.positions).map((c) => txt(c.ref)) }
  })
  const crimps = [...tally(ends_, (x) => x.crimp.pn || '').entries()].map(([pn, xs]) => ({
    pn, qty: xs.length, family: xs[0].crimp.family?.name || '', price: xs[0].crimp.price ?? null,
    why: [...new Set(xs.map((x) => x.crimp.why || x.crimp.guess || (x.crimp.ok === false ? 'AWG fora da gama' : '')).filter(Boolean))],
  }))
  const seals = [...tally(ends_.filter((x) => x.crimp.seal), (x) => x.crimp.seal).entries()].map(([pn, xs]) => ({ pn, qty: xs.length }))
  const wire = [...tally(h.model.sheets.Wires, (w) => `${up(w.colour)}|${txt(w.csa_mm2)}|${txt(w.wire_pn)}`).entries()].map(([k, ws]) => {
    const [colour, csa, pn] = k.split('|')
    const known = ws.filter((w) => num(w.length_mm) > 0)
    return { colour, csa, pn, n: ws.length, mm: known.reduce((s, w) => s + num(w.length_mm), 0), unknown: ws.length - known.length }
  }).sort((a, b) => b.n - a.n)
  const tools = [...new Set(ends_.map((x) => x.crimp.tool).filter(Boolean))]
  const priced = [...housings, ...crimps].filter((x) => x.pn && x.price != null)
  const cost = priced.reduce((s, x) => s + x.qty * x.price, 0)
  const unpriced = [...housings, ...crimps].filter((x) => !x.pn || x.price == null).reduce((s, x) => s + x.qty, 0)
  return { housings, crimps, seals, wire, tools, ends: ends_, cost, unpriced }
}

// o que falta para o harness ficar completo: cada item é [rótulo, feitos, total]
export function completeness(h, catalog, placed = () => false) {
  const halves = [...h.H.conns.values()].filter((c) => up(c.type) === 'CONNECTOR')
  const W = h.model.sheets.Wires
  const ends_ = wireEnds(h)
  const has = (xs, f) => xs.filter(f).length
  const items = [
    ['Fichas com P/N', has(halves, (c) => txt(c.housing_pn)), halves.length],
    ['Fichas com género (M/F)', has(halves, (c) => ['M', 'F'].includes(up(c.gender))), halves.length],
    ['Pontas com crimp definido', has(ends_, (x) => crimpFor(catalog, x.conn, x.w).pn), ends_.length],
    ['Fios com secção', has(W, (w) => num(w.csa_mm2) > 0), W.length],
    ['Fios com cor', has(W, (w) => txt(w.colour)), W.length],
    ['Fios com comprimento', has(W, (w) => num(w.length_mm) > 0), W.length],
    ['Fios com P/N do cabo', has(W, (w) => txt(w.wire_pn)), W.length],
    ['Fichas com posição 3D', has(halves, (c) => placed(txt(c.ref), c)), halves.length],
    ['Issues fechadas', has(h.model.sheets.Issues, (i) => ['fechado', 'closed'].includes(txt(i.status).toLowerCase())), h.model.sheets.Issues.length],
  ]
  const scored = items.filter(([, , n]) => n > 0)
  const score = scored.length ? Math.round((100 * scored.reduce((s, [, d, n]) => s + d / n, 0)) / scored.length) : 0
  return { items, score, topology: h.model.sheets.Segments.length > 0 }
}

export function bomCsv(code, bom) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['harness', 'tipo', 'P/N', 'descrição', 'quantidade', 'unidade', 'preço unitário (€, 1 un.)']]
  for (const x of bom.housings) rows.push([code, 'ficha', x.pn || 'POR DEFINIR', `${x.family} ${x.refs.join(' ')}`.trim(), x.qty, 'un', x.price ?? ''])
  for (const x of bom.crimps) rows.push([code, 'crimp', x.pn || 'POR DEFINIR', [x.family, ...x.why].filter(Boolean).join('; '), x.qty, 'un', x.price ?? ''])
  for (const x of bom.seals) rows.push([code, 'vedante de fio', x.pn, '', x.qty, 'un'])
  for (const x of bom.wire) rows.push([code, 'fio', x.pn || 'POR DEFINIR', `${x.colour || 'sem cor'} ${x.csa ? x.csa + ' mm²' : 'sem secção'} · ${x.n} fios${x.unknown ? ` (${x.unknown} sem comprimento)` : ''}`, (x.mm / 1000).toFixed(2), 'm'])
  for (const t of bom.tools) rows.push([code, 'ferramenta', t, 'alicate de crimpar', 1, 'un'])
  return rows.map((r) => r.map(q).join(',')).join('\n')
}
