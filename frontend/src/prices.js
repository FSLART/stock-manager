import { partNumberOf } from './stockText.js'

// Tamanho/encapsulamento, para comparar só peças parecidas ("603" e "0603" contam como iguais).
const sizeOf = props => String(Object.entries(props).find(([key]) => /^(encapsulamento|tamanho|footprint)$/i.test(key.trim()))?.[1] ?? '').replace(/^0+/, '')
const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2
}

// Preço unitário: o do catálogo pelo P/N do item; sem P/N conhecido, a mediana das peças do catálogo da mesma
// categoria e tamanho, e depois da categoria (estimated). null quando não há base para estimar.
export function priceEstimator(parts) {
  const byPartNumber = new Map(), groups = {}
  for (const part of parts) {
    if (part.price == null) continue
    byPartNumber.set(part.mpn.toUpperCase(), part.price)
    if (!part.category) continue
    for (const key of [`${part.category}|${sizeOf(part.props)}`, part.category]) (groups[key] ??= []).push(part.price)
  }
  const medians = Object.fromEntries(Object.entries(groups).map(([key, prices]) => [key, median(prices)]))
  return item => {
    const exact = byPartNumber.get(partNumberOf(item).toUpperCase())
    if (exact != null) return { price: exact, estimated: false }
    const median = medians[`${item.cat}|${sizeOf(item.props)}`] ?? medians[item.cat]
    return median == null ? null : { price: median, estimated: true }
  }
}

// Cêntimos de resistências precisam de 3 casas; totais grandes dispensam casas decimais.
export const euros = value => value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR',
  minimumFractionDigits: value >= 100 ? 0 : 2, maximumFractionDigits: value >= 100 ? 0 : value < 0.1 ? 3 : 2 })
