// Vistas 2D de um harness: diagrama de ligações (fichas e fios) e formboard (troços com comprimentos).
import { ends, txt } from './harness.js'

const num = (v) => (txt(v) === '' ? NaN : Number(txt(v).replace(',', '.')))

// ---- diagrama de ligações: fichas em colunas pela distância à ficha com mais fios, só os pinos com fio
export const D = { row: 18, head: 30, pad: 20, loop: 70, gapMax: 170, gapMin: 50, minW: 130, maxW: 320 }
// largura de uma caixa pelo texto (Inter 13px negrito ≈ 8 px/letra no título, 11px ≈ 6.5 px/letra nos labels)
const boxWidth = (title, labels, maxW = D.maxW, x0 = 44) => Math.round(Math.min(maxW, Math.max(D.minW, 20 + 8 * title.length,
  ...labels.map((l) => x0 + 6.5 * Math.min(l.length, 40) + 12))))
export const MISSING = 'não está no Excel'

// colunas da disposição (layout.json) → { ref: coluna }, e as entradas que não têm ficha (para mostrar vazias)
function fixedColumns(columns, refs) {
  const col = new Map()
  const order = new Map()
  const missing = []
  columns.forEach((entries, c) => entries.forEach((e, i) => {
    const res = e.refs.map((r) => new RegExp(r))
    const hits = refs.filter((r) => !col.has(r) && res.some((re) => re.test(r)))
    hits.forEach((r, j) => (col.set(r, c), order.set(r, i * 100 + j)))
    if (!hits.length) missing.push({ label: e.label, col: c, order: i * 100 })
  }))
  return { col, order, missing }
}

// diagrama de ligações: fichas em colunas, só os pinos com fio; avail = largura disponível em px
// columns (layout.json): colunas fixas, como as fichas estão no carro; sem isso, colunas pela distância à ficha com mais fios
export function diagram(h, { avail = Infinity, columns = null } = {}) {
  const wires = h.model.sheets.Wires
  const pins = new Map()
  const adj = new Map()
  const deg = new Map()
  const link = (a, b) => adj.set(a, [...(adj.get(a) || []), b])
  for (const w of wires) {
    const [a, b] = ends(w)
    for (const e of [a, b]) {
      if (!pins.has(e.ref)) pins.set(e.ref, new Set())
      pins.get(e.ref).add(e.pin)
      deg.set(e.ref, (deg.get(e.ref) || 0) + 1)
    }
    link(a.ref, b.ref)
    link(b.ref, a.ref)
  }
  let col = new Map()
  let order = new Map()
  let missing = []
  if (columns?.length) {
    // fichas da disposição (também as que não têm fios: aparecem a dizer "sem fios")
    ;({ col, order, missing } = fixedColumns(columns, [...new Set([...pins.keys(), ...h.H.conns.keys()])].filter((r) => !r.startsWith('SPL'))))
    for (const r of col.keys()) if (!pins.has(r)) pins.set(r, new Set())
    // as outras vão para a coluna com que partilham mais fios (várias passagens, para as cadeias de splices)
    for (let pass = 0; pass < 6; pass++)
      for (const r of pins.keys()) {
        if (col.has(r)) continue
        const votes = new Map()
        for (const n of adj.get(r) || []) if (col.has(n)) votes.set(col.get(n), (votes.get(col.get(n)) || 0) + 1)
        if (votes.size) col.set(r, [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0])
      }
    for (const r of pins.keys()) if (!col.has(r)) col.set(r, columns.length) // sem ligação a nada da disposição
  } else {
    for (const start of [...pins.keys()].sort((x, y) => deg.get(y) - deg.get(x))) {
      if (col.has(start)) continue
      const comp = [start]
      col.set(start, 0)
      for (let i = 0; i < comp.length; i++)
        for (const n of adj.get(comp[i]) || []) if (!col.has(n)) col.set(n, col.get(comp[i]) + 1), comp.push(n)
    }
  }
  // caixas: pinos pela ordem do pinout, largura pelo texto mais comprido (nunca mais larga do que o ecrã)
  const maxW = Math.max(D.minW, Math.min(D.maxW, avail - D.loop - 2 * D.pad))
  const fit = (b) => Object.assign(b, { titleChars: Math.floor((b.w - 20) / 8), labelChars: Math.floor((b.w - 54) / 6.5) })
  const boxes = [...pins.keys()].map((ref) => {
    const pinOrder = h.H.pinsOf(ref).map((p) => txt(p.pin))
    const rows = [...pins.get(ref)].sort((a, b) => (pinOrder.indexOf(a) + 1 || 1e9) - (pinOrder.indexOf(b) + 1 || 1e9) || a.localeCompare(b))
    const labels = rows.map((pin) => `${txt(h.H.pins.get(`${ref}\u0000${pin}`)?.label)}`)
    const conn = h.H.conns.get(ref)
    return fit({ ref, col: col.get(ref), rows, conn, empty: !rows.length, w: boxWidth(ref, rows.length ? labels : ['sem fios ligados'], maxW, rows.length ? 44 : 10),
      h: D.head + Math.max(1, rows.length) * D.row + 8, sort: order.get(ref) ?? 1e6 - (deg.get(ref) || 0) })
  })
  for (const m of missing)
    boxes.push(fit({ ref: m.label, col: m.col, rows: [], placeholder: true, w: boxWidth(m.label, [MISSING], maxW, 10), h: D.head + D.row + 8, sort: m.order }))
  // colunas → x; se não couberem na largura disponível, passam para faixas por baixo
  const nCols = Math.max(...boxes.map((b) => b.col)) + 1
  const colW = Array.from({ length: nCols }, (_, c) => Math.max(0, ...boxes.filter((b) => b.col === c).map((b) => b.w)))
  const used = colW.map((w, c) => [w, c]).filter(([w]) => w > 0)
  const span = (cs, gap) => cs.reduce((s, [w]) => s + w, 0) + gap * (cs.length - 1) + 2 * D.pad + D.loop
  const bands = []
  for (const c of used) {
    const last = bands.at(-1)
    if (last && span([...last, c], D.gapMin) <= avail) last.push(c)
    else bands.push([c])
  }
  let top = D.pad
  const placed = []
  for (const band of bands) {
    const gap = band.length > 1 ? Math.max(D.gapMin, Math.min(D.gapMax, (avail - span(band, 0)) / (band.length - 1))) : 0
    let x = D.pad
    let bottom = top
    for (const [w, c] of band) {
      let y = top
      for (const b of boxes.filter((b) => b.col === c).sort((p, q) => p.sort - q.sort)) {
        Object.assign(b, { x, y, colW: w })
        y += b.h + 24
        placed.push(b)
      }
      bottom = Math.max(bottom, y)
      x += w + (Number.isFinite(gap) ? gap : D.gapMax)
    }
    top = bottom + 40
  }
  const byRef = new Map(placed.filter((b) => !b.placeholder).map((b) => [b.ref, b]))
  const rowY = (b, pin) => b.y + D.head + b.rows.indexOf(pin) * D.row + D.row / 2
  const lines = wires.map((w) => {
    const [a, b] = ends(w).map((e) => ({ ...e, box: byRef.get(e.ref) }))
    const [ya, yb] = [rowY(a.box, a.pin), rowY(b.box, b.pin)]
    let pts
    if (a.box.col === b.box.col) {
      const x = a.box.x + a.box.colW
      const [x1, x2] = [a.box.x + a.box.w, b.box.x + b.box.w]
      pts = a.box.y <= b.box.y ? [[x1, ya], [x + D.loop, ya], [x + D.loop, yb], [x2, yb]] : [[x2, yb], [x + D.loop, yb], [x + D.loop, ya], [x1, ya]]
    } else {
      const [l, r, yl, yr] = a.box.x < b.box.x ? [a, b, ya, yb] : [b, a, yb, ya]
      const [x1, x2] = [l.box.x + l.box.w, r.box.x]
      const k = Math.max(60, Math.abs(x2 - x1) / 2)
      pts = [[x1, yl], [x1 + k, yl], [x2 - k, yr], [x2, yr]]
    }
    return { w, pts, d: `M${pts[0]} C${pts[1]} ${pts[2]} ${pts[3]}` }
  })
  return {
    boxes: placed, lines,
    width: Math.max(...placed.map((b) => b.x + b.colW + D.loop + D.pad)),
    height: Math.max(200, ...placed.map((b) => b.y + b.h + D.pad)),
  }
}

// par entrançado: os dois fios enrolam-se à volta da linha do meio e acabam cada um no seu pino
const bez = (p, t) => [0, 1].map((i) => (1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t * t * p[2][i] + t ** 3 * p[3][i])
export function twist(pa, pb) {
  const len = Math.hypot(pa[3][0] - pa[0][0], pa[3][1] - pa[0][1]) + Math.abs(pa[1][0] - pa[0][0])
  const k = 2 * Math.max(2, Math.round(len / 90)) // nº par de meias-voltas: cada fio volta ao seu lado no fim
  const n = Math.max(64, 10 * k)
  const A = []
  const B = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const [a, b] = [bez(pa, t), bez(pb, t)]
    const c = Math.cos(Math.PI * k * t)
    A.push(a.map((v, j) => ((a[j] + b[j]) / 2 + ((a[j] - b[j]) / 2) * c).toFixed(1)))
    B.push(b.map((v, j) => ((a[j] + b[j]) / 2 - ((a[j] - b[j]) / 2) * c).toFixed(1)))
  }
  const mid = bez(pa, 0.5).map((v, j) => (v + bez(pb, 0.5)[j]) / 2)
  return { a: `M${A.join(' L')}`, b: `M${B.join(' L')}`, mid }
}

// ---- formboard: árvore dos troços desenhada à escala (mm), nº de fios em cada troço
export function formboard(h) {
  const segs = h.model.sheets.Segments
    .map((s) => ({ id: txt(s.seg_id), a: txt(s.from_node), b: txt(s.to_node), len: num(s.length_mm) }))
    .filter((s) => s.a && s.b)
  if (!segs.length) return null
  const adj = new Map()
  for (const s of segs) for (const [x, y] of [[s.a, s.b], [s.b, s.a]]) (adj.get(x) || adj.set(x, []).get(x)).push({ n: y, s })
  const kind = (n) => {
    const c = h.H.conns.get(n)
    if (c) return txt(c.type).toUpperCase() === 'SPLICE' ? 'splice' : 'connector'
    return /^BP\d+$/.test(n) ? 'branch' : 'drawing'
  }
  const pos = new Map()
  const parent = new Map()
  const leaves = new Map()
  const count = (n, from) => {
    const kids = adj.get(n).filter((e) => e.n !== from)
    leaves.set(n, kids.length ? kids.reduce((s, e) => s + count(e.n, n), 0) : 1)
    return leaves.get(n)
  }
  // várias árvores (desenhos com troços soltos): cada uma a partir do nó com mais ramos
  let offsetY = 0
  const placeTree = (root) => {
    count(root, null)
    const before = pos.size
    const place = (n, from, angle, wedge) => {
      const kids = adj.get(n).filter((e) => e.n !== from)
      const total = kids.reduce((s, e) => s + leaves.get(e.n), 0)
      let start = angle - wedge / 2
      for (const e of kids) {
        const share = (wedge * leaves.get(e.n)) / total
        const dir = start + share / 2
        const L = Number.isFinite(e.s.len) ? e.s.len : 60 // troço sem comprimento: desenhado com 60 mm, a tracejado
        const [x, y] = pos.get(n)
        pos.set(e.n, [x + L * Math.cos(dir), y + L * Math.sin(dir)])
        parent.set(e.n, { n, s: e.s })
        place(e.n, n, dir, Math.min(1.5 * share, 0.8 * Math.PI)) // um pouco mais aberto do que a fatia: as folhas não se amontoam
        start += share
      }
    }
    pos.set(root, [0, offsetY])
    place(root, null, 0, 2 * Math.PI)
    const ys = [...pos.entries()].slice(before).map(([, p]) => p[1])
    offsetY = Math.max(...ys) + 150
  }
  for (const n of [...adj.keys()].sort((a, b) => adj.get(b).length - adj.get(a).length)) if (!pos.has(n)) placeTree(n)

  // fios por troço: caminho de cada fio entre as suas duas fichas
  const load = new Map(segs.map((s) => [s, []]))
  const unrouted = []
  const path = (a, b) => {
    const prev = new Map([[a, null]])
    const q = [a]
    while (q.length) {
      const n = q.shift()
      if (n === b) break
      for (const e of adj.get(n) || []) if (!prev.has(e.n)) prev.set(e.n, { n, s: e.s }), q.push(e.n)
    }
    if (!prev.has(b)) return null
    const out = []
    for (let n = b; prev.get(n); n = prev.get(n).n) out.push(prev.get(n).s)
    return out
  }
  for (const w of h.model.sheets.Wires) {
    const [a, b] = ends(w).map((e) => e.ref)
    const p = adj.has(a) && adj.has(b) ? path(a, b) : null
    if (p) for (const s of p) load.get(s).push(txt(w.wire_id))
    else unrouted.push(txt(w.wire_id))
  }
  const xs = [...pos.values()].map((p) => p[0])
  const ys = [...pos.values()].map((p) => p[1])
  // dir: para onde a ficha aponta (para fora da árvore, ao contrário da média dos vizinhos)
  const dirOf = (id, [x, y]) => {
    const ns = adj.get(id).map((e) => pos.get(e.n))
    return Math.atan2(y - ns.reduce((s, p) => s + p[1], 0) / ns.length, x - ns.reduce((s, p) => s + p[0], 0) / ns.length)
  }
  return {
    nodes: [...pos.entries()].map(([id, p]) => ({ id, x: p[0], y: p[1], kind: kind(id), dir: dirOf(id, p) })),
    segs: segs.map((s) => ({ ...s, known: Number.isFinite(s.len), wires: load.get(s) })),
    bbox: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
    total: segs.reduce((s, x) => s + (Number.isFinite(x.len) ? x.len : 0), 0),
    unrouted,
  }
}

// ---- face de encaixe de uma ficha (como no pinout do harness.design): posição de cada cavidade, em px
// shortcut: cavidades por ordem do pinout em anéis (circular) ou 2 filas (retangular), não a numeração do fabricante;
// passar a coordenadas do catálogo quando a equipa as tiver
export function face(pins, round, pitch = 26) {
  const n = pins.length
  if (round) {
    const rings = []
    for (let left = n, r = 0; left > 0; r++) {
      const cap = n <= 8 ? n : r ? 6 * r : 1
      rings.push(Math.min(cap, left))
      left -= cap
    }
    let i = 0
    const pts = rings.flatMap((k, r) => Array.from({ length: k }, (_, j) => {
      const a = -Math.PI / 2 + (2 * Math.PI * j) / k
      const rad = (n <= 8 ? 1 : r) * pitch * (n <= 8 ? Math.max(0.8, k / 6) : 1)
      return { pin: pins[i++], x: rad * Math.cos(a), y: rad * Math.sin(a) }
    }))
    const R = Math.max(...pts.map((p) => Math.hypot(p.x, p.y))) + pitch
    return { round, w: 2 * R, h: 2 * R, pts }
  }
  const rows = n > 4 ? 2 : 1
  const cols = Math.ceil(n / rows)
  const pts = pins.map((pin, i) => ({ pin, x: ((i % cols) - (cols - 1) / 2) * pitch, y: (Math.floor(i / cols) - (rows - 1) / 2) * pitch * 1.4 }))
  return { round, w: cols * pitch + 1.4 * pitch, h: rows * pitch * 1.4 + pitch, pts }
}

// ---- nomes das fichas sem se sobreporem: cada um sobe ou desce uma linha de cada vez até caber
// items: [{ x, y, w, h, anchor: 'start'|'middle'|'end' }] (y = meio do texto); obstacles: [{ x, y, w, h }] (caixas pelo canto)
export function spreadLabels(items, obstacles = []) {
  const placed = [...obstacles]
  const hit = (a) => placed.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
  return items.map((it) => {
    const x = it.anchor === 'start' ? it.x : it.anchor === 'end' ? it.x - it.w : it.x - it.w / 2
    const box = (step) => ({ x, y: it.y + step * it.h - it.h / 2, w: it.w, h: it.h })
    const step = [0, -1, 1, -2, 2, -3, 3].find((s) => !hit(box(s))) ?? 0 // nada livre: fica no sítio
    placed.push(box(step))
    return { x: it.x, y: it.y + step * it.h }
  })
}
