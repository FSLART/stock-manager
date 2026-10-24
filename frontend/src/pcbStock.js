import { mainKey, partNumberOf } from './stockText.js'

const PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, R: 1, r: 1 }
const empty = text => !text || /^[-—\s]*$/.test(text)
const cleanPn = text => empty(text) ? '' : String(text).toUpperCase().replace(/\s+/g, '')

// "4k7", "4.7kΩ", "100nF", "0,1 uF", "4R7" -> número; o prefixo do cabeçalho ("Indutância (µH)") vale para valores sem prefixo.
export function siValue(text, header = '') {
  const match = String(text ?? '').replace(',', '.').replace(/\s+/g, '').match(/^(\d*\.?\d+)([pnuµμmkKMGRr]?)(\d*)/)
  if (!match) return null
  const [, whole, prefix, decimals] = match
  const scale = prefix ? PREFIX[prefix] : PREFIX[header.match(/\(([pnuµμmkM])/)?.[1]] ?? 1
  return Number(decimals ? `${whole}.${decimals}` : whole) * scale
}

// Só resistências, condensadores e indutores casam pelo valor; o resto precisa do P/N.
const kindOfLine = line => line.reference.match(/^\s*([RCL])\d/i)?.[1].toUpperCase() ?? { Ω: 'R', F: 'C', H: 'L' }[line.value.trim().slice(-1)]
const kindOfCategory = name => /resist/i.test(name) ? 'R' : /condens|capacit/i.test(name) ? 'C' : /indut/i.test(name) ? 'L' : null
const footprintOf = item => Object.entries(item.props).find(([key]) => /^(encapsulamento|footprint|package)/i.test(key))?.[1] ?? ''
const SIZE = /(?:^|\D)(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)(?!\d)/
const sizeCode = text => String(text ?? '').match(SIZE)?.[1]
// "CAP 1 uF 0603 (1608 Metric)", "Capacitor 1 uF +/- 10% 25 V 0603" -> "1 uF ..." (o valor no início, sem o tamanho nem o métrico).
const valueText = text => text.replace(/\([^)]*\)/g, ' ').replace(new RegExp(SIZE.source, 'g'), ' ').replace(/^\D*?(\.?\d)/, '$1')
const shortName = text => text.replace(/\([^)]*\)/g, '').replace(/^\s*(cap|res|capacitor|resistor)\s+/i, '').trim()
const flat = text => text.toLowerCase().replace(/[^a-z0-9]/g, '')

// Footprint em falta num dos lados não exclui; "R_0603_1608Metric" e "0603" contam como iguais.
function sameFootprint(a, b) {
  if (empty(a) || empty(b)) return true
  const [sa, sb] = [sizeCode(a), sizeCode(b)]
  if (sa || sb) return sa === sb
  return flat(a).includes(flat(b)) || flat(b).includes(flat(a))
}

const sameValue = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b))

// O Altium junta numa linha peças de valores diferentes ("CAP 1uF 0805, CAP 10uF 0805"): cada valor é uma variante.
// Sem tamanho no próprio valor ("2K2"), vale o footprint da linha ou o tamanho escrito na descrição.
function variantsOf(line) {
  const footprint = empty(line.footprint) ? sizeCode(line.description) ?? sizeCode(line.value) ?? '' : line.footprint
  const variants = new Map()
  for (const piece of line.value.split(/,\s+/)) {
    const value = siValue(valueText(piece))
    const variant = { name: shortName(piece), value, footprint: sizeCode(piece) ?? footprint }
    if (value !== null && !variants.has(`${value}|${variant.footprint}`)) variants.set(`${value}|${variant.footprint}`, variant)
  }
  return [...variants.values()]
}

// Sem coluna MPN (BOM do Altium) o P/N vem no nome: "ISO1042DWV", ou alternativas "MIC5239-3.3YS-TR, MIC1790-50".
// Sem P/N igual, aceita o mesmo P/N com o sufixo de encapsulamento ("24FC08" -> "24FC08-I/MS"), se não for curto demais.
function itemsByPartNumber(line, items) {
  const candidates = (empty(line.partNumber) ? line.value.split(/,\s+/) : [line.partNumber]).map(cleanPn).filter(Boolean)
  const exact = items.filter(item => candidates.includes(cleanPn(partNumberOf(item))))
  if (exact.length) return exact
  const prefixes = candidates.filter(pn => pn.length >= 5 && /\d/.test(pn) && /[A-Z]/.test(pn))
  return items.filter(item => prefixes.some(pn => cleanPn(partNumberOf(item)).startsWith(pn) && /[^A-Z0-9]/.test(cleanPn(partNumberOf(item))[pn.length])))
}

// Itens de stock que servem uma linha do BOM: primeiro pelo P/N do fabricante, depois valor + footprint nos passivos.
// Uma linha com vários valores devolve os itens de cada um em variants.
export function matchStock(line, items) {
  const byPn = itemsByPartNumber(line, items)
  if (byPn.length) return { items: byPn, by: 'P/N' }
  const kind = kindOfLine(line)
  const variants = (kind ? variantsOf(line) : []).map(({ name, value, footprint }) => ({ name, items: items.filter(item => kindOfCategory(item.cat) === kind
    && sameValue(siValue(item.props[mainKey(item)], mainKey(item)), value)
    && sameFootprint(footprint, footprintOf(item))) }))
  if (variants.length > 1) return { items: [], by: 'valor', variants }
  const byValue = variants[0]?.items ?? []
  return { items: byValue, by: byValue.length ? 'valor' : '' }
}

const onHandOf = items => items.reduce((total, item) => total + item.qty, 0)
const locationsOf = items => [...new Set(items.map(item => item.location).filter(Boolean))].join(', ')
// Numa linha com vários valores o BOM não diz quantas peças são de cada: cada valor leva pelo menos uma por placa
// e no máximo todas. Só é OK se cada valor chega para a linha inteira; entre os dois extremos fica "verificar".
function statusOf(row) {
  if (!row.variants) return row.onHand >= row.needed ? 'ok' : row.onHand > 0 ? 'short' : 'missing'
  if (row.variants.every(variant => variant.onHand >= row.needed)) return 'ok'
  if (row.variants.every(variant => variant.onHand === 0)) return 'missing'
  return row.variants.some(variant => variant.onHand < row.boards) ? 'short' : 'check'
}

// Junta os BOMs (linhas × placas) e soma o que cada componente precisa; linhas que casam com os mesmos itens de stock somam-se.
export function stockCheck(boards, items) {
  const rows = new Map()
  for (const { lines, count } of boards) {
    for (const line of lines) {
      const match = matchStock(line, items)
      const key = match.items.length ? `stock:${match.items.map(item => item.id).sort().join(',')}` : `bom:${cleanPn(line.partNumber) || `${flat(line.value)}|${flat(line.footprint)}`}`
      const row = rows.get(key) ?? rows.set(key, {
        name: empty(line.partNumber) ? line.value : line.partNumber,
        references: [], footprint: line.footprint, by: match.by, needed: 0, boards: 0,
        onHand: onHandOf(match.variants ? [...new Map(match.variants.flatMap(variant => variant.items).map(item => [item.id, item])).values()] : match.items),
        locations: locationsOf(match.items),
        ...match.variants && { variants: match.variants.map(variant => ({ name: variant.name, onHand: onHandOf(variant.items), locations: locationsOf(variant.items) })) },
      }).get(key)
      if (!empty(line.reference)) row.references.push(line.reference)
      row.needed += line.quantity * count
      row.boards += count
    }
  }
  return [...rows.values()].map(row => ({ ...row, status: statusOf(row) }))
}
