// Propriedades que guardam o número de peça do fabricante e a marca, com os nomes usados nas categorias.
export const isPartNumber = key => /^(p\/n|referência|mpn)$/i.test(key.trim())
export const isBrand = key => /^(brand|fabricante|marca)$/i.test(key.trim())
export const partNumberOf = item => String(Object.entries(item.props).find(([key]) => isPartNumber(key))?.[1] ?? '').trim()
// Chave da propriedade que dá nome ao componente (a primeira, ou o valor do passivo se existir).
export const mainKey = item => Object.keys(item.props).find(key => /^(valor|capacidade|resistência|indutância|frequência)\b/i.test(key)) ?? Object.keys(item.props)[0]
export const componentValue = item => {
  const key = mainKey(item), value = String(item.props[key] ?? '').trim()
  if (!value || /^[—-]$/.test(value)) return '—'
  const unit = key?.match(/\((Ω|µH|uH|Hz|V|A|W)\)/)?.[1]
  return unit && !/[a-zA-ZΩµ]$/.test(value.replace(/[kKMmunp]$/, '')) ? `${value} ${unit}` : value
}
// Restantes propriedades numa linha, para a vista "Tudo" não ter uma coluna por propriedade de cada categoria.
export const describe = item => Object.entries(item.props).filter(([key, value]) => key !== mainKey(item) && String(value ?? '').trim() && !/^[—-]$/.test(String(value).trim())).map(([, value]) => value).join(' · ')
