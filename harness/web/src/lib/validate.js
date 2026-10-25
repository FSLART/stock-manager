// Regras de validação do formato standard. Função pura: modelo de parseWorkbook() -> lista de findings
// { sev: critical|error|warning|info, rule, sheet, row, msg, refs }.

import { ends, indexHarness, refOfKey, showKey as show, splitQ, txt } from './harness.js'
import { housingOf } from './bom.js'
import { busById, canPairs } from './can.js'

export const SEVERITIES = ['critical', 'error', 'warning', 'info']
export const IEC_COLOURS = ['BK', 'BN', 'RD', 'OG', 'YE', 'GN', 'BU', 'VT', 'GY', 'WH', 'PK', 'TQ']
const CSA_AWG = { 0.14: 26, 0.22: 24, 0.35: 22, 0.5: 20, 0.75: 18, 1: 17, 1.5: 16, 2.5: 14, 4: 12, 6: 10, 10: 8, 16: 6, 25: 4, 35: 2, 50: 1 }
const MULTI_WIRE = new Set(['SPLICE', 'STUD'])
const TYPES = new Set(['CONNECTOR', 'STUD', 'SPLICE'])
const REQUIRED = {
  Wires: ['wire_id', 'net', 'from_ref', 'from_pin', 'to_ref', 'to_pin', 'colour', 'csa_mm2', 'hv'],
  Connectors: ['ref', 'type', 'hv_rated', 'housing_pn'],
  Pins: ['ref', 'pin', 'label', 'dir'],
}

const up = (v) => txt(v).toUpperCase()
const num = (v) => (txt(v) === '' ? NaN : Number(txt(v).replace(',', '.'))) // aceita vírgula decimal
const volt = (v) => up(v).replace(/\s+/g, '').replace(',', '.')

// lista curta para mensagens: "a, b, c … (+12)"
const few = (xs, n = 8) => xs.slice(0, n).join(', ') + (xs.length > n ? ` … (+${xs.length - n})` : '')

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

// Dijkstra sobre a topologia (troços com comprimento); devolve distância ou undefined
function topology(segments) {
  const adj = new Map()
  const link = (a, b, l) => (adj.get(a) || adj.set(a, []).get(a)).push([b, l])
  for (const s of segments) {
    const [a, b, l] = [txt(s.from_node), txt(s.to_node), num(s.length_mm)]
    if (a && b && l > 0) link(a, b, l), link(b, a, l)
  }
  const dist = (from, to) => {
    if (!adj.has(from) || !adj.has(to)) return undefined
    const best = new Map([[from, 0]])
    const todo = new Set([from])
    while (todo.size) {
      const n = [...todo].reduce((x, y) => (best.get(x) <= best.get(y) ? x : y))
      todo.delete(n)
      if (n === to) return best.get(n)
      for (const [m, l] of adj.get(n)) {
        const d = best.get(n) + l
        if (!(best.get(m) <= d)) best.set(m, d), todo.add(m)
      }
    }
    return undefined
  }
  return { adj, dist }
}

export function validate(model, catalog = null) {
  const out = []
  const add = (sev, rule, sheet, row, msg, refs = [], wires = []) => out.push({ sev, rule, sheet, row, msg, refs, wires })
  const S = model.sheets

  // --- estrutura: sem isto não dá para validar mais nada
  for (const [sheet, cols] of Object.entries(REQUIRED)) {
    if (model.missing.includes(sheet)) add('critical', 'STRUCT', sheet, null, `Falta a folha ${sheet}.`)
    else {
      const miss = cols.filter((c) => !model.headers[sheet].includes(c))
      if (miss.length) add('critical', 'STRUCT', sheet, 1, `Faltam colunas: ${miss.join(', ')}.`)
    }
  }
  if (out.length) return out

  const H = indexHarness(model)
  const { conns, pins, usage } = H
  for (const c of H.dupConns)
    add('error', 'C-DUP', 'Connectors', c._row, `Ref "${txt(c.ref)}" repetida (também na linha ${conns.get(txt(c.ref))._row}).`, [txt(c.ref)])
  for (const p of H.dupPins) add('error', 'P-DUP', 'Pins', p._row, `Pino ${txt(p.ref)}:${txt(p.pin)} repetido.`, [txt(p.ref)])
  const pinsOf = (ref) => H.pinsOf(ref).map((p) => txt(p.pin))
  const parts = new Map(S.Parts.map((p) => [txt(p.pn), p]))
  const topo = topology(S.Segments)
  const typeOf = (ref) => up(conns.get(ref)?.type)

  // --- fios
  const ids = new Map()
  const noCsa = []
  const twists = new Map()
  for (const w of S.Wires) {
    const id = txt(w.wire_id) || `linha ${w._row}`
    const ends = ['from', 'to'].map((e) => ({ ref: txt(w[`${e}_ref`]), pin: txt(w[`${e}_pin`]) }))
    const refs = ends.map((e) => e.ref).filter(Boolean)
    const here = (sev, rule, msg) => add(sev, rule, 'Wires', w._row, `${id}: ${msg}`, refs, [id])

    if (!txt(w.wire_id)) here('error', 'W-ID', 'sem wire_id.')
    else if (ids.has(id)) here('error', 'W-ID', `wire_id repetido (linha ${ids.get(id)}).`)
    else ids.set(id, w._row)

    for (const { ref, pin } of ends) {
      if (!ref || !pin) {
        here('error', 'W-END', 'uma das pontas não tem ref ou pino.')
        continue
      }
      if (!conns.has(ref)) {
        const near = [...conns.keys()].filter((r) => levenshtein(r.toUpperCase(), ref.toUpperCase()) <= 2)
        here('error', 'W-REF', `conector "${ref}" não existe em Connectors${near.length ? ` — querias "${near[0]}"?` : ''}.`)
        continue
      }
      const known = pinsOf(ref)
      if (!known.length) here('warning', 'W-PIN', `${ref} não tem pinout na folha Pins.`)
      else if (!known.includes(pin)) {
        const other = known.find((p) => p.toUpperCase() === pin.toUpperCase())
        here('error', 'W-PIN', `pino ${ref}:${pin} não existe no pinout${other ? ` (existe "${other}" — atenção a maiúsculas/minúsculas)` : ''}.`)
      }
    }

    const colour = up(w.colour)
    const hv = up(w.hv)
    if (!colour) here('warning', 'W-COLOUR', 'sem cor.')
    else if (colour.split('/').some((c) => !IEC_COLOURS.includes(c)))
      here('error', 'W-COLOUR', `cor "${txt(w.colour)}" não é um código IEC 60757 (${IEC_COLOURS.join(', ')}).`)
    if (hv !== 'Y' && hv !== 'N') here('error', 'W-HV', `hv tem de ser Y ou N (está "${txt(w.hv)}").`)
    else if ((hv === 'Y') !== (colour.split('/')[0] === 'OG'))
      here('error', 'W-HV', hv === 'Y' ? 'fio HV tem de ser laranja (OG).' : 'fio laranja (OG) marcado como não-HV.')
    if (hv === 'Y') {
      const notRated = refs.filter((r) => conns.has(r) && up(conns.get(r).hv_rated) !== 'Y')
      if (notRated.length) here('error', 'W-HVCONN', `fio HV ligado a ${notRated.join(' e ')}, que não está marcado como HV rated.`)
    }

    const csa = num(w.csa_mm2)
    if (txt(w.csa_mm2) === '') noCsa.push(id)
    else if (!(csa in CSA_AWG)) here('warning', 'W-CSA', `secção ${txt(w.csa_mm2)} mm² não é standard.`)
    else
      for (const ref of refs) {
        const range = txt(parts.get(txt(conns.get(ref)?.contact_pn))?.awg_range).match(/\d+/g)?.map(Number)
        if (range?.length === 2 && (CSA_AWG[csa] < Math.min(...range) || CSA_AWG[csa] > Math.max(...range)))
          here('error', 'W-CRIMP', `${csa} mm² (≈${CSA_AWG[csa]} AWG) fora da gama do contacto de ${ref} (${txt(parts.get(txt(conns.get(ref).contact_pn)).awg_range)}).`)
      }

    const net = up(w.net)
    const tp = txt(w.twist_group)
    if (tp) twists.set(tp, [...(twists.get(tp) || []), w])

    if (refs.length === 2) {
      const L = topo.dist(refs[0], refs[1])
      if (L !== undefined && txt(w.length_mm) === '') here('info', 'W-LEN', `comprimento pela topologia: ${L} mm.`)
      else if (L !== undefined && Math.abs(num(w.length_mm) - L) > 0.5)
        here('warning', 'W-LEN', `length_mm = ${txt(w.length_mm)} mas a topologia dá ${L} mm.`)
    }
  }
  if (noCsa.length > 3)
    add('warning', 'W-CSA', 'Wires', null, `${noCsa.length} de ${S.Wires.length} fios sem secção (csa_mm2): ${few(noCsa)}.`, [], noCsa)
  else for (const id of noCsa) add('warning', 'W-CSA', 'Wires', S.Wires.find((w) => txt(w.wire_id) === id)?._row ?? null, `${id}: sem secção (csa_mm2).`, [], [id])
  for (const [tp, ws] of twists)
    if (ws.length !== 2)
      add('error', 'W-TWIST', 'Wires', ws[0]._row, `Par entrançado ${tp} tem ${ws.length} fio(s): ${ws.map((w) => txt(w.wire_id)).join(', ')}.`, [], ws.map((w) => txt(w.wire_id)))

  // --- CAN: só há cinco barramentos, e cada fio H vai com o seu L, entrançados
  const can = canPairs({ model, H })
  const names = [...busById.values()].map((b) => b.name).join(', ')
  for (const [w, c] of can.info) {
    const id = txt(w.wire_id)
    const where = (sev, rule, msg) => add(sev, rule, 'Wires', w._row, `${id}: ${msg}`, ends(w).map((e) => e.ref), [id])
    if (!c.bus) where('error', 'W-CANBUS', `${txt(w.net)} é CAN mas não é de nenhum barramento conhecido (só existem: ${names}).`)
    else if (c.likely) where('warning', 'W-CANBUS', `${txt(w.net)}: ${c.likely}.`)
    if (c.bus && !c.side) where('warning', 'W-CANBUS', `${txt(w.net)}: não diz se é CAN H ou CAN L.`)
    if (c.bus && (c.side === 'H' || c.side === 'L') && !can.partner.has(w))
      where('warning', 'W-CANPAIR', `${txt(w.net)} (${busById.get(c.bus).name} ${c.side}) não tem o CAN ${c.side === 'H' ? 'L' : 'H'} entre as mesmas fichas — tem de ser par entrançado.`)
  }

  // --- um contacto, um fio (exceto splices e pernos)
  for (const [k, ws] of usage) {
    const ref = refOfKey(k)
    if (ws.length > 1 && !MULTI_WIRE.has(typeOf(ref)))
      add('critical', 'W-DUP', 'Wires', ws[1]._row, `Pino ${show(k)} tem ${ws.length} fios: ${ws.map((w) => txt(w.wire_id)).join(', ')}.`, [ref], ws.map((w) => txt(w.wire_id)))
  }

  // --- circuitos (pinos ligados por fios, através de splices/pernos): polaridade e tensão
  for (const { keys: ks, wires } of H.circuits) {
    const info = ks.map((k) => ({ k, p: pins.get(k) })).filter((x) => x.p)
    const refs = [...new Set(ks.map(refOfKey))]
    const wireIds = wires.map((w) => txt(w.wire_id))
    const ids = wireIds.join(', ')
    const nets = few([...new Set(wires.map((w) => txt(w.net)).filter(Boolean))], 4)
    const dirs = new Set(info.map((x) => up(x.p.dir)))
    if (dirs.has('VCC') && dirs.has('GND')) {
      const list = info.filter((x) => ['VCC', 'GND'].includes(up(x.p.dir))).map((x) => `${show(x.k)} ${up(x.p.dir)}`)
      add('critical', 'W-POL', 'Wires', wires[0]._row, `VCC e GND no mesmo circuito ${nets} (${list.join(', ')}) — fios ${ids}.`, refs, wireIds)
    }
    const volts = new Map(info.filter((x) => volt(x.p.voltage)).map((x) => [show(x.k), volt(x.p.voltage)]))
    if (new Set(volts.values()).size > 1)
      add('warning', 'W-VOLT', 'Wires', wires[0]._row, `Tensões diferentes no circuito ${nets}: ${few([...volts].map(([p, v]) => `${p} ${v}`), 6)} — fios ${few(wireIds)}.`, refs, wireIds)
  }

  // --- pinos
  const unused = new Map() // ref -> [pinos com sinal mas sem fio]
  for (const [k, p] of pins) {
    const n = usage.get(k)?.length || 0
    const ref = txt(p.ref)
    if (up(p.dir) === 'NC' && n) add('error', 'P-NC', 'Pins', p._row, `Pino ${show(k)} está NC mas tem fio.`, [ref])
    else if (txt(p.label) && up(p.dir) !== 'NC' && !n && !MULTI_WIRE.has(typeOf(ref)))
      unused.set(ref, [...(unused.get(ref) || []), p])
    if (!conns.has(ref)) add('error', 'P-REF', 'Pins', p._row, `Pino ${show(k)}: conector "${ref}" não existe em Connectors.`, [ref])
  }

  for (const [ref, ps] of unused)
    add('warning', 'P-UNUSED', 'Pins', ps[0]._row, `${ref}: ${ps.length} pino(s) com sinal mas sem fio — ${few(ps.map((p) => `${txt(p.pin)} ${txt(p.label)}`))}.`, [ref])

  // --- conectores (num harness ainda sem P/N, topologia ou 3D, uma mensagem só em vez de uma por conector)
  const real = [...conns.values()].filter((c) => up(c.type) !== 'SPLICE')
  const noPn = real.length > 0 && real.every((c) => !txt(c.housing_pn))
  const noTopo = real.length > 0 && !topo.adj.size
  const noXyz = real.length > 0 && real.every((c) => ['x_m', 'y_m', 'z_m'].some((a) => txt(c[a]) === ''))
  if (noPn) add('warning', 'C-PN', 'Connectors', null, `Nenhum dos ${real.length} conectores tem P/N (housing_pn).`)
  if (noTopo) add('info', 'C-TOPO', 'Segments', null, 'Sem topologia (RapidHarness): ainda não há rotas nem comprimentos.')
  if (noXyz) add('info', 'C-XYZ', 'Connectors', null, 'Nenhum conector tem posição 3D (x/y/z).')
  for (const [ref, c] of conns) {
    const type = up(c.type)
    const n = [...usage.keys()].filter((k) => k.startsWith(ref + '\u0000')).reduce((s, k) => s + usage.get(k).length, 0)
    const here = (sev, rule, msg) => add(sev, rule, 'Connectors', c._row, `${ref}: ${msg}`, [ref])
    if (!TYPES.has(type)) here('error', 'C-TYPE', `type "${txt(c.type)}" inválido (CONNECTOR, STUD ou SPLICE).`)
    if (txt(c.gender) && !['M', 'F'].includes(up(c.gender))) here('error', 'C-GENDER', `gender "${txt(c.gender)}" inválido (M ou F).`)
    const cat = housingOf(catalog, txt(c.housing_pn))?.housing // ficha conhecida no catálogo
    if (cat?.positions && pinsOf(ref).length > cat.positions)
      here('error', 'C-POS', `o pinout tem ${pinsOf(ref).length} pinos e a ficha ${txt(c.housing_pn)} só tem ${cat.positions} posições.`)
    if (cat?.gender && ['M', 'F'].includes(up(c.gender)) && up(c.gender) !== cat.gender)
      here('warning', 'C-GENDER', `marcada ${up(c.gender)}, mas a ficha ${txt(c.housing_pn)} é ${cat.gender} no catálogo.`)
    if (type === 'SPLICE') {
      if (n < 3) here('warning', 'C-SPLICE', `splice com só ${n} fio(s).`)
      continue
    }
    if (!n) here('info', 'C-UNUSED', 'nenhum fio ligado.')
    if (!txt(c.housing_pn) && !noPn) here('warning', 'C-PN', 'sem P/N (housing_pn).')
    for (const col of ['housing_pn', 'mate_pn', 'contact_pn'])
      if (txt(c[col]) && !parts.has(txt(c[col]))) here('warning', 'C-PN', `${col} "${txt(c[col])}" não está na folha Parts.`)
    if (!topo.adj.has(ref) && !noTopo) here('warning', 'C-TOPO', 'fora da topologia (Segments) — sem rota nem comprimento.')
    if (['x_m', 'y_m', 'z_m'].some((a) => txt(c[a]) === '') && !noXyz) here('info', 'C-XYZ', 'sem posição 3D (x/y/z).')
  }

  // --- topologia
  const nodes = new Set(S.Nodes.map((n) => txt(n.node)))
  for (const s of S.Segments) {
    for (const end of ['from_node', 'to_node'])
      if (txt(s[end]) && !conns.has(txt(s[end])) && !nodes.has(txt(s[end])))
        add('error', 'T-NODE', 'Segments', s._row, `${txt(s.seg_id)}: "${txt(s[end])}" não é um conector nem um nó (Nodes).`)
    if (!(num(s.length_mm) > 0)) add('error', 'T-LEN', 'Segments', s._row, `${txt(s.seg_id)}: comprimento inválido "${txt(s.length_mm)}".`)
  }
  const seen = new Set()
  let pieces = 0
  for (const n of topo.adj.keys()) {
    if (seen.has(n)) continue
    pieces++
    const stack = [n]
    while (stack.length) for (const [m] of topo.adj.get(stack.pop())) if (!seen.has(m)) seen.add(m), stack.push(m)
  }
  if (pieces > 1) add('warning', 'T-SPLIT', 'Segments', null, `A topologia está partida em ${pieces} partes desligadas.`)

  // --- pendentes
  const unconfirmed = S.Parts.filter((p) => up(p.confirmed) !== 'Y').map((p) => txt(p.pn))
  if (unconfirmed.length) add('info', 'PART-CONF', 'Parts', null, `${unconfirmed.length} P/N por confirmar: ${unconfirmed.join(', ')}.`)
  for (const i of S.Issues)
    if (txt(i.id) && !['fechado', 'closed'].includes(txt(i.status).toLowerCase()))
      add('info', 'ISSUE', 'Issues', i._row, `${txt(i.id)} (${txt(i.severity)}) por fechar: ${txt(i.where)}.`)

  const rank = (f) => SEVERITIES.indexOf(f.sev)
  return out.sort((a, b) => rank(a) - rank(b) || a.sheet.localeCompare(b.sheet) || (a.row ?? 0) - (b.row ?? 0))
}

// Verificações do carro inteiro: o que só se vê juntando harnesses pelos acoplamentos.
// car = indexCar(...); index = index.json (mates, copies, lonely)
export function validateCar(harnesses, car, index) {
  const out = []
  const add = (sev, rule, msg, links = []) => out.push({ sev, rule, sheet: 'Carro', row: null, msg, refs: [], wires: [], links })
  const pinOf = (q) => {
    const { code, ref, pin } = splitQ(q)
    return car.byCode.get(code)?.H.pins.get(`${ref}\u0000${pin}`)
  }
  for (const c of car.circuits) {
    const codes = new Set(c.wires.map((x) => x.code))
    if (codes.size < 2) continue // dentro de um harness já é verificado pelo validate() desse harness
    const info = c.keys.map((q) => ({ q, p: pinOf(q) })).filter((x) => x.p)
    const where = (q) => { const { code, ref, pin } = splitQ(q); return `${code} ${ref}:${pin}` }
    const links = c.wires.map((x) => ({ code: x.code, id: txt(x.w.wire_id) }))
    const nets = few([...new Set(c.wires.map((x) => txt(x.w.net)).filter(Boolean))], 4)
    const dirs = new Set(info.map((x) => up(x.p.dir)))
    if (dirs.has('VCC') && dirs.has('GND'))
      add('critical', 'X-POL', `VCC e GND no mesmo circuito ${nets} entre harnesses: ${info.filter((x) => ['VCC', 'GND'].includes(up(x.p.dir))).map((x) => `${where(x.q)} ${up(x.p.dir)}`).join(', ')}.`, links)
    const volts = new Map(info.filter((x) => volt(x.p.voltage)).map((x) => [where(x.q), volt(x.p.voltage)]))
    if (new Set(volts.values()).size > 1)
      add('warning', 'X-VOLT', `Tensões diferentes no circuito ${nets} entre harnesses: ${few([...volts].map(([p, v]) => `${p} ${v}`), 6)}.`, links)
  }
  const noGender = []
  for (const m of index.mates || []) {
    const [A, B] = [car.byCode.get(m.a), car.byCode.get(m.b)]
    if (!A || !B) continue
    // um conector = ficha macho + ficha fêmea, uma em cada harness
    const [ga, gb] = [A, B].map((x) => up(x.H.conns.get(m.ref)?.gender))
    if (ga && gb && ga === gb)
      add('error', 'X-GENDER', `${m.ref}: as fichas do ${m.a} e do ${m.b} estão as duas marcadas ${ga} — uma tem de ser macho e a outra fêmea.`)
    else if (!ga || !gb) noGender.push(m.ref)
    const wired = (H) => new Set([...H.usage.keys()].filter((k) => refOfKey(k) === m.ref).map((k) => k.split('\u0000')[1]))
    const [wa, wb] = [wired(A.H), wired(B.H)]
    const onlyA = [...wa].filter((p) => !wb.has(p))
    const onlyB = [...wb].filter((p) => !wa.has(p))
    if (onlyA.length || onlyB.length)
      add('warning', 'X-MATE', `${m.ref} (${m.a} ⇄ ${m.b}): pinos com fio só de um lado —${onlyA.length ? ` só no ${m.a}: ${onlyA.join(', ')}` : ''}${onlyA.length && onlyB.length ? ';' : ''}${onlyB.length ? ` só no ${m.b}: ${onlyB.join(', ')}` : ''}.`)
  }
  if (noGender.length)
    add('info', 'X-GENDER', `${noGender.length} conector(es) entre harnesses sem o género (M/F) das duas fichas: ${few(noGender)}.`)
  for (const l of index.lonely || [])
    add('warning', 'X-IFACE', `${l.ref} existe no harness ${l.has} mas não no ${l.missing} — o conector de ligação entre os dois não bate.`)
  for (const c of index.copies || [])
    add('warning', 'X-COPY', `${c.a} e ${c.b} definem os mesmos conectores (${c.refs.join(', ')}) — um é cópia do outro?`)
  const rank = (f) => SEVERITIES.indexOf(f.sev)
  return out.sort((a, b) => rank(a) - rank(b))
}
