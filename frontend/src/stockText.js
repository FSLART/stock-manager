// Propriedades que guardam o número de peça do fabricante e a marca, com os nomes usados nas categorias.
export const isPartNumber = key => /^(p\/n|referência|mpn)$/i.test(key.trim())
export const isBrand = key => /^(brand|fabricante|marca)$/i.test(key.trim())
export const partNumberOf = item => String(Object.entries(item.props).find(([key]) => isPartNumber(key))?.[1] ?? '').trim()
// Chave da propriedade que dá nome ao componente (a primeira, ou valor/capacidade se existirem).
export const mainKey = item => Object.keys(item.props).find(key => /^(valor|capacidade)\b/.test(key)) ?? Object.keys(item.props)[0]
export const componentValue = item => item.props[mainKey(item)] || '—'
// Restantes propriedades numa linha, para a vista "Tudo" não ter uma coluna por propriedade de cada categoria.
export const describe = item => Object.entries(item.props).filter(([key, value]) => key !== mainKey(item) && value).map(([, value]) => value).join(' · ')
