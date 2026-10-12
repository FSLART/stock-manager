import { parseCsv } from './csv.js'

export function parseBom(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const normalize = header => header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  const headers = rows[0].map(normalize)
  const aliases = {
    reference: /^(references?|referencias?|refs?|designators?|partreference)$/,
    value: /^(value|component|componentvalue|valor|name|componentname)$/,
    quantity: /^(qty|quantity|quantidade|qtd|count|amount)$/,
    description: /^(description|desc|descricao|details?)$/,
    footprint: /^(footprint|package|encapsulation|encapsulamento)$/,
    partNumber: /^(mpn|partnumber|partno|manufacturerpartnumber|ordercode|codigo)$/,
  }
  const indices = Object.fromEntries(Object.entries(aliases).map(([key, pattern]) => [key, headers.findIndex(header => pattern.test(header))]))
  const hasHeaders = Object.values(indices).some(index => index >= 0)
  if (!hasHeaders) Object.assign(indices, { reference: 0, value: 1, quantity: 2 })
  return (hasHeaders ? rows.slice(1) : rows).map((fields, index) => {
    const get = key => fields[indices[key]] || ''
    const reference = get('reference')
    const value = get('value')
    const partNumber = get('partNumber')
    if (!value && !partNumber) throw new Error(`Linha ${index + (hasHeaders ? 2 : 1)}: falta o valor ou MPN do componente.`)
    const rawQuantity = get('quantity')
    const quantity = rawQuantity ? Number(rawQuantity) : reference.split(/[,\s]+/).filter(Boolean).length || 1
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error(`Linha ${index + (hasHeaders ? 2 : 1)}: quantidade inválida.`)
    return { reference: reference || '—', value: value || 'Componente sem valor', description: get('description') || '—', footprint: get('footprint') || '—', partNumber: partNumber || '—', quantity }
  })
}
