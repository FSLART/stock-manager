// Índices sobre o modelo do Excel, partilhados pelo validador e pelas páginas do site:
// conectores, pinos, fios em cada pino e circuitos (pinos unidos por fios, através de splices e pernos).

export const txt = (v) => String(v ?? '').trim()
export const pinKey = (ref, pin) => `${ref}\u0000${pin}` // pinos distinguem maiúsculas (A ≠ a nos circulares)
export const showKey = (k) => k.replace('\u0000', ':')
export const refOfKey = (k) => k.split('\u0000')[0]
export const ends = (w) => ['from', 'to'].map((e) => ({ ref: txt(w[`${e}_ref`]), pin: txt(w[`${e}_pin`]) }))

export function indexHarness(model) {
  const S = model.sheets
  const conns = new Map()
  const dupConns = []
  for (const c of S.Connectors) {
    const ref = txt(c.ref)
    if (ref) conns.has(ref) ? dupConns.push(c) : conns.set(ref, c)
  }
  const pins = new Map()
  const dupPins = []
  for (const p of S.Pins) {
    const k = pinKey(txt(p.ref), txt(p.pin))
    pins.has(k) ? dupPins.push(p) : pins.set(k, p)
  }
  const usage = new Map() // pinKey -> [fios]
  for (const w of S.Wires)
    for (const { ref, pin } of ends(w)) if (ref && pin) usage.set(pinKey(ref, pin), [...(usage.get(pinKey(ref, pin)) || []), w])

  const parent = new Map([...usage.keys()].map((k) => [k, k]))
  const find = (k) => (parent.get(k) === k ? k : (parent.set(k, find(parent.get(k))), parent.get(k)))
  for (const w of S.Wires) {
    const [a, b] = ends(w).map((e) => pinKey(e.ref, e.pin))
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b))
  }
  const groups = new Map()
  for (const k of usage.keys()) groups.set(find(k), [...(groups.get(find(k)) || []), k])
  const circuits = [...groups.values()].map((keys) => ({ keys, wires: [...new Set(keys.flatMap((k) => usage.get(k)))] }))
  const circuitOf = new Map() // fio -> circuito
  for (const c of circuits) for (const w of c.wires) circuitOf.set(w, c)

  return {
    conns, pins, usage, circuits, circuitOf, dupConns, dupPins,
    pinsOf: (ref) => S.Pins.filter((p) => txt(p.ref) === ref),
    wireById: new Map(S.Wires.map((w) => [txt(w.wire_id), w])),
  }
}

// ---- carro inteiro: os circuitos atravessam harnesses pelos acoplamentos (mesmo conector dos dois lados)
export const qKey = (code, ref, pin) => `${code}\u0001${pinKey(ref, pin)}`
export const splitQ = (q) => {
  const [code, rest] = q.split('\u0001')
  const [ref, pin] = rest.split('\u0000')
  return { code, ref, pin }
}

// harnesses: [{ code, model, H }] dos harnesses do carro; mates: [{ ref, a, b }] de index.json
export function indexCar(harnesses, mates = []) {
  const parent = new Map()
  const node = (k) => (parent.has(k) || parent.set(k, k), k)
  const find = (k) => (parent.get(k) === k ? k : (parent.set(k, find(parent.get(k))), parent.get(k)))
  const union = (a, b) => parent.set(find(node(a)), find(node(b)))
  const wiresAt = new Map() // qKey -> [{ code, w }]
  for (const { code, H } of harnesses)
    for (const [k, ws] of H.usage) wiresAt.set(node(`${code}\u0001${k}`), ws.map((w) => ({ code, w })))
  for (const { code, model } of harnesses)
    for (const w of model.sheets.Wires) {
      const [a, b] = ends(w).map((e) => qKey(code, e.ref, e.pin))
      if (parent.has(a) && parent.has(b)) union(a, b)
    }
  const byCode = new Map(harnesses.map((h) => [h.code, h]))
  const links = []
  const mateOf = new Map() // "code\u0001ref" -> { code, ref } do outro lado
  for (const m of mates) {
    const [A, B] = [byCode.get(m.a), byCode.get(m.b)]
    if (!A || !B) continue
    mateOf.set(`${m.a}\u0001${m.ref}`, { code: m.b, ref: m.ref })
    mateOf.set(`${m.b}\u0001${m.ref}`, { code: m.a, ref: m.ref })
    const pins = new Set([...A.H.pinsOf(m.ref), ...B.H.pinsOf(m.ref)].map((p) => txt(p.pin)))
    for (const pin of pins) {
      const [qa, qb] = [qKey(m.a, m.ref, pin), qKey(m.b, m.ref, pin)]
      if (!parent.has(qa) && !parent.has(qb)) continue // nenhum dos lados tem fio neste pino
      union(qa, qb)
      links.push({ ref: m.ref, pin, a: m.a, b: m.b, qa, qb })
    }
  }
  const groups = new Map()
  for (const k of parent.keys()) groups.set(find(k), [...(groups.get(find(k)) || []), k])
  const circuits = [...groups.values()].map((keys) => {
    const set = new Set(keys)
    const wires = new Map() // fio -> harness
    for (const k of keys) for (const x of wiresAt.get(k) || []) wires.set(x.w, x.code)
    return { keys, wires: [...wires].map(([w, code]) => ({ code, w })), links: links.filter((l) => set.has(l.qa)) }
  })
  const circuitOf = new Map()
  for (const c of circuits) for (const { w } of c.wires) circuitOf.set(w, c)
  return { circuits, circuitOf, links, mateOf, byCode }
}

// placa (PCB) de um conector, segundo boards.json: a ficha do harness liga ao header desta placa
export function boardOf(boards, code, ref) {
  return (boards?.boards || []).find((b) => (!b.harness || b.harness === code) && new RegExp(b.match).test(ref)) || null
}
