// CSV records may contain delimiters and newlines inside quoted fields.
export function parseCsv(text) {
  const source = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').trim()
  if (!source) return []
  const firstLine = source.split('\n')[0]
  const separator = firstLine.replace(/"(?:[^"]|"")*"/g, '').includes(';') ? ';' : ','
  const rows = []
  let row = [], value = '', quoted = false
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index++ }
      else quoted = !quoted
    } else if (!quoted && (character === separator || character === '\n')) {
      row.push(value.trim())
      value = ''
      if (character === '\n') { if (row.some(Boolean)) rows.push(row); row = [] }
    } else value += character
  }
  if (quoted) throw new Error('O CSV contém aspas por fechar.')
  row.push(value.trim())
  if (row.some(Boolean)) rows.push(row)
  if (!rows.length) return []
  return rows
}
