import { parseCsv } from './csv.js'

export function parseInventoryCsv(text, categories) {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('O CSV deve conter cabeçalhos e pelo menos um componente.')
  if (rows.length > 5001) throw new Error('Importa no máximo 5000 linhas de cada vez.')
  const normalize = value => value.trim().toLocaleLowerCase('pt').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const headers = rows[0].map(normalize)
  if (new Set(headers).size !== headers.length || headers.some(header => !header)) throw new Error('Os cabeçalhos devem ser únicos e não podem estar vazios.')
  const categoryIndex = headers.findIndex(header => ['categoria', 'category', 'cat'].includes(header))
  const quantityIndex = headers.findIndex(header => ['quantidade', 'quantity', 'qty', 'qtd'].includes(header))
  if (categoryIndex < 0 || quantityIndex < 0) throw new Error('Inclui as colunas categoria e quantidade.')
  return rows.slice(1).map((row, index) => {
    const line = index + 2
    if (row.length !== headers.length) throw new Error(`Linha ${line}: o número de campos não corresponde aos cabeçalhos.`)
    const category = categories.find(category => normalize(category.name) === normalize(row[categoryIndex]))
    if (!category) throw new Error(`Linha ${line}: categoria desconhecida (${row[categoryIndex]}).`)
    const qty = Number(row[quantityIndex])
    if (!/^\d+$/.test(row[quantityIndex]) || !Number.isSafeInteger(qty) || qty < 1) throw new Error(`Linha ${line}: quantidade deve ser um inteiro positivo.`)
    const props = Object.fromEntries(category.props.map(key => {
      const column = headers.indexOf(normalize(key))
      if (column < 0 || !row[column]) throw new Error(`Linha ${line}: falta a propriedade ${key} da categoria ${category.name}.`)
      return [key, row[column]]
    }))
    const propertyHeaders = category.props.map(normalize)
    for (let column = 0; column < headers.length; column++) {
      if (column !== categoryIndex && column !== quantityIndex && !propertyHeaders.includes(headers[column]) && row[column]) throw new Error(`Linha ${line}: a propriedade ${rows[0][column]} não pertence à categoria ${category.name}.`)
    }
    return { cat: category.name, qty, props }
  })
}
