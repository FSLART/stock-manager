// Barramentos CAN do carro. Só existem estes cinco; um fio CAN que não caiba num deles é um erro.
import { ends, pinKey, txt } from './harness.js'

export const CAN_BUSES = [
  { id: 'PWT', name: 'Powertrain', colour: '#ff922b', re: /\b(PWT|PT|POWERTRAIN)\b/ },
  { id: 'DATA', name: 'Data', colour: '#22b8cf', re: /\b(DATA|DAT)\b/ },
  { id: 'AUT', name: 'Autonomous', colour: '#94d82d', re: /\b(AUT|AUTON\w*)\b/ },
  { id: 'DTI', name: 'DTI Config', colour: '#f06595', re: /\b(DTI|CONF|CONFIG\w*)\b/ },
  { id: 'CHG', name: 'Charger', colour: '#fcc419', re: /\b(CHG|CHARGER|CHAGER|CHARG\w*)\b/ },
]
// nomes que aparecem nos Excels e que provavelmente são um destes, mas convém renomear
const LIKELY = [
  { id: 'PWT', re: /\bPWR\b/, why: 'PWR CAN tratado como Powertrain (PWT) — confirmar e renomear' },
  { id: 'AUT', re: /\bAD\b/, why: 'AD CAN tratado como Autonomous (AUT) — confirmar e renomear' },
]
export const busById = new Map(CAN_BUSES.map((b) => [b.id, b]))

const words = (s) => ` ${txt(s).toUpperCase().replace(/[^A-Z0-9+-]+/g, ' ')} `

// classifica um fio: null se não é CAN; senão { bus, side: 'H'|'L'|'S'(blindagem)|null, likely? }
export function canOf(w, H) {
  const labels = ends(w).map((e) => H?.pins.get(pinKey(e.ref, e.pin))?.label)
  const sources = [w.net, ...labels, w.wire_name, w.description].map(words)
  const all = sources.join(' ')
  if (!/\bCAN\b|CANH|CANL/.test(all)) return null
  const side = /\bSHIELD\b/.test(all) ? 'S'
    : /\b(H|HIGH|CANH)\b|CAN\s*\+/.test(all) ? 'H'
      : /\b(L|LOW|CANL)\b|CAN\s*-/.test(all) ? 'L' : null
  // o nome do fio e os labels mandam; a descrição só se eles não disserem nada
  for (const s of sources) {
    const b = CAN_BUSES.find((x) => x.re.test(s))
    if (b) return { bus: b.id, side }
  }
  for (const s of sources) {
    const l = LIKELY.find((x) => x.re.test(s))
    if (l) return { bus: l.id, side, likely: l.why }
  }
  return { bus: null, side }
}

// pares entrançados: o H e o L do mesmo barramento entre as mesmas duas fichas
export function canPairs(h) {
  const groups = new Map()
  const info = new Map()
  for (const w of h.model.sheets.Wires) {
    const c = canOf(w, h.H)
    if (!c) continue
    info.set(w, c)
    if (!c.bus || (c.side !== 'H' && c.side !== 'L')) continue
    const k = `${c.bus}|${ends(w).map((e) => e.ref).sort().join('|')}`
    groups.set(k, [...(groups.get(k) || []), w])
  }
  const partner = new Map()
  for (const ws of groups.values()) {
    const hs = ws.filter((w) => info.get(w).side === 'H')
    const ls = ws.filter((w) => info.get(w).side === 'L')
    hs.forEach((w, i) => ls[i] && (partner.set(w, ls[i]), partner.set(ls[i], w)))
  }
  return { info, partner }
}
