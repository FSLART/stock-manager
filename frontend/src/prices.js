import { partNumberOf } from './stockText.js'

// Tamanho/encapsulamento, para comparar só peças parecidas ("603" e "0603" contam como iguais).
const sizeOf = props => String(Object.entries(props).find(([key]) => /^(tamanho|tipo|footprint)$/i.test(key.trim()))?.[1] ?? '').replace(/^0+/, '')
const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2
}

// Preço unitário estimado: o do catálogo pelo P/N do item; sem P/N conhecido, a mediana das peças do catálogo
// da mesma categoria e tamanho, e depois da categoria. null quando não há base para estimar.
export function priceEstimator(parts) {
  const byPartNumber = new Map(), groups = {}
  for (const part of parts) {
    if (part.price == null) continue
    byPartNumber.set(part.mpn.toUpperCase(), part.price)
    if (!part.category) continue
    for (const key of [`${part.category}|${sizeOf(part.props)}`, part.category]) (groups[key] ??= []).push(part.price)
  }
  const medians = Object.fromEntries(Object.entries(groups).map(([key, prices]) => [key, median(prices)]))
  return item => byPartNumber.get(partNumberOf(item).toUpperCase()) ?? medians[`${item.cat}|${sizeOf(item.props)}`] ?? medians[item.cat] ?? null
}
